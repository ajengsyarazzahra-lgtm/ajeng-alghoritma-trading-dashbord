# Bot UAS Indodax — Dry Run

Bot ini mensimulasikan order dari data pasar publik Indodax; tidak ada order nyata dan tidak diperlukan API key Indodax. Data/status live: [dashboard Vercel](https://ajeng-algorithm-trading-dashboard.vercel.app/). Repository: [ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord](https://github.com/ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord).

## Struktur dan status bukti

- `api/tick.js`, `api/dashboard.js`, `api/control.js`, `api/quotes.js` — endpoint Vercel.
- `lib/indodax-bot.js`, `lib/bot-config.js`, `lib/redis.js` — strategi dry-run, aturan, API publik, dan storage.
- `public/index.html` — dashboard live dan pembaca log JSON offline.
- `.env.example` — nama variabel saja; tidak berisi secret.
- `.github/workflows/indodax-dry-run.yml` — pemanggilan endpoint tiap jam pada menit ke-17 UTC.
- `vercel.json` — konfigurasi fungsi dan cron harian (cadangan; penjadwal utama adalah GitHub Actions per jam).
- `tools/parity_check.py`, `tools/dump_indicators.js` — membandingkan indikator dan sinyal beli bot (JS) dengan backtest (Python) per candle.
- `tools/collect_snapshots.js` — pengumpul snapshot order book (spread/slippage) dari laptop.
- `CATATAN_PERUBAHAN_PASCA_FREEZE.md` — catatan jujur semua perubahan setelah 4 November 2026, termasuk perbaikan bug.
- `backtest.py` — backtest dari CSV OHLCV lokal; subcommand download tersedia, tetapi tidak diperlukan untuk menggunakan data lokal.
- `hitung_ulang.py` — hitung ulang metrik dari ekspor JSON dashboard/schema UAS.
- `tools/hitung_ulang.js` — kalkulator JavaScript yang juga tersedia.
- `STRATEGI_DAN_REFLEKSI.md` — aturan strategi dan status refleksi berbasis bukti yang saat ini tersedia.
- `logs/README.md` — menjelaskan bahwa log forward test mentah lengkap belum tersedia.

Versi ini memakai **timeframe 60 menit** (sesuai konfigurasi awal bot). Data harian di `results/indikatif_harian/` hanya hasil lama indikatif; backtest yang sesuai timeframe memakai dataset baru di `data/indodax_1h/`.

Pada 10 November 2026, tiga file candle harian BTC/ETH/XRP dari arsip yang diberikan disalin ke `data/indodax_harian/`. CSV mencakup periode berbeda per pair dan berakhir pada 25 September 2026. Data historis mendukung backtest tiga tahun pada timeframe harian, tetapi tidak mencakup jendela forward 4–14 November 2026. Arsip data menyatakan folder Indodax berisi 457 pair IDR; catatan arsip ada di `data/BACA_DATA.md` dan mengingatkan adanya survivorship bias karena universe mencakup pair yang masih tersedia. Catatan tersebut dan nama sumber tidak memverifikasi asal upstream secara independen. Hash SHA-256 CSV yang dipakai:

| File | SHA-256 |
|---|---|
| `data/indodax_harian/BTC.csv` | `c460a368ff5c16a6920010dcf0fadd56b58ad9369d45160905d6ee85cf23b942` |
| `data/indodax_harian/ETH.csv` | `444eb454d490a99965dd1da86359aa91529a395c8ad54625a16d63667dac0017` |
| `data/indodax_harian/XRP.csv` | `50da001053aeb4584b1a1044f7c8db839319eed09ec04cd677105d9ee917a711` |

Snapshot order book live laptop sudah dikumpulkan setelah freeze; snapshot tersebut tidak dapat membuktikan biaya pra-freeze atau hasil historis. Tabel likuiditas awal periode dihitung dari data 1 jam, tetapi universe BTC/ETH/XRP tidak disaring memakai ambang historis yang dibekukan. Log forward test lengkap 10 hari belum tersedia. File `kompas100_10thn.json` tidak dipakai. Semua perubahan terjadi setelah tanggal freeze (lihat `CATATAN_PERUBAHAN_PASCA_FREEZE.md`); jangan menyebutnya konfigurasi yang dibekukan atau forward test yang berhasil. Uji koneksi laptop ke tiga endpoint Indodax pada 10 November 2026 berhasil HTTP 200; hal ini tidak membuktikan status bot Vercel.

Backtest lokal tiga tahun telah dibuat dari CSV tersebut. Hasilnya berstatus `incomplete_market_costs_indicative_only`: spread/slippage tidak tersedia, sehingga angka tidak boleh dipresentasikan sebagai hasil eksekusi realistis.

## Aturan bot yang dikodekan

Konfigurasi saat ini di `lib/bot-config.js`: BTCIDR, ETHIDR, XRPIDR; timeframe 60 menit (`tf=60` Indodax); EMA 30/100, RSI Wilder 14 rentang 50–75, ATR 14 trailing stop 3× ATR, cross lookback lima candle; modal virtual Rp100.000.000; taker fee 0,51%; minimum order Rp25.000; maks. tiga posisi, ukuran maks. 10% ekuitas per posisi, daily loss limit 3% WIB. Ini perubahan pasca-freeze, bukan bukti freeze pada 4 November.

Endpoint bot mengambil candle tertutup `history_v2`, order book publik `/api/depth`, dan waktu server `/api/server_time`. Entry dievaluasi hanya dari candle valid dan volume positif pada jendela indikator; pembelian disimulasikan dengan menelusuri ask, penjualan dengan menelusuri bid, dan valuasi posisi terbuka menggunakan best bid. Ada retry terbatas, idempotency per candle, distributed lock, dan kill switch. Lihat `STRATEGI_DAN_REFLEKSI.md` untuk audit, batas bukti, dan detail metode.

## Menjalankan bot/deploy

1. Pasang environment variables berikut di Vercel (tanpa menyimpan nilainya di repository): `CRON_SECRET`, `CONTROL_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BOT_ENABLED`, `PROCESS_KILL_SWITCH`, dan `BOT_PAIRS`. `BOT_ENABLED` harus `true` agar bot aktif; nilai kill switch dan pasangan harus diperiksa sebelum menjalankan.
2. Pada GitHub Actions, set repository secret `CRON_SECRET` yang sama dan variable `VERCEL_TICK_URL` ke URL Vercel yang diakhiri `/api/tick`.
3. Deploy project ke Vercel dengan `public` sebagai output directory. GitHub Actions memanggil `/api/tick` tiap jam pada menit ke-17 UTC; Vercel Cron Hobby hanya sekali sehari sehingga tidak cukup untuk timeframe 1 jam. Scheduler tidak menjamin endpoint sukses—periksa status dan error pada dashboard.
4. `PROCESS_KILL_SWITCH=true` memblokir entry baru. Kill switch manual tersedia lewat endpoint kontrol/dashboard dengan `CONTROL_SECRET`.

`.env.example` hanya berisi nama konfigurasi tanpa kredensial. Nilai environment tidak dibaca dari file ini secara otomatis; atur nama/values yang diperlukan secara manual pada Vercel dan GitHub. Jangan commit `.env` atau secret.

## Uji koneksi laptop (10 November 2026, WIB)

Uji dijalankan berurutan dari laptop dengan `curl.exe`; tidak ada request paralel atau upaya menghindari pembatasan:

| Endpoint | Hasil |
|---|---|
| `https://indodax.com/api/server_time` | HTTP 200, 21:49:03 WIB |
| `https://indodax.com/api/depth/btcidr` | HTTP 200, 21:49:09 WIB |
| `https://indodax.com/tradingview/history_v2?symbol=BTCIDR&tf=60&from=1794062942&to=1794322142` | HTTP 200, 21:49:13 WIB |

Pengambilan data memakai `https://indodax.com/tradingview/history_v2`, `symbol`, `tf=60`, `from`, dan `to`; waktu akses dataset 10 November 2026 WIB. Status HTTP ini hanya membuktikan respons pada saat pengujian, bukan ketersediaan layanan terus-menerus.

## Data Indodax 1 jam dan backtest 3 tahun

Perintah yang dijalankan sesuai rentang di prompt:

```powershell
python .\backtest.py download --start 2023-11-01T00:00:00Z --end 2026-11-10T00:00:00Z --pairs BTCIDR ETHIDR XRPIDR --out data\indodax_1h
python .\backtest.py run --data .\data\indodax_1h --timeframe-minutes 60 --start 2023-11-10T00:00:00Z --end 2026-11-10T00:00:00Z --out .\results\backtest_1h_3y.json
python .\hitung_ulang.py .\results\backtest_1h_3y.json --output .\results\backtest_1h_3y_metrics.json
python .\tools\parity_check.py --data .\data\indodax_1h --step 1
```

| CSV | Baris candle | Rentang UTC | Gap / duplikat | Volume ≤ 0 | SHA-256 |
|---|---:|---|---:|---:|---|
| `data/indodax_1h/BTCIDR.csv` | 26.520 | 2023-11-01 00:00 – 2026-11-09 23:00 | 0 / 0 | 91 | `28fd4d9abdf53fb6d4c490231eac54ec26c283f927727c547d1682262b145675` |
| `data/indodax_1h/ETHIDR.csv` | 26.520 | 2023-11-01 00:00 – 2026-11-09 23:00 | 0 / 0 | 98 | `dd3bbe193cd501cfc926f97a273e55ae784c1f6317fa03524a3289ff9dbc02b1` |
| `data/indodax_1h/XRPIDR.csv` | 26.520 | 2023-11-01 00:00 – 2026-11-09 23:00 | 0 / 0 | 98 | `eb3c959245308cb1cd997bb5b8496cca16c8e622ef8f9f2a21c2c241fd6a7fa7` |

Rentang permintaan: 1 November 2023 sampai 10 November 2026 (akhir eksklusif); candle terakhir lengkap pada 9 November 2026 23:00 UTC. Data yang tidak memiliki volume positif tetap disimpan apa adanya, tetapi tidak menjadi sinyal yang dapat ditradingkan bila masuk ke 120-candle jendela indikator. Ringkasan likuiditas deskriptif untuk 30 hari pertama memakai `close × volume` per bar dan disimpan di `results/universe_liquidity_initial_30d.json`. Ini bukan bukti kriteria universe yang dibekukan atau penghindaran survivorship bias.

Backtest berhasil menghasilkan 26.304 titik ekuitas, 838 order, dan 419 trade tertutup. Return, drawdown, CAGR, dan metrik lengkap hanya ada di `results/backtest_1h_3y_metrics.json`. Karena tidak ada snapshot pra-freeze, hasil ditandai `incomplete_market_costs_indicative_only`; spread/slippage tidak diterapkan dan angka ini bukan performa net yang lengkap. Jangan menafsirkan fee saja sebagai seluruh biaya eksekusi.

Parity pada 26.400 candle per pair (79.200 total) menghasilkan nol perbedaan sinyal beli; selisih relatif maksimum EMA lambat berada di bawah `0.00000085`. Detail per pair dan contoh tersimpan di `results/parity_check.json`. Pemeriksaan ini membandingkan perhitungan indikator dan kondisi sinyal, bukan mengesahkan kualitas data atau parity eksekusi live.

### Fee, minimum order, dan pembulatan

`https://indodax.com/api/pairs` merespons HTTP 200 pada 10 November 2026 pukul 21:54 WIB. Untuk BTCIDR, ETHIDR, dan XRPIDR, respons mencatat `trade_fee_percent_taker=0.2`, `trade_min_base_currency=10000`, `quantity_increment=1e-8`, dan `price_round=8`. Bot memakai fee 0,51% dan minimum Rp25.000, keduanya lebih konservatif/lebih tinggi daripada nilai API yang terbaca pada tanggal akses. Harga simulasi diambil langsung dari level order book; bot tidak mengirim limit price.

Halaman rincian biaya yang diperiksa dari terminal, `https://help.indodax.com/rincian-biaya-transaksi/`, merespons HTTP 404 pada 10 November 2026. **PERLU DIISI MANUAL** dengan URL dan tarif halaman resmi yang benar; jangan menebak tarif atau URL alternatif. Sebelum mengklaim fee final, bandingkan sumber resmi yang terverifikasi dan gunakan tarif yang lebih tinggi.

## Snapshot order book

`node .\tools\collect_snapshots.js --once` berhasil menyimpan snapshot aktual untuk 3 pair ke `logs/snapshots_laptop.jsonl`. Pengukuran ini terjadi setelah freeze, jadi tidak dapat menggantikan snapshot pra-freeze. Penjadwal Task Scheduler Windows `IndodaxSnapshotUAS` dibuat per jam; laptop harus menyala dan tidak tidur saat tugas berjalan. Cara memeriksa/menghentikan ada di `logs/PANDUAN_SNAPSHOT.md`. Berkas `logs/snapshot_task.log` hanya akan ada setelah tugas terjadwal menulis keluaran; jangan membuat isinya sendiri.

## Backtest menggunakan CSV lokal

Dataset harian BTC/ETH/XRP yang tersedia disimpan di `data/indodax_harian/` dengan nama `BTC.csv`, `ETH.csv`, dan `XRP.csv`. Backtest menerima simbol `BTCIDR`, `ETHIDR`, dan `XRPIDR`, serta kolom singkat `t,o,h,l,c,v` atau nama OHLCV lengkap. Tanggal tanpa zona waktu pada file ini diperlakukan sebagai UTC. Arsip menyebut data harian berasal dari Indodax; `data/BACA_DATA.md` memuat catatan arsip, dan hash SHA-256 di atas mengidentifikasi file yang dipakai. Provenance sumber upstream belum diverifikasi independen.

```powershell
python .\backtest.py run --data .\data\indodax_harian --timeframe-minutes 1440 --start 2023-09-25T00:00:00Z --end 2026-09-26T00:00:00Z --out .\results\indikatif_harian\backtest_indodax_daily_3y.json
python .\hitung_ulang.py .\results\indikatif_harian\backtest_indodax_daily_3y.json --output .\results\indikatif_harian\backtest_indodax_daily_3y_metrics.json
```

Skrip memvalidasi header, OHLCV, timestamp duplikat, panjang warm-up, dan kontinuitas candle yang dipakai strategi. Validasi ini tidak membuktikan asal CSV; simpan informasi asal dataset secara terpisah. Periksa juga gap, zona waktu, cakupan tiga tahun, dan konsistensi harga dengan sumber yang terdokumentasi.

### Biaya spread/slippage

Untuk model biaya pasar lengkap, berikan `logs/snapshots_pre_freeze.jsonl` berisi observasi sebelum waktu freeze sebenarnya dengan field `time`, `pair`, `spreadPct`, dan `slippagePct` terukur:

```powershell
python .\backtest.py run --data .\data\indodax_harian --timeframe-minutes 60 --snapshots .\logs\snapshots_pre_freeze.jsonl --start 2023-09-25T00:00:00Z --end 2026-09-26T00:00:00Z --out .\results\backtest_1h_3y.json
```

Tanpa file snapshot, skrip tetap dapat menghasilkan skenario indikatif dengan fee 0,51% tetapi **tidak menerapkan spread/slippage**. Metadata hasil mencatat `marketImpactCostStatus=unavailable_omitted` dan `performanceValidity=incomplete_market_costs_indicative_only`; angka itu bukan estimasi performa realistis atau hasil yang memenuhi seluruh syarat biaya eksekusi. Jangan menganggap biaya yang tidak diketahui bernilai nol. Snapshot yang dimasukkan harus terukur dan dapat diaudit; skrip tidak membuat data biaya.

Eksekusi backtest memakai open candle berikutnya setelah sinyal pada bar tertutup. Model ini bukan rekonstruksi historical order book per candle. Aturan indikator/entry/exit di Python adalah port terpisah dari JavaScript bot; gunakan `tools/parity_check.py` untuk membuktikan parity per candle (belum dijalankan pada data Indodax asli). Fee 0,51% berasal dari konfigurasi kode saat ini; verifikasi dan sitasi tarif resmi yang berlaku pada periode backtest sebelum mengklaim hasil akhir. Dataset berakhir sebelum jendela forward, sehingga backtest ulang pada 4–14 November 2026 tidak bisa dibuat dari arsip yang diberikan.

## Menarik data 1 jam (jalankan di laptop, bukan di Vercel)

```powershell
python .\backtest.py download --start 2023-11-01T00:00:00Z --end 2026-11-10T00:00:00Z --pairs BTCIDR ETHIDR XRPIDR --out .\data\indodax_1h
python .\backtest.py run --data .\data\indodax_1h --timeframe-minutes 60 --start 2023-11-10T00:00:00Z --end 2026-11-10T00:00:00Z --out .\results\backtest_1h_3y.json
python .\hitung_ulang.py .\results\backtest_1h_3y.json --output .\results\backtest_1h_3y_metrics.json
python .\tools\parity_check.py --data .\data\indodax_1h --step 1
```

`download` menarik mundur dari `--end` dengan jeda 0,4 detik per request (di bawah 3 request/detik, tidak paralel). Satu request
hanya memberi sekitar 650 bar, jadi 3 tahun per pair membutuhkan sekitar 40 request. Periksa jumlah baris tiap CSV sebelum backtest.
`parity_check.py` membandingkan indikator dan sinyal beli bot vs backtest per candle; lampirkan `results/parity_check.json`.
Simpan juga alamat sumber dan tanggal akses data di laporan.

## Mengumpulkan snapshot order book

```powershell
node .\tools\collect_snapshots.js --once          # jadwalkan tiap jam lewat Task Scheduler, atau:
node .\tools\collect_snapshots.js --every-minutes 60
python .\backtest.py run ... --snapshots .\logs\snapshots_laptop.jsonl --snapshot-cutoff 2026-11-10T00:00:00Z
```

Snapshot yang dikumpulkan setelah 4 November tidak memenuhi syarat "sebelum freeze". Bila dipakai, metadata hasil menandai
`snapshotCutoffAfterFreeze=true` dan hal itu harus dijelaskan di refleksi. Bot juga menyimpan snapshot tiap tick di Redis.

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

## Dashboard offline

Dashboard offline tidak memuat CDN atau script/style eksternal. Untuk analisis lokal, unduh ekspor lengkap melalui `/api/dashboard?full=1`, lalu buka `public/index.html`, pilih tombol **Muat log JSON**, dan pilih file ekspor. Berkas diproses di browser lokal; periksa `logExportComplete` karena ekspor yang terpotong tidak membuktikan forward test lengkap. `generate_log.py` hanya menulis template skema kosong; skrip ini tidak menghasilkan harga, order, atau hasil simulasi.

Dashboard live: [https://ajeng-algorithm-trading-dashboard.vercel.app/](https://ajeng-algorithm-trading-dashboard.vercel.app/)

GitHub: [https://github.com/ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord](https://github.com/ajengsyarazzahra-lgtm/ajeng-alghoritma-trading-dashbord)
