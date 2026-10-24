# Membuat installer Windows melalui GitHub Actions

Workflow sudah disediakan di `.github/workflows/build-windows.yml`.

## Langkah
1. Unggah semua berkas proyek ke repositori `nanahara87/RAM-SAWIT`, branch `main`, dalam satu commit. Pastikan folder `.github/workflows` ikut diunggah.
2. Buka **Actions**. Jika GitHub menampilkan tombol **I understand my workflows, go ahead and enable them**, pilih tombol itu.
3. Pilih **Build RAM Sawit Windows Installer**. Push ke `main` akan menjalankan workflow otomatis; jika perlu, pilih **Run workflow**.
4. Tunggu job `Build Windows x64 installer` selesai dengan status hijau.
5. Installer dan portable EXE akan tersedia di **Releases**. Workflow artifact juga tersedia selama 30 hari pada halaman run.

## Jika workflow gagal
- Buka run yang gagal dan periksa log pada langkah pertama yang merah.
- Jika langkah Release gagal karena permission, buka **Settings → Actions → General → Workflow permissions**, lalu izinkan `Read and write permissions` untuk `GITHUB_TOKEN`, kemudian jalankan ulang workflow.
- Jika npm gagal, jalankan ulang workflow; kegagalan sementara jaringan registry biasanya dapat dicoba kembali.

Workflow menggunakan runner Windows GitHub-hosted; Node.js tidak perlu dipasang di komputer lokal untuk proses build cloud.
