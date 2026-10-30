# 📚 My Papers

A small web app to keep all your college question papers and notes in one place,
organised as **Semester → Subject → Type**.

Types: **Test 1**, **Test 2**, **Exam**, **Modules**, **Q&A**

## Start it

```bash
npm install
npm start
```

Then open http://localhost:4000 on your laptop.

## Open it on your phone

1. Connect your phone to the **same Wi-Fi** as the laptop.
2. When you run `npm start`, the terminal prints a line like
   `On your phone (same Wi-Fi): http://192.168.1.5:4000`. Open that address on your phone.
3. If Windows asks whether to allow Node.js through the firewall, allow it on **Private networks**.

On the phone, **Choose files** lets you take photos of a question paper with the camera.

## Where your files are kept

- Uploaded PDFs/photos are saved in the `uploads/` folder
- The list of semesters, subjects and papers is in `data/db.json`

Back up these two folders (for example, copy them to Google Drive) so you don't lose anything.

> There is no login, so anyone on the same Wi-Fi who knows the address can open it.
> That's fine at home, but be careful on college or public Wi-Fi.
