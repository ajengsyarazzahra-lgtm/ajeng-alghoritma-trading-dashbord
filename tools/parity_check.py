#!/usr/bin/env python3
"""Bandingkan indikator dan sinyal BELI antara bot (JavaScript) dan backtest (Python) per candle.

Bot menghitung dari jendela <=650 bar terakhir tiap panggilan; backtest.py menghitung dari seluruh
riwayat. Skrip ini menjalankan keduanya pada candle CSV yang sama dan melaporkan selisihnya.

Pemakaian:
  python tools/parity_check.py --data data/indodax_1h --pairs BTCIDR ETHIDR XRPIDR --step 1
Hasil: results/parity_check.json (untuk dilampirkan di paket UAS).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import backtest as bt  # noqa: E402

WINDOW = 650


def buy_signal(ind: dict, close: float) -> bool:
    return bool(ind["crossedUp"] and ind["fast"] > ind["slow"]
                and ind["rsi"] is not None and 50 <= ind["rsi"] <= 75 and close > ind["slow"])


def python_indicators(rows: list[dict], step: int) -> dict[int, dict]:
    closes = [r["close"] for r in rows]
    fast, slow, rsis, atrs = bt.ema(closes, 30), bt.ema(closes, 100), bt.rsi(closes), bt.atr(rows)
    out = {}
    for i in range(120, len(rows), step):
        cross = any(fast[k] > slow[k] and fast[k - 1] <= slow[k - 1] for k in range(max(1, i - 4), i + 1))
        out[int(rows[i]["time"])] = {"fast": fast[i], "slow": slow[i], "rsi": rsis[i], "atr": atrs[i], "crossedUp": cross,
                                      "close": rows[i]["close"]}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="data/indodax_1h")
    ap.add_argument("--pairs", nargs="+", default=list(bt.PAIRS))
    ap.add_argument("--step", type=int, default=1, help="1 = setiap candle (lambat untuk 3 tahun 1 jam); 6 = lebih cepat")
    ap.add_argument("--out", default="results/parity_check.json")
    args = ap.parse_args()

    candles = {p: bt.read_candles(Path(args.data), p) for p in args.pairs}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        json.dump({p: [{**r, "time": int(r["time"])} for r in rows] for p, rows in candles.items()}, handle)
        tmp = handle.name
    js = subprocess.run(["node", str(ROOT / "tools" / "dump_indicators.js"), tmp, str(args.step)],
                        capture_output=True, text=True, check=True).stdout
    js_ind = json.loads(js)

    report = {"window": WINDOW, "step": args.step, "pairs": {}}
    total = mismatches = 0
    for pair in args.pairs:
        py = python_indicators(candles[pair], args.step)
        n = diff_sig = 0
        max_rel = {"fast": 0.0, "slow": 0.0, "rsi": 0.0, "atr": 0.0}
        examples = []
        for row in js_ind[pair]:
            p = py[row["time"]]
            n += 1
            for key in max_rel:
                if p[key] is None or row[key] is None:
                    continue
                rel = abs(p[key] - row[key]) / max(abs(p[key]), 1e-12)
                max_rel[key] = max(max_rel[key], rel)
            if buy_signal(p, p["close"]) != buy_signal(row, p["close"]):
                diff_sig += 1
                if len(examples) < 10:
                    examples.append({"time": row["time"], "python": buy_signal(p, p["close"]), "js": buy_signal(row, p["close"])})
        report["pairs"][pair] = {"candlesCompared": n, "buySignalMismatches": diff_sig,
                                 "maxRelativeDiff": max_rel, "mismatchExamples": examples}
        total += n
        mismatches += diff_sig
        print(f"{pair}: {n} candle, beda sinyal beli={diff_sig}, selisih relatif maks={max_rel}")
    report["totalCandlesCompared"] = total
    report["totalBuySignalMismatches"] = mismatches
    report["signalParityPct"] = 100.0 * (total - mismatches) / total if total else None
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Parity sinyal beli: {report['signalParityPct']:.4f}% -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
