# 29 Card Game

## Run on your PC
    npm install
    npm start        # http://localhost:3000

## Deploy (Render)
Push this folder to GitHub. Render -> New Web Service. Build: npm install. Start: npm start.

## Android APK without the URL bar
The URL bar shows when Android cannot verify that the app owns your website.
1. Generate the signed APK in PWABuilder (use the same signing key every time).
2. The PWABuilder zip contains a file named assetlinks.json. Copy it over public/.well-known/assetlinks.json in this project.
3. Commit and push, wait for Render to redeploy.
4. Check that https://YOUR-SITE.onrender.com/.well-known/assetlinks.json opens and shows the file.
5. Uninstall the old app on the phone, install the new signed APK, open it.
If the bar is still there: update Chrome on the phone, make sure Chrome is the default browser, and confirm the package ID in
assetlinks.json matches the one you set in PWABuilder.

## Source
src/engine.ts holds the rules, src/test.ts is the simulation test. engine.js and bot.js are the built runtime files.

## Voice messages
Online rooms have a mic button: hold it to record up to 8 seconds, release to send. The server only relays the clip to the other
players and never stores it. The browser asks for microphone permission once. Tap a player's avatar to mute them.

## Note
This zip does not contain public/.well-known/assetlinks.json. If you already added yours, keep it.

## Card art
The picture cards are in public/cards (S/H/D/C-7..A.webp plus back.webp, 180x252, about 600 KB in total).
To turn them off and use plain drawn cards, delete the CARD_IMAGES line in public/config.js.
To replace a card, put a new 180x252 WebP with the same file name in that folder.

## Sounds
Bids and passes are spoken with the phone's own voice (browser speech). The bell button next to your avatar turns all sounds on or off.

## Reactions
Three reaction buttons (haha, sad, angry) sit at the bottom-right of the table. Everyone sees the bubble over your avatar and hears a short sound. Cooldown: 2 seconds.

## Logo
All icon files are in public/ (icon-192, icon-512, icon-maskable-512, apple-touch-icon, favicon-48). After uploading, make a new APK in PWABuilder with the same signing key so the phone icon updates.
