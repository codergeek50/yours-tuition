# YOURS Tuition

A phone-first app for a single tuition teacher: students (with school and class), daily attendance, monthly fees, numbered receipts and exportable reports.

There is no server of its own and no account to create. Your data lives in **your own Google Drive** (with a readable Google Sheet you can open like an Excel file), and the app is installed on your phone like any other app. This code repository contains no student data.

## Set up (one time, about 5 minutes)

Your data lives in **your own Google Drive**, through a small free script in your Google account. Full steps: [apps-script/README.md](apps-script/README.md). In short:

1. Create a new Apps Script project, paste in `apps-script/Code.gs`, and run **setup**.
2. Deploy it as a **Web app** (execute as you, access: Anyone).
3. Run **showConnection** and open the **Connection** tab of the Google Sheet it created: it shows the web app address, the secret key and a ready-made **setup link**.
4. Open that setup link on the teacher's phone. The app sets itself up and opens straight to Home, with no login or setup screen. To set up more phones, use More, Another phone, Show setup link.
5. **Install it**: in Chrome choose Add to Home screen, in Safari choose Share, Add to Home Screen.

A PIN is optional (More, Lock) for phones other people use.

## Everyday use

- **Attendance**: everyone starts as present. Tap a student to cycle Present, Absent, Leave, then Save.
- **Students**: add name, school, class, guardian phone and monthly fee. Deactivate instead of deleting, so history stays.
- **Fees**: pick the month, tap a student, record a payment (part payments are fine). A numbered receipt opens; tap Print / Save as PDF.
- **Mistakes on a receipt**: void it with a reason and issue a new one. Receipt numbers are never reused or edited.
- **Reports**: see attendance date by date for every student (the current month by default, or any range you pick), and download it or the fees report as CSV, which opens in Excel or Google Sheets.
- **Visiting teachers**: for teachers who come in on specific days (special classes) and are paid per visit. Add the teacher once, then tap Record visit: choose the teacher, the day, the hours (quick buttons for 1, 1.5, 2, 3, 4) and the amount paid (pre-filled from their usual amount). The month view shows what you paid each teacher and in total, and you can download the visits or a payout summary as CSV. Visits can be edited or deleted. If you cannot pay on the day, choose **Pay later**: the visit shows as pending, and a **Still to pay** card lists what each teacher is owed across all months. Mark one visit paid from its edit screen, or tap **Mark all paid** for a teacher once you have paid them. The Home tile and both CSV files show paid and pending separately.
- **Reminders**: for pending fees, a button opens WhatsApp with a ready message.
- **Your spreadsheet**: More, Open the spreadsheet shows all your data as readable tabs in Google Sheets (also downloadable as Excel). It is a read-only copy.
- **Backup**: More, Export all data downloads one file. `npm run backup` makes dated backups from your Drive automatically.

It works offline. Changes wait on the phone and upload when you are back online (the top-right chip shows the status).

## Privacy and safety

- The data is stored only in your own Google Drive. The app has no server of its own.
- The secret key is encrypted on the phone with a key the browser will not let anyone read out, and is only ever sent to your own data service. With the optional PIN it is encrypted with the PIN instead.
- The setup link contains the key: send it privately and delete the message afterwards. If it leaks, run **rotateKey** in the script and set the phones up again.
- With a PIN set, the app locks after 5 minutes in the background.
- Do not share the Google Sheet or the Drive folder.
- Student records are children's data. Collect only what you need.

## Develop and maintain

```bash
npm install
npm run dev        # local dev server
npm test           # unit and component tests
npm run build      # production build into dist/
npm run verify     # typecheck, tests, colour contrast, build and dependency audit in one go
npm run contrast   # WCAG AA check of every colour pair
```

`npm run test:e2e` runs end-to-end tests over real HTTP against a local server that runs the real `Code.gs` on an in-memory fake of Google. Set `E2E_ENDPOINT` and `E2E_KEY` to run the same tests against a throwaway deployed web app instead.

Stack: Vite, TypeScript, Preact, a service worker for offline use, IndexedDB for the on-phone copy, a Google Apps Script web app over Drive and Sheets for storage, DM Sans and Inter for type.

### What the safety net covers

- Saves are atomic on the phone, so two quick taps can never produce the same receipt number or overwrite each other.
- Sync never overwrites an edit made while it was running; conflicts are merged, not dropped.
- Restoring a backup accepts only the app's own files and never reuses a receipt number.
- A setup link cannot repoint a phone that is already set up.
- Only the app's own file names are accepted by the data service, and the key is checked in constant time on every request.
- Text written to the readable Sheet can never run as a formula.
