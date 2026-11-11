# Catatan perubahan pasca-freeze (dicatat apa adanya)

Freeze date menurut soal: **Rabu 4 November 2026, 12.00 WIB**. Commit pertama di repositori ini bertanggal
**5 November 2026, 11.17 WIB** (hash `32b85c3`), jadi **tidak ada commit freeze yang sah**. Dokumen ini
mencatat semua perubahan sesudahnya agar bisa diaudit. Riwayat commit tidak diubah dan tidak ditulis ulang.

## Kronologi
| Tanggal (WIB) | Peristiwa |
|---|---|
| 5 Nov 2026 | Commit pertama (`32b85c3`) dan kode bot (timeframe 60 menit, EMA 30/100, RSI 50–75, ATR 3×). |
| 5 Nov 2026 | Commit pertama juga memuat `log-indodax-lengkap.json` (log sintetik hasil `generate_log.py`). Log itu **bukan data Indodax**. |
| 7 Nov 2026 | Log sintetik dihapus (`f49c603`). Jangan dipakai sebagai hasil. Tidak ada angka darinya di laporan ini. |
| 10 Nov 2026 | Timeframe sempat diubah ke harian (`22f6439`) lalu dikembalikan ke 60 menit di versi ini. |

## Perubahan di versi ini (10 November 2026)
1. **Perbaikan bug (tidak mengubah aturan strategi):** di `computeIndicators` (`lib/indodax-bot.js`) kunci `fast` dan `slow`
   didefinisikan dua kali, sehingga nilai angka tertimpa array EMA. Akibatnya syarat `close > slow` dan `fast > slow` tidak
   pernah benar, jadi **bot tidak pernah bisa memberi sinyal beli**. Perbaikan: array diganti nama menjadi `fastSeries`/`slowSeries`.
   Aturan, parameter, dan universe tidak berubah.
2. Timeframe dikembalikan ke **60 menit** (`timeframeMinutes: 60`) dan jadwal GitHub Actions ke **tiap jam menit ke-17 UTC**.
3. `backtest.py`: default timeframe 60 menit, opsi `--snapshot-cutoff`. Bila dipakai setelah freeze, metadata mencatat
   `snapshotCutoffAfterFreeze=true`.
4. Alat baru: `tools/parity_check.py` + `tools/dump_indicators.js` (cek kesamaan indikator dan sinyal bot vs backtest),
   `tools/collect_snapshots.js` (pengumpul snapshot order book).
5. Dihapus dari paket: `kompas100_10thn.json` (data saham, tidak dipakai), ZIP revisi UTS bersarang. Hasil backtest harian
   dipindah ke `results/indikatif_harian/` karena bukan konfigurasi bot yang sekarang.
6. Validasi data diperketat di `lib/indodax-bot.js` dan `backtest.py`: harga OHLC/volume nol atau tidak valid pada jendela indikator tidak dapat menghasilkan entry. Alasan penolakan disimpan sebagai alasan kualitas data. Perubahan ini memperbaiki perlakuan data rusak dan **tidak mengubah aturan sinyal**.
7. Audit operasional menambahkan batas jeda 350 ms sebelum setiap percobaan request publik di `lib/indodax-bot.js` (agar retry juga mematuhi batas request) dan timeout 8 detik pada `redis.append` di `lib/redis.js`. Append tidak dicoba ulang untuk menghindari duplikasi log setelah timeout yang hasilnya ambigu.
8. `lib/bot-config.js` kini menolak `BOT_PAIRS` yang berbeda dari BTCIDR, ETHIDR, XRPIDR agar universe tidak dapat berubah melalui environment variable. Ini mempertahankan universe UAS yang ditetapkan dan tidak mengubah aturan sinyal.
9. Hasil dan dokumentasi data Indodax hourly, backtest/parity, ringkasan likuiditas, snapshot pasca-freeze, laporan audit, dan catatan metrik telah ditambahkan/diperbarui; tidak ada data sintetis yang dibuat.

## Konsekuensi yang harus dijelaskan di refleksi
- Karena freeze terlewat, komponen kecocokan backtest–forward tidak dapat dibuktikan melalui commit freeze.
- Forward test baru dimulai setelah bot benar-benar berjalan dan log tercatat; jendela 10 hari harus dihitung dari
  log nyata. Jangan menulis hasil di luar yang tercatat.
