/* GNHS Quiz updater (dialog version)
 * Every time the app opens, a pop-up dialog shows:
 *   1) "searching for updates"  (stays up SEARCH_MS)
 *   2) if there is a new version -> "downloading" with a progress bar
 *      if not                    -> "no update" message (stays up NO_UPDATE_MS), then closes
 * - Windows (Electron): status comes from electron-updater via window.gnhsUpdater
 * - Android (Capacitor): checks GitHub Releases, downloads the APK INSIDE the app,
 *   then opens Android's installer (ApkInstaller plugin).
 * - Plain browser: does nothing.
 */
(function () {
  const REPO = 'juliuscelio-del/GNHS_Quiz';
  const APK_NAME = 'GNHS-Quiz-Android.apk';

  // ---------- timing (milliseconds) ----------
  const SEARCH_MS = 10000;     // how long the "searching" dialog stays up
  const NO_UPDATE_MS = 5000;   // how long the "no update" dialog stays up

  // ---------- all texts in one place ----------
  const T = {
    title: 'GNHS Quiz',
    searching: 'Wait sa kadaliha...mangita sa ta sa updates',
    downloading: 'ato sa downloadon ag bag.ong update...wait sa...',
    none: 'updated pa ne sija..Pwed pa gamiton',
    ready: 'Human na ma-download ang bag.ong update.',
    restart: 'I-restart karon',
    later: 'Sa sunod na lang',
    allow: 'Pasagdi ang GNHS Quiz nga mag-install og updates, dayon balik ug i-tap ang Update.',
    openSettings: 'Abli-on ang settings',
    update: 'Update',
    opening: 'Human na ang download. Abli-on na ang installer...',
    tapInstall: 'I-tap ang "Install" sa Android prompt para mahuman ang update.',
    openInstaller: 'Abli-on balik ang installer',
    failed: 'Wala molampos ang update',
    retry: 'Sulayi balik',
    close: 'Isara'
  };

  const cap = window.Capacitor;
  const isAndroid = !!(cap && cap.isNativePlatform && cap.isNativePlatform() &&
                       cap.getPlatform && cap.getPlatform() === 'android');
  const desktop = window.gnhsUpdater || null;
  if (!isAndroid && !desktop) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- dialog UI ----------
  const css = `
.gnhsu-overlay{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;
  padding:20px;background:rgba(6,12,28,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
  opacity:0;transition:opacity .22s ease}
.gnhsu-overlay.open{opacity:1}
.gnhsu-card{width:100%;max-width:340px;background:var(--card,#16254a);color:var(--fg,#eef2ff);border-radius:22px;
  padding:30px 24px 22px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.08);
  font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;transform:translateY(10px) scale(.96);
  transition:transform .22s ease}
.gnhsu-overlay.open .gnhsu-card{transform:none}
.gnhsu-icon{position:relative;width:68px;height:68px;margin:0 auto 14px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;background:rgba(79,140,255,.16)}
.gnhsu-icon > *{display:none}
.gnhsu-card[data-mode="search"] .gnhsu-spin{display:block}
.gnhsu-card[data-mode="download"] .gnhsu-down{display:block}
.gnhsu-card[data-mode="ok"] .gnhsu-okmark{display:block}
.gnhsu-card[data-mode="warn"] .gnhsu-warnmark{display:block}
.gnhsu-card[data-mode="ok"] .gnhsu-icon{background:rgba(60,207,145,.16)}
.gnhsu-card[data-mode="warn"] .gnhsu-icon{background:rgba(255,176,64,.18)}
.gnhsu-spin{width:34px;height:34px;border:4px solid rgba(128,140,170,.35);border-top-color:var(--accent,#4f8cff);
  border-radius:50%;animation:gnhsu-spin .9s linear infinite}
@keyframes gnhsu-spin{to{transform:rotate(360deg)}}
.gnhsu-down{animation:gnhsu-bob 1.1s ease-in-out infinite}
@keyframes gnhsu-bob{0%,100%{transform:translateY(-2px)}50%{transform:translateY(3px)}}
.gnhsu-icon svg{width:34px;height:34px}
.gnhsu-title{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#9db0d8);margin-bottom:6px}
.gnhsu-msg{font-size:16px;font-weight:600;min-height:24px;word-break:break-word}
.gnhsu-track{display:none;height:8px;margin-top:16px;border-radius:99px;background:rgba(128,140,170,.28);overflow:hidden}
.gnhsu-fill{height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#4f8cff,#7db0ff);transition:width .2s ease}
.gnhsu-pct{display:none;margin-top:8px;font-size:13px;color:var(--muted,#9db0d8)}
.gnhsu-btn{display:none;width:100%;margin-top:18px;padding:12px;border:0;border-radius:12px;background:var(--accent,#4f8cff);
  color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer}
.gnhsu-btn:active{opacity:.85}
.gnhsu-link{display:none;width:100%;margin-top:6px;padding:10px;border:0;background:transparent;
  color:var(--muted,#9db0d8);font:14px system-ui,sans-serif;cursor:pointer}
`;
  const style = document.createElement('style');
  style.textContent = css;

  const overlay = document.createElement('div');
  overlay.className = 'gnhsu-overlay';
  overlay.innerHTML =
    '<div class="gnhsu-card" role="alertdialog" aria-live="polite" data-mode="search">' +
      '<div class="gnhsu-icon">' +
        '<div class="gnhsu-spin"></div>' +
        '<svg class="gnhsu-down" viewBox="0 0 24 24" fill="none" stroke="#4f8cff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="M7 11l5 5 5-5"/><path d="M5 20h14"/></svg>' +
        '<svg class="gnhsu-okmark" viewBox="0 0 24 24" fill="none" stroke="#3ccf91" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' +
        '<svg class="gnhsu-warnmark" viewBox="0 0 24 24" fill="none" stroke="#ffb040" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v8"/><path d="M12 18.2v.1"/></svg>' +
      '</div>' +
      '<div class="gnhsu-title"></div>' +
      '<div class="gnhsu-msg"></div>' +
      '<div class="gnhsu-track"><div class="gnhsu-fill"></div></div>' +
      '<div class="gnhsu-pct"></div>' +
      '<button class="gnhsu-btn" type="button"></button>' +
      '<button class="gnhsu-link" type="button"></button>' +
    '</div>';

  const card = overlay.querySelector('.gnhsu-card');
  const titleEl = overlay.querySelector('.gnhsu-title');
  const msgEl = overlay.querySelector('.gnhsu-msg');
  const trackEl = overlay.querySelector('.gnhsu-track');
  const fillEl = overlay.querySelector('.gnhsu-fill');
  const pctEl = overlay.querySelector('.gnhsu-pct');
  const btnEl = overlay.querySelector('.gnhsu-btn');
  const linkEl = overlay.querySelector('.gnhsu-link');
  titleEl.textContent = T.title;

  const mount = () => { document.head.appendChild(style); document.body.appendChild(overlay); };
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  let autoTimer = null, hideTimer = null;

  // opts: mode ('search'|'download'|'ok'|'warn'), text, percent, button {label,onClick}, closable
  function show(opts) {
    clearTimeout(autoTimer);
    clearTimeout(hideTimer);
    card.setAttribute('data-mode', opts.mode || 'search');
    msgEl.textContent = opts.text || '';
    if (opts.percent != null) {
      trackEl.style.display = 'block';
      pctEl.style.display = 'block';
      fillEl.style.width = opts.percent + '%';
      pctEl.textContent = opts.percent + '%';
    } else {
      trackEl.style.display = 'none';
      pctEl.style.display = 'none';
    }
    if (opts.button) {
      btnEl.textContent = opts.button.label;
      btnEl.onclick = opts.button.onClick;
      btnEl.style.display = 'block';
    } else {
      btnEl.style.display = 'none';
    }
    if (opts.closable) {
      linkEl.textContent = opts.closeLabel || T.close;
      linkEl.onclick = hide;
      linkEl.style.display = 'block';
    } else {
      linkEl.style.display = 'none';
    }
    overlay.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('open')));
  }

  function hide() {
    clearTimeout(autoTimer);
    overlay.classList.remove('open');
    hideTimer = setTimeout(() => { overlay.style.display = 'none'; }, 260);
  }

  const autoHide = (ms) => { clearTimeout(autoTimer); autoTimer = setTimeout(hide, ms); };

  const showNone = () => { show({ mode: 'ok', text: T.none }); autoHide(NO_UPDATE_MS); };

  // The dialog pops up right away on every app start.
  show({ mode: 'search', text: T.searching });

  // ---------- Windows ----------
  if (desktop) {
    let searchDone = false, pending = null;

    const apply = (s) => {
      if (s.state === 'available') show({ mode: 'download', text: T.downloading, percent: 0 });
      else if (s.state === 'progress') show({ mode: 'download', text: T.downloading, percent: s.percent });
      else if (s.state === 'downloaded')
        show({ mode: 'ok', text: T.ready, button: { label: T.restart, onClick: () => desktop.install() },
               closable: true, closeLabel: T.later });
      else if (s.state === 'none') showNone();
      else if (s.state === 'error') hide();
    };

    desktop.onStatus((s) => {
      if (s.state === 'checking') return;
      if (!searchDone) { pending = s; return; }   // keep "searching" up for the full time
      apply(s);
    });

    setTimeout(() => {
      searchDone = true;
      if (pending) apply(pending);
      else hide();                                // no answer (offline): close quietly
    }, SEARCH_MS);

    desktop.check();
    return;
  }

  // ---------- Android ----------
  const P = cap.Plugins || {};
  const Installer = P.ApkInstaller;
  const AppPlugin = P.App;
  if (!Installer || !AppPlugin) { hide(); return; } // native plugin missing: do nothing

  const parse = (v) => String(v).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const isNewer = (a, b) => {
    const x = parse(a), y = parse(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
    }
    return false;
  };

  async function startUpdate(url, version) {
    let handle = null;
    try {
      const { allowed } = await Installer.canInstall();
      if (!allowed) {
        show({
          mode: 'warn', text: T.allow, closable: true,
          button: {
            label: T.openSettings,
            onClick: async () => {
              await Installer.openInstallSettings();
              show({ mode: 'warn', text: T.allow, closable: true,
                     button: { label: T.update, onClick: () => startUpdate(url, version) } });
            }
          }
        });
        return;
      }
      show({ mode: 'download', text: T.downloading, percent: 0 });
      handle = await Installer.addListener('progress', (e) =>
        show({ mode: 'download', text: T.downloading, percent: e.percent }));
      await Installer.download({ url });
      show({ mode: 'download', text: T.opening, percent: 100 });
      await Installer.install();
      show({ mode: 'ok', text: T.tapInstall, closable: true,
             button: { label: T.openInstaller, onClick: () => Installer.install() } });
    } catch (e) {
      show({ mode: 'warn', text: T.failed + ' (' + (e && e.message ? e.message : e) + ')', closable: true,
             button: { label: T.retry, onClick: () => startUpdate(url, version) } });
    } finally {
      if (handle && handle.remove) handle.remove();
    }
  }

  // Returns {status:'update', url, version} | {status:'none'} | {status:'error'}
  async function check() {
    try {
      const info = await AppPlugin.getInfo();              // versionName, e.g. 1.0.12
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), SEARCH_MS);
      let res;
      try {
        res = await fetch('https://api.github.com/repos/' + REPO + '/releases/latest',
                          { cache: 'no-store', signal: ctl.signal });
      } finally { clearTimeout(timer); }
      if (!res.ok) return { status: 'error' };
      const rel = await res.json();
      const latest = String(rel.tag_name || '').replace(/^v/i, '');
      if (!latest || !isNewer(latest, info.version)) return { status: 'none' };
      const asset = (rel.assets || []).find((a) => a.name === APK_NAME);
      if (!asset) return { status: 'none' };
      return { status: 'update', url: asset.browser_download_url, version: latest };
    } catch (_) {
      return { status: 'error' };                          // offline or rate-limited
    }
  }

  (async function run() {
    const t0 = Date.now();
    const result = await check();
    const wait = SEARCH_MS - (Date.now() - t0);            // keep "searching" up for the full time
    if (wait > 0) await sleep(wait);
    if (result.status === 'update') startUpdate(result.url, result.version);
    else if (result.status === 'none') showNone();
    else hide();                                           // offline: close quietly
  })();
})();
