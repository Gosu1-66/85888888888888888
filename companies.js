// companies.js — 公司一句話簡介（台股、美股；加密貨幣不顯示）。資料在 companies.json，沒有的就不顯示。
export const CO = {};
let loaded = false;
export function loadCompanies() {
  if (loaded) return Promise.resolve(CO);
  return fetch("companies.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => { Object.assign(CO, j || {}); loaded = true; window.dispatchEvent(new CustomEvent("portfolios:changed")); return CO; })
    .catch(() => CO);
}
export const companyDesc = (key) => (String(key).startsWith("加密貨幣:") ? "" : CO[key] || "");
