# MTG Match Journal — Setup Guide

## Step 1: Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it something like "MTG Journal"

## Step 2: Add the Apps Script

1. In the spreadsheet, click **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Open the `Code.gs` file from this zip and paste the entire contents
4. Click **Save** (the floppy disk icon)

## Step 3: Deploy as a Web App

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" and choose **Web app**
3. Set the following options:
   - Description: `MTG Journal API` (optional)
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. You may be asked to authorize — click through the Google permissions prompts
6. Copy the **Web app URL** — it looks like:
   `https://script.google.com/macros/s/LONG_STRING_HERE/exec`

## Step 4: Configure the App

1. Open `app.js` from this zip in any text editor
2. Find this line near the top:
   ```
   const SCRIPT_URL = "YOUR_APPS_SCRIPT_URL_HERE";
   ```
3. Replace `YOUR_APPS_SCRIPT_URL_HERE` with the URL you copied

## Step 5: Deploy to Netlify

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop)
2. Drag and drop the entire `mtg-journal` folder onto the page
3. Your app will be live in seconds with a URL like `https://random-name.netlify.app`

## Where does the data live?

All entries are stored as rows in the **Entries** tab of your Google Sheet.
The Apps Script creates that tab automatically on first use.

You can open the sheet anytime to see, export, or back up your data.

## Updating the app later

If you change `app.js` or `index.html`, just drag the folder to Netlify Drop again
(or use the Netlify dashboard to re-deploy). Your Google Sheet data is unaffected.
