# Bot UAS Indodax — Dry Run

Bot ini mensimulasikan order dari data pasar publik Indodax; tidak ada order nyata dan tidak diperlukan API key Indodax. Data/status live: [dashboard Vercel](https://ajeng-algorithm-trading-dashboard.vercel.app/). Repository: [ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord](https://github.com/ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord).

## Struktur dan status bukti

- `api/tick.js`, `api/dashboard.js`, `api/control.js`, `api/quotes.js` — endpoint Vercel.
- `lib/indodax-bot.js`, `lib/bot-config.js`, `lib/redis.js` — strategi dry-run, aturan, API publik, dan storage.
- `public/index.html` — dashboard live dan pembaca log JSON offline.
- `.env.example` — nama variabel saja; tidak berisi secret.
- `.github/workflows/indodax-dry-run.yml` — pemanggilan endpoint harian pada menit ke-17 UTC.
- `vercel.json` — konfigurasi fungsi dan cron harian.
- `backtest.py` — backtest dari CSV OHLCV lokal; subcommand download tersedia, tetapi tidak diperlukan untuk menggunakan data lokal.
- `hitung_ulang.py` — hitung ulang metrik dari ekspor JSON dashboard/schema UAS.
- `tools/hitung_ulang.js` — kalkulator JavaScript yang juga tersedia.
- `STRATEGI_DAN_REFLEKSI.md` — aturan strategi dan status refleksi berbasis bukti yang saat ini tersedia.
- `logs/README.md` — menjelaskan bahwa log forward test mentah lengkap belum tersedia.

Pada 10 November 2026, tiga file candle harian BTC/ETH/XRP dari arsip yang diberikan disalin ke `data/indodax_harian/`. CSV mencakup periode berbeda per pair dan berakhir pada 25 September 2026. Data historis mendukung backtest tiga tahun pada timeframe harian, tetapi tidak mencakup jendela forward 4–14 November 2026. Arsip data menyatakan folder Indodax berisi 457 pair IDR; catatan arsip ada di `data/BACA_DATA.md` dan mengingatkan adanya survivorship bias karena universe mencakup pair yang masih tersedia. Catatan tersebut dan nama sumber tidak memverifikasi asal upstream secara independen. Hash SHA-256 CSV yang dipakai:

| File | SHA-256 |
|---|---|
| `data/indodax_harian/BTC.csv` | `c460a368ff5c16a6920010dcf0fadd56b58ad9369d45160905d6ee85cf23b942` |
| `data/indodax_harian/ETH.csv` | `444eb454d490a99965dd1da86359aa91529a395c8ad54625a16d63667dac0017` |
| `data/indodax_harian/XRP.csv` | `50da001053aeb4584b1a1044f7c8db839319eed09ec04cd677105d9ee917a711` |

Belum ada snapshot spread/slippage terukur, bukti likuiditas universe pada awal periode, atau log forward test 10 hari lengkap. File `kompas100_10thn.json` tidak dipakai. Perubahan ke timeframe harian dilakukan setelah tanggal freeze; jangan menyebutnya konfigurasi yang dibekukan atau forward test yang berhasil. Endpoint live terakhir yang diperiksa melaporkan OFFLINE dengan error Indodax HTTP 403; cek `/api/dashboard` sebelum menyatakan bot berjalan.

Backtest lokal tiga tahun telah dibuat dari CSV tersebut. Hasilnya berstatus `incomplete_market_costs_indicative_only`: spread/slippage tidak tersedia, sehingga angka tidak boleh dipresentasikan sebagai hasil eksekusi realistis.

## Aturan bot yang dikodekan

Konfigurasi saat ini di `lib/bot-config.js`: BTCIDR, ETHIDR, XRPIDR; timeframe harian (`tf=1D` Indodax); EMA 30/100, RSI Wilder 14 rentang 50–75, ATR 14 trailing stop 3× ATR, cross lookback lima candle; modal virtual Rp100.000.000; taker fee 0,51%; minimum order Rp25.000; maks. tiga posisi, ukuran maks. 10% ekuitas per posisi, daily loss limit 3% WIB. Ini perubahan pasca-freeze, bukan bukti freeze pada 4 November.

Endpoint bot mengambil candle tertutup `history_v2`, order book publik `/api/depth`, dan waktu server `/api/server_time`. Entry dievaluasi hanya dari candle valid dan volume positif; pembelian disimulasikan pada ask, penjualan pada bid, dan valuasi posisi terbuka menggunakan best bid. Ada retry terbatas, idempotency per candle, distributed lock, dan kill switch. Lihat `STRATEGI_DAN_REFLEKSI.md` untuk batas bukti dan detail metode.

## Menjalankan bot/deploy

1. Pasang `CRON_SECRET`, `CONTROL_SECRET`, `UPSTASH_REDIS_REST_URL`, dan `UPSTASH_REDIS_REST_TOKEN` sebagai environment variables Vercel. Atur `BOT_ENABLED=true`. Jangan commit `.env` atau secret.
2. Pada GitHub Actions, set repository secret `CRON_SECRET` yang sama dan variable `VERCEL_TICK_URL` ke URL Vercel yang diakhiri `/api/tick`.
3. Deploy project ke Vercel dengan `public` sebagai output directory. Vercel Cron dan GitHub Actions dijadwalkan harian setelah candle UTC 1D ditutup. Scheduler tidak menjamin endpoint sukses—periksa status dan error pada dashboard.
4. `PROCESS_KILL_SWITCH=true` memblokir entry baru. Kill switch manual tersedia lewat endpoint kontrol/dashboard dengan `CONTROL_SECRET`.

`.env.example` berisi nama konfigurasi tanpa kredensial. Nilai environment tidak dibaca dari file ini secara otomatis; salin nama-namanya ke pengaturan Vercel/GitHub secara manual.

## Backtest menggunakan CSV lokal

Dataset harian BTC/ETH/XRP yang tersedia disimpan di `data/indodax_harian/` dengan nama `BTC.csv`, `ETH.csv`, dan `XRP.csv`. Backtest menerima simbol `BTCIDR`, `ETHIDR`, dan `XRPIDR`, serta kolom singkat `t,o,h,l,c,v` atau nama OHLCV lengkap. Tanggal tanpa zona waktu pada file ini diperlakukan sebagai UTC. Arsip menyebut data harian berasal dari Indodax; `data/BACA_DATA.md` memuat catatan arsip, dan hash SHA-256 di atas mengidentifikasi file yang dipakai. Provenance sumber upstream belum diverifikasi independen.

```powershell
python .\backtest.py run --data .\data\indodax_harian --timeframe-minutes 1440 --start 2023-09-25T00:00:00Z --end 2026-09-26T00:00:00Z --out .\results\backtest_indodax_daily_3y.json
python .\hitung_ulang.py .\results\backtest_indodax_daily_3y.json --output .\results\backtest_indodax_daily_3y_metrics.json
```

Skrip memvalidasi header, OHLCV, timestamp duplikat, panjang warm-up, dan kontinuitas candle yang dipakai strategi. Validasi ini tidak membuktikan asal CSV; simpan informasi asal dataset secara terpisah. Periksa juga gap, zona waktu, cakupan tiga tahun, dan konsistensi harga dengan sumber yang terdokumentasi.

### Biaya spread/slippage

Untuk model biaya pasar lengkap, berikan `logs/snapshots_pre_freeze.jsonl` berisi observasi sebelum waktu freeze sebenarnya dengan field `time`, `pair`, `spreadPct`, dan `slippagePct` terukur:

```powershell
python .\backtest.py run --data .\data\indodax_harian --timeframe-minutes 1440 --snapshots .\logs\snapshots_pre_freeze.jsonl --start 2023-09-25T00:00:00Z --end 2026-09-26T00:00:00Z --out .\results\backtest.json
```

Tanpa file snapshot, skrip tetap dapat menghasilkan skenario indikatif dengan fee 0,51% tetapi **tidak menerapkan spread/slippage**. Metadata hasil mencatat `marketImpactCostStatus=unavailable_omitted` dan `performanceValidity=incomplete_market_costs_indicative_only`; angka itu bukan estimasi performa realistis atau hasil yang memenuhi seluruh syarat biaya eksekusi. Jangan menganggap biaya yang tidak diketahui bernilai nol. Snapshot yang dimasukkan harus terukur dan dapat diaudit; skrip tidak membuat data biaya.

Eksekusi backtest memakai open candle berikutnya setelah sinyal pada bar tertutup. Model ini bukan rekonstruksi historical order book per candle. Aturan indikator/entry/exit di Python adalah port terpisah dari JavaScript bot; parity per candle belum dibuktikan. Fee 0,51% berasal dari konfigurasi kode saat ini; verifikasi dan sitasi tarif resmi yang berlaku pada periode backtest sebelum mengklaim hasil akhir. Dataset berakhir sebelum jendela forward, sehingga backtest ulang pada 4–14 November 2026 tidak bisa dibuat dari arsip yang diberikan.

## Hitung ulang

```powershell
python .\hitung_ulang.py .\indodax-dry-run-export.json
python .\hitung_ulang.py .\indodax-dry-run-export.json --output .\results\metrics.json
node .\tools\hitung_ulang.js .\indodax-dry-run-export.json
```

Kalkulator menerima JSON hasil backtest atau ekspor dashboard dan menghitung hanya dari baris/state yang ada. Untuk metrik backtest CSV, jalankan kalkulator pada hasil JSON yang dibuat `backtest.py`, bukan pada CSV mentah. Dashboard offline menampilkan peringatan bila `logExportComplete` bukan `true`, biaya spread/slippage tidak terbukti, atau parity sinyal belum diuji. Kalkulator menandai skenario tanpa spread/slippage sebagai indikatif. Ekspor live dengan `logExportComplete: false` diberi peringatan, karena data terpotong tidak membuktikan kelengkapan. CAGR forward 10 hari tidak ditampilkan. Jangan menggunakan hasil angka untuk mengisi periode yang tidak terekam.

Perbandingan sinyal entry/exit memakai `candleTime` (bukan waktu pemrosesan bot) dan menghitung sinyal/order duplikat satu per satu. Baris `hold` tetap disimpan sebagai log keputusan, tetapi tidak dihitung sebagai sinyal entry/exit yang cocok.

## Log forward test dan paket pengumpulan

Ekspor log server (JSON) dari dashboard dan periksa `logExportComplete` serta rentang waktunya. Berkas mentah yang memenuhi periode forward harus disimpan tanpa rekayasa di `logs/raw_forward_test.json`; file tersebut belum tersedia/terverifikasi, sehingga belum dibuat. `logs/README.md` mencatat kekurangan ini.

Paket akhir perlu source code, data yang dipakai, backtest dan jendela forward yang sama, ekspor log mentah, skrip hitung ulang, HTML offline, strategi/refleksi, `.env.example`, serta riwayat commit. Bukti freeze pra-4 November 2026 pukul 12.00 WIB tidak dapat dibuat retroaktif. Jangan mengubah tanggal commit atau mengklaim snapshot pasca-tenggat sebagai bukti freeze. Pengumpulan menurut soal adalah 14 November 2026 pukul 23.59 WIB; keterlambatan dapat mengurangi nilai.

Dashboard live: [https://ajeng-algorithm-trading-dashboard.vercel.app/](https://ajeng-algorithm-trading-dashboard.vercel.app/)

GitHub: [https://github.com/ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord](https://github.com/ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord)
