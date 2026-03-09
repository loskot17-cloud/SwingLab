# SwingLab PWA — Deployment Guide

## Files
- `index.html` — The full SwingLab app
- `manifest.json` — PWA manifest (app name, icons, theme)
- `sw.js` — Service worker (offline caching)
- `icon-192.png` — App icon (192x192)
- `icon-512.png` — App icon (512x512)

## Deploy to GitHub Pages

### Step 1: Create a new repository
1. Go to https://github.com/new
2. Name it `swinglab` (or whatever you prefer)
3. Set it to **Public**
4. Click "Create repository"

### Step 2: Upload files
1. On the repo page, click **"uploading an existing file"** link
2. Drag all 5 files from the `swinglab-pwa` folder into the upload area:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
3. Click **"Commit changes"**

### Step 3: Enable GitHub Pages
1. Go to your repo's **Settings** tab
2. Click **Pages** in the left sidebar
3. Under "Source", select **Deploy from a branch**
4. Under "Branch", select **main** and **/ (root)**
5. Click **Save**
6. Wait 1-2 minutes for deployment

### Step 4: Access your app
Your app will be live at:
```
https://YOUR_USERNAME.github.io/swinglab/
```

### Step 5: Install on your Android phone
1. Open the URL above in **Chrome** on your phone
2. You should see a banner "Add SwingLab to Home screen" — tap it
3. If no banner appears: tap the **⋮ menu** → **"Add to Home screen"** or **"Install app"**
4. SwingLab now appears as an app on your home screen

## That's it!
- Full camera access works (HTTPS is provided by GitHub Pages)
- The app caches itself for offline use after first load
- All features work: upload video, live camera, analysis, save, PDF export

## Updating the app
To push updates, just replace the files in your GitHub repo. 
The service worker will detect changes and update the cache.
Bump the `CACHE_NAME` version in `sw.js` to force a cache refresh.
