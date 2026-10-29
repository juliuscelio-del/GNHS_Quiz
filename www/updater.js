/* GNHS Quiz updater
 * - Windows (Electron): shows status from electron-updater via window.gnhsUpdater
 * - Android (Capacitor): checks GitHub Releases, downloads the APK INSIDE the app
 *   with a progress bar, then opens Android's installer (ApkInstaller plugin).
 * - Plain browser: does nothing.
 */
(function () {
  const REPO = 'juliuscelio-del/GNHS_Quiz';
  const APK_NAME = 'GNHS-Quiz-Android.apk';

  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.isNativePlatform && cap.isNativePlatform() &&
                       cap.getPlatform && cap.getPlatform() === 'android');
  const desktop = window.gnhsUpdater || null;
  if (!isAndroid && !desktop) return;

  // ---------- tiny UI ----------
  const bar = document.createElement('div');
  bar.style.cssText =
    'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));' +
    'z-index:2147483647;background:#16254a;color:#eef2ff;border-radius:12px;padding:12px 14px;' +
    'font:14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4);display:none;';
  const msg = document.createElement('div');
  const track = document.createElement('div');
  track.style.cssText = 'height:6px;background:rgba(255,255,255,.2);border-radius:3px;margin-top:8px;display:none;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;width:0;background:#4f8cff;transition:width .2s;';
  track.appendChild(fill);
  const btn = document.createElement('button');
  btn.style.cssText = 'margin-top:10px;width:100%;padding:10px;border:0;border-radius:8px;background:#4f8cff;color:#fff;font-size:15px;display:none;';
  bar.append(msg, track, btn);
  const mount = () => document.body.appendChild(bar);
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  function show(text, opts) {
    opts = opts || {};
    bar.style.display = 'block';
    msg.textContent = text;
    track.style.display = opts.percent != null ? 'block' : 'none';
    if (opts.percent != null) fill.style.width = opts.percent + '%';
    if (opts.button) { btn.textContent = opts.button; btn.onclick = opts.onClick; btn.style.display = 'block'; }
    else btn.style.display = 'none';
  }
  const hide = () => { bar.style.display = 'none'; };

  // ---------- Windows ----------
  if (desktop) {
    desktop.onStatus((s) => {
      if (s.state === 'available') show('Downloading update v' + s.version + '…', { percent: 0 });
      else if (s.state === 'progress') show('Downloading update… ' + s.percent + '%', { percent: s.percent });
      else if (s.state === 'downloaded')
        show('Update v' + s.version + ' is ready.', { button: 'Restart now', onClick: () => desktop.install() });
      else if (s.state === 'none' || s.state === 'error') hide();
    });
    desktop.check();
    return;
  }

  // ---------- Android ----------
  const P = cap.Plugins || {};
  const Installer = P.ApkInstaller;
  const AppPlugin = P.App;
  if (!Installer || !AppPlugin) return; // native plugin missing: do nothing (never open a browser)

  const parse = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const isNewer = (a, b) => {
    const x = parse(a), y = parse(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  };

  async function startUpdate(url, version) {
    try {
      const { allowed } = await Installer.canInstall();
      if (!allowed) {
        show('Allow GNHS Quiz to install updates, then come back and tap Update again.', {
          button: 'Open settings',
          onClick: async () => { await Installer.openInstallSettings(); show('After allowing, tap Update again.', { button: 'Update', onClick: () => startUpdate(url, version) }); }
        });
        return;
      }
      show('Downloading v' + version + '… 0%', { percent: 0 });
      const handle = await Installer.addListener('progress', (e) =>
        show('Downloading v' + version + '… ' + e.percent + '%', { percent: e.percent }));
      await Installer.download({ url });
      if (handle && handle.remove) handle.remove();
      show('Download complete. Opening installer…', { percent: 100 });
      await Installer.install();
      show('Tap "Install" in the Android prompt to finish updating.', { button: 'Open installer again', onClick: () => Installer.install() });
    } catch (e) {
      show('Update failed (' + (e && e.message ? e.message : e) + ').', { button: 'Try again', onClick: () => startUpdate(url, version) });
    }
  }

  async function check() {
    try {
      const info = await AppPlugin.getInfo();              // versionName, e.g. 1.0.12
      const res = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { cache: 'no-store' });
      if (!res.ok) return;
      const rel = await res.json();
      const latest = String(rel.tag_name || '').replace(/^v/i, '');
      if (!latest || !isNewer(latest, info.version)) return;
      const asset = (rel.assets || []).find((a) => a.name === APK_NAME);
      if (!asset) return;
      show('A new version (v' + latest + ') is available.', {
        button: 'Update', onClick: () => startUpdate(asset.browser_download_url, latest)
      });
    } catch (_) { /* offline or rate-limited: stay quiet */ }
  }

  check();
})();
