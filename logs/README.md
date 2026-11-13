# Log forward test

## Tersedia

- `snapshots_laptop.jsonl`: snapshot order book BTCIDR, ETHIDR, dan XRPIDR yang dikumpulkan dari laptop. Isi file dapat bertambah saat collector berjalan. Snapshot ini pasca-freeze dan bukan log panggilan, order, atau ekuitas forward bot; jangan gunakan untuk mengklaim biaya historis pra-freeze.
- `PANDUAN_SNAPSHOT.md`: cara menjalankan collector dan memeriksa/menghentikan tugas hourly Task Scheduler lokal.

## Belum tersedia

- `raw_forward_test.json` dan log forward test lengkap 10 hari belum tersedia. Jangan membuat atau mengisi log sintetik.
- `snapshot_task.log` belum diverifikasi pernah dibuat oleh tugas terjadwal; tugas memerlukan laptop menyala dan tidak tidur.
- Snapshot spread/slippage pra-freeze tidak tersedia.

Ekspor log dari `/api/dashboard?full=1` hanya dapat dipakai bila `logExportComplete` bernilai `true` dan rentang waktu yang disyaratkan benar-benar lengkap. Simpan ekspor mentah apa adanya di folder ini setelah periode forward test selesai.
