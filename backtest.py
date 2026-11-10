#!/usr/bin/env python3
"""Download Indodax candles and run a backtest from local OHLCV CSV files."""

from __future__ import annotations

import argparse
from bisect import bisect_right
import csv
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DOWNLOAD_BAR_SECONDS = 3600
MAX_BARS_PER_REQUEST = 640
PAIRS = ("BTCIDR", "ETHIDR", "XRPIDR")
INITIAL_CAPITAL = 100_000_000.0
FEE_RATE = 0.0051
MIN_ORDER = 25_000.0
MAX_POSITIONS = 3
MAX_POSITION_PCT = 0.10
DAILY_LOSS_LIMIT = 0.03
FREEZE_AT = "2026-11-04T12:00:00+07:00"
API = "https://indodax.com/tradingview/history_v2"


def parse_time(value: str) -> int:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp())


def iso(seconds: int) -> str:
    return datetime.fromtimestamp(seconds, timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "UAS-Indodax-DryRun/1.0"})
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt < 2:
                time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"Indodax request gagal: {last_error}")


def download_history(args: argparse.Namespace) -> None:
    start, end = parse_time(args.start), parse_time(args.end)
    if end <= start:
        raise ValueError("--end harus setelah --start.")
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True)
    for pair in args.pairs:
        all_rows: dict[int, dict[str, Any]] = {}
        cursor = end
        while cursor > start:
            query = urllib.parse.urlencode({
                "from": max(start, cursor - MAX_BARS_PER_REQUEST * DOWNLOAD_BAR_SECONDS),
                "symbol": pair,
                "tf": 60,
                "to": cursor,
            })
            rows = fetch_json(f"{API}?{query}")
            if not isinstance(rows, list) or not rows:
                raise RuntimeError(f"Indodax mengembalikan respons candle kosong untuk {pair} pada {iso(cursor)}.")
            valid = []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                try:
                    candle = {
                        "time": int(row["Time"]),
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "volume": float(row["Volume"]),
                    }
                except (KeyError, TypeError, ValueError):
                    continue
                if start <= candle["time"] < end:
                    all_rows[candle["time"]] = candle
                    valid.append(candle["time"])
            earliest = min(valid) if valid else None
            if earliest is None or earliest >= cursor:
                raise RuntimeError(f"Pagination history_v2 tidak bergerak mundur untuk {pair}; hentikan agar tidak membuat dataset parsial.")
            cursor = earliest
            print(f"{pair}: terkumpul {len(all_rows)} candle sampai {iso(cursor)}", file=sys.stderr)
            if cursor > start:
                time.sleep(0.4)
        path = output / f"{pair}.csv"
        with path.open("w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=("time", "open", "high", "low", "close", "volume"))
            writer.writeheader()
            writer.writerows(all_rows[key] for key in sorted(all_rows))
        print(f"{pair}: {len(all_rows)} candle tersimpan di {path}")


def find_candle_file(folder: Path, pair: str) -> Path:
    if not folder.is_dir():
        raise FileNotFoundError(f"Folder data candle tidak ditemukan: {folder}")
    expected = pair.upper()
    accepted_stems = {expected}
    if expected.endswith("IDR"):
        accepted_stems.add(expected[:-3])
    matches = [
        path for path in folder.glob("*.csv")
        if "".join(character for character in path.stem.upper() if character.isalnum()) in accepted_stems
    ]
    if not matches:
        raise FileNotFoundError(
            f"CSV candle {pair} tidak ditemukan di {folder}; nama file yang diterima, misalnya {pair}.csv."
        )
    if len(matches) > 1:
        raise ValueError(f"Lebih dari satu CSV cocok untuk {pair} di {folder}: {matches}")
    return matches[0]


def parse_candle_time(value: str) -> float:
    try:
        return float(value)
    except ValueError:
        return float(parse_time(value))


def read_candles(folder: Path, pair: str) -> list[dict[str, float]]:
    path = find_candle_file(folder, pair)
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames:
            raise ValueError(f"CSV candle tidak memiliki header: {path}")
        normalized = {
            "".join(character for character in name.lower() if character.isalnum()): name
            for name in reader.fieldnames
        }
        aliases = {
            "time": ("time", "timestamp", "datetime", "date", "t"),
            "open": ("open", "openprice", "o"),
            "high": ("high", "highprice", "h"),
            "low": ("low", "lowprice", "l"),
            "close": ("close", "closeprice", "c"),
            "volume": ("volume", "vol", "basevolume", "v"),
        }
        columns = {
            key: next((normalized[name] for name in names if name in normalized), None)
            for key, names in aliases.items()
        }
        missing = [key for key, column in columns.items() if column is None]
        if missing:
            raise ValueError(f"CSV {path} tidak memiliki kolom OHLCV yang diperlukan: {', '.join(missing)}")
        rows = []
        for line_number, row in enumerate(reader, 2):
            try:
                candle = {
                    "time": parse_candle_time(row[columns["time"]]),
                    **{
                        key: float(row[columns[key]])
                        for key in ("open", "high", "low", "close", "volume")
                    },
                }
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError(f"Baris candle tidak valid di {path}:{line_number}: {row}") from error
            values = list(candle.values())
            if not all(math.isfinite(value) for value in values):
                raise ValueError(f"Nilai non-finite di {path}:{line_number}.")
            if (
                min(candle[key] for key in ("open", "high", "low", "close")) <= 0
                or candle["volume"] < 0
                or candle["high"] < max(candle["open"], candle["close"], candle["low"])
                or candle["low"] > min(candle["open"], candle["close"], candle["high"])
            ):
                raise ValueError(f"Nilai OHLCV tidak masuk akal di {path}:{line_number}.")
            rows.append(candle)
    rows.sort(key=lambda item: item["time"])
    if len({row["time"] for row in rows}) != len(rows):
        raise ValueError(f"Timestamp candle duplikat ditemukan di {path}.")
    if len(rows) < 121:
        raise ValueError(f"{pair} hanya memiliki {len(rows)} candle; diperlukan >=121 untuk indikator dan validasi.")
    return rows


def read_snapshot_costs(
    path: Path | None, freeze_at: int, pairs: tuple[str, ...]
) -> tuple[dict[str, tuple[float, float]], str, int, float | None, float | None]:
    if path is None:
        print(
            "PERINGATAN: snapshot biaya tidak diberikan; spread/slippage tidak diterapkan "
            "dan hasil bukan estimasi performa dengan biaya pasar lengkap.",
            file=sys.stderr,
        )
        return {pair: (0.0, 0.0) for pair in pairs}, "unavailable_omitted", 0, None, None
    if not path.is_file():
        raise FileNotFoundError(f"File snapshot yang ditentukan tidak ditemukan: {path}")
    observations: dict[str, list[tuple[float, float]]] = {pair: [] for pair in pairs}
    all_spreads: list[float] = []
    all_slippages: list[float] = []
    with path.open(encoding="utf-8-sig") as file:
        for line_number, line in enumerate(file, 1):
            if not line.strip():
                continue
            row = json.loads(line)
            when = parse_time(row.get("time", ""))
            if when >= freeze_at:
                continue
            pair = str(row.get("pair", "")).upper()
            spread = row.get("spreadPct")
            slippage = row.get("slippagePct")
            if pair not in observations or spread is None or slippage is None:
                raise ValueError(f"{path}:{line_number} perlu pair, spreadPct dan slippagePct terukur.")
            spread_value, slip_value = float(spread), float(slippage)
            if not math.isfinite(spread_value) or not math.isfinite(slip_value) or spread_value < 0 or slip_value < 0:
                raise ValueError(f"{path}:{line_number} berisi biaya tidak valid.")
            observations[pair].append((spread_value, slip_value))
            all_spreads.append(spread_value)
            all_slippages.append(slip_value)
    missing = [pair for pair, rows in observations.items() if not rows]
    if missing:
        raise ValueError(
            "Backtest dihentikan: tidak ada snapshot pra-freeze terukur untuk "
            + ", ".join(missing)
            + ". Jangan mengganti spread/slippage dengan angka rekaan."
        )
    return (
        {
            pair: (
                statistics.median(row[0] for row in rows),
                statistics.median(row[1] for row in rows),
            )
            for pair, rows in observations.items()
        },
        "measured_pre_freeze",
        len(all_spreads),
        statistics.median(all_spreads),
        statistics.median(all_slippages),
    )


def ema(values: list[float], period: int) -> list[float]:
    output = [values[0]] if values else []
    alpha = 2 / (period + 1)
    for value in values[1:]:
        output.append(value * alpha + output[-1] * (1 - alpha))
    return output


def rsi(values: list[float], period: int = 14) -> list[float | None]:
    output: list[float | None] = [None] * len(values)
    if len(values) <= period:
        return output
    gains = sum(max(values[i] - values[i - 1], 0) for i in range(1, period + 1)) / period
    losses = sum(max(values[i - 1] - values[i], 0) for i in range(1, period + 1)) / period

    def value(gain: float, loss: float) -> float:
        return 100.0 if loss == 0 else 100 - 100 / (1 + gain / loss)

    output[period] = value(gains, losses)
    for index in range(period + 1, len(values)):
        change = values[index] - values[index - 1]
        gains = (gains * (period - 1) + max(change, 0)) / period
        losses = (losses * (period - 1) + max(-change, 0)) / period
        output[index] = value(gains, losses)
    return output


def atr(candles: list[dict[str, float]], period: int = 14) -> list[float | None]:
    ranges = []
    for index, bar in enumerate(candles):
        if index == 0:
            ranges.append(bar["high"] - bar["low"])
        else:
            previous = candles[index - 1]["close"]
            ranges.append(max(bar["high"] - bar["low"], abs(bar["high"] - previous), abs(bar["low"] - previous)))
    output: list[float | None] = [None] * len(candles)
    if len(candles) <= period:
        return output
    current = sum(ranges[1:period + 1]) / period
    output[period] = current
    for index in range(period + 1, len(ranges)):
        current = (current * (period - 1) + ranges[index]) / period
        output[index] = current
    return output


def wib_day(seconds: int) -> str:
    return datetime.fromtimestamp(seconds + 7 * 3600, timezone.utc).date().isoformat()


def backtest(args: argparse.Namespace) -> dict[str, Any]:
    start, end, freeze_at = parse_time(args.start), parse_time(args.end), parse_time(FREEZE_AT)
    bar_seconds = args.timeframe_minutes * 60
    if end <= start:
        raise ValueError("--end harus setelah --start.")
    data = {pair: read_candles(Path(args.data), pair) for pair in args.pairs}
    costs, cost_status, snapshot_count, median_spread, median_slippage = read_snapshot_costs(
        Path(args.snapshots) if args.snapshots else None,
        freeze_at,
        tuple(args.pairs),
    )
    by_time = {pair: {int(row["time"]): index for index, row in enumerate(rows)} for pair, rows in data.items()}
    candle_times = {pair: sorted(indexed) for pair, indexed in by_time.items()}

    def marked_position_value(pair: str, quantity: float, timestamp: int) -> float:
        index = bisect_right(candle_times[pair], timestamp) - 1
        if index < 0:
            return 0.0
        price_time = candle_times[pair][index]
        close = data[pair][by_time[pair][price_time]]["close"]
        return quantity * close * (1 - costs[pair][0] / 200)

    if any(rows[0]["time"] > start - 121 * bar_seconds for rows in data.values()):
        raise ValueError("Data harus menyertakan >=121 candle warm-up sebelum --start.")
    duration_days = (end - start) / 86400
    if duration_days < 365.2425 * 3:
        raise ValueError("Rentang backtest harus sekurang-kurangnya tiga tahun.")
    for pair, rows in data.items():
        in_range = [row for row in rows if start <= row["time"] < end]
        if not in_range or end - in_range[0]["time"] < 365.2425 * 3 * 86400:
            raise ValueError(f"Rentang candle {pair} tidak mencapai tiga tahun penuh.")
    indicators: dict[str, list[dict[str, Any]]] = {}
    for pair, rows in data.items():
        closes = [row["close"] for row in rows]
        fast, slow, rsis, atrs = ema(closes, 30), ema(closes, 100), rsi(closes), atr(rows)
        calculated = []
        for i, bar in enumerate(rows):
            cross = any(
                fast[j] > slow[j] and fast[j - 1] <= slow[j - 1]
                for j in range(max(1, i - 4), i + 1)
            )
            calculated.append({"fast": fast[i], "slow": slow[i], "rsi": rsis[i], "atr": atrs[i], "crossedUp": cross})
        indicators[pair] = calculated

    cash, positions = INITIAL_CAPITAL, {}
    daily_key = None
    daily_start = None
    daily_blocked = False
    orders, trades, signals, equity = [], [], [], []
    all_times = sorted({t for pair in args.pairs for t in by_time[pair] if start <= t < end})
    for candle_time in all_times:
        candidates = []
        for pair in args.pairs:
            index = by_time[pair].get(candle_time)
            if index is None or index + 1 >= len(data[pair]):
                continue
            bar = data[pair][index]
            ind = indicators[pair][index]
            recent = data[pair][max(0, index - 119):index + 1]
            contiguous = len(recent) == 120 and all(
                int(recent[k]["time"] - recent[k - 1]["time"]) == bar_seconds
                for k in range(1, len(recent))
            )
            valid = contiguous and bar["volume"] > 0 and all(
                row["volume"] >= 0 and min(row["open"], row["high"], row["low"], row["close"]) > 0
                for row in recent
            )
            if not valid:
                signals.append({"time": iso(candle_time), "pair": pair, "action": "hold", "reason": "data quality invalid"})
                continue
            position = positions.get(pair)
            buy = bool(ind["crossedUp"] and ind["fast"] > ind["slow"]
                       and ind["rsi"] is not None and 50 <= ind["rsi"] <= 75 and bar["close"] > ind["slow"])
            if position:
                position["highestClose"] = max(position["highestClose"], bar["close"])
                stop = position["highestClose"] - 3 * (ind["atr"] or 0)
                sell = bar["close"] < stop or ind["fast"] < ind["slow"]
                action = "sell" if sell else "hold"
                reason = "atr_trailing_stop" if bar["close"] < stop else "ema_trend_exit" if sell else "no_signal"
                signals.append({"time": iso(candle_time), "pair": pair, "action": action, "reason": reason, "close": bar["close"]})
                if sell:
                    candidates.append((pair, "sell", bar, data[pair][index + 1], position, reason))
            else:
                action = "buy" if buy else "hold"
                signals.append({"time": iso(candle_time), "pair": pair, "action": action, "reason": "ema_cross_rsi" if buy else "no_signal", "close": bar["close"]})
                if buy:
                    candidates.append((pair, "buy", bar, data[pair][index + 1], None, "ema_cross_rsi"))

        day = wib_day(candle_time)
        mark = cash + sum(
            marked_position_value(pair, pos["quantity"], candle_time)
            for pair, pos in positions.items()
        )
        if day != daily_key:
            daily_key, daily_start, daily_blocked = day, mark, False
        if daily_start and mark <= daily_start * (1 - DAILY_LOSS_LIMIT):
            daily_blocked = True
        # Exits first, then entries, matching the bot's position/risk ordering.
        candidates.sort(key=lambda item: item[1] == "buy")
        for pair, side, bar, next_bar, position, reason in candidates:
            spread_pct, slip_pct = costs[pair]
            reference = next_bar["open"]
            fill_price = reference * (1 + spread_pct / 200 + slip_pct / 100) if side == "buy" else reference * (1 - spread_pct / 200 - slip_pct / 100)
            if side == "sell":
                pos = positions.get(pair)
                if not pos:
                    continue
                quantity = pos["quantity"]
                notional = quantity * fill_price
                fee = notional * FEE_RATE
                gross = (reference - pos["entryMid"]) * quantity
                entry_cost = pos["entryFee"] + pos["entryMid"] * quantity * (spread_pct / 200 + slip_pct / 100)
                exit_cost = fee + notional * (spread_pct / 200 + slip_pct / 100)
                net = gross - entry_cost - exit_cost
                cash += notional - fee
                orders.append({"time": iso(int(next_bar["time"])), "signalTime": iso(candle_time), "pair": pair, "side": side,
                               "status": "filled", "quantity": quantity, "signalPrice": bar["close"], "fillPrice": fill_price,
                               "fee": fee,
                               "spreadCost": notional * spread_pct / 200 if cost_status == "measured_pre_freeze" else None,
                               "slippageCost": notional * slip_pct / 100 if cost_status == "measured_pre_freeze" else None})
                trades.append({"time": iso(int(next_bar["time"])), "pair": pair, "quantity": quantity, "grossPnl": gross, "netPnl": net})
                del positions[pair]
            else:
                if daily_blocked or len(positions) >= MAX_POSITIONS or pair in positions:
                    continue
                current_equity = cash + sum(
                    marked_position_value(p, pos["quantity"], candle_time)
                    for p, pos in positions.items()
                )
                budget = min(cash, current_equity * MAX_POSITION_PCT)
                quantity = budget / (fill_price * (1 + FEE_RATE))
                notional = quantity * fill_price
                fee = notional * FEE_RATE
                if notional < MIN_ORDER:
                    continue
                cash -= notional + fee
                positions[pair] = {"quantity": quantity, "entryMid": reference, "entryFee": fee,
                                   "highestClose": bar["close"]}
                orders.append({"time": iso(int(next_bar["time"])), "signalTime": iso(candle_time), "pair": pair, "side": side,
                               "status": "filled", "quantity": quantity, "signalPrice": bar["close"], "fillPrice": fill_price,
                               "fee": fee,
                               "spreadCost": notional * spread_pct / 200 if cost_status == "measured_pre_freeze" else None,
                               "slippageCost": notional * slip_pct / 100 if cost_status == "measured_pre_freeze" else None})
        mark = cash + sum(
            marked_position_value(pair, pos["quantity"], candle_time)
            for pair, pos in positions.items()
        )
        equity.append({"time": iso(candle_time), "equity": mark, "cash": cash,
                       "positionsValue": mark - cash,
                       "valuation": (
                           "close less measured half-spread estimate"
                           if cost_status == "measured_pre_freeze"
                           else "close; spread/slippage unavailable and omitted"
                       )})

    if not equity:
        raise ValueError("Tidak ada candle serentak untuk periode yang diminta.")
    start_price = next(row["close"] for row in data["BTCIDR"] if row["time"] >= start)
    end_price = next((row["close"] for row in reversed(data["BTCIDR"]) if row["time"] < end), None)
    result = {
        "schemaVersion": 1,
        "metadata": {
            "strategyName": "Indodax EMA Trend Following (dry run)",
            "timeframeMinutes": args.timeframe_minutes, "pairs": list(args.pairs),
            "initialCapital": INITIAL_CAPITAL, "freezeAt": FREEZE_AT,
            "backtestStart": iso(start), "backtestEnd": iso(end),
            "historicalDataSourceUrl": "local CSV; source provenance must be verified from the dataset",
            "historicalDataAccessDate": datetime.now(timezone.utc).date().isoformat(),
            "entryRule": "EMA 30 melintasi EMA 100 ke atas dalam 5 candle; RSI Wilder 14 50-75; close di atas EMA 100.",
            "exitRule": "Close di bawah highestClose - 3 x ATR Wilder 14, atau EMA 30 di bawah EMA 100.",
            "sizingRule": "Maksimum 10% ekuitas per posisi, kas tersedia, maksimum 3 posisi, minimum order Rp25.000.",
            "parameters": {
                "fastEma": 30, "slowEma": 100, "rsiPeriod": 14, "rsiMin": 50,
                "rsiMax": 75, "atrPeriod": 14, "atrMultiple": 3, "breakoutLookback": 5,
            },
            "signalCodeRef": "Port Python terpisah dari lib/indodax-bot.js; commit freeze dan parity per candle belum diverifikasi.",
            "snapshotSource": str(args.snapshots) if args.snapshots else None,
            "signalParityVerified": False,
            "backtestSnapshotCount": snapshot_count,
            "backtestMedianSpreadPct": median_spread,
            "backtestMedianSlippagePct": median_slippage,
            "marketImpactCostStatus": cost_status,
            "snapshotRule": (
                "median measured spreadPct and slippagePct only from observations strictly before freeze"
                if cost_status == "measured_pre_freeze"
                else "spread and slippage unavailable; omitted, not assumed to be zero in reality"
            ),
            "performanceValidity": (
                "cost_model_with_measured_pre_freeze_spread_slippage"
                if cost_status == "measured_pre_freeze"
                else "incomplete_market_costs_indicative_only"
            ),
            "medianCostsPct": (
                {pair: {"spread": values[0], "slippage": values[1]} for pair, values in costs.items()}
                if cost_status == "measured_pre_freeze"
                else {pair: {"spread": None, "slippage": None} for pair in args.pairs}
            ),
            "forwardStart": FREEZE_AT, "takerFeeRate": FEE_RATE, "minimumOrderIdr": MIN_ORDER,
            "maxOpenPositions": MAX_POSITIONS, "maxPositionPct": MAX_POSITION_PCT,
            "dailyLossLimitPct": DAILY_LOSS_LIMIT,
        },
        "backtest": {
            "equity": equity,
            "benchmark": [{"time": iso(start), "price": start_price}, {"time": iso(end - 1), "price": end_price}],
            "signals": signals, "orders": orders, "trades": trades,
        },
        "forward": {"scheduledCandles": [], "calls": [], "equity": [], "signals": [], "orders": [], "trades": [], "errors": [], "snapshots": []},
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    download = subparsers.add_parser("download", help="Tarik candle Indodax secara mundur dan berurutan")
    download.add_argument("--start", required=True, help="ISO date/time; contoh 2023-11-04T00:00:00Z")
    download.add_argument("--end", required=True)
    download.add_argument("--pairs", nargs="+", default=list(PAIRS))
    download.add_argument("--out", default="data/indodax_1h")
    run = subparsers.add_parser("run", help="Jalankan backtest dari CSV candle lokal")
    run.add_argument("--data", default="data/indodax_d1h")
    run.add_argument("--snapshots", help="JSONL spread/slippage terukur sebelum freeze (opsional; bila absen, biaya pasar tidak diterapkan)")
    run.add_argument("--start", required=True)
    run.add_argument("--end", required=True)
    run.add_argument("--timeframe-minutes", type=int, choices=(60, 240, 1440), default=1440,
                     help="Timeframe candle CSV (default: 1440 untuk harian)")
    run.add_argument("--pairs", nargs="+", default=list(PAIRS))
    run.add_argument("--out", default="results/backtest.json")
    args = parser.parse_args()
    try:
        if args.command == "download":
            download_history(args)
        else:
            result = backtest(args)
            print(f"Backtest tersimpan: {args.out}; candle={len(result['backtest']['equity'])}; order={len(result['backtest']['orders'])}")
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Backtest tidak selesai: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
