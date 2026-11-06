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

  const foreign = (rank.foreign || []).slice().sort((a, c) => c.net - a.net);
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
  const arr = (rank[tab] || []).slice().sort((a, b) => b.net - a.net);
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
  const rows = d.list.slice().sort((a, b) => (b.shares || 0) - (a.shares || 0));
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
          <span class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(clean(x.code))}</div></span>
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
  const rows = uni().filter((x) => x.market !== "指數" && S.quotes[x.key]).map((x) => ({ x, q: S.quotes[x.key] }));
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
          <span class="logo">${stockLogo(k, nm, x.symbol, "logo")}</span>
          <span class="rmid"><div class="nm">${esc(nm)}</div><div class="sub">${esc(x.symbol)}${x.industry ? `<span class="mini-chip">${esc(x.industry)}</span>` : ""}</div></span>
          <span class="rpx"><div class="p">${fmt(q.price, 2)}</div><div class="d ${tone(q.change)}">${q.change != null ? pct(q.change) : "—"}</div></span>
          <span class="rside">${sparkLine(k, 64, 22)}</span>
        </a>`;
      }).join("") || `<p class="small muted">目前無報價資料。</p>`}
    </section>
    <p class="muted small" style="text-align:center">依即時報價排序，清單為內建與自選標的。</p>`;
}

/* ── 大盤 ── */
export function viewIndex() {
  const list = indices();
  const b = breadth();
  const ind = industryFlow();
  const cards = list.map((i) => `<div class="idx-card compact">
    <div class="small muted">${esc(i.name)}</div>
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-top:4px">
      <span class="num" style="font-size:17px">${fmt(i.price, 2)}</span>
      <span class="num small ${tone(i.changePct)}">${i.change != null ? (i.change > 0 ? "+" : "") + fmt(i.change, 2) : "—"} ${i.changePct != null ? pct(i.changePct) : ""}</span>
    </div>
  </div>`).join("");
  return `${head("大盤")}
    <section class="card"><h2 class="h2">指數</h2><div class="index-cards">${cards || '<p class="muted small">尚無資料</p>'}</div></section>
    ${b ? `<section class="card"><h2 class="h2">市場寬度</h2>
      <div class="row" style="gap:8px"><span class="badge up">漲 ${b.rise}</span><span class="badge down">跌 ${b.fall}</span><span class="badge none">平 ${b.flat}</span></div>
      <div class="small muted" style="margin-top:8px">成交金額 ${yi(b.amount)}</div></section>` : ""}
    ${ind.length ? `<section class="card"><h2 class="h2">產業資金</h2>
      ${ind.slice().sort((a, c) => (c.totalNet || 0) - (a.totalNet || 0)).slice(0, 8).map((x) => `<div class="list-item">
        <span style="flex:1">${esc(x.name)}</span><span class="num ${tone(x.totalNet)}">${zhang(x.totalNet)}</span></div>`).join("")}
    </section>` : ""}
    <section class="card"><a class="more-link" href="#/analysis">看完整行情與技術分析 ›</a></section>`;
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

/* ── 市場熱力圖（個股版）：面積＝漲跌幅規模，顏色＝漲跌，格內帶真 logo ── */
export function viewHeat() {
  const rows = uni().filter((x) => x.market !== "指數" && S.quotes[x.key] && S.quotes[x.key].change != null)
    .map((x) => ({ x, q: S.quotes[x.key] }));
  const ind = industryFlow().slice().sort((a, b) => (b.totalNet || 0) - (a.totalNet || 0));
  if (!rows.length) return `${head()}${emptyCard("市場熱力圖", "市場資料尚未更新")}`;
  rows.sort((a, b) => Math.abs(b.q.change || 0) - Math.abs(a.q.change || 0));
  const top = rows.filter((r) => r.x.market === "台股").slice(0, 10).concat(rows.filter((r) => r.x.market !== "台股").slice(0, 6));
  const maxChg = Math.max(...top.map((r) => Math.abs(r.q.change || 0)), 1);
  const blocks = top.map(({ x, q }) => {
    const w = Math.abs(q.change || 0) / maxChg;
    const up = (q.change || 0) >= 0;
    const bg = up ? `rgba(255,77,79,${0.14 + w * 0.5})` : `rgba(36,194,111,${0.14 + w * 0.5})`;
    const k = x.key;
    return `<a href="#/stock/${encodeURIComponent(k)}" style="flex:${1 + Math.round(w * 4)};min-width:96px;background:${bg};border-radius:12px;padding:9px 10px;text-decoration:none;color:#fff;display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:${62 + Math.round(w * 46)}px">
      <span class="logo" style="width:24px;height:24px;flex:none">${stockLogo(k, x.name, x.symbol, "logo")}</span>
      <div style="font-size:12.5px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.name)}</div>
      <div style="font-family:var(--mono);font-size:12px;opacity:.95">${q.change != null ? pct(q.change) : "—"}</div>
    </a>`;
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
      <div class="sec-h"><span class="ico">🔥</span><span class="tt">個股熱力圖</span><span class="sp"></span><span class="meta">面積＝漲跌幅</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:stretch">${blocks}</div>
      <div class="row" style="margin-top:12px;gap:12px;flex-wrap:wrap">
        <span class="small muted">上漲 ${rise} 檔</span><span class="small muted">下跌 ${fall} 檔</span>
        <span class="small muted">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span>
      </div>
    </section>
    <section class="xcard">
      <div class="sec-h"><span class="ico">🏭</span><span class="tt">產業資金</span><span class="sp"></span><a href="#/analysis" class="small" style="color:var(--gold2);text-decoration:none">行情頁 ›</a></div>
      ${indRows || `<p class="small muted">尚無產業資料</p>`}
    </section>
    <p class="muted small" style="text-align:center">格內為內建與自選標的即時報價；下方產業資金為 TWSE 盤後統計。</p>`;
}