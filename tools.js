// tools.js — 首頁功能入口的專屬頁面：市場雷達／法人排行／當沖排行／選股／大盤
// 資料來源：market.json（TWSE 盤後）＋即時報價 S.quotes。單位：金額元→億、股→張。
import { esc, fmt, pct, tone, registerAction, $ } from "./ui.js";
import { S, save, uni, quoteOf, fxRate } from "./state.js";
import { keyOf } from "./portfolio.js";
import { breadth, institutions, instRank, industryFlow, daytrade, greedIndex, indices } from "./marketdata.js";
import { HOT_STOCKS, CATALOG } from "./catalog.js";
import { stockLogo, sparkLine } from "./home.js";

const yi = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1e8), 0) + "億";
const zhang = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1000), 0) + "張";
const clean = (s) => String(s || "").trim();
/* 可點判定：有報價 + 至少 60 根日 K（避免點進去看不到圖） */
const canKey = (k) => !!(S.quotes?.[k] && typeof S.quotes[k].price === "number") && (S.file?.candles?.[k]?.length || 0) >= 60;
const canCode = (c) => canKey(keyOf("台股", clean(c)));
const nameOf = (code, raw) => {
  const k = keyOf("台股", code);
  return uni().find((x) => x.key === k)?.name || clean(raw) || code;
};

function head() {
  return "";   // 頂部列已提供返回鍵，子頁不再重複
}

function emptyCard(title, msg) {
  return `<section class="card"><h2 class="h2">${esc(title)}</h2><p class="muted small">${esc(msg)}</p></section>`;
}

/* ── 市場雷達 ── */
export function viewRadar() {
  const g = greedIndex();
  const b = breadth();
  const ind = industryFlow();
  const inst = institutions();
  const rank = instRank() || {};
  const idx = indices()[0];
  const dateTxt = S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : "";

  const stockCount = new Set([...(rank.foreign || []), ...(rank.trust || []), ...(rank.dealer || [])].map((x) => String(x.code).trim())).size;
  const indSorted = ind.slice().sort((a, c) => (c.totalNet || 0) - (a.totalNet || 0));
  const maxInd = Math.max(...ind.map((x) => Math.abs(x.totalNet || 0)), 1);
  const score = (v) => Math.round(50 + Math.max(-1, Math.min(1, v / maxInd)) * 45);

  const indTop = indSorted.slice(0, 6).map((x, i) => {
    const s = score(x.totalNet || 0);
    return `<div class="rrow rank" style="grid-template-columns:26px minmax(0,1fr) auto">
      <span class="rk ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}">${i + 1}</span>
      <div class="rmid"><div class="nm">${esc(x.name)}</div>
        <div class="barline" style="margin-top:6px"><i style="width:${Math.min(100, s)}%;background:linear-gradient(90deg,#c9a259,#f0cf8e)"></i></div>
        <div class="sub" style="margin-top:5px">${(x.totalNet || 0) >= 0 ? "+" : ""}${zhang(x.totalNet)}</div>
      </div>
      <div class="rpx"><div class="p" style="font-size:16px;color:var(--gold2)">${s}</div></div>
    </div>`;
  }).join("");

  const foreign = (rank.foreign || []).filter((x) => canCode(x.code)).slice().sort((a, c) => c.net - a.net);
  const maxF = Math.max(...foreign.map((x) => x.net), 1);
  const stkTop = foreign.slice(0, 6).map((x, i) => {
    const k = keyOf("台股", String(x.code).trim());
    const nm = uni().find((u) => u.key === k)?.name || String(x.name).trim();
    const s = Math.round(50 + (x.net / maxF) * 45);
    const q = S.quotes[k];
    return `<a class="rrow" style="grid-template-columns:22px 34px minmax(0,1fr) auto" href="#/stock/${encodeURIComponent(k)}">
      <span class="rk ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}">${i + 1}</span>
      <span class="logo">${stockLogo(k, nm, String(x.code).trim(), "logo")}</span>
      <span class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(String(x.code).trim())} · 共振 ${s}</div></span>
      <span class="rpx"><div class="p ${q ? tone(q.change) : ""}">${q ? fmt(q.price, 2) : "—"}</div><div class="d ${q ? tone(q.change) : "muted"}">${q ? pct(q.change) : "—"}</div></span>
    </a>`;
  }).join("");

  const eventStk = foreign.slice(0, 3).map((x) => {
    const k = keyOf("台股", String(x.code).trim());
    const nm = uni().find((u) => u.key === k)?.name || String(x.name).trim();
    const q = S.quotes[k];
    return `<a class="rrow" href="#/stock/${encodeURIComponent(k)}">
      <span class="logo">${stockLogo(k, nm, String(x.code).trim(), "logo")}</span>
      <span class="rmid"><div class="nm">${esc(nm)} <span class="mini-chip red">強勢共振</span></div>
        <div class="sub">外資買超 ${zhang(x.net)}${q ? " · 現價 " + fmt(q.price, 2) : ""}</div></span>
      <span class="rpx"><div class="p ${q ? tone(q.change) : ""}" style="font-size:14px">${q ? pct(q.change) : ""}</div></span>
    </a>`;
  }).join("");

  return `<section class="xcard">
      <div class="sec-h"><span class="ico">📡</span><span class="tt">市場情報總覽</span><span class="sp"></span><span class="meta">${esc(dateTxt)}</span></div>
      <div class="stat4" style="border-top:0;padding-top:0">
        <div><div class="k">覆蓋個股</div><div class="v" style="font-size:17px">${stockCount}</div></div>
        <div><div class="k">追蹤產業</div><div class="v" style="font-size:17px">${ind.length}</div></div>
        <div><div class="k">偵測事件</div><div class="v" style="font-size:17px">${(b ? b.rise + b.fall : 0)}</div></div>
        <div><div class="k">市場情緒</div><div class="v" style="font-size:17px">${g ? g.score : "—"}</div></div>
      </div>
    </section>

    <section class="xcard">
      <div class="sec-h"><span class="ico">🏭</span><span class="tt">產業共振榜</span><span class="sp"></span><span class="meta">依法人淨額</span></div>
      ${indTop || `<p class="small muted">尚無資料</p>`}
    </section>

    <section class="xcard">
      <div class="sec-h"><span class="ico">🎯</span><span class="tt">個股多因子共振</span><span class="sp"></span><span class="meta">外資視角</span></div>
      ${stkTop || `<p class="small muted">尚無資料</p>`}
    </section>

    <section class="xcard">
      <div class="sec-h"><span class="ico">⚡</span><span class="tt">異常事件研究線索</span><span class="sp"></span><span class="meta">規則式</span></div>
      ${eventStk || `<p class="small muted">尚無資料</p>`}
      <p class="small muted" style="margin-top:10px">分數與共振為法人淨額與量價的規則式推估，非預測。</p>
    </section>`;
}

/* ── 法人排行 ── */
export function viewInst() {
  const rank = instRank();
  if (!rank) return `${head("法人買賣超排行")}${emptyCard("法人排行", "市場資料尚未更新")}`;
  const tab = S.instTab || "foreign";
  const tabs = [["foreign", "外資"], ["trust", "投信"], ["dealer", "自營商"]];
  const keyOfType = tab === "foreign" ? "外資" : tab === "trust" ? "投信" : "自營商";
  const arr = (rank[tab] || []).filter((x) => canCode(x.code)).slice().sort((a, b) => b.net - a.net);
  const top = arr.slice(0, 25);
  const bot = arr.slice(-15).reverse();
  const row = (x, i) => {
    const k = keyOf("台股", clean(x.code));
    const w = S.set.watch.includes(k);
    const nm = nameOf(x.code, x.name);
    return `<a class="rrow" style="grid-template-columns:22px 34px minmax(0,1fr) auto 64px" href="#/stock/${encodeURIComponent(k)}">
      <span class="rk ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}" style="width:20px;height:20px;font-size:11px">${i + 1}</span>
      <span class="logo">${stockLogo(k, nm, clean(x.code), "logo")}</span>
      <span class="rmid"><div class="nm">${esc(nm)}${w ? '<span class="mini-chip gold">自選</span>' : ""}</div><div class="sub">${esc(clean(x.code))} · ${esc(keyOfType)}</div></span>
      <span class="rpx"><div class="p ${tone(x.net)}">${zhang(x.net)}</div></span>
      <span class="rside">${sparkLine(k, 64, 22)}</span>
    </a>`;
  };
  return `${head()}
    <div class="chiprow" style="margin:0 0 10px">
      ${tabs.map(([k, label]) => `<button type="button" class="chip2 ${tab === k ? "on" : ""}" data-act="inst-tab" data-tab="${k}">${esc(label)}</button>`).join("")}
    </div>
    <section class="xcard">
      <div class="sec-h"><span class="tt">${esc(keyOfType)}買超前 25 名</span><span class="sp"></span><span class="meta">單位：張</span></div>
      ${top.map(row).join("")}
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="tt">${esc(keyOfType)}賣超前 15 名</span></div>
      ${bot.map((x, i) => row(x, i)).join("")}
    </section>
    <p class="muted small" style="text-align:center">盤後統計，資料由 TWSE 公開資訊排程抓取。</p>`;
}

/* ── 當沖排行 ── */
export function viewDaytrade() {
  const d = daytrade();
  if (!d || !d.list) return `${head("當沖排行")}${emptyCard("當沖排行", "市場資料尚未更新")}`;
  const total = d.total?.shares;
  const totalText = total == null ? "—" : (total > 1e10 ? yi(total) : zhang(total));
  const rows = d.list.slice().filter((x) => canCode(x.code)).sort((a, b) => (b.shares || 0) - (a.shares || 0));
  return `${head()}
    <section class="xcard">
      <div class="sec-h"><span class="tt">全市場當沖成交量</span><span class="sp"></span><span class="meta">${esc(d.date || "")}</span></div>
      <div class="num" style="font-size:22px;font-weight:800;color:var(--gold2)">${totalText}</div>
      <div class="small muted" style="margin-top:4px">當日現股沖銷合計，盤後統計。</div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="tt">當沖熱門（前 ${rows.length} 檔）</span><span class="sp"></span><span class="meta">量＝張</span></div>
      ${rows.map((x, i) => {
        const k = keyOf("台股", clean(x.code));
        const nm = nameOf(x.code, x.name);
        return `<a class="rrow" style="grid-template-columns:22px 34px minmax(0,1fr) auto 64px" href="#/stock/${encodeURIComponent(k)}">
          <span class="rk ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}" style="width:20px;height:20px;font-size:11px">${i + 1}</span>
          <span class="logo">${stockLogo(k, nm, clean(x.code), "logo")}</span>
          <span class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(clean(x.code))}${/A$/.test(clean(x.code)) ? `<span class="mini-chip">ETF</span>` : ""}</div></span>
          <span class="rpx"><div class="p">${zhang(x.shares)}</div></div>
          <span class="rside">${sparkLine(k, 64, 22)}</span>
        </a>`;
      }).join("")}
    </section>
    <p class="muted small" style="text-align:center">當沖量＝當日現股沖銷成交量，盤後統計。</p>`;
}

/* ── 選股 ── */
export function viewScan() {
  const sort = S.scanSort || "chg";
  const tabs = [["chg", "漲幅"], ["drop", "跌幅"], ["price", "價格"]];
  const rows = uni().filter((x) => x.market !== "指數" && canKey(x.key)).map((x) => ({ x, q: S.quotes[x.key] }));
  const sorted = rows.slice().sort((a, b) => {
    if (sort === "price") return (b.q.price || 0) - (a.q.price || 0);
    if (sort === "drop") return (a.q.change || 0) - (b.q.change || 0);
    return (b.q.change || 0) - (a.q.change || 0);
  }).slice(0, 30);
  return `${head()}
    <div class="chiprow" style="margin:0 0 10px">
      ${tabs.map(([k, label]) => `<button type="button" class="chip2 ${sort === k ? "on" : ""}" data-act="scan-sort" data-sort="${k}">${esc(label)}</button>`).join("")}
    </div>
    <section class="xcard">
      ${sorted.map(({ x, q }, i) => {
        const k = x.key, nm = x.name;
        return `<a class="rrow" style="grid-template-columns:22px 34px minmax(0,1fr) auto 64px" href="#/stock/${encodeURIComponent(k)}">
          <span class="rk ${i === 0 ? "g1" : i === 1 ? "g2" : i === 2 ? "g3" : "gx"}" style="width:20px;height:20px;font-size:11px">${i + 1}</span>
          <span class="logo">${stockLogo(k, nm, x.symbol, "logo-in")}</span>
          <span class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(x.symbol)}${x.industry ? `<span class="mini-chip">${esc(x.industry)}</span>` : ""}</div></span>
          <span class="rpx"><div class="p">${fmt(q.price, 2)}</div><div class="d ${tone(q.change)}">${q.change != null ? pct(q.change) : "—"}</div></span>
          <span class="rside">${sparkLine(k, 64, 22)}</span>
        </a>`;
      }).join("") || `<p class="small muted">目前無報價資料。</p>`}
    </section>
    <p class="muted small" style="text-align:center">全市場報價，僅列出已有日 K 的標的（可點進去看線圖）。</p>`;
}

/* ── 大盤 ── */
/* ── 指數總覽（對齊參考 App：主指數大圖 + 分類 chip + 清單帶走勢） ── */
const IDX_GROUP = [
  ["all", "重要指數"],
  ["tech", "電子"],
  ["fin", "金融"],
  ["mat", "原物料"],
  ["other", "其他"],
];
const idxGroupOf = (name) => {
  const n = String(name || "");
  if (/電子|半導體/.test(n)) return "tech";
  if (/金融/.test(n)) return "fin";
  if (/化學|水泥|鋼鐵|塑膠|紡織|食品|橡膠|汽車|電機|電器/.test(n)) return "mat";
  return "other";
};
const idxShort = (name) => String(name || "").replace("發行量加權股價指數", "加權指數").replace("類指數", "").replace("指數", "").trim() || "指數";
/* 清單用全名，對齊參考 App：加權指數／櫃買指數／半導體類／金融保險類 */
const idxName = (i) => {
  const full = String(i?.name || "").replace("發行量加權股價指數", "加權指數");
  if (/類指數$/.test(full)) return full.replace(/類指數$/, "類");
  return full || "指數";
};
const idxLabel = (code) => {
  const c = String(code || "").slice(0, 3);
  if (c === "o00") return "現貨";
  return "現貨";
};

registerAction("idx-cat", (el) => {
  S.idxCat = el.dataset.cat;
  save();
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});

/* 以收盤價序列畫迷你走勢 */
function sparkArr(arr, w = 340, h = 96) {
  if (!arr || arr.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"></svg>`;
  const cs = arr.slice(-110);
  const min = Math.min(...cs), max = Math.max(...cs), rng = (max - min) || 1;
  const pts = cs.map((c, i) => `${((i / (cs.length - 1)) * (w - 2) + 1).toFixed(1)},${(h - 2 - ((c - min) / rng) * (h - 4)).toFixed(1)}`).join(" ");
  const up = cs[cs.length - 1] >= cs[0];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

export function viewIndex() {
  const list = indices();
  const b = breadth();
  const ind = industryFlow();
  const dateTxt = S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : "";
  const cat = S.idxCat || "all";
  const hero = list.find((i) => i.code === "t00") || list[0];
  /* 「重要指數」只放參考 App 的那 6 項：台指期盤後／台指期／加權／櫃買／半導體／金融保險 */
  const CORE_IDX = ["t00", "o00", "t24", "t17"];
  const rows = list.filter((i) => (cat === "all" ? CORE_IDX.includes(String(i.code || "").slice(0, 3)) : idxGroupOf(i.name) === cat));
  const px = (v) => (v == null ? "—" : fmt(v, v >= 1000 ? 0 : 2));

  /* 台指期（日盤／夜盤），排在「重要指數」清單最前面，對齊參考 App */
  const fut = S.market?.futures || null;
  const futRows = [];
  if (fut?.afterHours) futRows.push({ nm: "台指期盤後", sub: "夜盤", icon: "🌙", price: fut.afterHours.price, change: fut.afterHours.change, pct: fut.afterHours.pct, vol: fut.afterHours.vol });
  if (fut?.regular) futRows.push({ nm: "台指期", sub: "期貨", icon: "☀️", price: fut.regular.price, change: fut.regular.change, pct: fut.regular.pct, vol: fut.regular.vol });
  const futHtml = (cat === "all" ? futRows : []).map((f, idx) => `<a class="rrow idx-row" href="#/indexv/${idx === 0 ? "fut-ah" : "fut-reg"}">
      <div class="rmid"><div class="nm">${esc(f.nm)} <span style="font-size:12px">${f.icon}</span></div><div class="sub">${esc(f.sub)}</div></div>
      <div class="rpx"><div class="p ${tone(f.pct)}" style="font-size:16px">${px(f.price)}</div><div class="d ${tone(f.pct)}">${f.change != null ? (f.change > 0 ? "+" : "") + fmt(f.change, 0) : "—"}${f.pct != null ? " · " + pct(f.pct) : ""}</div></div>
      <div class="isp"><span class="small muted" style="display:block;text-align:right;line-height:1.3">成交<br>${f.vol ? fmt(f.vol, 0) + " 口" : "—"}</span></div>
      <span class="go">›</span>
    </a>`).join("");
  const totalRows = futHtml ? futRows.length + rows.length : rows.length;

  /* hero：有台指期盤後就用它（對齊參考 App），否則用加權 */
  const heroF = fut?.afterHours || fut?.regular || null;
  const heroHtml = heroF ? `<div class="idx-hero">
      <div class="ih-top"><div><div class="ih-nm">${esc(fut?.afterHours ? "台指期盤後" : "台指期")} <span style="font-size:12px">${fut?.afterHours ? "🌙" : "☀️"}</span></div><div class="ih-sub">${esc(fut?.afterHours ? "夜盤" : "期貨")} · ${esc(String(heroF.contract || ""))}</div></div><span class="mini-chip ${(heroF.pct || 0) >= 0 ? "up" : "down"}">${heroF.pct != null ? pct(heroF.pct) : "—"}</span></div>
      <div class="ih-px ${tone(heroF.pct)}">${px(heroF.price)}</div>
      <div class="ih-dl"><span class="${tone(heroF.change)}">${heroF.change != null ? (heroF.change > 0 ? "+" : "") + fmt(heroF.change, 0) : "—"}</span><em>｜</em><b class="${tone(heroF.pct)}">${heroF.pct != null ? pct(heroF.pct) : "—"}</b></div>
      <div class="ih-chart">${sparkArr(heroF.chart, 340, 96)}</div>
      <div class="ih-meta"><span>前收 ${heroF.ref ? fmt(heroF.ref, 2) : "—"}</span><span>成交量 ${heroF.vol ? fmt(heroF.vol, 0) + " 口" : "—"}</span><span>${esc(dateTxt)}</span></div>
    </div>` : (hero ? `<div class="idx-hero">
      <div class="ih-top"><div><div class="ih-nm">${esc(idxShort(hero.name))}</div><div class="ih-sub">現貨 · ${esc(dateTxt)}</div></div><span class="mini-chip ${(hero.changePct || 0) >= 0 ? "up" : "down"}">${hero.changePct != null ? pct(hero.changePct) : "—"}</span></div>
      <div class="ih-px ${tone(hero.changePct)}">${px(hero.price)}</div>
      <div class="ih-dl"><span class="${tone(hero.change)}">${hero.change != null ? (hero.change > 0 ? "+" : "") + fmt(hero.change, 0) : "—"}</span><em>｜</em><b class="${tone(hero.changePct)}">${hero.changePct != null ? pct(hero.changePct) : "—"}</b></div>
      <div class="ih-chart">${sparkLine(keyOf("指數", "^TWII"), 340, 96)}</div>
      <div class="ih-meta"><span>前收 ${hero.prev ? fmt(hero.prev, 2) : "—"}</span><span>日期 ${esc(dateTxt)}</span><span>${esc(String(hero.time || "").slice(-8))}</span></div>
    </div>` : `<p class="small muted">指數資料更新中</p>`);

  const cats = IDX_GROUP.map(([k, label]) => {
    const n = k === "all" ? rows.filter((i) => CORE_IDX.includes(String(i.code || "").slice(0, 3))).length + futRows.length : list.filter((i) => idxGroupOf(i.name) === k).length;
    if (k !== "all" && !n) return "";
    return `<button class="ana-tab${cat === k ? " on" : ""}" data-act="idx-cat" data-cat="${k}">${label}${n ? `<sup>${n}</sup>` : ""}</button>`;
  }).join("");

  const listRows = rows.map((i) => {
    const code = String(i.code || "").slice(0, 3);
    const hist = S.idxHist?.[code];
    const canOpen = code === "t00" ? true : !!(hist && hist.length > 1);
    const tag = canOpen ? "a" : "div";
    const href = canOpen ? ` href="#/indexv/${encodeURIComponent(code)}"` : "";
    return `<${tag} class="rrow idx-row${canOpen ? "" : " static"}"${href}>
      <div class="rmid"><div class="nm">${esc(idxName(i))}</div><div class="sub">${esc(idxLabel(i.code))}${canOpen ? "" : " · 歷史序列建置中"}</div></div>
      <div class="rpx"><div class="p ${tone(i.changePct)}" style="font-size:16px">${px(i.price)}</div><div class="d ${tone(i.changePct)}">${i.changePct != null ? pct(i.changePct) : "—"}</div></div>
      <div class="isp">${i.code === "t00" ? sparkLine(keyOf("指數", "^TWII"), 76, 24) : `<span class="small muted" style="display:block;text-align:right;line-height:1.3">前收<br>${i.prev ? fmt(i.prev, 2) : "—"}</span>`}</div>
      <span class="go">${canOpen ? "›" : ""}</span>
    </${tag}>`;
  }).join("");

  return `<section class="xcard">
      <div class="sec-h"><span class="ico">🧭</span><span class="tt">市場指數</span><span class="sp"></span><span class="meta">${esc(dateTxt)}</span></div>
      ${heroHtml}
    </section>
    <div class="ana-tabs" style="margin-top:-4px">${cats}</div>
    <section class="xcard">
      <div class="sec-h"><span class="ico">📋</span><span class="tt">${esc((IDX_GROUP.find((g) => g[0] === cat) || [0, "重要指數"])[1])}</span><span class="sp"></span><span class="badge none">${totalRows} 檔</span></div>
      ${futHtml}${listRows || (futHtml ? "" : `<p class="small muted">此分類目前無資料</p>`)}
    </section>
    ${b ? `<section class="xcard"><div class="sec-h"><span class="ico">📊</span><span class="tt">市場寬度</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      <div class="triple"><div><div class="k">上漲</div><div class="v up">${b.rise}</div></div><div><div class="k">平盤</div><div class="v">${b.flat}</div></div><div><div class="k">下跌</div><div class="v down">${b.fall}</div></div></div>
      <div class="barline split"><i style="width:${Math.round(b.rise / Math.max(1, b.rise + b.flat + b.fall) * 100)}%;background:var(--up)"></i><i style="width:${100 - Math.round(b.rise / Math.max(1, b.rise + b.flat + b.fall) * 100)}%;background:var(--down)"></i></div>
      <p class="small muted" style="margin-top:8px">成交金額 ${yi(b.amount)}</p></section>` : ""}
    <section class="xcard"><a class="more-link" href="#/analysis">看完整行情與技術分析 ›</a></section>`;
}

/* ── 智投（研究工具箱入口） ── */
export function viewTools() {
  const g = greedIndex();
  const b = breadth();
  const idx = indices()[0];
  const hot = (b && b.rise + b.fall) ? Math.round(b.rise / (b.rise + b.fall) * 100) : null;
  const tools = [
    { ico: "🧮", name: "條件篩選器", sub: "法人偏多 + 技術轉強", href: "#/scan", tag: "研究" },
    { ico: "🎚", name: "估值情境器", sub: "保守／中性／樂觀三檔", href: "#/valuation", tag: "研究" },
    { ico: "🔔", name: "智慧警報", sub: "價格與漲跌幅通知", href: "#/profile?f=alerts", tag: "通知" },
    { ico: "⚖", name: "多股比較", sub: "同產業橫向對照", href: "#/analysis", tag: "Plus" },
  ];
  return `<section class="xcard">
      <div class="sec-h"><span class="ico">🎯</span><span class="tt">選擇今天的研究任務</span><span class="sp"></span><span class="meta">Free 方案</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        ${tools.map((t) => `<a href="${t.href}" style="text-decoration:none;color:inherit;background:var(--card2);border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:13px 13px;display:block">
          <div style="font-size:19px">${t.ico}</div>
          <div style="font-weight:800;font-size:14px;margin-top:8px">${esc(t.name)}</div>
          <div class="small muted" style="margin-top:3px;line-height:1.4">${esc(t.sub)}</div>
          <div class="small" style="margin-top:8px;color:var(--gold2)">${esc(t.tag)}</div>
        </a>`).join("")}
      </div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">📈</span><span class="tt">今日盤勢</span><span class="sp"></span><span class="meta">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span></div>
      <div class="stat4" style="border-top:0;padding-top:0">
        <div><div class="k">加權指數</div><div class="v ${idx ? tone(idx.changePct) : ""}" style="font-size:17px">${idx ? fmt(idx.price, 2) : "—"}</div></div>
        <div><div class="k">漲跌</div><div class="v ${idx ? tone(idx.changePct) : ""}" style="font-size:17px">${idx && idx.changePct != null ? pct(idx.changePct) : "—"}</div></div>
        <div><div class="k">上漲占比</div><div class="v" style="font-size:17px">${hot != null ? hot + "%" : "—"}</div></div>
        <div><div class="k">市場情緒</div><div class="v" style="font-size:17px">${g ? g.score : "—"}</div></div>
      </div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">🔗</span><span class="tt">更多</span></div>
      ${[["市場雷達", "#/radar"], ["外資買超", "#/inst"], ["當沖排行", "#/daytrade"], ["市場熱力圖", "#/heat"], ["交易成本試算", "#/calc"]].map(([n, h]) => `<a class="rrow" style="grid-template-columns:minmax(0,1fr) auto" href="${h}"><div class="rmid"><div class="nm">${esc(n)}</div></div><div class="rpx"><span class="muted">›</span></div></a>`).join("")}
    </section>`;
}

/* ── 估值情境器 ── */
export function viewValuation() {
  const list = uni().filter((u) => u.market !== "指數" && S.quotes[u.key]);
  const key = S.valKey && list.some((u) => u.key === S.valKey) ? S.valKey : list[0] && list[0].key;
  const u = list.find((x) => x.key === key);
  const cs = (S.file?.candles?.[key] || []).map((r) => (Array.isArray(r) ? { c: r[4] } : r)).map((x) => x.c).filter(Number.isFinite);
  if (!u) return `${emptyCard("估值情境器", "尚無可用報價。")}`;
  const q = S.quotes[key] || {};
  const tail = cs.slice(-60);
  const mean = tail.length ? tail.reduce((a, c) => a + c, 0) / tail.length : q.price;
  const sd = tail.length > 2 ? Math.sqrt(tail.reduce((a, c) => a + (c - mean) ** 2, 0) / tail.length) : 0;
  const pctOf = (p) => (mean ? (p - mean) / mean * 100 : 0);
  const rows = [
    ["保守（−1σ）", mean - sd, "回測 60 日均價下方一個標準差"],
    ["中性（均價）", mean, "近 60 日收盤均價"],
    ["樂觀（+1σ）", mean + sd, "回測 60 日均價上方一個標準差"],
  ];
  return `<section class="xcard">
      <div class="sec-h"><span class="ico">🎚</span><span class="tt">估值情境器</span><span class="sp"></span><span class="meta">${esc(u.name)} ${esc(u.symbol)}</span></div>
      <div class="chiprow" style="margin:0 0 10px;max-height:78px;overflow:auto">
        ${list.slice(0, 12).map((x) => `<button type="button" class="chip2 ${x.key === key ? "on" : ""}" data-act="val-pick" data-key="${esc(x.key)}">${esc(x.name)}</button>`).join("")}
      </div>
      <div class="row" style="margin-bottom:6px"><span class="small muted">現價</span><span class="num small">${q.price != null ? fmt(q.price, 2) : "—"}</span></div>
      ${rows.map(([l, v, d]) => `<div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">${esc(l)}</div><div class="sub">${esc(d)}</div></div><div class="rpx"><div class="p" style="font-size:15px">${fmt(v, 2)}</div><div class="d ${tone(pctOf(v))}" style="font-size:11.5px">${pctOf(v) >= 0 ? "+" : ""}${pctOf(v).toFixed(2)}%</div></div></div>`).join("")}
      <p class="small muted" style="margin-top:12px;line-height:1.7">情境價位以近 60 日收盤統計推估，非預測、非投資建議；未含基本面 EPS 與同業本益比。</p>
    </section>`;
}

/* ── 計算工具（原工具箱） ── */
export function viewCalc() {
  const fx = fxRate();
  return `<section class="xcard">
      <div class="sec-h"><span class="ico">🧾</span><span class="tt">台股交易成本試算</span></div>
      <div class="row" style="gap:8px">
        <input id="t-price" type="number" inputmode="decimal" placeholder="成交價（元）">
        <input id="t-lots" type="number" inputmode="decimal" placeholder="張數">
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button type="button" class="goldbtn" style="width:auto;padding:0 18px;height:38px" data-act="calc-fee">計算</button>
      </div>
      <div id="t-out" class="small muted" style="margin-top:10px">手續費以 6 折計算（0.1425% × 0.6），賣出另加證交稅 0.3%。</div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">💱</span><span class="tt">匯率換算（美元 ⇄ 新台幣）</span></div>
      <div class="row" style="gap:8px"><input id="t-usd" type="number" inputmode="decimal" placeholder="美元金額"></div>
      <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="ghostbtn" style="width:auto;padding:0 16px;height:36px" data-act="calc-fx">換算</button></div>
      <div id="t-fxout" class="small muted" style="margin-top:10px">目前匯率：1 美元 ≈ ${fx ? fx.toFixed(2) : "—"} 新台幣</div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">📊</span><span class="tt">報酬率試算</span></div>
      <div class="row" style="gap:8px">
        <input id="t-cost" type="number" inputmode="decimal" placeholder="投入成本">
        <input id="t-now" type="number" inputmode="decimal" placeholder="目前市值">
      </div>
      <div class="row" style="gap:8px;margin-top:8px"><button type="button" class="ghostbtn" style="width:auto;padding:0 16px;height:36px" data-act="calc-ror">計算</button></div>
      <div id="t-rorout" class="small muted" style="margin-top:10px">報酬率＝（目前市值 − 成本）／成本。</div>
    </section>`;
}

/* ── actions ── */
registerAction("calc-fee", () => {
  const p = parseFloat(($("#t-price") || {}).value || "0");
  const lots = parseFloat(($("#t-lots") || {}).value || "0");
  const out = $("#t-out");
  if (!out) return;
  if (!p || !lots) { out.innerHTML = "請輸入成交價與張數。"; return; }
  const gross = p * lots * 1000;
  const fee = (g) => Math.max(20, Math.round(g * 0.001425 * 0.6));
  const buyFee = fee(gross), sellFee = fee(gross), tax = Math.round(gross * 0.003);
  const total = buyFee + sellFee + tax;
  out.innerHTML = `成交金額 ${fmt(gross, 0)} 元<br>買進手續費 ${fmt(buyFee, 0)} 元<br>賣出手續費 ${fmt(sellFee, 0)} 元<br>證交稅 ${fmt(tax, 0)} 元<br><strong>一買一賣總成本 ${fmt(total, 0)} 元（約 ${(total / gross * 100).toFixed(3)}%）</strong><br>損益兩平價約 ${fmt(p * (1 + total / gross), 2)} 元`;
});
registerAction("calc-fx", () => {
  const usd = parseFloat(($("#t-usd") || {}).value || "0");
  const out = $("#t-fxout");
  if (!out) return;
  const fx = fxRate();
  if (!usd || !fx) { out.innerHTML = "請輸入美元金額。"; return; }
  out.innerHTML = `${fmt(usd, 2)} 美元 ≈ <strong>${fmt(usd * fx, 0)}</strong> 新台幣（匯率 ${fx.toFixed(2)}）`;
});
registerAction("calc-ror", () => {
  const c = parseFloat(($("#t-cost") || {}).value || "0");
  const n = parseFloat(($("#t-now") || {}).value || "0");
  const out = $("#t-rorout");
  if (!out) return;
  if (!c) { out.innerHTML = "請輸入成本與市值。"; return; }
  const d = n - c, r = d / c * 100;
  out.innerHTML = `損益 <span class="${tone(d)}">${d > 0 ? "+" : ""}${fmt(d, 0)}</span> 元，報酬率 <span class="${tone(d)}">${r > 0 ? "+" : ""}${r.toFixed(2)}%</span>`;
});
registerAction("inst-tab", (el) => { S.instTab = el.dataset.tab; save(); window.dispatchEvent(new CustomEvent("portfolios:changed")); });
registerAction("val-pick", (el) => { S.valKey = el.dataset.key; window.dispatchEvent(new CustomEvent("portfolios:changed")); });
registerAction("scan-sort", (el) => { S.scanSort = el.dataset.sort; save(); window.dispatchEvent(new CustomEvent("portfolios:changed")); });

/* ── 個股熱力圖（Treemap）：面積＝漲跌幅權重，格與格緊貼，格內透明底 icon ── */
const heatIcon = (x) => {
  const cid = S.cryptoLogos?.[String(x.symbol).toUpperCase()];
  if (cid) return `<img class="hicon" src="${cid}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  const id = S.logos?.[x.key];
  if (id) return `<img class="hicon" src="https://s3-symbol-logo.tradingview.com/${encodeURIComponent(id)}--big.svg" alt="" loading="lazy" onerror="this.style.display='none'">`;
  return `<span class="hicon-txt">${esc(String(x.name).trim().slice(0, 1))}</span>`;
};
export function viewHeat() {
  const rows = uni().filter((x) => x.market !== "指數" && canKey(x.key))
    .map((x) => ({ x, q: S.quotes[x.key] }));
  const ind = industryFlow().slice().sort((a, b) => (b.totalNet || 0) - (a.totalNet || 0));
  if (!rows.length) return `${head()}${emptyCard("市場熱力圖", "市場資料尚未更新")}`;
  rows.sort((a, b) => Math.abs(b.q.change || 0) - Math.abs(a.q.change || 0));
  const pick = rows.filter((r) => r.x.market === "台股").slice(0, 10)
    .concat(rows.filter((r) => r.x.market !== "台股").slice(0, 2));
  const wOf = (r) => Math.abs(r.q.change || 0) || 0.3;
  const pw = (r) => Math.pow(wOf(r), 0.55);
  const maxW = Math.max(...pick.map(wOf), 0.3);
  const total = pick.reduce((s, r) => s + pw(r), 0) || 1;
  const H = 320;
  const groups = [pick.slice(0, 6), pick.slice(6, 12)].filter((g) => g.length);
  const blocks = groups.map((g) => {
    const gsum = g.reduce((s, r) => s + pw(r), 0) || 1;
    const h = Math.max(116, Math.min(196, Math.round(H * gsum / total)));
    return `<div style="display:flex;gap:2px;height:${h}px">${g.map(({ x, q }) => {
      const w = wOf({ q });
      const share = (pw({ q }) / gsum) * 100;
      const inten = (0.30 + (w / maxW) * 0.52).toFixed(2);
      const up = (q.change || 0) >= 0;
      const bg = up ? `rgba(var(--up-rgb),${inten})` : `rgba(var(--down-rgb),${inten})`;
      const narrow = share < 16;
      return `<a href="#/stock/${encodeURIComponent(x.key)}" style="flex:0 0 calc(${share.toFixed(1)}% - 2px);min-width:0;background:${bg};border-radius:6px;padding:7px 8px;display:flex;flex-direction:column;gap:3px;text-decoration:none;color:#fff;overflow:hidden">
        ${heatIcon(x)}
        <div style="font-size:${narrow ? 10.5 : 11.5}px;font-weight:700;line-height:1.15;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}</div>
        ${narrow ? "" : `<div style="font-family:var(--mono);font-size:10.5px;opacity:.9">${q.price != null ? fmt(q.price, 2) : ""}</div>`}
        <div style="font-family:var(--mono);font-size:${narrow ? 10 : 11}px;font-weight:700">${q.change != null ? pct(q.change) : "—"}</div>
      </a>`;
    }).join("")}</div>`;
  }).join("");
  const rise = rows.filter((r) => (r.q.change || 0) > 0).length, fall = rows.filter((r) => (r.q.change || 0) < 0).length;
  const indRows = ind.slice(0, 8).map((x, i) => {
    const v = x.totalNet || 0;
    return `<div class="rrow" style="grid-template-columns:minmax(0,1fr) auto">
      <div class="rmid"><div class="nm">${esc(clean(x.name))}</div></div>
      <div class="rpx"><div class="p ${tone(v)}" style="font-size:13px">${(v >= 0 ? "+" : "") + zhang(v)}</div></div>
    </div>`;
  }).join("");
  return `${head()}
    <section class="xcard">
      <div class="sec-h"><span class="ico">🔥</span><span class="tt">個股熱力圖</span><span class="sp"></span><span class="meta">面積＝漲跌幅權重</span></div>
      <div style="display:flex;flex-direction:column;gap:2px;border-radius:8px;overflow:hidden">${blocks}</div>
      <div class="row" style="margin-top:12px;gap:12px;flex-wrap:wrap">
        <span class="small muted">上漲 ${rise} 檔</span><span class="small muted">下跌 ${fall} 檔</span>
        <span class="small muted">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span>
      </div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">🏭</span><span class="tt">產業資金</span><span class="sp"></span><a href="#/analysis" class="small" style="color:var(--gold2);text-decoration:none">行情頁 ›</a></div>
      ${indRows || `<p class="small muted">尚無產業資料</p>`}
    </section>
    <p class="muted small" style="text-align:center">格內為全市場有日 K 的標的（可點進去）；下方產業資金為 TWSE 盤後統計。</p>`;
}