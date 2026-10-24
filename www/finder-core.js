/* Shared discovery logic: runs in Electron, Android WebView, and Node (tests). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FinderCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const APP_ID = "gnhs-quiz";
  const PORT = 3000;

  // Prefixes tried when we can't learn the device's own subnet (Android).
  // Includes the usual home/school routers and phone-hotspot ranges.
  const COMMON_PREFIXES = [
    "192.168.1.", "192.168.0.", "192.168.100.", "192.168.43.", "192.168.2.",
    "192.168.10.", "10.0.0.", "10.0.1.", "172.20.10.", "192.168.8.", "192.168.254.",
  ];

  async function probe(ip, port, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(`http://${ip}:${port}/api/ping`, { signal: ctrl.signal, cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.app === APP_ID ? { ip, port: j.port || port } : null;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  // Scan prefixes in order. Calls onFound({ip,port}) for each hit.
  // Stops early if shouldStop() returns true.
  async function scan(prefixes, opts = {}) {
    const { port = PORT, timeoutMs = 700, concurrency = 64, onFound = () => {}, shouldStop = () => false, onProgress = () => {} } = opts;
    for (let p = 0; p < prefixes.length; p++) {
      onProgress(prefixes[p], p, prefixes.length);
      const hosts = [];
      for (let i = 1; i <= 254; i++) hosts.push(prefixes[p] + i);
      let idx = 0;
      const worker = async () => {
        while (idx < hosts.length && !shouldStop()) {
          const ip = hosts[idx++];
          const hit = await probe(ip, port, timeoutMs);
          if (hit) onFound(hit);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      if (shouldStop()) return;
    }
  }

  // Best-effort: ask the WebView for its own LAN IP (works on some Androids).
  function localPrefixViaWebRTC(timeoutMs = 1500) {
    return new Promise((resolve) => {
      try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        const done = (v) => { try { pc.close(); } catch (_) {} resolve(v); };
        const timer = setTimeout(() => done(null), timeoutMs);
        pc.createDataChannel("x");
        pc.onicecandidate = (e) => {
          if (!e.candidate) return;
          const m = /(\d+\.\d+\.\d+)\.\d+/.exec(e.candidate.candidate);
          if (m && !m[0].startsWith("0.")) { clearTimeout(timer); done(m[1] + "."); }
        };
        pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done(null));
      } catch (_) { resolve(null); }
    });
  }

  return { APP_ID, PORT, COMMON_PREFIXES, probe, scan, localPrefixViaWebRTC };
});
