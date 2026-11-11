# Refleksi — Backtest vs Forward Test (DRAFT)

Bagian bertanda **[ISI]** harus diisi dari log forward test asli (`/api/dashboard?full=1`). Jangan menulis angka yang tidak ada di log.

## 1. Kejujuran proses (tulis apa adanya)
- Freeze 4 Nov 2026 12.00 WIB **terlewat**. Commit pertama: 5 Nov 2026 11.17 WIB (`32b85c3`). Karena itu kecocokan backtest–forward tidak bisa dibuktikan lewat commit freeze.
- Commit pertama memuat `log-indodax-lengkap.json`, sebuah log **sintetik** dari template `generate_log.py`, dihapus pada 7 Nov (`f49c603`). File itu tidak pernah dipakai untuk angka apa pun di laporan ini dan bukan data Indodax.
- Bot awalnya punya bug di `computeIndicators` (nilai EMA tertimpa array) sehingga **tidak pernah bisa memberi sinyal beli**. Diperbaiki 10 Nov tanpa mengubah aturan strategi (lihat `CATATAN_PERUBAHAN_PASCA_FREEZE.md`).
- Penjelasan soal author commit `22f6439` dan `ec864dc`: [ISI — jelaskan dengan jujur, mis. akun git di laptop berbeda dari akun GitHub awal].

## 2. Hasil backtest (3 tahun, 10 Nov 2023 – 10 Nov 2026, candle 1 jam Indodax, BTC/ETH/XRP)
| Skenario | Return | CAGR | Max DD | Profit factor | Win rate | Trade |
|---|---:|---:|---:|---:|---:|---:|
| Fee saja (tanpa spread/slippage) | -21,71% | -7,83% | 25,08% | 0,677 | 22,20% | 419 |
| Fee + spread + slippage dari snapshot* | -24,23% | -8,83% | 26,70% | 0,645 | 21,48% | 419 |
| Buy and hold BTC/IDR | +136,17% | | | | | |

\* Snapshot diambil **setelah** freeze (10–11 Nov 2026), jadi ini skenario sensitivitas, bukan hasil pra-freeze. Metadata hasil menandainya `snapshotCutoffAfterFreeze=true` (label `measured_pre_freeze` di metadata bawaan skrip menyesatkan; abaikan label itu).

Porsi biaya (fee + spread + slippage) terhadap laba kotor: **74,99%** di skenario snapshot (file `results/backtest_1h_3y_snapshot_scenario_metrics.json`). Artinya hampir tiga perempat laba kotor habis untuk biaya, dan strategi kalah dari buy and hold dengan selisih besar. Ini hasil buruk yang bisa dibuktikan, bukan kesalahan yang disembunyikan.

## 3. Spread: asumsi backtest vs pengukuran
Dari 45 snapshot (15 putaran/pair, 10 Nov 15.02 UTC – 11 Nov 13.08 UTC), file `results/spread_snapshot_summary.json`:

| Pair | Median spread | P90 spread | Median slippage (order Rp10 juta) |
|---|---:|---:|---:|
| BTCIDR | 0,0395% | 0,1104% | 0,0012% |
| ETHIDR | 0,0854% | 0,1908% | 0,0000% |
| XRPIDR | 0,0835% | 0,1595% | 0,0128% |

Keterbatasan: hanya ±26 jam dan 15 sampel per pair, jadi belum mewakili 3 tahun (spread bisa melebar saat volatil). [ISI] Bandingkan dengan **seluruh** snapshot dari forward test (median per pair): BTC ____ / ETH ____ / XRP ____.

## 4. Forward test (4 – 14 Nov 2026)
Semua angka dari log mentah, dihitung dengan `hitung_ulang.py`:
- Jumlah candle terjadwal: [ISI] | terproses tepat waktu: [ISI] | **uptime**: [ISI] %
- Panggilan terlambat / terlewat dan penyebabnya (GitHub Actions menit ke-17, antrean, error Redis/Vercel): [ISI]
- Error API (jumlah, jenis): [ISI] | pemakaian kill switch: [ISI]
- Jumlah sinyal beli/jual, jumlah order, jumlah trade tertutup: [ISI]
- Return forward: [ISI] | max drawdown: [ISI] | buy and hold BTC pada jendela yang sama: [ISI]
- Jika 0 trade: tulis jelas dan tunjukkan bahwa log sinyal cocok dengan backtest.

## 5. Kecocokan backtest vs forward (jendela yang sama)
- Backtest dijalankan ulang pada jendela forward dengan candle yang sama (butuh data 1 jam sampai 14 Nov): [ISI]
- Kecocokan sinyal masuk/keluar candle demi candle: [ISI] % (parity indikator sebelumnya: 0 selisih pada 79.200 candle)
- Selisih harga fill per trade (fill vs harga sinyal) dan dekomposisi: spread [ISI] + slippage [ISI] + keterlambatan jadwal [ISI]

## 6. Sumber selisih dan pelajaran
- Biaya: taker 0,51% per sisi memakan sebagian besar laba kotor; ini penyebab utama hasil negatif.
- Spread backtest bersumber dari sampel pendek pasca-freeze, bukan dari periode backtest.
- Universe BTC/ETH/XRP dipilih tanpa kriteria likuiditas yang dibekukan sebelumnya, sehingga survivorship bias tidak bisa dikesampingkan. [ISI] kriteria yang kamu pakai (mis. median nilai transaksi harian awal periode, lihat `results/universe_liquidity_initial_30d.json`: BTC ±Rp19,9 M, ETH ±Rp6,0 M, XRP ±Rp5,0 M per hari pada 1–30 Nov 2023).
- Dampak jadwal per jam pada uptime: [ISI]
