# YOURS Tuition

A phone-first app for a single tuition teacher: students (with school and class), daily attendance, monthly fees, numbered receipts and exportable reports.

There is no server and no account. Your data lives as small files in **your own private GitHub repository**, and the app is installed on your phone like any other app. This code repository contains no student data.

## Set up (one time, about 5 minutes)

1. **Create a private data repository** on GitHub (for example `tuition-data`). Choose **Private**. Leave it empty.
2. **Create an access token** that can touch only that repository:
   GitHub, Settings, Developer settings, Personal access tokens, **Fine-grained tokens**, Generate new token.
   - Repository access: **Only select repositories**, then pick your data repository.
   - Permissions, Repository permissions: **Contents: Read and write**. Nothing else.
   - Set an expiry (up to a year). Copy the token.
3. **Open the app once and choose Connect**: enter `your-username/tuition-data` and paste the token. That is the only time anyone types a token.
4. **Set up the teacher's phone without typing anything**: in the app go to More, Another phone, Show setup link. Send that link to the teacher's phone and open it. The app sets itself up, removes the token from the address bar, and from then on opens straight to Attendance with no login or setup screen.
5. **Install it**: in Chrome choose Add to Home screen, in Safari choose Share, Add to Home Screen.

The app refuses to connect to a repository that is public. A PIN is optional (More, Lock) for phones other people use.

## Everyday use

- **Attendance**: everyone starts as present. Tap a student to cycle Present, Absent, Leave, then Save.
- **Students**: add name, school, class, guardian phone and monthly fee. Deactivate instead of deleting, so history stays.
- **Fees**: pick the month, tap a student, record a payment (part payments are fine). A numbered receipt opens; tap Print / Save as PDF.
- **Mistakes on a receipt**: void it with a reason and issue a new one. Receipt numbers are never reused or edited.
- **Reports**: see attendance date by date for every student (the current month by default, or any range you pick), and download it or the fees report as CSV, which opens in Excel or Google Sheets.
- **Visiting teachers**: for teachers who come in on specific days (special classes) and are paid per visit. Add the teacher once, then tap Record visit: choose the teacher, the day, the hours (quick buttons for 1, 1.5, 2, 3, 4) and the amount paid (pre-filled from their usual amount). The month view shows what you paid each teacher and in total, and you can download the visits or a payout summary as CSV. Visits can be edited or deleted.
- **Reminders**: for pending fees, a button opens WhatsApp with a ready message.
- **Backup**: More, Export all data. Your data also has full history in the private repository.

It works offline. Changes wait on the phone and upload when you are back online (the top-right chip shows the status).

## Privacy and safety

- The token is encrypted on the phone with a key the browser will not let anyone read out, and is only ever sent to GitHub. With the optional PIN it is encrypted with the PIN instead.
- The setup link contains the token: send it privately and delete the message afterwards.
- With a PIN set, the app locks after 5 minutes in the background.
- Keep the data repository private. Do not share the token.
- Tokens expire. The app warns you 14 days before; create a new one and reconnect.
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

`npm run verify -- --e2e` also runs the end-to-end tests against a real **private** throwaway GitHub repo (set `TEST_DATA_REPO` and `TEST_GITHUB_TOKEN`).

Stack: Vite, TypeScript, Preact, a service worker for offline use, IndexedDB for the on-phone copy, the GitHub REST API for storage, DM Sans and Inter for type.

### What the safety net covers

- Saves are atomic on the phone, so two quick taps can never produce the same receipt number or overwrite each other.
- Sync never overwrites an edit made while it was running; conflicts are merged, not dropped.
- Restoring a backup accepts only the app's own files and never reuses a receipt number.
- A setup link cannot repoint a phone that is already set up.
- The app refuses to run against a public data repository.
