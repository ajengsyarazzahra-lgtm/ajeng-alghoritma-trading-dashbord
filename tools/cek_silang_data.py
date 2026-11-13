#!/usr/bin/env python3
"""Cek silang: candle 1 jam (data/indodax_1h) yang diagregasi per hari UTC
vs candle harian (data/indodax_harian). Murni dari file di repo.

Pemakaian (dari folder repo):
  python tools/cek_silang_data.py
"""
import csv, json, datetime as dt, collections
PAIRS = [("BTCIDR", "BTC"), ("ETHIDR", "ETH"), ("XRPIDR", "XRP")]
out = {"metode": "agregasi 1 jam per hari UTC; bandingkan close harian, toleransi < Rp1", "pairs": {}}
for p, z in PAIRS:
    day = collections.OrderedDict()
    for r in csv.DictReader(open(f"data/indodax_1h/{p}.csv")):
        d = dt.datetime.fromtimestamp(int(r["time"]), dt.timezone.utc).strftime("%Y-%m-%d")
        c = float(r["close"])
        n = day.get(d, [0, c])
        day[d] = [n[0] + 1, c]  # jumlah bar, close terakhir hari itu
    ref = {r["t"]: float(r["c"]) for r in csv.DictReader(open(f"data/indodax_harian/{z}.csv"))}
    common = [d for d in day if d in ref]
    full = [d for d in common if day[d][0] == 24]
    same = [d for d in full if abs(day[d][1] - ref[d]) < 1]
    out["pairs"][p] = {"hari_tumpang_tindih": len(common), "hari_dengan_24_bar": len(full),
                       "close_sama": len(same), "close_beda": [d for d in full if d not in same][:10]}
json.dump(out, open("results/cek_silang_harian_vs_1jam.json", "w"), indent=2)
print(json.dumps(out, indent=2))
