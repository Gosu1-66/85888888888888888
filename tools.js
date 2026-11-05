// tools.js — 首頁功能入口的專屬頁面：市場雷達／法人排行／當沖排行／選股／大盤
// 資料來源：market.json（TWSE 盤後）＋即時報價 S.quotes。單位：金額元→億、股→張。
import { esc, fmt, pct, tone, registerAction, $ } from "./ui.js";
import { S, save, uni, quoteOf, fxRate } from "./state.js";
import { keyOf } from "./portfolio.js";
import { breadth, institutions, instRank, industryFlow, daytrade, greedIndex, indices } from "./marketdata.js";
import { HOT_STOCKS, CATALOG } from "./catalog.js";

const yi = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1e8), 0) + "億";
const zhang = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1000), 0) + "張";
const clean = (s) => String(s || "").trim();
const nameOf = (code, raw) => {
  const k = keyOf("台股", code);
  return uni().find((x) => x.key === k)?.name || clean(raw) || code;
};

function head(title) {
  return `<div class="row" style="align-items:center;gap:10px;margin-bottom:10px">
    <a href="#/home" class="btn sm">‹ 首頁</a>
    <h2 class="h2" style="margin:0">${esc(title)}</h2>
  </div>`;
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
  const idx = indices()[0];

  const gauge = g ? `<section class="card">
    <h2 class="h2">市場情緒</h2>
    <div class="row" style="gap:16px;align-items:center">
      <div style="font-size:44px;font-weight:800" class="${g.score >= 50 ? "up" : "down"}">${g.score}</div>
      <div><div style="font-weight:700">${esc(g.label)}</div>
      <div class="muted small">0 = 極度恐慌，100 = 極度貪婪</div></div>
    </div>
    <div style="margin-top:10px">${g.parts.map((p) => `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--border);padding:6px 0">
      <span class="small muted">${esc(p.label)}</span><span class="small">${esc(p.text)}</span></div>`).join("")}</div>
  </section>` : emptyCard("市場情緒", "市場資料尚未更新");

  const breadthCard = b ? `<section class="card">
    <h2 class="h2">漲跌家數（${esc(b.date || "")}）</h2>
    <div class="row" style="gap:8px;margin-bottom:8px">
      <span class="badge up">上漲 ${b.rise}</span>
      <span class="badge down">下跌 ${b.fall}</span>
      <span class="badge none">平盤 ${b.flat}</span>
    </div>
    <div style="height:10px;border-radius:6px;overflow:hidden;display:flex">
      <div style="flex:${b.rise};background:var(--up)"></div>
      <div style="flex:${b.flat};background:var(--muted,#666)"></div>
      <div style="flex:${b.fall};background:var(--down)"></div>
    </div>
    <div class="small muted" style="margin-top:8px">成交金額 ${yi(b.amount)}｜全市場（含上櫃）上漲 ${b.riseAll}、下跌 ${b.fallAll}</div>
  </section>` : emptyCard("漲跌家數", "市場資料尚未更新");

  const indRows = ind.slice().sort((a, c) => (c.totalNet || 0) - (a.totalNet || 0));
  const indCard = indRows.length ? `<section class="card">
    <h2 class="h2">產業法人買賣超</h2>
    ${indRows.map((x) => `<div class="list-item">
      <span style="flex:1">${esc(x.name)}</span>
      <span class="num ${tone(x.totalNet)}">${zhang(x.totalNet)}</span>
    </div>`).join("")}
  </section>` : emptyCard("產業法人買賣超", "市場資料尚未更新");

  const instCard = inst ? `<section class="card">
    <h2 class="h2">三大法人合計（${esc(inst.date || "")}）</h2>
    <div class="list-item"><span style="flex:1">合計</span><span class="num ${tone(inst.total?.net)}">${yi(inst.total?.net)}</span></div>
    <div class="list-item"><span style="flex:1">外資</span><span class="num ${tone(inst.foreign?.net)}">${yi(inst.foreign?.net)}</span></div>
    <div class="list-item"><span style="flex:1">投信</span><span class="num ${tone(inst.trust?.net)}">${yi(inst.trust?.net)}</span></div>
    <div class="list-item"><span style="flex:1">自營商</span><span class="num ${tone(inst.dealer?.net)}">${yi(inst.dealer?.net)}</span></div>
  </section>` : "";

  return `${head("市場雷達")}
    ${idx ? `<section class="card"><div class="row" style="justify-content:space-between;align-items:center">
      <div><div class="small muted">${esc(idx.name)}</div><div class="num" style="font-size:26px;font-weight:800">${fmt(idx.price, 2)}</div></div>
      <div class="num ${tone(idx.changePct)}">${idx.change != null ? (idx.change > 0 ? "+" : "") + fmt(idx.change, 2) : "—"}<br>${idx.changePct != null ? pct(idx.changePct) : ""}</div>
    </div></section>` : ""}
    ${gauge}${breadthCard}${instCard}${indCard}
    <p class="muted small" style="text-align:center">資料為最近交易日盤後統計，僅供參考。</p>`;
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
    return `<a class="list-item" href="#/search?s=${encodeURIComponent(k)}">
      <span class="muted small" style="width:26px">${i + 1}</span>
      <span style="flex:1;min-width:0"><strong>${esc(clean(x.code))}</strong> <span class="muted small">${esc(nameOf(x.code, x.name))}</span>
        ${w ? `<span class="dot"></span>` : ""}</span>
      <span class="num ${tone(x.net)}">${zhang(x.net)}</span>
    </a>`;
  };
  return `${head("法人買賣超排行")}
    <div class="row" style="gap:8px;margin-bottom:10px">
      ${tabs.map(([k, label]) => `<button type="button" class="btn sm ${tab === k ? "primary" : ""}" data-act="inst-tab" data-tab="${k}">${esc(label)}</button>`).join("")}
    </div>
    <div class="small muted" style="margin:-2px 0 10px">${esc(keyOfType)}買超前 25 名（單位：張）</div>
    <section class="card">${top.map(row).join("")}</section>
    <div class="small muted" style="margin:14px 0 10px">${esc(keyOfType)}賣超前 15 名</div>
    <section class="card">${bot.map((x, i) => row(x, i)).join("")}</section>
    <p class="muted small" style="text-align:center">盤後統計，資料由 TWSE 公開資訊排程抓取。</p>`;
}

/* ── 當沖排行 ── */
export function viewDaytrade() {
  const d = daytrade();
  if (!d || !d.list) return `${head("當沖排行")}${emptyCard("當沖排行", "市場資料尚未更新")}`;
  const total = d.total?.shares;
  const totalText = total == null ? "—" : (total > 1e10 ? yi(total) : zhang(total));
  const rows = d.list.slice().sort((a, b) => (b.shares || 0) - (a.shares || 0));
  return `${head("當沖排行")}
    <section class="card">
      <div class="row" style="justify-content:space-between"><span class="muted small">${esc(d.date || "")} 全市場當沖成交量</span>
      <span class="num">${totalText}</span></div>
    </section>
    <section class="card">
      <h2 class="h2">當沖熱門（前 ${rows.length} 檔）</h2>
      ${rows.map((x, i) => {
        const k = keyOf("台股", clean(x.code));
        return `<a class="list-item" href="#/search?s=${encodeURIComponent(k)}">
          <span class="muted small" style="width:26px">${i + 1}</span>
          <span style="flex:1;min-width:0"><strong>${esc(clean(x.code))}</strong> <span class="muted small">${esc(clean(x.name))}</span></span>
          <span class="num">${zhang(x.shares)}</span>
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
  return `${head("選股")}
    <div class="row" style="gap:8px;margin-bottom:10px">
      ${tabs.map(([k, label]) => `<button type="button" class="btn sm ${sort === k ? "primary" : ""}" data-act="scan-sort" data-sort="${k}">${esc(label)}排序</button>`).join("")}
    </div>
    <section class="card">
      ${sorted.map(({ x, q }, i) => `<a class="list-item" href="#/search?s=${encodeURIComponent(x.key)}">
        <span class="muted small" style="width:26px">${i + 1}</span>
        <span style="flex:1;min-width:0"><strong>${esc(x.symbol)}</strong> <span class="muted small">${esc(x.name)}</span>
          ${x.market !== "台股" ? `<span class="tag mid">${esc(x.market)}</span>` : ""}</span>
        <span class="num ${tone(q.change)}">${fmt(q.price, 2)}<br><span class="small">${q.change != null ? pct(q.change) : "—"}</span></span>
      </a>`).join("") || `<p class="muted small">目前無報價資料。</p>`}
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

/* ── 工具（計算機） ── */
export function viewTools() {
  const fx = fxRate();
  return `${head("工具")}
    <section class="card">
      <h2 class="h2">台股交易成本試算</h2>
      <div class="row" style="gap:8px">
        <input id="t-price" type="number" inputmode="decimal" placeholder="成交價（元）">
        <input id="t-lots" type="number" inputmode="decimal" placeholder="張數">
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button type="button" class="btn primary" data-act="calc-fee">計算</button>
      </div>
      <div id="t-out" class="small muted" style="margin-top:10px">手續費以 6 折計算（0.1425% × 0.6），賣出另加證交稅 0.3%。</div>
    </section>
    <section class="card">
      <h2 class="h2">匯率換算（美元 ⇄ 新台幣）</h2>
      <div class="row" style="gap:8px">
        <input id="t-usd" type="number" inputmode="decimal" placeholder="美元金額">
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button type="button" class="btn" data-act="calc-fx">換算</button>
      </div>
      <div id="t-fxout" class="small muted" style="margin-top:10px">目前匯率：1 美元 ≈ ${fx ? fx.toFixed(2) : "—"} 新台幣</div>
    </section>
    <section class="card">
      <h2 class="h2">報酬率試算</h2>
      <div class="row" style="gap:8px">
        <input id="t-cost" type="number" inputmode="decimal" placeholder="投入成本">
        <input id="t-now" type="number" inputmode="decimal" placeholder="目前市值">
      </div>
      <div class="row" style="gap:8px;margin-top:8px">
        <button type="button" class="btn" data-act="calc-ror">計算</button>
      </div>
      <div id="t-rorout" class="small muted" style="margin-top:10px">報酬率＝（目前市值 − 成本）／成本。</div>
    </section>
    <p class="muted small" style="text-align:center">試算結果僅供參考，實際費用以券商公告為準。</p>`;
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
registerAction("scan-sort", (el) => { S.scanSort = el.dataset.sort; save(); window.dispatchEvent(new CustomEvent("portfolios:changed")); });
