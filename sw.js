// sw.js — Service Worker：程式碼/資料採網路優先（部署即時生效），圖片等資源快取優先；離線時回快取殼。
const VERSION = "gosu-v3-28";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "ui.js", "state.js", "portfolio.js", "catalog.js",
  "quotes.js", "marketdata.js",
  "charts.js", "indicators.js", "analysis.js",
  "app.js", "home.js", "stock.js", "analysisview.js", "search.js", "portfolios.js", "profile.js", "cloud.js", "tools.js", "indexview.js", "kline.js", "lightweight-charts.js",
  "manifest.webmanifest",
  "icon-180.png", "icon-192.png", "icon-512.png",
];
const DATA = ["prices.json", "market.json", "margin.json", "index-history.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;

  // 換頁（含 PWA 離線開啟）：網路優先，失敗時回快取殼，避免離線一片白
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("index.html", copy)); return r; })
        .catch(() => caches.match("index.html").then((hit) => hit || caches.match("./"))),
    );
    return;
  }

  const path = url.pathname.split("/").pop();
  // 程式碼與資料（js/css/json/html 及根路徑）：網路優先，離線才回快取 → 部署即時生效
  const isFresh = DATA.includes(path) || /\.(js|css|json|html)$/.test(path) || path === "" || url.pathname.endsWith("/") || url.pathname.endsWith(".webmanifest");
  if (isFresh) {
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })));
});
