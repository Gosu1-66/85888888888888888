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
import { CATALOG, HOT_STOCKS, ETF_LIST, INDUSTRIES, universe } from "./catalog.js";
import { refreshQuotes, loadCandles, SOURCE_LABEL } from "./quotes.js";
import {
  refreshMarket, indices, breadth, institutions, instRank,
  industryFlow, industryEst, daytrade, greedIndex, marketTone,
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
  const updated = S.market && S.market.updated;
  const ageTxt = updated ? ageText(Date.parse(updated)) : "—";
  const stale = (typeof STALE_MSG === "string" && STALE_MSG) ? `<div class="banner warn">${esc(STALE_MSG)}</div>` : "";

  return `
  <div class="view-analysis">
    ${stale}
    <div class="banner info">
      市場資料時間：${esc(ageTxt)}　<span class="muted small">（盤後統計／規則式估算，僅供參考）</span>
    </div>

    ${renderIndices()}

    <div class="grid g2">
      ${renderBreadth()}
      ${renderGreed()}
    </div>

    ${renderInstitutions()}
    ${renderIndustry()}
    ${renderEtfs()}
    ${renderStrategy()}

    <footer class="small muted" style="margin-top:16px;text-align:center">
      本工具所有數據來自公開與非即時來源，標示「估算／盤後」者尤須留意；僅為個人看盤輔助，<strong>非投資建議</strong>，交易風險自負。
    </footer>
  </div>`;
}

/* ---------- 插入後：非同步載入 ETF K 線並算報酬風險 ---------- */
function renderEtfMetrics(m) {
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
