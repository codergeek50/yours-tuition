# Your data service (set up once, about 5 minutes)

YOURS Tuition keeps its data in **your own Google Drive**, through a small free script that runs in your Google account. Nothing is paid for, and nobody else (not even the app's author) can see the data.

What you end up with:

- A Drive folder **YOURS Tuition data** holding the data files.
- A Google Sheet **YOURS Tuition data (read-only view)** with tabs *Students*, *Teachers*, *Payments*, *Visits* and one *Attendance* tab per month. Open it in Sheets, or File, Download, Microsoft Excel. It is a read-only copy: changes made in the Sheet are overwritten and never go back to the app.
- A secret key and web address that let the app (and only the app) read and save the data.

You need: your Google account. No Google Cloud project, no credit card.

## Steps

1. Open <https://script.google.com> and click **New project**. Name it `YOURS Tuition data`.
2. Delete the sample code. Open `Code.gs` from this folder, copy **all** of it, paste it into the editor, and click **Save**.
3. In the toolbar pick the function **setup** and click **Run**. Google asks for permission. This is your own script, so it shows a warning screen: choose your account, **Advanced**, **Go to YOURS Tuition data (unsafe)**, then **Allow**. (The script needs Drive and Sheets only to create the folder and the Sheet.)
4. Click **Deploy**, **New deployment**, the gear icon, **Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Click **Deploy**. ("Anyone" means no Google sign-in is needed from the phone; the secret key is what protects the data.)
5. Open the **Web app URL** shown after deploying (it ends in `/exec`) once in a browser tab: it shows a short "ok" message and lets the script learn its own address. Back in the editor pick the function **showConnection** and click **Run**. Then open Drive, the folder **YOURS Tuition data**, the Sheet, and the **Connection** tab. It shows:
   - the **web app address**,
   - the **secret key**,
   - a ready-made **setup link**.
6. Open the **setup link** on the teacher's phone (send it privately, then delete the message). The app sets itself up and opens straight to Home. To set up another phone later, use More, Another phone, Show setup link.

## Keeping it safe

- Anyone who has both the address and the key can read and change the tuition data. Keep the **Connection** tab and the setup link private, and do not share the Sheet or the folder.
- If the key might have leaked: in the script editor run **rotateKey**. The old key stops working at once. Open the Connection tab for the new setup link and set each phone up again.
- Your data stays in your Drive: delete the folder to delete the data. Drive's own version history keeps earlier versions of each file for a while.

## Updating the script later

When a new `Code.gs` is released: paste it over the old one, Save, then **Deploy, Manage deployments**, the pencil icon, **Version: New version**, **Deploy**. The address and key stay the same.

## If something does not work

| What the app says | Likely cause |
|---|---|
| "did not answer as expected ... Anyone" | The deployment's access is not **Anyone**. Redeploy with Who has access set to Anyone. |
| "did not accept the secret key" | The key was replaced with `rotateKey`, or it was typed wrongly. Use the current setup link. |
| "not set up yet" | You have not run **setup** (step 3). |
| The first sync after a while takes a few seconds | Normal: Google wakes the script up. The app works from its offline copy in the meantime. |
