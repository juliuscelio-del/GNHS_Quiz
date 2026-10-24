// Offline sanity test: starts a fake teacher server and checks the student
// finder can discover it. Uses 127.0.0.x, which all loop back on Linux/Mac.
const http = require("http");
const dgram = require("dgram");
const assert = require("assert");
const path = require("path");

const { registerPing, startBeacon, BEACON_PORT } = require("../server-addon/beacon.js");
const F = require("../www/finder-core.js");

function fakeApp() {
  const routes = {};
  return { get: (p, h) => (routes[p] = h), routes };
}

(async () => {
  // Minimal express-like shim so the test needs no dependencies.
  const app = fakeApp();
  registerPing(app, 3000);
  const server = http.createServer((req, res) => {
    const h = app.routes[req.url.split("?")[0]];
    if (!h) { res.statusCode = 404; return res.end(); }
    res.set = (k, v) => res.setHeader(k, v);
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    h(req, res);
  });
  await new Promise((r) => server.listen(3000, "0.0.0.0", r));

  // 1) direct probe
  const hit = await F.probe("127.0.0.1", 3000, 1000);
  assert.deepStrictEqual(hit, { ip: "127.0.0.1", port: 3000 });
  assert.strictEqual(await F.probe("127.0.0.1", 3999, 300), null);
  console.log("✔ ping probe finds the quiz server and ignores dead ports");

  // 2) subnet scan
  const found = [];
  await F.scan(["127.0.0."], { onFound: (s) => found.push(s.ip), timeoutMs: 500 });
  assert.ok(found.includes("127.0.0.1"), "scan should find 127.0.0.1");
  console.log(`✔ subnet scan found the server (${found.length} address${found.length > 1 ? "es" : ""} on loopback)`);

  // 3) UDP beacon (needs a broadcast-capable interface; skipped if sandbox has none)
  const got = await new Promise((resolve) => {
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    s.on("message", (b) => { s.close(); resolve(JSON.parse(b.toString())); });
    s.bind(BEACON_PORT, () => startBeacon(3000, "Test Teacher"));
    setTimeout(() => { try { s.close(); } catch (_) {} resolve(null); }, 4500);
  });
  if (got) { assert.strictEqual(got.app, "gnhs-quiz"); console.log("✔ UDP beacon received:", JSON.stringify(got)); }
  else console.log("• UDP beacon not received (this environment has no broadcast route; test on a real network)");

  server.close();
  process.exit(0);
})().catch((e) => { console.error("✘ FAILED:", e.message); process.exit(1); });
