#!/usr/bin/env python3
"""Recalculate UAS metrics from the dashboard export or schemaVersion 1 JSON."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def dashboard_data(data: dict[str, Any]) -> dict[str, Any]:
    if data.get("schemaVersion") == 1:
        return data
    if data.get("ok") is not True or not all(key in data for key in ("rules", "state", "logs")):
        raise ValueError("Input harus berupa skema UAS v1 atau ekspor dashboard Vercel.")

    rules = data["rules"]
    logs = data["logs"]
    state = data["state"]
    start = timestamp(rules.get("forwardStart") or rules.get("freezeAt"))
    end = timestamp(data.get("updatedAt") or state.get("lastSuccessAt"))
    interval = number(rules.get("timeframeMinutes"))
    scheduled: list[dict[str, str]] = []
    if start and end and interval and interval > 0:
        step = interval * 60
        start_epoch = math.ceil(start.timestamp() / step) * step
        limit = min(end.timestamp(), start.timestamp() + 10 * 86400)
        current = start_epoch
        while current + 2 * step <= limit:
            scheduled.append({
                "candleTime": datetime.fromtimestamp(current, timezone.utc).isoformat(),
                "closesAt": datetime.fromtimestamp(current + 2 * step, timezone.utc).isoformat(),
            })
            current += step
    return {
        "schemaVersion": 1,
        "metadata": {
            "initialCapital": rules.get("initialCapitalIdr"),
            "timeframeMinutes": rules.get("timeframeMinutes"),
            "forwardStart": rules.get("forwardStart") or rules.get("freezeAt"),
            "forwardEnd": data.get("updatedAt"),
        },
        "rules": rules,
        "state": state,
        "logs": logs,
        "logExportComplete": data.get("logExportComplete") is True,
        "backtest": {},
        "forward": {"scheduledCandles": scheduled, **logs},
    }


def sequence_metrics(equity: list[dict[str, Any]], initial: float | None) -> dict[str, Any]:
    rows = sorted(
        (row for row in equity if isinstance(row, dict) and number(row.get("equity")) is not None),
        key=lambda row: timestamp(row.get("time") or row.get("timestamp")) or datetime.min.replace(tzinfo=timezone.utc),
    )
    values = [float(number(row["equity"])) for row in rows]
    peak = -math.inf
    drawdown = 0.0
    for value in values:
        peak = max(peak, value)
        if peak > 0:
            drawdown = min(drawdown, value / peak - 1)
    result: dict[str, Any] = {
        "equityPoints": len(values),
        "maxDrawdownPct": abs(drawdown) * 100 if values else None,
        "returnPct": (values[-1] / initial - 1) * 100 if values and initial and initial > 0 else None,
    }
    if len(rows) >= 2 and initial and initial > 0:
        first_time = timestamp(rows[0].get("time") or rows[0].get("timestamp"))
        last_time = timestamp(rows[-1].get("time") or rows[-1].get("timestamp"))
        if first_time and last_time and last_time > first_time:
            years = (last_time - first_time).total_seconds() / (365.2425 * 86400)
            result["cagrPct"] = ((values[-1] / initial) ** (1 / years) - 1) * 100 if values[-1] > 0 else None
        else:
            result["cagrPct"] = None
    else:
        result["cagrPct"] = None
    return result


def trade_metrics(
    section: dict[str, Any],
    complete: bool,
    market_impact_cost_status: str | None = None,
) -> dict[str, Any]:
    trades = section.get("trades") or []
    orders = section.get("orders") or []
    closed = [row for row in trades if number(row.get("netPnl")) is not None]
    wins = [row for row in closed if float(row["netPnl"]) > 0]
    losses = [row for row in closed if float(row["netPnl"]) < 0]
    net_wins = sum(float(row["netPnl"]) for row in wins)
    net_losses = abs(sum(float(row["netPnl"]) for row in losses))
    gross_profit = sum(max(0.0, number(row.get("grossPnl")) or 0.0) for row in closed)
    fees_known = all(number(row.get("fee")) is not None for row in orders)
    market_impact_known = market_impact_cost_status != "unavailable_omitted" and all(
        number(row.get(field)) is not None
        for row in orders
        for field in ("spreadCost", "slippageCost")
    )
    fees = sum(number(row.get("fee")) or 0.0 for row in orders) if fees_known else None
    spread = (
        sum(float(number(row.get("spreadCost"))) for row in orders)
        if market_impact_known else None
    )
    slippage = (
        sum(float(number(row.get("slippageCost"))) for row in orders)
        if market_impact_known else None
    )
    costs_known = fees_known and market_impact_known
    total_costs = fees + spread + slippage if costs_known else None
    return {
        "tradeRows": len(trades),
        "closedTrades": len(closed),
        "winRatePct": len(wins) / len(closed) * 100 if closed else None,
        "profitFactor": net_wins / net_losses if net_losses else None,
        "avgWinIdr": net_wins / len(wins) if wins else None,
        "avgLossIdr": -net_losses / len(losses) if losses else None,
        "grossProfitIdr": gross_profit,
        "realizedNetProfitIdr": sum(float(row["netPnl"]) for row in closed) if closed else None,
        "feesIdr": fees,
        "spreadCostIdr": spread,
        "slippageCostIdr": slippage,
        "costToGrossProfitPct": total_costs / gross_profit * 100 if gross_profit > 0 and total_costs is not None else None,
        "tradeRowsComplete": complete or "trades" in section,
    }


def calculate(data: dict[str, Any]) -> dict[str, Any]:
    data = dashboard_data(data)
    logs = data.get("logs") or {}
    state = data.get("state") or {}
    stats = state.get("stats") or {}
    metadata = data.get("metadata") or {}
    rules = data.get("rules") or {}
    forward = data.get("forward") or {}
    complete = data.get("logExportComplete") is True
    initial = number(rules.get("initialCapitalIdr", metadata.get("initialCapital")))

    forward_trades = forward.get("trades") or logs.get("trades") or []
    forward_orders = forward.get("orders") or logs.get("orders") or []
    forward_equity = forward.get("equity") or logs.get("equity") or []
    forward_calls = forward.get("calls") or logs.get("calls") or []
    closed_trades = [row for row in forward_trades if number(row.get("netPnl")) is not None]
    wins = [row for row in closed_trades if float(row["netPnl"]) > 0]
    losses = [row for row in closed_trades if float(row["netPnl"]) < 0]
    net_wins = sum(float(row["netPnl"]) for row in wins)
    net_losses = abs(sum(float(row["netPnl"]) for row in losses))
    gross_profit = sum(max(0.0, number(row.get("grossPnl")) or 0.0) for row in closed_trades)

    equity_rows = sorted(
        (row for row in forward_equity if isinstance(row, dict) and number(row.get("equity")) is not None),
        key=lambda row: timestamp(row.get("time") or row.get("timestamp")) or datetime.min.replace(tzinfo=timezone.utc),
    )
    last_equity = (
        float(number(equity_rows[-1]["equity"])) if complete and equity_rows
        else number(state.get("lastEquity"))
        if number(state.get("lastEquity")) is not None
        else float(number(equity_rows[-1]["equity"])) if equity_rows else None
    )
    if not complete and number(stats.get("totalTrades")) is not None:
        total_trades = int(number(stats["totalTrades"]) or 0)
        total_wins = int(number(stats.get("wins")) or 0)
        gross_profit = number(stats.get("grossProfit")) or 0.0
        fees = number(stats.get("fees")) or 0.0
        spread_cost = number(stats.get("spreadCost")) or 0.0
        slippage_cost = number(stats.get("slippageCost")) or 0.0
    else:
        total_trades = len(closed_trades)
        total_wins = len(wins)
        fees = sum(number(row.get("fee")) or 0.0 for row in forward_orders)
        spread_cost = sum(number(row.get("spreadCost")) or 0.0 for row in forward_orders)
        slippage_cost = sum(number(row.get("slippageCost")) or 0.0 for row in forward_orders)

    interval = number(rules.get("timeframeMinutes", metadata.get("timeframeMinutes")))
    on_time: set[str] = set()
    if interval:
        for call in forward_calls:
            if str(call.get("status", "")).lower() != "processed":
                continue
            candle_time = timestamp(call.get("candleTime"))
            processed = timestamp(call.get("processedAt") or call.get("calledAt") or call.get("time"))
            if candle_time and processed and processed.timestamp() <= candle_time.timestamp() + interval * 120:
                on_time.add(candle_time.isoformat())
    evaluation_end = timestamp(data.get("updatedAt") or metadata.get("forwardEnd"))
    scheduled = 0
    for candle in forward.get("scheduledCandles") or []:
        closes_at = timestamp(candle.get("closesAt"))
        if closes_at and (evaluation_end is None or closes_at <= evaluation_end):
            scheduled += 1

    total_costs = fees + spread_cost + slippage_cost
    backtest_part = data.get("backtest") or {}
    backtest_equity = backtest_part.get("equity") or []
    backtest_metadata = metadata
    market_cost_status = backtest_metadata.get("marketImpactCostStatus", "unknown")
    market_cost_warning = None
    if market_cost_status == "unavailable_omitted":
        market_cost_warning = (
            "Spread/slippage tidak tersedia dan tidak diterapkan; metrik backtest bersifat indikatif "
            "dan bukan hasil dengan biaya eksekusi pasar lengkap."
        )
    elif market_cost_status == "unknown":
        market_cost_warning = "Status biaya spread/slippage tidak tercatat; kelengkapan biaya backtest tidak terverifikasi."
    backtest_result = {
        **sequence_metrics(backtest_equity, initial),
        **trade_metrics(
            backtest_part,
            True,
            backtest_metadata.get("marketImpactCostStatus"),
        ),
        "marketImpactCostStatus": market_cost_status,
        "performanceValidity": backtest_metadata.get("performanceValidity", "unverified_cost_model"),
        "warning": market_cost_warning,
    }
    forward_result = {
        **sequence_metrics(forward_equity, initial),
        **trade_metrics(forward, complete),
        "totalEquityIdr": last_equity,
        "returnPct": (last_equity / initial - 1) * 100 if last_equity is not None and initial and initial > 0 else None,
        "maxDrawdownPct": (
            abs(number(state.get("maxDrawdown")) or 0.0) * 100
            if not complete and state.get("lastEquityAt")
            else sequence_metrics(forward_equity, initial)["maxDrawdownPct"]
        ),
    }
    forward_start = timestamp(metadata.get("forwardStart") or rules.get("forwardStart") or rules.get("freezeAt"))
    forward_end = timestamp(metadata.get("forwardEnd"))
    def in_window(row: dict[str, Any]) -> bool:
        when = timestamp(row.get("candleTime") or row.get("time"))
        return bool(when and (forward_start is None or when >= forward_start)
                    and (forward_end is None or when <= forward_end))
    back_signals = [row for row in backtest_part.get("signals", []) if in_window(row)]
    live_signals = [row for row in (forward.get("signals") or logs.get("signals") or []) if in_window(row)]
    def signal_key(row: dict[str, Any]) -> tuple[str, str, str] | None:
        when = timestamp(row.get("candleTime") or row.get("time"))
        pair, action = row.get("pair"), row.get("action")
        if not when or not pair or action not in {"buy", "sell"}:
            return None
        return when.isoformat(), str(pair).upper(), str(action).lower()
    back_keys = [key for row in back_signals if (key := signal_key(row)) is not None]
    live_keys = [key for row in live_signals if (key := signal_key(row)) is not None]
    from collections import Counter
    back_count, live_count = Counter(back_keys), Counter(live_keys)
    comparison = {
        "backtestSignalRowsInWindow": len(back_signals),
        "forwardSignalRowsInWindow": len(live_signals),
        "backtestActionSignals": len(back_keys),
        "forwardActionSignals": len(live_keys),
        "matchedActionSignals": sum((back_count & live_count).values()),
        "backtestOnlyActionSignals": sum((back_count - live_count).values()),
        "forwardOnlyActionSignals": sum((live_count - back_count).values()),
        "comparable": bool(forward_start and forward_end and back_signals and live_signals),
    }
    benchmark = backtest_part.get("benchmark") or []
    benchmark_rows = sorted(
        (row for row in benchmark if isinstance(row, dict) and number(row.get("price")) is not None),
        key=lambda row: timestamp(row.get("time")) or datetime.min.replace(tzinfo=timezone.utc),
    )
    if len(benchmark_rows) >= 2 and number(benchmark_rows[0].get("price")):
        benchmark_return = (
            float(number(benchmark_rows[-1]["price"])) / float(number(benchmark_rows[0]["price"])) - 1
        ) * 100
    else:
        benchmark_return = None
    backtest_result["benchmarkReturnPct"] = benchmark_return
    return {
        "backtest": backtest_result,
        "forward": forward_result,
        "comparison": comparison,
        "source": "dashboard export / raw JSON; unavailable values are not estimated",
        "rawLogsComplete": complete,
        "totalEquityIdr": last_equity,
        "returnPct": (last_equity / initial - 1) * 100 if last_equity is not None and initial and initial > 0 else None,
        "maxDrawdownPct": (
            abs(number(state.get("maxDrawdown")) or 0.0) * 100
            if not complete and state.get("lastEquityAt")
            else sequence_metrics(forward_equity, initial)["maxDrawdownPct"]
        ),
        "cagrPct": None,
        "totalTrades": total_trades,
        "winRatePct": total_wins / total_trades * 100 if total_trades else None,
        "profitFactor": net_wins / net_losses if net_losses else None,
        "profitFactorStatus": "undefined: no net losses in available trade rows" if not net_losses else "calculated",
        "totalOrders": int(number(stats.get("totalOrders")) or 0) if not complete else len(forward_orders),
        "grossProfitIdr": gross_profit,
        "realizedNetProfitIdr": number(stats.get("netProfit")) if not complete else sum(float(row["netPnl"]) for row in closed_trades),
        "feesIdr": fees,
        "spreadCostIdr": spread_cost,
        "slippageCostIdr": slippage_cost,
        "costToGrossProfitPct": total_costs / gross_profit * 100 if gross_profit > 0 else None,
        "callsTotal": number(logs.get("callsTotal")) if "logs" in data else len(forward_calls),
        "successfulCallsTotal": number(stats.get("totalSuccessCalls")),
        "successfulCallsInExport": sum(str(row.get("status", "")).lower() in {"processed", "duplicate"} for row in forward_calls),
        "onTimeCandlesInExport": len(on_time),
        "scheduledCandlesElapsed": scheduled,
        "uptimePctInExport": len(on_time) / scheduled * 100 if scheduled else None,
        "retainedCallRows": len(forward_calls),
        "retainedOrderRows": len(forward_orders),
        "retainedTradeRows": len(forward_trades),
        "warning": "Ekspor tidak lengkap; metrik yang tidak tersimpan tidak dapat diverifikasi dari baris mentah." if not complete else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="Path ekspor JSON dashboard atau log skema UAS v1")
    parser.add_argument("--output", help="Simpan hasil JSON ke file, bukan hanya stdout")
    args = parser.parse_args()
    try:
        data = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
        if not isinstance(data, dict):
            raise ValueError("Akar JSON harus berupa object.")
        result = json.dumps(calculate(data), indent=2, ensure_ascii=False)
        if args.output:
            Path(args.output).write_text(result + "\n", encoding="utf-8")
        print(result)
        return 0
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"Gagal menghitung ulang: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
