# Fee dan minimum order — sumber dan status verifikasi

Diperiksa ulang: 13 November 2026. **Bagian bertanda [ISI] harus dilengkapi dari halaman resmi / profil akun Indodax.**

## Nilai yang dipakai bot (`lib/bot-config.js`)
- Taker fee all-in: **0,51%** (beli dan jual)
- Minimum order: **Rp25.000**

## Sumber 1 — API publik (terverifikasi dari repo)
- `https://indodax.com/api/pairs`, diakses 10 Nov 2026 21:54 WIB dan diperiksa ulang 13 Nov 2026: BTCIDR, ETHIDR, dan XRPIDR masing-masing menampilkan `trade_fee_percent_taker = 0.2` dan `trade_min_base_currency = 10000`.
- Catatan: nilai ini hanya komponen trading fee, **bukan all-in** (belum termasuk pajak PPh 0,21% saat jual dan fee CFX).

## Sumber 2 — Halaman resmi rincian biaya
- [ISI] URL halaman resmi yang berlaku setelah 1 Okt 2026 (Help Center Indodax, "Rincian Biaya Transaksi").
- [ISI] Tarif taker all-in beli: ____ %  | jual: ____ %
- [ISI] Tanggal akses: ____ 
- Cara cepat: Profil & Pengaturan -> Informasi Transaksi (web), atau Profil -> Pengaturan Pribadi -> Lihat Detail di "Biaya Trading" (aplikasi Pro). Screenshot halaman itu dan simpan di folder `bukti/`.
- `https://help.indodax.com/rincian-biaya-transaksi/` memberi HTTP 404 (README). Jangan dipakai sebagai sitasi.
- Pemeriksaan ulang 13 Nov 2026 juga tidak memperoleh rincian all-in dari halaman tersebut; tarif resmi beli/jual tetap belum terverifikasi.

## Angka dari sumber pihak ketiga (bukan sumber resmi, hanya untuk sanity check)
Sumber-sumber ini **tidak sepakat satu sama lain** dan sebagian sudah usang, jadi jangan dikutip sebagai tarif resmi:
- Taker all-in IDR, versi lama (sebelum 2025): 0,31% beli / 0,30% jual (artikel Help Center versi Inggris yang tampil di hasil pencarian; tidak bisa dibuka otomatis karena diblokir bot detection).
- Taker all-in setelah PPh 0,21% (PMK 50/2025): trading fee 0,20% + CFX ~0,022% -> sekitar 0,2111% beli / 0,4211% jual (blockchainmedia.id, ringkasan pihak ketiga).
- Review lain menyebut 0,3248% taker; ada pula yang menyebut 0,25% sebagai tarif dasar.
- Perubahan struktur all-in efektif 1 Okt 2026 (menurut soal UAS dan Help Center yang dikutip crypto-indonesia.com); angka pastinya belum bisa saya konfirmasi dari halaman resmi.

## Kesimpulan sementara
Angka tertinggi yang muncul di semua sumber di atas adalah sekitar 0,42% (taker jual). Jadi **0,51% di bot masih lebih mahal/konservatif**, sesuai aturan soal "pakai yang lebih mahal". Tetap isi bagian [ISI] di atas dengan angka resmi supaya sitasinya sah.

## Minimum order
- API `/api/pairs`: Rp10.000.
- Order langsung mode Pro: Rp25.000 (dikutip soal UAS; ringkasan pihak ketiga tanggal 4 Okt 2026 juga menyebut hal yang sama).
- Bot memakai **Rp25.000** (yang lebih ketat). [ISI] URL halaman resmi + tanggal akses.
