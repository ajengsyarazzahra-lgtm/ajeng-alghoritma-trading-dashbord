# Langkah akhir sebelum kumpul (Sabtu 14 Nov 2026, 23.59 WIB)

1. Setelah 14 Nov 12.00 WIB, ekspor log lengkap:
   `https://<domain-vercel>/api/dashboard?full=1` -> simpan sebagai `logs/raw_forward_test.json` (cek `logExportComplete: true`).
2. Hitung ulang metrik forward:
   `python hitung_ulang.py logs/raw_forward_test.json --output results/forward_metrics.json`
3. Tarik data 1 jam sampai 14 Nov dan backtest jendela forward (dari laptop, jangan paralel):
   `python backtest.py download --start 2023-11-01T00:00:00Z --end 2026-11-14T12:00:00Z --pairs BTCIDR ETHIDR XRPIDR --out data/indodax_1h`
   `python backtest.py run --data data/indodax_1h --timeframe-minutes 60 --start 2026-11-04T05:00:00Z --end 2026-11-14T05:00:00Z --out results/backtest_jendela_forward.json`
4. Ringkas semua snapshot (laptop + bot) untuk refleksi:
   `python tools/ringkas_snapshot.py logs/snapshots_laptop.jsonl results/spread_snapshot_summary.json`
5. Isi semua [ISI] di `REFLEKSI_DRAFT.md` (ganti namanya jadi bagian refleksi di `STRATEGI_DAN_REFLEKSI.md`) dan `FEE_DAN_MINIMUM_ORDER.md`.
6. Bersihkan paket: hapus semua folder `__pycache__`, jangan sertakan ZIP lama.
7. `git add` -> `git commit` -> `git push` (biasa, **tanpa force-push**).
8. ZIP final = folder repo lengkap dengan `.git`. Tulis link Vercel dan link GitHub di kolom catatan RISE.
