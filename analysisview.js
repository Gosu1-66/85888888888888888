// analysisview.js — 台股看盤 PWA 市場分析模組（行情頁）
// 區塊：指數全覽（含台指期盤後參考）／漲跌家數／貪婪指數／法人資金動向／產業資金／ETF 觀察／策略觀察。
// 單位：法人彙總與成交金額為「元→億」；產業資金、買超排行、當沖為「股→張」，皆為盤後統計，缺資料顯示「—」。
import {
  $, $$, esc, fmt, pct, tone, money, ageText, toast,
  openSheet, closeSheet, uid, today, badge, statusBanner,
  registerAction, parseRoute
} from "./ui.js";
import { S, save, fxRate, fxSource, quoteOf, holdings, uni } from "./state.js";
import {
  keyOf, currencyOf, MARKETS, holdingStats, portfolioStats,
  toTWD, computePosition, toHoldings
} from "./portfolio.js";
import { stockLogo, sparkLine } from "./home.js";
import { CATALOG, HOT_STOCKS, ETF_LIST, INDUSTRIES, universe } from "./catalog.js";
import { refreshQuotes, loadCandles, SOURCE_LABEL } from "./quotes.js";
import {
  refreshMarket, indices, breadth, institutions, instRank,
  industryFlow, industryEst, daytrade, margin, greedIndex, marketTone,
  hotPicks, etfMetrics, scanner, turnoverTop, STALE_MSG
} from "./marketdata.js";
import { palette, drawDonut, drawTechnical } from "./charts.js";
import { buildSeries, rsi, sma, ema, macd } from "./indicators.js";

/* ---------- 小工具 ---------- */
// 金額（元）→ 億元字串（三大法人彙總等「元」單位）
function yi(n) {
  if (n == null || isNaN(n)) return "—";
  return fmt(Math.round(n / 1e8), 0) + "億";
}
// 股數 → 張數（產業資金／買超排行／當沖等「股」單位）
function zhang(n) {
  if (n == null || isNaN(n)) return "—";
  return fmt(Math.round(n / 1000), 0) + "張";
}
// 帶漲跌色的淨額儲存格
function netSpan(n, fmtFn = yi) {
  if (n == null || isNaN(n)) return `<span class="muted">—</span>`;
  return `<span class="num ${tone(n)}">${fmtFn(n)}</span>`;
}
// 0-100 → 1-5 星
function stars(score) {
  if (score == null || isNaN(score)) return "—";
  const n = Math.max(1, Math.min(5, Math.round(score / 20)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}
// 貪婪指數環：依 score 畫紅→黃→綠弧
function gaugeStyle(score) {
  const s = Math.max(0, Math.min(100, score || 0));
  const deg = (s / 100) * 360;
  return `background: conic-gradient(from -90deg, #ef4444 0deg, #f59e0b ${Math.max(deg / 2, 1)}deg, #16a34a ${deg}deg, #e5e7eb ${deg}deg 360deg);`;
}
function gaugeTag(score) {
  if (score == null) return `<span class="tag mid">—</span>`;
  if (score < 25) return `<span class="tag bear">極度恐慌</span>`;
  if (score < 45) return `<span class="tag bear">恐慌</span>`;
  if (score < 55) return `<span class="tag mid">中性</span>`;
  if (score < 75) return `<span class="tag bull">貪婪</span>`;
  return `<span class="tag bull">極度貪婪</span>`;
}

/* ---------- 區塊：指數全覽 ---------- */
function renderIndices() {
  const list = indices() || [];
  if (!list.length) {
    return `<section class="card empty"><h2 class="h2">指數全覽</h2><p class="muted small">尚無指數資料（待 GitHub 排程更新 market.json）。</p></section>`;
  }
  const cards = list.map(idx => `
    <div class="idx-card">
      <div class="small muted">${esc(idx.name)}</div>
      <div class="num">${idx.price != null ? fmt(idx.price, 2) : "—"}</div>
      <div class="num ${tone(idx.change)}">${idx.change != null ? (idx.change > 0 ? "+" : "") + fmt(idx.change, 2) : "—"}</div>
      <div class="num ${tone(idx.changePct)}">${idx.changePct != null ? pct(idx.changePct) : "—"}</div>
    </div>`).join("");

  // 台指期盤後（未接期交所即時源，以加權指數為參考）
  const fut = S.market && S.market.futures;
  let futHtml;
  if (fut && fut.price != null) {
    futHtml = `<div class="list-item"><span>台指期（盤後參考）</span>
      <span class="num">${fmt(fut.price, 2)}</span>
      <span class="num ${tone(fut.change)}">${fut.change != null ? pct(fut.change) : "—"}</span>
      <span class="muted small">前 ${fut.prev != null ? fmt(fut.prev, 2) : "—"}</span></div>`;
  } else {
    futHtml = `<div class="list-item"><span>台指期盤後</span>
      <span class="muted small">以加權指數為參考（本工具未接期交所即時源）</span></div>`;
  }

  return `<section class="card">
    <h2 class="h2">指數全覽</h2>
    <div class="index-cards">${cards}</div>
    <div class="list" style="margin-top:10px">${futHtml}</div>
  </section>`;
}

/* ---------- 區塊：漲跌家數 ---------- */
function renderBreadth() {
  const b = breadth();
  if (!b) return "";
  return `<section class="card">
    <h2 class="h2">漲跌家數 <span class="muted small">（上市）</span></h2>
    <div class="kpi-grid">
      <div class="stat"><div class="small muted">上漲</div><div class="num up">${b.rise != null ? fmt(b.rise, 0) : "—"}</div></div>
      <div class="stat"><div class="small muted">下跌</div><div class="num down">${b.fall != null ? fmt(b.fall, 0) : "—"}</div></div>
      <div class="stat"><div class="small muted">平盤</div><div class="num">${b.flat != null ? fmt(b.flat, 0) : "—"}</div></div>
      <div class="stat"><div class="small muted">成交金額</div><div class="num">${b.amount != null ? yi(b.amount) : "—"}</div></div>
    </div>
    <div class="small muted" style="margin-top:6px">全體（含上櫃）：上漲 ${b.riseAll ?? "—"}／下跌 ${b.fallAll ?? "—"}／平盤 ${b.flatAll ?? "—"}</div>
  </section>`;
}

/* ---------- 區塊：貪婪指數 ---------- */
function renderGreed() {
  const g = greedIndex();
  if (!g) return "";
  const parts = (g.parts || []).map(p =>
    `<div class="list-item"><span class="small">${esc(p.label || "")}</span><span class="small muted">${esc(p.text || "")}</span></div>`
  ).join("");
  return `<section class="card">
    <h2 class="h2">市場情緒（恐懼貪婪指數）</h2>
    <div class="row" style="align-items:center;gap:18px">
      <div class="gauge-ring" style="${gaugeStyle(g.score)}">
        <div class="gauge-num"><div class="num">${g.score != null ? fmt(g.score, 0) : "—"}</div></div>
      </div>
      <div>
        <div style="font-size:20px;font-weight:700">${esc(g.label || "")} ${gaugeTag(g.score)}</div>
        <div class="small muted" style="margin-top:4px">規則式估算，僅供參考</div>
      </div>
    </div>
    ${parts ? `<div class="list" style="margin-top:10px">${parts}</div>` : ""}
  </section>`;
}

/* ---------- 區塊：法人資金動向（單位：元 → 億） ---------- */
function instLine(label, d) {
  const net = d ? d.net : null;
  return `<div class="list-item">
    <span>${esc(label)}</span>
    <span class="small muted">買 ${d && d.buy != null ? yi(d.buy) : "—"}</span>
    <span class="small muted">賣 ${d && d.sell != null ? yi(d.sell) : "—"}</span>
    ${netSpan(net)}
  </div>`;
}
function renderInstitutions() {
  const inst = institutions();
  if (!inst) return "";
  const days = (inst.days || []).slice(-5).map(d => `
    <tr>
      <td class="small muted">${esc(d.date)}</td>
      <td class="num ${tone(d.totalNet)}">${yi(d.totalNet)}</td>
      <td class="num ${tone(d.foreignNet)}">${yi(d.foreignNet)}</td>
    </tr>`).join("");
  return `<details class="card" open>
    <summary class="h2">法人資金動向 ${inst.date ? `<span class="muted small">（${esc(inst.date)} 盤後）</span>` : ""}</summary>
    <div class="list">
      ${instLine("合計", inst.total)}
      ${instLine("外資", inst.foreign)}
      ${instLine("投信", inst.trust)}
      ${instLine("自營", inst.dealer)}
    </div>
    <div class="sub" style="margin-top:10px">近 5 日（億元）</div>
    <table class="mini-tbl">
      <thead><tr><th>日期</th><th>合計買超</th><th>外資買超</th></tr></thead>
      <tbody>${days || `<tr><td colspan="3" class="muted small">尚無資料</td></tr>`}</tbody>
    </table>
    <div class="row right" style="margin-top:10px">
      <button type="button" class="btn" data-act="inst-ranks">買超排行</button>
    </div>
  </details>`;
}

/* ---------- 區塊：法人產業資金（單位：股 → 張） ---------- */
function renderIndustry() {
  const flow = industryFlow() || [];
  const est = industryEst() || {};
  const flowRows = flow.map(r => `
    <tr>
      <td>${esc(r.name)}</td>
      <td class="num ${tone(r.foreignNet)}">${zhang(r.foreignNet)}</td>
      <td class="num ${tone(r.trustNet)}">${zhang(r.trustNet)}</td>
      <td class="num ${tone(r.dealerNet)}">${zhang(r.dealerNet)}</td>
      <td class="num ${tone(r.totalNet)}"><strong>${zhang(r.totalNet)}</strong></td>
    </tr>`).join("");
  const estRows = Object.entries(est).map(([k, v]) => `
    <tr>
      <td>${esc(k)} <span class="tag mid">估算</span></td>
      <td colspan="3" class="small muted">熱門成分股 ${v.stocks != null ? fmt(v.stocks, 0) : "—"} 檔</td>
      <td class="num ${tone(v.totalNet)}"><strong>${zhang(v.totalNet)}</strong></td>
    </tr>`).join("");
  return `<details class="card" open>
    <summary class="h2">法人產業資金</summary>
    <table class="mini-tbl">
      <thead><tr><th>產業</th><th>外資</th><th>投信</th><th>自營</th><th>合計</th></tr></thead>
      <tbody>${flowRows}${estRows || ""}</tbody>
    </table>
    <div class="small muted" style="margin-top:6px">單位：張（股數）；半導體／通信網路為熱門成分股估算（TWSE 通訊類日報常無資料）。</div>
  </details>`;
}

/* ---------- 區塊：ETF 列表 ---------- */
function renderEtfs() {
  if (!ETF_LIST || !ETF_LIST.length) {
    return `<details class="card"><summary class="h2">ETF 觀察</summary><p class="muted small">尚無 ETF 清單。</p></details>`;
  }
  const rows = ETF_LIST.map(etf => {
    const key = keyOf("台股", etf.symbol);
    const q = S.quotes ? S.quotes[key] : null;
    const price = q ? q.price : null;
    const chg = q ? q.change : null;
    return `<div class="list-item" style="flex-wrap:wrap">
      <a href="#/search?s=${encodeURIComponent(key)}" style="flex:1;min-width:180px;text-decoration:none;color:inherit">
        <strong>${esc(etf.symbol)}</strong> <span class="muted small">${esc(etf.name)}</span>
      </a>
      <span class="num">${price != null ? fmt(price, 2) : "—"}</span>
      <span class="num ${chg == null ? "" : tone(chg)}">${chg != null ? pct(chg) : "—"}</span>
      <span>${q ? badge(q) : `<span class="badge none">無報價</span>`}</span>
    </div>
    <div class="etf-metrics-slot" data-sym="${esc(etf.symbol)}" style="padding:4px 12px 10px 12px">
      <span class="small muted">報酬／風險計算中…</span>
    </div>`;
  }).join("");
  return `<details class="card" open>
    <summary class="h2">ETF 觀察</summary>
    <div class="list">${rows}</div>
    <div class="small muted" style="margin-top:6px">規模／人氣：無公開即時規模（TDCC 受益人數來源不可用），改以成交量推估人氣。點列進入個股詳情。</div>
  </details>`;
}

/* ---------- 區塊：策略卡 ---------- */
function renderStrategy() {
  // 籌碼集中：外資買超前 5
  const ir = instRank() || { foreign: [], trust: [], dealer: [] };
  const chip = (ir.foreign || []).slice(0, 5).map(x => `
    <div class="list-item">
      <span>${esc(x.code)} <span class="muted small">${esc(x.name)}</span></span>
      <span class="num up">法人加碼 ${zhang(x.net)}</span>
    </div>`).join("") || `<div class="muted small empty">尚無資料</div>`;

  // 注意股熱度：當沖前 5
  const dt = daytrade() || { list: [] };
  const hot = (dt.list || []).slice(0, 5).map(x => `
    <div class="list-item">
      <span>${esc(x.code)} <span class="muted small">${esc(x.name)}</span></span>
      <span class="num">當沖 ${zhang(x.shares)}</span>
    </div>`).join("") || `<div class="muted small empty">尚無資料</div>`;

  // 高資產週轉：以台股標的日 K 成交量推估（估算）
  const turnover = (turnoverTop(5) || []).map(x => `
    <div class="list-item">
      <a href="#/search?s=${encodeURIComponent(x.key)}" style="text-decoration:none;color:inherit;flex:1;min-width:0">
        <span>${esc(x.name)} <span class="muted small">${esc(x.symbol)}</span></span>
      </a>
      <span class="num">量 ${fmt(Math.round(x.vol / 1000), 0)} 張</span>
    </div>`).join("") || `<div class="muted small empty">尚無成交量資料</div>`;

  // 技術面掃描器
  const sc = scanner() || [];
  const scRows = sc.map(x => `
    <a class="list-item" href="#/search?s=${encodeURIComponent(x.key)}" style="text-decoration:none;color:inherit">
      <span>${esc(x.name)} <span class="muted small">${esc(x.key)}</span></span>
      <span class="tag ${x.signal === "bull" ? "bull" : x.signal === "bear" ? "bear" : "mid"}">${x.signal === "bull" ? "多方" : x.signal === "bear" ? "空方" : "觀望"}</span>
      <span class="num ${tone(x.pct)}">${x.pct != null ? pct(x.pct) : "—"}</span>
      <span class="small muted">${esc(x.reason || "")}</span>
    </a>`).join("") || `<div class="muted small empty">尚無掃描結果（需 K 線檔案）</div>`;

  return `<section class="card">
    <h2 class="h2">策略觀察</h2>
    <div class="grid g3">
      <div>
        <div class="sub">籌碼集中（外資加碼前 5）</div>
        <div class="list">${chip}</div>
      </div>
      <div>
        <div class="sub">注意股熱度（當沖前 5）</div>
        <div class="list">${hot}</div>
      </div>
      <div>
        <div class="sub">高資產週轉（成交量前 5，估算）</div>
        <div class="list">${turnover}</div>
      </div>
    </div>
    <div class="sub" style="margin-top:12px">技術面選股掃描器</div>
    <div class="list">${scRows}</div>
  </section>`;
}

/* ---------- 主 view ---------- */
export function viewAnalysis() {
  const idxs = indices();
  const b = breadth();
  const inst = institutions();
  const ind = industryFlow().slice().sort((a, c) => (c.totalNet || 0) - (a.totalNet || 0));
  const g = greedIndex();
  const dt = daytrade();
  const mg = margin();
  const rank = instRank() || {};
  const priceOf = (code) => { const k = keyOf("台股", String(code).trim()); return S.quotes[k]?.price; };
  const amtOf = (code, net) => { const p = priceOf(code); return p && net ? net * p : null; };
  // 可點判定：報價 + 至少 60 根日 K 才做成連結，否則不列入排行（避免點進去是空白頁）
  const canKey = (key) => !!(S.quotes?.[key] && typeof S.quotes[key].price === "number") && (S.file?.candles?.[key]?.length || 0) >= 60;
  const canCode = (code) => canKey(keyOf("台股", String(code || "").trim()));
  const dateTxt = S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : "";

  const idxCards = idxs.map((i) => `<div class="fncard" style="min-width:104px">
      <div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.name.replace("發行量加權股價指數", "加權指數"))}</div>
      <div class="num" style="font-size:15px;font-weight:800;margin-top:4px">${fmt(i.price, 2)}</div>
      <div class="small ${tone(i.changePct)}">${i.changePct != null ? pct(i.changePct) : "—"}</div>
    </div>`).join("");

  const maxAbs = Math.max(...ind.map((x) => Math.abs(x.totalNet || 0)), 1);
  const flowRow = (x, sign) => {
    const v = x.totalNet || 0;
    const w = Math.min(100, Math.abs(v) / maxAbs * 100);
    return `<div class="rrow" style="grid-template-columns:minmax(0,1fr) auto">
      <div class="rmid"><div class="nm">${esc(x.name)}</div><div class="barline" style="margin-top:6px"><i style="width:${w}%;background:${sign > 0 ? "var(--up)" : "var(--down)"}"></i></div></div>
      <div class="rpx"><div class="p ${tone(v)}" style="font-size:14px">${(v >= 0 ? "+" : "") + zhang(v)}</div></div>
    </div>`;
  };
  const buy = ind.slice(0, 5), sell = ind.slice(-5).reverse();

  const topRows = (rank.foreign || []).filter((x) => canCode(x.code)).slice().sort((a, c) => c.net - a.net).slice(0, 5).map((x) => {
    const k = keyOf("台股", String(x.code).trim());
    const nm = uni().find((u) => u.key === k)?.name || String(x.name).trim();
    const amt = amtOf(x.code, x.net);
    return `<a class="rrow" style="grid-template-columns:minmax(0,1fr) auto" href="#/stock/${encodeURIComponent(k)}"><div class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(String(x.code).trim())} · 外資買超</div></div><div class="rpx"><div class="p ${tone(amt)}" style="font-size:14px">${amt ? yi(amt) : zhang(x.net)}</div></div></a>`;
  }).join("");

  const heatTop = (() => {
    const all = uni().filter((u) => u.market !== "指數" && canKey(u.key))
      .sort((a, c) => Math.abs(S.quotes[c.key].change) - Math.abs(S.quotes[a.key].change));
    const rows = all.filter((u) => u.market === "台股").slice(0, 4)
      .concat(all.filter((u) => u.market !== "台股").slice(0, 2));
    if (!rows.length) return `<p class="small muted">尚無報價資料</p>`;
    const wOf = (u) => Math.abs(S.quotes[u.key].change || 0) || 0.3;
    const gsum = rows.reduce((s, u) => s + wOf(u), 0) || 1;
    const maxW = Math.max(...rows.map(wOf), 0.3);
    const hicon = (u) => {
      const cid = S.cryptoLogos?.[String(u.symbol).toUpperCase()];
      if (cid) return `<img class="hicon" src="${cid}" alt="" loading="lazy" onerror="this.style.display='none'">`;
      const id = S.logos?.[u.key];
      if (id) return `<img class="hicon" src="https://s3-symbol-logo.tradingview.com/${encodeURIComponent(id)}--big.svg" alt="" loading="lazy" onerror="this.style.display='none'">`;
      return `<span class="hicon-txt">${esc(String(u.name).trim().slice(0, 1))}</span>`;
    };
    return `<div style="display:flex;gap:2px;height:104px;border-radius:8px;overflow:hidden">${rows.map((u) => {
      const q = S.quotes[u.key], w = wOf(u);
      const inten = (0.30 + (w / maxW) * 0.52).toFixed(2);
      const up = (q.change || 0) >= 0;
      const bg = up ? `rgba(var(--up-rgb),${inten})` : `rgba(var(--down-rgb),${inten})`;
      return `<a href="#/stock/${encodeURIComponent(u.key)}" style="flex:0 0 calc(${((w / gsum) * 100).toFixed(1)}% - 2px);min-width:0;background:${bg};padding:7px;display:flex;flex-direction:column;gap:3px;text-decoration:none;color:#fff;overflow:hidden">
        ${hicon(u)}
        <div style="font-size:11px;font-weight:700;line-height:1.15;margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.name)}</div>
        <div style="font-family:var(--mono);font-size:10.5px;opacity:.95">${q.change != null ? pct(q.change) : "—"}</div>
      </a>`;
    }).join("")}</div>`;
  })();

  const gParts = g ? g.parts.map((p) => `<div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">${esc(p.label)}</div></div><div class="rpx"><span class="small">${esc(p.text)}</span></div></div>`).join("") : "";

  /* ── 分頁（對齊參考 App：總覽／ETF／排行／籌碼／策略／風險） ── */
  const TABS = ["總覽", "ETF", "排行", "籌碼", "策略", "風險"];
  const tab = TABS.includes(S.anaTab) ? S.anaTab : "總覽";
  const tabsHtml = `<div class="ana-tabs">${TABS.map((t) => `<button type="button" class="ana-tab${t === tab ? " on" : ""}" data-act="ana-tab" data-tab="${t}">${t}</button>`).join("")}</div>`;

  const risePct = b && b.rise + b.fall > 0 ? Math.round((b.rise / (b.rise + b.fall)) * 100) : 0;
  const instNet = inst?.total?.net ?? null;
  const fNet = inst?.foreign?.net ?? null, tNet = inst?.trust?.net ?? null, dNet = inst?.dealer?.net ?? null;
  const maxInst = Math.max(Math.abs(fNet || 0), Math.abs(tNet || 0), Math.abs(dNet || 0), 1);
  const instCol = (label, v) => `<div class="icol">
      <div class="k">${label}</div>
      <div class="v ${v == null ? "" : tone(v)}">${v == null ? "—" : yi(v)}</div>
      <div class="barline"><i style="width:${Math.min(100, Math.abs(v || 0) / maxInst * 100)}%;background:${(v || 0) >= 0 ? "var(--up)" : "var(--down)"}"></i></div>
    </div>`;

  /* 指數大卡（橫向滑動，第一張帶走勢） */
  const idxBig = idxs.map((i, n) => {
    const nm = String(i.name).replace("發行量加權股價指數", "加權指數");
    const spark = n === 0 ? sparkLine(keyOf("指數", "^TWII"), 120, 30) : "";
    return `<a class="idx-big" href="#/indexb">
      <div class="ib-nm">${esc(nm)}</div>
      <div class="ib-px ${tone(i.changePct)}">${i.price != null ? fmt(i.price, 0) : "—"}</div>
      <div class="ib-dl"><span class="${tone(i.change)}">${i.change != null ? (i.change > 0 ? "+" : "") + fmt(i.change, 0) : "—"}</span><em>｜</em><b class="${tone(i.changePct)}">${i.changePct != null ? pct(i.changePct) : "—"}</b></div>
      <div class="ib-sp">${spark}</div>
    </a>`;
  }).join("");

  const breadthCard = b ? `<section class="xcard half">
      <div class="sec-h"><span class="ico">📊</span><span class="tt">漲跌家數</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      <div class="triple">
        <div><div class="k">上漲</div><div class="v up">${b.rise}</div></div>
        <div><div class="k">平盤</div><div class="v">${b.flat}</div></div>
        <div><div class="k">下跌</div><div class="v down">${b.fall}</div></div>
      </div>
      <div class="barline split"><i style="width:${risePct}%;background:var(--up)"></i><i style="width:${100 - risePct}%;background:var(--down)"></i></div>
    </section>` : "";

  const greedCard = g ? `<section class="xcard half">
      <div class="sec-h"><span class="ico">🧭</span><span class="tt">貪婪指數</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      <div class="triple" style="grid-template-columns:1fr">
        <div><div class="v ${g.score < 45 ? "down" : g.score > 55 ? "up" : ""}" style="font-size:24px">${g.score}<span class="small muted" style="font-size:12px">/100</span></div><div class="k">${esc(g.label)}</div></div>
      </div>
      <div class="barline rainbow"><i style="width:${Math.max(4, g.score)}%"></i></div>
    </section>` : "";

  const instBlock = `<section class="xcard">
      <div class="sec-h"><span class="ico">🏦</span><span class="tt">法人資金動向</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      <div class="small muted">合計買賣超</div>
      <div class="bigfig ${tone(instNet)}">${instNet != null ? yi(instNet) : "—"}</div>
      <div class="chip-row">
        <span class="mini-chip ${instNet == null ? "" : instNet >= 0 ? "up" : "down"}">${instNet == null ? "—" : instNet >= 0 ? "三大法人買超" : "三大法人賣超"}</span>
        <span class="mini-chip">外資 ${fNet == null ? "—" : yi(fNet)}</span>
        <span class="mini-chip">投信 ${tNet == null ? "—" : yi(tNet)}</span>
      </div>
      <div class="icols">${instCol("外資", fNet)}${instCol("投信", tNet)}${instCol("自營商", dNet)}</div>
    </section>`;

  const indAllZero = !ind.length || ind.every((x) => !(x.totalNet || 0));
  const industryBlock = `<section class="xcard">
      <div class="sec-h"><span class="ico">🏭</span><span class="tt">法人產業資金</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      ${indAllZero ? `<p class="small muted">產業資金明細尚未更新（TWSE 個股法人資料未發布），稍後排程會自動補上。</p>` : `<div class="two-col">
        <div><div class="mini-chip up" style="margin-bottom:8px;display:inline-block">買超</div>${buy.slice(0, 3).map((x) => flowRow(x, 1)).join("") || `<p class="small muted">尚無</p>`}</div>
        <div><div class="mini-chip down" style="margin-bottom:8px;display:inline-block">賣超</div>${sell.slice(0, 3).map((x) => flowRow(x, -1)).join("") || `<p class="small muted">尚無</p>`}</div>
      </div>`}
    </section>`;

  const heatBlock = `<section class="xcard">
      <div class="sec-h"><span class="ico">🔥</span><span class="tt">市場熱力圖</span><span class="sp"></span><a href="#/heat" class="small" style="color:var(--gold2);text-decoration:none">看完整 ›</a></div>
      ${heatTop}
    </section>`;

  const marginBlock = `<section class="xcard">
      <div class="sec-h"><span class="ico">💳</span><span class="tt">信用交易況</span><span class="sp"></span><span class="date-chip">${mg?.date ? esc(String(mg.date).slice(4, 6) + "/" + String(mg.date).slice(6, 8)) : ""}</span></div>
      ${mg ? `<div class="stat4" style="border-top:0;padding-top:0">
        <div><div class="k">融資金額</div><div class="v" style="font-size:14px">${mg.marginAmt != null ? yi(mg.marginAmt) : "—"}</div></div>
        <div><div class="k">融資增減</div><div class="v ${tone(mg.marginAmtChg)}" style="font-size:14px">${mg.marginAmtChg != null ? (mg.marginAmtChg > 0 ? "+" : "") + yi(mg.marginAmtChg) : "—"}</div></div>
        <div><div class="k">融券餘額</div><div class="v" style="font-size:14px">${mg.shortLots != null ? zhang(mg.shortLots) : "—"}</div></div>
        <div><div class="k">融券增減</div><div class="v ${tone(-(mg.shortLotsChg || 0))}" style="font-size:14px">${mg.shortLotsChg != null ? (mg.shortLotsChg > 0 ? "+" : "") + zhang(mg.shortLotsChg) : "—"}</div></div>
      </div><p class="small muted" style="margin-top:8px">融資增加代表散戶槓桿偏多；融券增加代表空方部位上升。</p>` : `<p class="small muted">資料尚未更新。</p>`}
    </section>`;

  const daytradeBlock = `<section class="xcard">
      <div class="sec-h"><span class="ico">⚡</span><span class="tt">當沖熱門</span><span class="sp"></span><a href="#/daytrade" class="small" style="color:var(--gold2);text-decoration:none">排行 ›</a></div>
      ${(dt?.list || []).filter((x) => canCode(x.code)).slice(0, 5).map((x) => {
        const k = keyOf("台股", String(x.code).trim());
        const nm = uni().find((u) => u.key === k)?.name || String(x.name).trim();
        return `<a class="rrow" style="grid-template-columns:minmax(0,1fr) auto" href="#/stock/${encodeURIComponent(k)}"><div class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(String(x.code).trim())}${/A$/.test(String(x.code).trim()) ? `<span class="mini-chip">ETF</span>` : ""}</div></div><div class="rpx"><div class="p" style="font-size:14px">${zhang(x.shares)}</div></div></a>`;
      }).join("") || `<p class="small muted">尚無資料</p>`}
    </section>`;

  /* 其他分頁內容 */
  const etfRows = ETF_LIST.filter((e) => canKey(keyOf("台股", e.symbol))).slice(0, 10).map((e) => {
    const code = e.symbol, nm = e.name, kind = e.type;
    const k = keyOf("台股", code), q = S.quotes[k];
    return `<a class="rrow side" href="#/stock/${encodeURIComponent(k)}">
      <span class="logo">${stockLogo(k, nm, code, "logo-in")}</span>
      <span class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(code)}<span class="mini-chip">${esc(kind)}</span></div></span>
      <span class="rpx"><div class="p">${q ? fmt(q.price, 2) : "—"}</div><div class="d ${q ? tone(q.change) : "muted"}">${q ? pct(q.change) : "—"}</div></span>
    </a>`;
  }).join("");

  const rankRows = (() => {
    const all = uni().filter((u) => u.market !== "指數" && canKey(u.key) && S.quotes[u.key].change != null);
    const up = all.slice().sort((a, c) => S.quotes[c.key].change - S.quotes[a.key].change).slice(0, 8);
    const dn = all.slice().sort((a, c) => S.quotes[a.key].change - S.quotes[c.key].change).slice(0, 8);
    const row = (u) => { const q = S.quotes[u.key]; return `<a class="rrow" style="grid-template-columns:minmax(0,1fr) auto" href="#/stock/${encodeURIComponent(u.key)}"><div class="rmid"><div class="nm">${esc(u.name)}</div><div class="sub">${esc(u.market)} · ${esc(u.symbol)}</div></div><div class="rpx"><div class="p ${tone(q.change)}" style="font-size:14px">${pct(q.change)}</div></div></a>`; };
    return `<section class="xcard"><div class="sec-h"><span class="ico">📈</span><span class="tt">漲幅排行</span></div>${up.map(row).join("")}</section>
      <section class="xcard"><div class="sec-h"><span class="ico">📉</span><span class="tt">跌幅排行</span></div>${dn.map(row).join("")}</section>`;
  })();

  const chipRows = (["foreign", "trust", "dealer"]).map((type) => {
    const arr = (rank[type] || []).filter((x) => canCode(x.code)).slice().sort((a, c) => c.net - a.net).slice(0, 6);
    const label = { foreign: "外資", trust: "投信", dealer: "自營商" }[type];
    return `<section class="xcard"><div class="sec-h"><span class="ico">🧾</span><span class="tt">${label}買超</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      ${arr.map((x) => {
        const k = keyOf("台股", String(x.code).trim());
        const nm = uni().find((u) => u.key === k)?.name || String(x.name).trim();
        const amt = amtOf(x.code, x.net);
        return `<a class="rrow" style="grid-template-columns:minmax(0,1fr) auto" href="#/stock/${encodeURIComponent(k)}"><div class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(String(x.code).trim())}</div></div><div class="rpx"><div class="p ${tone(amt)}" style="font-size:14px">${amt ? yi(amt) : zhang(x.net)}</div></div></a>`;
      }).join("") || `<p class="small muted">尚無資料</p>`}
    </section>`;
  }).join("");

  const strategyBlock = `<section class="xcard">
      <div class="sec-h"><span class="ico">🎯</span><span class="tt">策略選股</span><span class="sp"></span><a href="#/scan" class="small" style="color:var(--gold2);text-decoration:none">完整選股 ›</a></div>
      <p class="small muted">依技術面（均線、MACD、RSI）與籌碼條件篩選，點下方按鈕看完整清單。</p>
      <a class="btn primary" href="#/scan" style="display:inline-flex;margin-top:8px">技術面選股</a>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">📐</span><span class="tt">估值工具</span></div>
      <a class="btn" href="#/valuation" style="display:inline-flex">本益比／殖利率估算</a>
    </section>`;

  const riskBlock2 = `<section class="xcard">
      <div class="sec-h"><span class="ico">🛡</span><span class="tt">市場避險情緒</span><span class="sp"></span><span class="date-chip">${esc(dateTxt)}</span></div>
      ${g ? `<div class="score-row"><div class="ring" style="background:conic-gradient(from -90deg,#c9a259 0deg,#f0cf8e ${(g.score / 100) * 360}deg,#22252a ${(g.score / 100) * 360}deg 360deg)"><span class="n">${g.score}</span></div>
        <div class="sc-grid"><div class="c"><div class="k">評級</div><div class="v" style="font-size:13px">${esc(g.label)}</div></div>
        <div class="c"><div class="k">三大法人</div><div class="v ${inst ? tone(inst.total?.net) : ""}" style="font-size:13px">${inst ? yi(inst.total?.net) : "—"}</div></div>
        <div class="c"><div class="k">當沖量</div><div class="v" style="font-size:13px">${dt?.total?.shares ? zhang(dt.total.shares) : "—"}</div></div>
        <div class="c"><div class="k">市場情緒</div><div class="v" style="font-size:13px">${g.score}</div></div></div></div>
        ${gParts}` : `<p class="small muted">尚無資料</p>`}
    </section>
    ${marginBlock}`;

  const body = tab === "ETF" ? `<section class="xcard"><div class="sec-h"><span class="ico">🧺</span><span class="tt">ETF 觀察</span><span class="sp"></span><span class="meta">前 10 檔</span></div>${etfRows || `<p class="small muted">尚無資料</p>`}</section>`
    : tab === "排行" ? rankRows
    : tab === "籌碼" ? chipRows
    : tab === "策略" ? strategyBlock
    : tab === "風險" ? riskBlock2
    : `
  <section class="xcard" style="padding:12px 14px">
    <div class="sec-h" style="margin:0 0 8px"><span class="ico">🌐</span><span class="tt">指數全覽</span><span class="sp"></span><a href="#/indexb" class="small" style="color:var(--gold2);text-decoration:none">全部 ›</a></div>
    <div class="idx-scroll">${idxBig || '<p class="small muted">尚無資料</p>'}</div>
  </section>
  <div class="dual2">${breadthCard}${greedCard}</div>
  ${instBlock}
  ${industryBlock}
  ${heatBlock}
  ${marginBlock}
  <section class="xcard">
    <div class="sec-h"><span class="ico">💰</span><span class="tt">外資買超金額（估算）</span><span class="sp"></span><span class="meta">張數×現價</span></div>
    ${topRows || '<p class="small muted">尚無資料</p>'}
  </section>
  ${daytradeBlock}`;

  return `${tabsHtml}${body}<p class="small muted" style="text-align:center;margin:14px 0 4px">資料為 TWSE 盤後統計；金額為估算，僅供參考、非投資建議。</p>`;
}

/* 行情頁二級分頁切換 */
registerAction("ana-tab", (el) => {
  const t = el?.dataset?.tab;
  if (!t) return;
  S.anaTab = t;
  save();
  document.querySelectorAll(".ana-tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});

/* ---------- 插入後：非同步載入 ETF K 線並算報酬風險 ---------- */function renderEtfMetrics(m) {
  if (!m) return `<span class="small muted">—（無 K 線資料）</span>`;
  return `<div class="kpi-grid" style="margin:4px 0">
    <div><div class="small muted">3M</div><div class="num ${tone(m.ret3m)}">${m.ret3m != null ? pct(m.ret3m) : "—"}</div></div>
    <div><div class="small muted">6M</div><div class="num ${tone(m.ret6m)}">${m.ret6m != null ? pct(m.ret6m) : "—"}</div></div>
    <div><div class="small muted">1Y</div><div class="num ${tone(m.ret1y)}">${m.ret1y != null ? pct(m.ret1y) : "—"}</div></div>
    <div><div class="small muted">年化波動</div><div class="num">${m.vol != null ? pct(m.vol) : "—"}</div></div>
    <div><div class="small muted">最大回檔</div><div class="num down">${m.mdd != null ? pct(m.mdd) : "—"}</div></div>
    <div><div class="small muted">評分</div><div class="num">${stars(m.score)}</div></div>
  </div>`;
}

export function afterAnalysis() {
  const slots = document.querySelectorAll(".etf-metrics-slot");
  slots.forEach(slot => {
    const sym = slot.dataset.sym;
    if (!sym) return;
    loadCandles("台股", sym, S.file).then(candles => {
      if (!slot.isConnected) return;
      if (!candles || !candles.length) {
        slot.innerHTML = `<span class="small muted">—（無 K 線檔案，請等排程產生行情檔）</span>`;
        return;
      }
      const m = etfMetrics(candles);
      slot.innerHTML = renderEtfMetrics(m);
    }).catch(() => {
      if (slot.isConnected) slot.innerHTML = `<span class="small muted">—</span>`;
    });
  });
}

/* ---------- 買超排行 Sheet ---------- */
function instRanksHtml() {
  const r = instRank() || {};
  const sec = (title, arr) => {
    const a = arr || [];
    const body = a.length
      ? a.slice(0, 10).map(x => `
          <div class="list-item">
            <span class="muted small">${esc(x.code)}</span>
            <span>${esc(x.name)}</span>
            <span class="num ${tone(x.net)}">${zhang(x.net)}</span>
          </div>`).join("")
      : `<div class="muted small empty">尚無資料</div>`;
    return `<div class="sub">${esc(title)}</div><div class="list">${body}</div>`;
  };
  return `<div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong>買超排行（前 10）</strong>
      <button type="button" class="btn sm" data-act="close-sheet-btn">關閉</button>
    </div>
    ${sec("外資", r.foreign)}
    ${sec("投信", r.trust)}
    ${sec("自營", r.dealer)}
    <div class="small muted" style="margin-top:8px">單位：張（股數）；為最近交易日盤後統計。</div>`;
}

registerAction("inst-ranks", () => {
  openSheet(instRanksHtml());
});
