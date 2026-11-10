# Strategi dan refleksi UAS — status audit 10 November 2026

> Konfigurasi timeframe harian dan backtest yang dibuat setelah tanggal freeze adalah perubahan terlambat. Ini bukan bukti commit freeze pra-4 November atau forward test 10 hari yang berhasil.

## Status bukti

- Aturan yang tercatat di `lib/bot-config.js` dapat dijalankan sebagai simulasi dry-run; endpoint bot mengambil data publik dan tidak mengirim order nyata.
- Commit freeze yang disyaratkan pada 4 November 2026 pukul 12.00 WIB tidak tersedia. Perubahan yang dibuat setelah tanggal tersebut harus tetap dicatat sebagai perubahan pasca-freeze.
- Arsip yang diberikan berisi candle Indodax harian untuk BTC, ETH, dan XRP. File tersebut disalin ke `data/indodax_harian/`; rentang bersama berakhir 25 September 2026 dan cukup panjang untuk backtest historis tiga tahun.
- `backtest.py` dikonfigurasi untuk membaca header singkat `t,o,h,l,c,v` dan berjalan pada timeframe 1440 menit. Backtest yang dihasilkan adalah skenario indikatif: tanpa snapshot spread/slippage, dan bukan hasil dengan biaya eksekusi pasar lengkap.
- Backtest indikatif 25 September 2023–25 September 2026 menghasilkan return 7,59%, CAGR 2,47%, maximum drawdown 8,29%, dan 14 trade tertutup. Benchmark BTC buy-and-hold 268,66%. Angka ini hanya keluaran model yang diulang dari CSV dan fee 0,51%; bukan klaim performa net realistis karena spread/slippage tidak tersedia.
- Data tidak mencakup jendela 4–14 November 2026, sehingga tidak dapat digunakan untuk backtest ulang pada jendela forward tersebut. Arsip juga tidak membuktikan likuiditas universe pada awal periode maupun provenance/checksum setiap CSV secara independen.
- Snapshot spread/slippage pra-freeze yang dapat diaudit juga belum ditemukan. Tanpa snapshot, skrip menandai keterbatasan biaya di metadata dan tidak menyatakan biaya yang hilang sebagai nol secara nyata.
- Log forward test lengkap 4–14 November belum tersedia; file ini tidak mengisi data atau hasil dengan angka rekaan.
- API dashboard terakhir yang dicek melaporkan OFFLINE dan error Indodax HTTP 403. Karena itu uptime dan keberhasilan forward test belum dapat dinyatakan.

## Aturan bot yang dikodekan

- Universe default: BTCIDR, ETHIDR, XRPIDR. Kriteria likuiditas dan survivorship bias di awal periode belum dibuktikan oleh artefak yang tersedia.
- Timeframe yang dikonfigurasi setelah perubahan 10 November: harian (`tf=1D` Indodax); candle berjalan dibuang. Candle terakhir harus cukup baru, valid, bervolume positif, dan memiliki jendela indikator berurutan.
- Entry long: EMA 30 melintasi ke atas EMA 100 dalam lima candle terakhir, EMA cepat di atas EMA lambat, RSI Wilder 14 berada di 50–75, dan close di atas EMA lambat.
- Exit: close di bawah trailing stop `highestClose - 3 × ATR(14)` atau EMA cepat di bawah EMA lambat.
- Modal virtual Rp100.000.000; taker fee 0,51%; minimum order Rp25.000; maksimum tiga posisi; sizing maksimum 10% ekuitas per posisi; daily loss limit 3% dengan pergantian hari WIB.
- Order dry-run menggunakan kedalaman order book live untuk ask/bid, membebankan fee, menilai posisi pada best bid, menggunakan kill switch, dan idempotency per candle.

## Refleksi sementara

Belum ada perbandingan numerik backtest versus forward test yang dapat dipertanggungjawabkan. Dashboard live pernah merekam nol order dan nol trade pada snapshot yang diperiksa, tetapi hal itu bukan hasil forward test 10 hari lengkap. Faktor operasional yang tercatat adalah kegagalan request Indodax HTTP 403; dampaknya harus dihitung dari log lengkap setelah pemulihan, bukan diekstrapolasi.

`backtest.py` membaca file CSV per pair dengan kolom lengkap OHLCV atau alias Indodax `t,o,h,l,c,v`. CSV yang tersedia berasal dari arsip data yang diberikan; tanggal harian tanpa zona waktu diperlakukan sebagai UTC. File harus mencakup sekurang-kurangnya tiga tahun dan warm-up indikator. Rumus indikator/aturan di Python merupakan port terpisah dari kode bot JavaScript; kesamaan implementasi per candle belum diverifikasi otomatis, sehingga parity 100% tidak boleh diklaim. Entry/exit historis dimodelkan pada open candle berikutnya. Dengan snapshot terukur, model dapat memakai median spread/slippage; snapshot yang diperlukan belum tersedia. Hasil tanpa snapshot hanya skenario indikatif dengan fee, bukan performa net realistis.

## Informasi yang harus diisi setelah bukti tersedia

- Kriteria universe berdasarkan likuiditas pada awal backtest dan bukti penghindaran survivorship bias.
- Verifikasi independen sumber, periode, jumlah bar valid, gap, dan checksum dataset.
- Jumlah snapshot pra-freeze, rentang waktu, median spread/slippage per pair, cara slippage diukur.
- Hash dan waktu commit freeze sebenarnya (jangan dibuat mundur).
- Hasil backtest 3 tahun, hasil backtest ulang pada jendela forward, hasil forward test lengkap, uptime terhitung, gap sinyal/fill, serta benchmark BTC.
- Penyebab kuantitatif selisih backtest-forward dan referensi sumber fee beserta tanggal akses.

## Hasil backtest indikatif dari arsip yang diberikan

Perintah dan hasil mesin ada di `results/backtest_indodax_daily_3y.json` dan metrik hitung ulang di `results/backtest_indodax_daily_3y_metrics.json`. Run menggunakan 1.097 titik ekuitas harian dan 3.288 baris keputusan sinyal. Return dan biaya hanya memakai model CSV/open candle berikutnya dengan fee 0,51%; median spread/slippage, validasi tarif resmi, dan parity implementasi bot/backtest tidak tersedia. Benchmark adalah BTC/IDR pada rentang data yang sama. Data terakhir 25 September 2026, jadi angka ini tidak membandingkan periode forward November 2026.
