/* GNHS Quiz — Student app updater
   Shows the update popup EVERY time the app opens, whether or not there is an update.
   The popup has NO close button: students can't dismiss it.
   - Android: checks GitHub Releases for a newer APK (also when the app returns
     from the background and internet comes back).
   - Windows: shows the status reported by electron-updater (see preload.js / main.js).
   Does nothing in a normal browser. */
(function () {
  var REPO = 'juliuscelio-del/GNHS_Quiz';
  var CHECKING_MS = 10000;          // "paabot kadali..." popup stays on screen this long
  var UP_TO_DATE_MS = 5000;         // "Okie pa ag version..." popup stays this long
  var NOTICE_MS = 4000;             // offline / error popups
  var FETCH_TIMEOUT_MS = 8000;      // don't hang forever on a network with no internet
  var WATCHDOG_MS = 25000;          // safety: a "checking" popup can never stay on screen longer than this
  var RECHECK_MS = 10 * 60 * 1000;  // Android: re-check when resuming if last check was this long ago

  // true  = when an update exists, students MUST update (no "Later" button).
  // false = students also get a "Later" button.
  var FORCE_UPDATE = true;

  var CHECKING_TITLE = 'paabot kadali....mangita tag update...';
  var UPTODATE_TITLE = 'Okie pa ag version. Updated pa ne. Padajun gamit';

  var checking = false, finished = false, shownOffline = false;
  var closeTimer = null, watchdog = null, lastCheckAt = 0;

  // ── Capacitor plugins (no bundler needed) ─────────────────────────────────
  function plugin(name) {
    var C = window.Capacitor;
    return C && C.Plugins && C.Plugins[name] ? C.Plugins[name] : null;
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  // Palette: ube #2a0f73 (card) · dragonfruit #ff2e93 · mango #ffc21a ·
  //          pandan-teal #00d1b2 · violet #7a5cff
  var css = [
    '#gnhs-upd{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;',
    'background:radial-gradient(circle at 15% 12%,rgba(255,46,147,.6),transparent 46%),',
    'radial-gradient(circle at 88% 90%,rgba(0,209,178,.5),transparent 46%),rgba(22,6,60,.86);',
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
    'font-family:"Trebuchet MS","Segoe UI Variable Display","Segoe UI",system-ui,-apple-system,Roboto,sans-serif}',

    // animated gradient frame around the card
    '#gnhs-upd .frame{width:min(360px,100%);padding:3px;border-radius:28px;',
    'background:linear-gradient(120deg,#ff2e93,#ffc21a,#00d1b2,#7a5cff,#ff2e93);background-size:300% 300%;',
    'box-shadow:0 0 40px rgba(255,46,147,.45),0 24px 60px rgba(10,0,40,.6);',
    'animation:gu-pop .3s ease-out both,gu-flow 5s ease-in-out infinite alternate}',
    '#gnhs-upd .card{position:relative;overflow:hidden;border-radius:25px;text-align:center;padding:34px 26px 36px;',
    'background:radial-gradient(circle at 50% -10%,#4a2bb8 0%,#2a0f73 55%,#1d0a54 100%);color:#fff}',
    '@keyframes gu-pop{from{opacity:0;transform:scale(.93) translateY(10px)}to{opacity:1;transform:none}}',
    '@keyframes gu-flow{from{background-position:0% 50%}to{background-position:100% 50%}}',

    // status icon
    '#gnhs-upd .icon{position:relative;width:76px;height:76px;margin:0 auto 18px;border-radius:50%;',
    'display:flex;align-items:center;justify-content:center}',
    '#gnhs-upd .icon.ok{background:linear-gradient(135deg,#00d1b2,#7cf29a);box-shadow:0 0 28px rgba(0,209,178,.65)}',
    '#gnhs-upd .icon.dl{background:linear-gradient(135deg,#ffc21a,#ff2e93);box-shadow:0 0 28px rgba(255,46,147,.65)}',
    '#gnhs-upd .icon.warn{background:linear-gradient(135deg,#ffb020,#ff4d4d);box-shadow:0 0 28px rgba(255,100,60,.65)}',
    '#gnhs-upd .icon:after{content:"";position:absolute;inset:-8px;border-radius:50%;',
    'border:2px solid rgba(255,255,255,.35);animation:gu-pulse 1.8s ease-out 3}',
    '@keyframes gu-pulse{from{transform:scale(.88);opacity:.9}to{transform:scale(1.25);opacity:0}}',

    // rainbow spinner
    '#gnhs-upd .ring{width:66px;height:66px;margin:4px auto 22px;border-radius:50%;',
    'background:conic-gradient(from 0deg,rgba(255,46,147,0),#ff2e93,#ffc21a,#00d1b2,#7a5cff);',
    '-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 8px),#000 calc(100% - 7px));',
    'mask:radial-gradient(farthest-side,transparent calc(100% - 8px),#000 calc(100% - 7px));',
    'animation:gu-spin .9s linear infinite}',
    '@keyframes gu-spin{to{transform:rotate(360deg)}}',

    // text
    '#gnhs-upd h2{margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:800;letter-spacing:-.01em;color:#ffd23f;',
    'background:linear-gradient(90deg,#ffd23f 0%,#ff7ab6 55%,#7ff3e0 100%);',
    '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}',
    '#gnhs-upd p{margin:0;color:#e1d6ff;font-size:15px;line-height:1.55}',
    '#gnhs-upd .chip{display:inline-block;margin-top:14px;padding:6px 16px;border-radius:999px;',
    'background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);color:#ffe27a;',
    'font-size:13px;font-weight:700;letter-spacing:.02em}',

    // download progress bar
    '#gnhs-upd .bar{margin:18px 0 0;height:10px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden}',
    '#gnhs-upd .bar i{display:block;height:100%;width:0;border-radius:inherit;',
    'background:linear-gradient(90deg,#ffd23f,#ff2e93,#7a5cff);transition:width .25s ease}',

    // buttons
    '#gnhs-upd .row{margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}',
    '#gnhs-upd .row button{padding:13px 28px;border-radius:999px;border:2px solid rgba(255,255,255,.3);',
    'background:transparent;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;transition:transform .12s ease}',
    '#gnhs-upd .row button:active{transform:scale(.96)}',
    '#gnhs-upd .row button:focus-visible{outline:3px solid #ffd23f;outline-offset:3px}',
    '#gnhs-upd .row button.p{border:0;background:linear-gradient(135deg,#ff2e93,#ff8a3d);box-shadow:0 8px 24px rgba(255,46,147,.55)}',

    // auto-close countdown
    '#gnhs-upd .cd{position:absolute;left:0;bottom:0;height:6px;',
    'background:linear-gradient(90deg,#ffd23f,#ff2e93,#7a5cff);animation:gu-cd linear forwards}',
    '@keyframes gu-cd{from{width:100%}to{width:0}}',

    '@media (prefers-reduced-motion:reduce){#gnhs-upd .frame,#gnhs-upd .icon:after{animation:none}}'
  ].join('');

  function svg(path) {
    return '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" ' +
           'stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
  var ICONS = {
    check: { cls: 'ok',   html: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>') },
    download: { cls: 'dl', html: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>') },
    alert: { cls: 'warn', html: svg('<path d="M12 6v7M12 17.5v.5"/>') }
  };

  function addStyle() {
    if (document.getElementById('gnhs-upd-css')) return;
    var s = document.createElement('style');
    s.id = 'gnhs-upd-css';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Popup (centered, NO close button) ─────────────────────────────────────
  function closePopup() {
    clearTimeout(closeTimer);
    var el = document.getElementById('gnhs-upd');
    if (el) el.remove();
  }

  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      checking = false;
      show({ title: "Couldn't check for updates", message: 'Check your internet connection.', icon: 'alert' }, NOTICE_MS);
    }, WATCHDOG_MS);
  }
  function disarmWatchdog() { clearTimeout(watchdog); }

  /* opts: title, message, chip, icon ('check'|'download'|'alert'), spinner,
           progress (0-100 → shows a bar), buttons [{label, primary, keep, onClick}] */
  function show(opts, autoCloseMs) {
    closePopup();
    addStyle();

    var overlay = document.createElement('div');
    overlay.id = 'gnhs-upd';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');

    var frame = document.createElement('div');
    frame.className = 'frame';
    var card = document.createElement('div');
    card.className = 'card';

    var top = document.createElement('div');
    if (opts.spinner) {
      top.className = 'ring';
    } else {
      var ic = ICONS[opts.icon] || ICONS.check;
      top.className = 'icon ' + ic.cls;
      top.innerHTML = ic.html;
    }
    card.appendChild(top);

    var h = document.createElement('h2');
    h.textContent = opts.title;
    card.appendChild(h);

    if (opts.message) {
      var p = document.createElement('p');
      p.className = 'msg';
      p.textContent = opts.message;
      card.appendChild(p);
    }

    if (opts.chip) {
      var chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = opts.chip;
      card.appendChild(chip);
    }

    if (typeof opts.progress === 'number') {
      var bar = document.createElement('div');
      bar.className = 'bar';
      var fill = document.createElement('i');
      fill.style.width = opts.progress + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
    }

    var firstPrimary = null;
    if (opts.buttons && opts.buttons.length) {
      var row = document.createElement('div');
      row.className = 'row';
      opts.buttons.forEach(function (b) {
        var btn = document.createElement('button');
        btn.textContent = b.label;
        if (b.primary) { btn.className = 'p'; firstPrimary = firstPrimary || btn; }
        btn.onclick = function () {
          if (!b.keep) closePopup();          // keep:true = popup stays until the app restarts/updates
          if (b.onClick) b.onClick();
        };
        row.appendChild(btn);
      });
      card.appendChild(row);
    }

    if (autoCloseMs) {
      var cd = document.createElement('div');
      cd.className = 'cd';
      cd.style.animationDuration = autoCloseMs + 'ms';
      card.appendChild(cd);
      closeTimer = setTimeout(closePopup, autoCloseMs);
    }

    frame.appendChild(card);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    if (firstPrimary) firstPrimary.focus();
  }

  function showUpToDate() {
    show({ title: UPTODATE_TITLE, icon: 'check' }, UP_TO_DATE_MS);
  }

  // Update the download popup in place (no flicker)
  function setProgress(percent, msg) {
    var m = document.querySelector('#gnhs-upd p.msg');
    var b = document.querySelector('#gnhs-upd .bar i');
    if (!m || !b) return false;
    m.textContent = msg;
    b.style.width = percent + '%';
    return true;
  }

  // ═════════════════════════════ WINDOWS ═══════════════════════════════════
  // main.js runs electron-updater and reports its status through preload.js.
  function startDesktop() {
    var D = window.gnhsUpdater;
    var verChip = '';

    var gateUntil = 0, queue = [], gateTimer = null;

    // The "checking" popup stays for CHECKING_MS; later statuses wait their turn.
    D.onStatus(function (s) {
      if (s.state !== 'checking') disarmWatchdog();
      if (s.state === 'checking') {
        gateUntil = Date.now() + CHECKING_MS;
        queue = [];
        clearTimeout(gateTimer);
        gateTimer = setTimeout(flush, CHECKING_MS);
      } else if (Date.now() < gateUntil) {
        queue.push(s);
        return;
      }
      handle(s);
    });

    function flush() { var q = queue; queue = []; q.forEach(handle); }

    function handle(s) {
      if (s.state === 'checking') {
        show({ title: CHECKING_TITLE, spinner: true });
        armWatchdog();
      } else if (s.state === 'none') {
        showUpToDate();
      } else if (s.state === 'available') {
        verChip = 'v' + s.current + ' \u2192 v' + s.version;
        show({
          title: 'Update',
          message: 'Nag-download na sa update\u2026',
          chip: verChip,
          spinner: true,
          progress: 0
        });
      } else if (s.state === 'progress') {
        var msg = 'Nag-download\u2026 ' + s.percent + '%';
        if (!setProgress(s.percent, msg)) {
          show({ title: 'Update', message: msg, chip: verChip, spinner: true, progress: s.percent });
        }
      } else if (s.state === 'downloaded') {
        var restart = { label: 'Restart now', primary: true, keep: true, onClick: function () { D.install(); } };
        show({
          title: 'Update',
          message: FORCE_UPDATE
            ? 'Na-download na ang v' + s.version + '. I-restart ang app para ma-install.'
            : 'Na-download na ang v' + s.version + '. I-restart ang app para ma-install, o ma-install gihapon inig close sa app.',
          icon: 'download',
          buttons: FORCE_UPDATE ? [restart] : [{ label: 'Later' }, restart]
        });
      } else if (s.state === 'error') {
        show({ title: "Couldn't check for updates", message: 'Check your internet connection.', icon: 'alert' }, NOTICE_MS);
      }
    }

    D.check();   // every time the app opens
  }

  // ═════════════════════════════ ANDROID ═══════════════════════════════════
  // Version compare (1.2.3 style)
  function isNewer(a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if ((x[i] || 0) > (y[i] || 0)) return true;
      if ((x[i] || 0) < (y[i] || 0)) return false;
    }
    return false;
  }

  function openUrl(url) {
    var B = plugin('Browser');
    if (B && B.open) B.open({ url: url });
    else window.open(url, '_system');
  }

  // Fetch the latest release, with a timeout
  function fetchLatestRelease() {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS) : null;
    return fetch('https://api.github.com/repos/' + REPO + '/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      if (r.status === 404) return null;                       // no release published yet
      if (r.status === 403 || r.status === 429) {
        var e = new Error('rate limit'); e.rateLimited = true; throw e;
      }
      if (!r.ok) throw new Error('bad response');
      return r.json();
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  // Run fn only after the "checking" popup has been visible for CHECKING_MS.
  function afterMin(startedAt, fn) {
    var left = Math.max(0, CHECKING_MS - (Date.now() - startedAt));
    return new Promise(function (resolve) {
      setTimeout(function () { try { fn(); } catch (e) {} resolve(); }, left);
    });
  }

  function renderResult(current, release) {
    if (!release) { showUpToDate(); return; }

    var latest = String(release.tag_name || '').replace(/^v/, '');
    var apk = (release.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0];

    if (apk && isNewer(latest, current)) {
      var update = { label: 'Update now', primary: true, keep: true, onClick: function () { openUrl(apk.browser_download_url); } };
      show({
        title: 'Update',
        message: 'Pislita ag update basin naa Updated na App',
        chip: 'v' + current + ' \u2192 v' + latest,
        icon: 'download',
        buttons: FORCE_UPDATE ? [update] : [{ label: 'Later' }, update]
      });
    } else {
      showUpToDate();
    }
  }

  function check() {
    if (finished || checking) return;
    var App = plugin('App');
    if (!App || !App.getInfo) return;        // not the installed app (e.g. opened in a browser)

    lastCheckAt = Date.now();

    if (!navigator.onLine) {
      if (!shownOffline) {
        shownOffline = true;
        show({ title: 'No internet connection',
               message: 'The app works offline. It will check again when internet returns.',
               icon: 'alert' }, NOTICE_MS);
      }
      return;
    }

    checking = true;
    var startedAt = Date.now();
    show({ title: CHECKING_TITLE, spinner: true });
    armWatchdog();

    Promise.all([App.getInfo(), fetchLatestRelease()]).then(function (res) {
      disarmWatchdog();
      finished = true;
      return afterMin(startedAt, function () { renderResult(res[0].version, res[1]); });
    }).catch(function (err) {
      disarmWatchdog();
      return afterMin(startedAt, function () {
        show({
          title: "Couldn't check for updates",
          message: err && err.rateLimited
            ? 'Too many checks right now. Try again in a little while.'
            : 'Check your internet connection.',
          icon: 'alert'
        }, NOTICE_MS);
      });
    }).then(function () { checking = false; });
  }

  function startAndroid() {
    check();                                          // every time the app opens
    window.addEventListener('online', check);         // when internet returns

    // Coming back from the background: show the popup again (if the last check
    // was a while ago), since the app isn't restarted when it's reopened.
    var App = plugin('App');
    if (App && App.addListener) {
      App.addListener('appStateChange', function (st) {
        if (st && st.isActive && Date.now() - lastCheckAt > RECHECK_MS) {
          finished = false; shownOffline = false;
          check();
        }
      });
    }
  }

  function start() {
    if (window.gnhsUpdater) startDesktop();           // Windows (Electron)
    else startAndroid();                              // Android (Capacitor); no-op in a browser
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
