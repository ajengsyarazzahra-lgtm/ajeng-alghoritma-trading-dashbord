#!/usr/bin/env python3
"""Ringkas spread/slippage dari snapshot order book (JSONL) -> JSON.

Pemakaian:
  python tools/ringkas_snapshot.py logs/snapshots_laptop.jsonl results/spread_snapshot_summary.json
Murni menghitung dari baris yang ada; tidak membuat data.
"""
import json, statistics as st, sys
from collections import defaultdict

def pct(xs, q):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(q * (len(xs) - 1))))]

def main(src, dst):
    rows = [json.loads(l) for l in open(src, encoding="utf-8") if l.strip()]
    by = defaultdict(list)
    for r in rows:
        by[r["pair"]].append(r)
    out = {"source": src, "totalRows": len(rows),
           "firstTime": min(r["time"] for r in rows), "lastTime": max(r["time"] for r in rows), "pairs": {}}
    for p, rs in sorted(by.items()):
        sp = [r["spreadPct"] for r in rs if r.get("spreadPct") is not None]
        sl = [r["slippagePct"] for r in rs if r.get("slippagePct") is not None]
        out["pairs"][p] = {
            "n": len(rs),
            "spreadPct": {"median": st.median(sp), "mean": st.mean(sp), "p90": pct(sp, .9), "max": max(sp)},
            "slippagePct": {"median": st.median(sl), "mean": st.mean(sl), "max": max(sl)} if sl else None,
            "notionalIdr": rs[0].get("notionalIdr"),
        }
    json.dump(out, open(dst, "w", encoding="utf-8"), indent=2)
    print(json.dumps(out["pairs"], indent=2))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
