# GNHS Quiz — Student App (Android)

Students open the app and it finds the teacher's quiz server by itself. If the teacher's IP
changes mid-quiz, the app searches again and reconnects. Manual IP entry is the fallback.

## 1. Build it on GitHub
1. Create a new GitHub repo and upload everything in this folder (keep the hidden `.github` folder).
2. Open **Actions → Build Android app → Run workflow**.
3. When it finishes, download **GNHS-Quiz-Android** from the run's Artifacts: a debug `.apk`.

## 2. Install
On the phone, allow "Install unknown apps" for the app you open the APK with.

## 3. Teacher server (once)
Copy `server-addon/beacon.js` into your `SERVER/` folder, then edit `server.js`:
```js
// top, with the other requires
const beacon = require("./beacon.js");

// right after app.use(express.json());
beacon.registerPing(app, PORT);

// first line inside server.listen(PORT, "0.0.0.0", () => {
beacon.startBeacon(PORT, "Teacher");
```
Allow Node.js through the teacher's firewall (UDP 41234, TCP 3000).
If students can't find the teacher, the school router may have "client isolation" turned on.

## Test the logic locally
`npm install` then `npm test`
