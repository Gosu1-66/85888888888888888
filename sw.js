// sw.js — Service Worker：外殼快取優先；行情／市場檔網路優先（排程更新後自動拿最新）。
const VERSION = "gosu-v2-1";
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "ui.js", "state.js", "portfolio.js", "catalog.js",
  "quotes.js", "marketdata.js",
  "charts.js", "indicators.js", "analysis.js",
  "app.js", "home.js", "analysisview.js", "search.js", "portfolios.js", "profile.js", "cloud.js",
  "manifest.webmanifest",
  "icon-180.png", "icon-192.png", "icon-512.png",
];
const DATA = ["prices.json", "market.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const path = url.pathname.split("/").pop();
  if (DATA.includes(path)) {
    // 網路優先，失敗才用快取（保持行情新鮮度）
    e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r; })));
});
