# RAM Sawit — Google Apps Script dan Template Spreadsheet

Paket ini memakai pola **append-only**: ketika transaksi atau pengaturan berubah, versi yang baru ditambahkan sebagai baris baru. Baris versi sebelumnya tidak dibersihkan atau ditimpa oleh sinkronisasi.

## Struktur spreadsheet

Template memiliki enam tab: `Dashboard`, `Pembelian`, `Penjualan`, `Pengeluaran`, `Pengaturan`, dan `Panduan`. Backend hanya menyimpan data di empat tab database berikut. Kolom A:B tetap mengikuti format template.

| Tab | Kolom A | Kolom B | Perilaku |
|---|---|---|---|
| `Pembelian` | `JSON_DATA` | `UPDATED_AT` | Satu baris per versi transaksi; versi lama tetap ada |
| `Penjualan` | `JSON_DATA` | `UPDATED_AT` | Satu baris per versi transaksi; versi lama tetap ada |
| `Pengeluaran` | `JSON_DATA` | `UPDATED_AT` | Satu baris per versi catatan; versi lama tetap ada |
| `Pengaturan` | `JSON_DATA` | `UPDATED_AT` | Snapshot konfigurasi baru ditambahkan jika berubah; riwayat harga digabung |

`Dashboard` dan `Panduan` tidak ditulis oleh backend. Jangan menghapus atau mengubah manual baris `JSON_DATA`/`UPDATED_AT` karena baris tersebut menjadi riwayat revisi.

## Cara sinkronisasi dan aturan konflik

1. Aplikasi mengirim snapshot lokal ke Apps Script. Server hanya menambahkan revisi yang belum pernah tersimpan; pengiriman ulang versi yang sama dilewati.
2. Server menggunakan `LockService` agar dua proses sinkronisasi tidak menulis bersamaan.
3. Setelah server mengonfirmasi permintaan melalui `syncId`, aplikasi membaca data aktif dan menggabungkannya dengan data lokal.
4. Untuk ID transaksi yang sama, versi dengan `updatedAt` paling baru menjadi versi aktif. Versi revisi lain tetap tersimpan pada baris sebelumnya/berikutnya di spreadsheet.
5. Transaksi dengan ID berbeda dipertahankan. Jika nomor transaksi sama tetapi ID berbeda (misalnya dua perangkat membuat nomor secara offline), aplikasi menampilkan peringatan agar nomor tersebut diperiksa, bukan menghapus salah satu transaksi.
6. Tombol **Gabungkan & tarik** juga mengirim data lokal lebih dulu. Ini mencegah perubahan lokal yang belum tersinkron hilang hanya karena tombol tarik ditekan.

Catatan: mekanisme append-only tidak menghapus baris cloud ketika transaksi dihapus dari browser. Karena ini dirancang untuk mempertahankan riwayat, penghapusan lokal tidak dianggap sebagai perintah menghapus arsip cloud.

## Instalasi atau pembaruan backend

1. Unggah `Template_Spreadsheet_RAM_Sawit.xlsx` ke Google Drive, lalu buka dengan Google Sheets dan konversikan jika diminta.
2. Buka proyek Apps Script yang digunakan URL `/exec` yang tertanam pada `index.html`. Jika perlu membuat proyek pertama kali, buka dari Google Sheets melalui **Ekstensi → Apps Script**.
3. Ganti seluruh isi `Code.gs` dengan file `Code.gs` terbaru dari paket. Simpan.
4. Jalankan `setupRamSawit()` satu kali dari proyek Apps Script yang terikat pada spreadsheet target. Fungsi ini merekam ID spreadsheet dan memeriksa struktur tanpa menghapus transaksi.
5. Buka **Deploy → Manage deployments**, edit Web App yang dipakai, pilih **New version**, lalu **Deploy**. Gunakan deployment yang sama supaya URL `/exec` tidak berubah dari URL di HTML.
6. Buka aplikasi, masuk ke menu **Sinkron**, lalu gunakan **Uji koneksi ulang**. Sesudah koneksi berhasil, lakukan sinkronisasi normal.

Jika URL deployment berubah, HTML harus diperbarui dengan URL baru; paket saat ini mengasumsikan URL yang sudah tertanam pada `index.html`.

## Keamanan

Web App yang izinnya terlalu terbuka dapat membuka isi transaksi bagi pihak yang memiliki URL. Pilih akses sesuai kebutuhan usaha, jangan membagikan URL publik, dan simpan cadangan JSON di tempat aman.

## Batasan yang perlu diketahui

- Sinkronisasi serta penggabungan membutuhkan koneksi internet dan deployment Apps Script yang aktif.
- Riwayat versi tetap disimpan di sheet, sedangkan aplikasi menampilkan satu versi aktif per ID.
- Backend ini tidak menerapkan sinkronisasi penghapusan cloud; baris lama tidak pernah dibersihkan oleh fungsi sync.
- Sintaks kode dan logika merge diuji secara lokal. Koneksi ke akun/deployment Google milik pengguna perlu diverifikasi dari menu Sinkron setelah kode dipasang.

> **Catatan versi 2.2.0:** fitur localhost/LAN memakai database bersama yang disimpan di komputer host dan berbeda dari Google Apps Script. Menu Sinkron Google tetap memakai deployment Apps Script yang sudah terpasang.
