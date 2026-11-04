// 離線快取：同網域檔案「網路優先、失敗改用快取」，所以更新網站後一定拿到新版，沒網路時也能開。
const CACHE = "invest-v1";
const SHELL = ["./", "index.html", "css/style.css", "js/app.js", "js/portfolio.js", "js/catalog.js", "js/quotes.js", "js/indicators.js", "js/analysis.js", "js/charts.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-180.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // 行情 API 等跨網域請求不經過快取
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(url.pathname.endsWith("prices.json") ? url.pathname : req, copy)); }
      return res;
    } catch {
      const hit = (await caches.match(url.pathname.endsWith("prices.json") ? url.pathname : req, { ignoreSearch: true })) || (req.mode === "navigate" ? await caches.match("index.html") : null);
      if (hit) return hit;
      return new Response("離線中", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
  })());
});
