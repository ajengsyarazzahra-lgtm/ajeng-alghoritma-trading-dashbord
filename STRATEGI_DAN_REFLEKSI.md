# Strategi dan refleksi UAS — status audit 10 November 2026

> Semua perubahan dan pengujian yang dilakukan setelah tenggat freeze dicatat sebagai pasca-freeze. Ini bukan bukti freeze 4 November atau forward test 10 hari.

Dashboard live: [https://ajeng-lq45-dashboard.vercel.app/](https://ajeng-lq45-dashboard.vercel.app/)

## Status bukti dan perubahan dari versi UTS

- Strategi tetap dry-run: bot tidak mengirim order nyata atau memakai API key Indodax untuk trading.
- Freeze yang disyaratkan pada 4 November 2026 pukul 12.00 WIB terlewat. Commit pertama bertanggal 5 November 2026 dan hash-nya `32b85c3`; tidak ada commit freeze sah yang dibuat mundur.
- Commit pertama memuat `log-indodax-lengkap.json` yang dibuat oleh generator template. Berkas itu log sintetik, bukan data Indodax, dan dihapus pada 7 November (`f49c603`). Tidak ada hasil di dokumen ini yang dihitung dari log tersebut.
- Perubahan 10 November memperbaiki bug `computeIndicators` yang menimpa nilai EMA dengan array, mengembalikan timeframe dan jadwal ke 60 menit, menolak candle OHLC/volume tidak valid dalam jendela indikator, membatasi `BOT_PAIRS` ke universe tetap, memastikan jeda request publik berlaku untuk setiap percobaan ulang, dan menambahkan timeout Redis append. Seluruh perubahan terjadi setelah freeze; rincian ada di `CATATAN_PERUBAHAN_PASCA_FREEZE.md`.
- Prompt tugas menyebut alamat author dua commit 10 November (`22f6439`, `ec864dc`) berbeda, tetapi pemeriksaan `git show` pada repositori lokal menunjukkan keduanya sama-sama `alza45 <bungaalzannah@gmail.com>`. **PERLU DIISI OLEH SAYA** untuk menjelaskan perbedaan yang dimaksud oleh prompt; identitas/riwayat commit tidak diubah.
- Koneksi Indodax dari laptop menjawab HTTP 200 pada pengujian 10 November. Itu tidak membuktikan bot Vercel online atau forward test berhasil. Belum ada log forward lengkap 10 hari, sehingga uptime, biaya eksekusi nyata, dan kecocokan hasil forward belum tersedia.

## Aturan bot yang dikodekan

Universe tetap BTCIDR, ETHIDR, XRPIDR; timeframe 60 menit; candle berjalan dibuang. Indikator: EMA 30/100, RSI Wilder 14 rentang 50–75, ATR Wilder 14, trailing stop 3 × ATR, dan lookback cross lima candle.

- Entry long: EMA 30 melintasi ke atas EMA 100 dalam lima candle terakhir, EMA cepat di atas EMA lambat, RSI 50–75, dan close di atas EMA lambat.
- Exit: close di bawah `highestClose - 3 × ATR(14)` atau EMA cepat di bawah EMA lambat.
- Modal virtual Rp100.000.000; taker fee 0,51%; minimum order Rp25.000; maksimum tiga posisi; sizing maksimum 10% ekuitas per posisi; daily loss limit 3% dengan hari WIB.
- Entry/exit disimulasikan menelusuri level asks/bids dan menghitung harga rata-rata fill. Nilai posisi dan ekuitas memakai best bid. Order book kosong atau spread di atas 2% menolak entry.
- Candle terakhir harus berumur tidak lebih dari dua timeframe; 120 candle harus berurutan dan OHLC/volume harus valid serta positif. Data berkualitas buruk menghasilkan alasan hold/validation error, bukan transaksi.

## Universe dan bukti likuiditas awal

Universe tidak berubah dari BTCIDR, ETHIDR, XRPIDR. Ringkasan deskriptif dihitung dari 30 hari pertama data per jam (1–30 November 2023 UTC), dengan notional harian `close × volume` dari CSV; median dan mean per pair disimpan di `results/universe_liquidity_initial_30d.json`, beserta hash SHA-256 CSV sumber.

Angka tersebut hanya menggambarkan volume pada awal rentang CSV, bukan ambang seleksi yang ditetapkan sebelum freeze dan bukan bukti bahwa universe dipilih dengan aturan historis tersebut. Daftar tiga aset tetap saat ini berpotensi survivorship bias; tanpa daftar aset yang tersedia pada awal periode dan kriteria seleksi yang dibekukan sebelumnya, survivorship bias tidak dapat ditiadakan atau dihitung secara independen.

## Hasil historis indikatif dan parity

Backtest 10 November 2023–10 November 2026 menggunakan candle Indodax 1 jam. Hasil Python dihitung ulang di `results/backtest_1h_3y_metrics.json`: return `-21.70898%`, CAGR `-7.83244%`, maximum drawdown `25.08363%`, profit factor `0.67668`, win rate `22.19570%`, 419 trade tertutup, fee Rp39.088.642,60, benchmark BTC `136.17281%`.

Spread dan slippage pra-freeze tidak tersedia, sehingga tidak diterapkan sebagai nilai nol aktual. Status hasil `incomplete_market_costs_indicative_only`; metrik bukan performa net lengkap atau jaminan hasil masa depan. Tiga snapshot order book laptop yang tersimpan adalah pasca-freeze dan tidak dipakai dalam backtest.

Parity membandingkan 26.400 candle per pair, 79.200 total, menghasilkan nol perbedaan sinyal beli. Selisih relatif maksimum EMA lambat adalah `0.0000004002` BTC, `0.0000006636` ETH, dan `0.0000008426` XRP; EMA cepat, RSI, dan ATR tidak berbeda menurut pemeriksaan. Ini menguji indikator/sinyal, bukan kecocokan eksekusi live atau kelengkapan data historis.

Hasil backtest harian sebelumnya masih tersedia di `results/indikatif_harian/`; hasil itu dari perubahan timeframe yang pernah dilakukan setelah freeze dan bukan konfigurasi sekarang.

## Refleksi — ISI SETELAH LOG FORWARD TERSEDIA

- Selisih backtest dan forward dalam angka: **ISI SETELAH LOG FORWARD TERSEDIA**.
- Spread backtest dibanding seluruh snapshot yang tercatat: **ISI SETELAH LOG FORWARD TERSEDIA**. Snapshot pra-freeze tidak tersedia; pengukuran laptop setelah freeze tidak digunakan sebagai pengganti.
- Dampak jadwal GitHub Actions yang berjalan setiap jam pada uptime terukur: **ISI SETELAH LOG FORWARD TERSEDIA**.
- Freeze 4 November terlewat; jangan menyebut perubahan 10 November sebagai freeze yang sah.
- Commit pertama 5 November memuat log sintetik yang dihapus 7 November; log itu tidak valid sebagai bukti market.
- Penjelasan ketidaksesuaian catatan author dalam prompt dengan hasil `git show` untuk commit `22f6439` dan `ec864dc`: **PERLU DIISI OLEH SAYA**.
- Jangan mengekstrapolasi ketersediaan endpoint saat diuji dari laptop menjadi uptime Vercel. Ekspor lengkap baru dapat dinilai setelah `logExportComplete=true` dan kelengkapan rentang waktu diverifikasi.
