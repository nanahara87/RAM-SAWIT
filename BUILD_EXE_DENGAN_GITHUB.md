# Membuat installer RAM Sawit Windows dari GitHub Actions

Paket ini memuat workflow `.github/workflows/build-windows.yml` untuk membangun installer Windows 64-bit pada runner Windows yang disediakan GitHub. Workflow menghasilkan installer NSIS dan aplikasi portable dari `npm run dist:win`.

## Cara menjalankan build online

1. Buat repositori GitHub baru, lalu unggah seluruh isi folder proyek ini ke repositori tersebut (termasuk folder tersembunyi `.github`). Jangan unggah folder `node_modules` atau data transaksi pribadi.
2. Buka tab **Actions** pada repositori dan aktifkan Actions bila diminta.
3. Pilih workflow **Build RAM Sawit Windows Installer**, lalu tekan **Run workflow**.
4. Tunggu hingga job berstatus berhasil. Buka hasil run dan pada bagian **Artifacts**, unduh `RAM-Sawit-Windows-Installer-...zip`.
5. Ekstrak ZIP artefak tersebut. Jalankan file `RAM-Sawit-2.2.0-Setup.exe` untuk instalasi. File portable EXE juga disertakan jika build berhasil membuatnya.

## Penting

- Workflow ini tetap memerlukan akun GitHub dan perlu dijalankan oleh pemilik repositori; mengunduh paket sumber ini saja tidak langsung menghasilkan EXE.
- Jangan mengunggah file database transaksi atau kredensial rahasia ke repositori publik.
- Jika build gagal, buka log langkah yang gagal; error detail akan ditampilkan oleh GitHub Actions.
