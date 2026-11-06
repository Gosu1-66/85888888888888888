// stock.js — 個股頁（對齊參考 App）：頭部報價、四格數據、K 線、六個頁籤（概覽／AI 研究／ETF／當沖／法人／主力）。
import { $, esc, fmt, pct, tone, toast, registerAction } from "./ui.js";
import { S, save, uni } from "./state.js";
import { keyOf } from "./portfolio.js";
import { buildSeries, rsi } from "./indicators.js";
import { drawTechnical } from "./charts.js";
import { stockLogo, sparkLine } from "./home.js";
import { industryFlow, instRank, institutions, daytrade, etfMetrics, indices } from "./marketdata.js";

const TABS = ["概覽", "AI 研究", "ETF", "當沖", "法人", "主力"];
const yi = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1e8), 2) + "億";
const zhang = (n) => (n == null || isNaN(n)) ? "—" : fmt(Math.round(n / 1000)) + "張";

function candleObjs(key) {
  return (S.file?.candles?.[key] || []).map((r) => (Array.isArray(r) ? { t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] } : r));
}

/* ── 四維評分（規則式，畫面標註估算） ── */
function scoreOf(u, key) {
  const cs = candleObjs(key);
  const series = cs.length >= 30 ? buildSeries(cs) : [];
  const last = series[series.length - 1] || {};
  const prev = series[series.length - 2] || {};
  const q = S.quotes[key] || {};
  const chg = q.change || 0;

  // 技術面：均線排列 40 + RSI 30 + MACD 30
  let tech = null;
  if (last.ma5 != null && last.ma20 != null) {
    let t = 0;
    t += (last.ma5 > last.ma20 ? 30 : 10) + (last.ma20 > (last.ma60 ?? last.ma20) ? 10 : 0);
    if (last.rsi != null) t += last.rsi > 70 ? 12 : last.rsi < 30 ? 26 : Math.round(Math.min(30, Math.max(0, (last.rsi - 30) / 40 * 30)));
    const bull = prev.dif != null && last.dif > last.dea && prev.dif <= prev.dea;
    t += bull ? 30 : last.dif > last.dea ? 22 : 8;
    tech = Math.max(0, Math.min(100, Math.round(t)));
  }
  // 籌碼面：法人當日買賣超（買超 → 高分）
  const r = instRank() || {};
  const nets = {};
  for (const type of ["foreign", "trust", "dealer"]) {
    const hit = (r[type] || []).find((x) => x.code === u.symbol);
    nets[type] = hit ? hit.net : null;
  }
  const tot = Object.values(nets).reduce((s, v) => s + (v || 0), 0);
  const chip = Object.values(nets).some((v) => v != null) ? Math.max(0, Math.min(100, Math.round(50 + (tot / 5e6) * 12))) : null;

  // 情緒面：當日漲跌幅 + 量能
  const v20 = cs.length >= 20 ? cs.slice(-20).reduce((s, c) => s + c.v, 0) / 20 : 0;
  const vr = v20 && cs.length ? cs[cs.length - 1].v / v20 : 1;
  const mood = Math.max(0, Math.min(100, Math.round(50 + chg * 6 + (vr > 1.5 ? 8 : 0))));
  const fund = null;   // 基本面資料未接（財報來源未串接）
  const arr = [chip, mood, tech].filter((x) => x != null);
  const score = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  return { chip, mood, tech, fund, score, chg, vr };
}

/* ── 個股頁主體 ── */
export function viewStock() {
  const key = decodeURIComponent((location.hash.split("/stock/")[1] || "").split("?")[0]);
  const u = uni().find((x) => x.key === key) || { key, name: key.split(":")[1] || "標的", symbol: key.split(":")[1] || "", market: "台股", board: "" };
  const q = S.quotes[key];
  const cs = candleObjs(key);
  const series = cs.length >= 30 ? buildSeries(cs) : [];
  const chgPct = q && q.change != null ? q.change : null;
  const prev = chgPct != null ? q.price / (1 + chgPct / 100) : null;
  const chg = prev ? q.price - prev : null;
  const sc = scoreOf(u, key);
  const vol = cs.length ? cs[cs.length - 1].v : null;
  const amt = vol && q ? vol * q.price : null;
  const tab = S.stockTab || "概覽";

  const stkLogo = stockLogo(key, u.name, u.symbol, "logo-in");
  const head = `<section class="xcard" style="padding:14px 16px">
    <div class="stk-head">
      <span class="logo">${stkLogo}</span>
      <div style="flex:1;min-width:0">
        <div class="nm">${esc(u.name)}</div>
        <div class="cd">${esc(u.symbol)} · ${esc(u.board || (q?.source === "binance" ? "即時" : "上市"))}${u.market === "加密貨幣" ? " · 加密貨幣" : ""}</div>
      </div>
      <div class="stk-px">
        <div class="p ${q ? tone(chg) : ""}">${q ? fmt(q.price, 2) : "—"}</div>
        <div class="d ${q ? tone(chg) : "muted"}">${q && chgPct != null ? `${chg >= 0 ? "+" : ""}${fmt(chg, 2)} (${pct(chgPct)})` : "無報價"}</div>
      </div>
    </div>
    <div class="stat4">
      <div><div class="k">總量</div><div class="v">${vol != null ? fmt(Math.round(vol / 1000)) : "—"}</div></div>
      <div><div class="k">量能比</div><div class="v">${sc.vr ? sc.vr.toFixed(2) : "—"}</div></div>
      <div><div class="k">成交額</div><div class="v">${amt ? yi(amt) : "—"}</div></div>
      <div><div class="k">技術分</div><div class="v" style="color:var(--gold2)">${sc.tech ?? "—"}</div></div>
    </div>
  </section>`;

  const kline = `<section class="xcard" style="padding:12px 12px 8px">
    <div class="chiprow" style="margin:0 0 6px">
      <span class="chip2" style="color:var(--gold2);border-color:rgba(217,177,106,.4)">6月</span>
      <span class="chip2">MA</span>
      <span style="flex:1"></span>
      <span class="chip2">${cs.length ? cs.length + " 根" : "無 K 線"}</span>
    </div>
    <canvas id="stk-chart"></canvas>
    <div class="legend"><span><i style="background:var(--warn)"></i>MA5</span><span><i style="background:var(--blue)"></i>MA20</span><span><i style="background:var(--pink)"></i>MA60</span><span>成交量・RSI・MACD</span></div>
  </section>`;

  const tabs = `<div class="tabbar">${TABS.map((t) => `<button type="button" class="${t === tab ? "on" : ""}" data-act="stock-tab" data-tab="${t}">${t}</button>`).join("")}</div>`;

  return `${head}${kline}${tabs}<div id="stk-panel">${panel(u, key, tab, sc, q, chgPct)}</div>`;
}

/* ── 各頁籤內容 ── */
function panel(u, key, tab, sc, q, chgPct) {
  const inst = institutions() || {};
  const r = instRank() || {};
  const nets = {};
  for (const type of ["foreign", "trust", "dealer"]) {
    const hit = (r[type] || []).find((x) => x.code === u.symbol);
    nets[type] = hit ? hit.net : null;
  }
  const flow = industryFlow().find((x) => x.name && String(x.name).includes(String(u.ind || ""))) || null;
  const cs = candleObjs(key);
  const closes = cs.map((c) => c.c);
  const ret5 = closes.length > 5 ? (closes[closes.length - 1] / closes[closes.length - 6] - 1) * 100 : null;
  const ret20 = closes.length > 20 ? (closes[closes.length - 1] / closes[closes.length - 21] - 1) * 100 : null;
  const rsiVal = closes.length > 14 ? rsi(closes).slice(-1)[0] : null;

  if (tab === "概覽") {
    const tag = (v, l) => `<div style="flex:1"><div class="small muted">${l}</div><div class="tag ${v == null ? "mid" : v >= 60 ? "bull" : v <= 40 ? "bear" : "mid"}" style="margin-top:6px;font-size:12.5px">${v == null ? "資料不足" : v >= 60 ? "偏多" : v <= 40 ? "偏空" : "中性"}</div></div>`;
    return `<section class="xcard">
      <div class="sec-h"><span class="ico">✦</span><span class="tt">AI 綜合摘要</span><span class="sp"></span><span class="meta">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span></div>
      <p class="small" style="line-height:1.75;color:#b6bdc6;margin:0 0 12px">
        ${u.name}（${u.symbol}）今日${chgPct >= 0 ? "上漲" : "下跌"} ${Math.abs(chgPct || 0).toFixed(2)}%，
        ${ret5 != null ? `近 5 日報酬 ${ret5 >= 0 ? "+" : ""}${ret5.toFixed(1)}%` : ""}${ret20 != null ? `、近 20 日 ${ret20 >= 0 ? "+" : ""}${ret20.toFixed(1)}%` : ""}；
        技術面 ${sc.tech ?? "—"} 分（RSI ${rsiVal != null ? rsiVal.toFixed(0) : "—"}），籌碼面 ${sc.chip ?? "—"} 分。
      </p>
      <div class="row" style="gap:10px;margin-bottom:14px">${tag(sc.chip, "短線籌碼")}${tag(sc.mood, "中線情緒")}${tag(sc.fund, "長線基本面")}</div>
      <div class="sec-h" style="margin-top:6px"><span class="tt">逐項分析</span></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">技術面</div><div class="sub">均線／RSI／MACD 綜合</div></div><div class="rpx"><div class="p" style="font-size:14px">${sc.tech ?? "—"} / 100</div></div></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">籌碼面</div><div class="sub">三大法人當日買賣超</div></div><div class="rpx"><div class="p" style="font-size:14px">${sc.chip ?? "—"} / 100</div></div></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">情緒面</div><div class="sub">漲跌幅與量能</div></div><div class="rpx"><div class="p" style="font-size:14px">${sc.mood ?? "—"} / 100</div></div></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">基本面</div><div class="sub">財報資料尚未串接</div></div><div class="rpx"><div class="p muted" style="font-size:14px">—</div></div></div>
      <div class="chiprow" style="margin-top:12px"><span class="chip2" style="color:var(--gold2);border-color:rgba(217,177,106,.35)">價格攻防</span></div>
      <div class="small muted">支撐 ${cs.length ? fmt(Math.min(...cs.slice(-20).map((c) => c.l)), 2) : "—"}｜壓力 ${cs.length ? fmt(Math.max(...cs.slice(-20).map((c) => c.h)), 2) : "—"}（近 20 日區間）</div>
    </section>`;
  }

  if (tab === "AI 研究") {
    const deg = (sc.score || 0) / 100 * 360;
    const conf = sc.tech != null && sc.chip != null ? Math.round(60 + Math.abs((sc.tech + sc.chip) / 2 - 50) * 0.6) : 55;
    const risk = Math.abs(sc.mood - 50) > 25 ? "高" : Math.abs(sc.mood - 50) > 10 ? "中等" : "低";
    return `<section class="xcard">
      <div class="sec-h"><span class="ico">◎</span><span class="tt">每日研判</span><span class="sp"></span><span class="meta">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span></div>
      <div class="score-row">
        <div class="ring" style="background:conic-gradient(from -90deg,#c9a259 0deg,#f0cf8e ${deg}deg,#22252a ${deg}deg 360deg)"><span class="n">${sc.score ?? "—"}</span></div>
        <div class="sc-grid">
          <div class="c"><div class="k">籌碼</div><div class="v">${sc.chip ?? "—"}</div></div>
          <div class="c"><div class="k">情緒</div><div class="v">${sc.mood ?? "—"}</div></div>
          <div class="c"><div class="k">技術</div><div class="v">${sc.tech ?? "—"}</div></div>
          <div class="c"><div class="k">基本</div><div class="v muted">—</div></div>
        </div>
      </div>
      <div class="row" style="margin-top:12px"><span class="small muted">AI 綜合評估</span><span class="small">信心 ${conf}% · 風險 ${risk}</span></div>
      <div class="barline"><i style="width:${sc.score || 0}%"></i></div>
      <p class="small muted" style="margin-top:12px;line-height:1.7">評分由技術指標、法人籌碼與當日量價以規則式加權計算（0–100），非投資建議；基本面需串接財報資料後才會納入。</p>
    </section>`;
  }

  if (tab === "ETF") {
    const m = etfMetrics(cs);
    if (!m) return `<section class="xcard"><div class="sec-h"><span class="ico">📦</span><span class="tt">ETF 資料</span></div><p class="small muted">K 線資料不足，無法計算 ETF 成分與績效指標。</p></section>`;
    return `<section class="xcard">
      <div class="sec-h"><span class="ico">📦</span><span class="tt">ETF 績效與風險</span><span class="sp"></span><span class="meta">估算</span></div>
      <div class="stat4" style="border-top:0;padding-top:0">
        <div><div class="k">3 個月</div><div class="v ${tone(m.ret3m)}">${m.ret3m != null ? pct(m.ret3m) : "—"}</div></div>
        <div><div class="k">6 個月</div><div class="v ${tone(m.ret6m)}">${m.ret6m != null ? pct(m.ret6m) : "—"}</div></div>
        <div><div class="k">年化波動</div><div class="v">${m.vol.toFixed(1)}%</div></div>
        <div><div class="k">最大回撤</div><div class="v">${m.mdd.toFixed(1)}%</div></div>
      </div>
      <div class="row" style="margin-top:14px"><span class="small muted">綜合評分</span><span class="small" style="color:var(--gold2);font-weight:800">${m.score} / 100</span></div>
      <div class="barline"><i style="width:${m.score}%"></i></div>
      <p class="small muted" style="margin-top:12px">成分股權重需 ETF 持股明細資料，目前未串接；此頁為報酬與風險統計。</p>
    </section>`;
  }

  if (tab === "當沖") {
    const dt = daytrade();
    const hit = (dt?.list || []).find((x) => x.code === u.symbol);
    const v = cs.length ? cs[cs.length - 1].v : null;
    return `<section class="xcard">
      <div class="sec-h"><span class="ico">⚡</span><span class="tt">當沖動向</span><span class="sp"></span><span class="meta">${dt?.date ? dt.date.slice(4, 6) + "/" + dt.date.slice(6, 8) : ""}</span></div>
      ${hit ? `<div class="stat4" style="border-top:0;padding-top:0">
          <div><div class="k">當沖張數</div><div class="v">${zhang(hit.shares)}</div></div>
          <div><div class="k">買進</div><div class="v">${zhang(hit.buy)}</div></div>
          <div><div class="k">賣出</div><div class="v">${zhang(hit.sell)}</div></div>
          <div><div class="k">佔成交量</div><div class="v">${v ? ((hit.shares / v) * 100).toFixed(1) + "%" : "—"}</div></div>
        </div>`
        : `<p class="small muted">此標的今日不在當沖成交量前 ${(dt?.list || []).length} 名，或非台股。</p>`}
      <div class="row" style="margin-top:14px"><span class="small muted">當日振幅</span><span class="small">${cs.length ? ((cs[cs.length - 1].h - cs[cs.length - 1].l) / cs[cs.length - 1].c * 100).toFixed(2) + "%" : "—"}</span></div>
      <div class="row" style="margin-top:8px"><span class="small muted">當日量能</span><span class="small">${v ? zhang(v) : "—"}</span></div>
    </section>`;
  }

  if (tab === "法人") {
    const row = (label, val) => `<div class="rrow" style="grid-template-columns:minmax(0,1fr) auto">
      <div class="rmid"><div class="nm">${label}</div></div>
      <div class="rpx"><div class="p ${val == null ? "muted" : tone(val)}" style="font-size:15px">${val == null ? "—" : (val >= 0 ? "+" : "") + zhang(val)}</div></div></div>`;
    return `<section class="xcard">
      <div class="sec-h"><span class="ico">🏦</span><span class="tt">法人籌碼動向</span><span class="sp"></span><span class="meta">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span></div>
      ${row("外資", nets.foreign)}${row("投信", nets.trust)}${row("自營", nets.dealer)}
      <div class="row" style="margin-top:12px"><span class="small muted">法人合計</span><span class="num small ${tone((nets.foreign || 0) + (nets.trust || 0) + (nets.dealer || 0))}">${zhang((nets.foreign || 0) + (nets.trust || 0) + (nets.dealer || 0))}</span></div>
      <div class="row" style="margin-top:8px"><span class="small muted">大盤三大法人</span><span class="num small ${tone(inst.total?.net)}">${yi(inst.total?.net)}</span></div>
      <p class="small muted" style="margin-top:12px">連買天數與集中度需逐日籌碼資料，目前僅有當日排行。</p>
    </section>`;
  }

  // 主力
  const main = nets.foreign != null ? nets.foreign : null;
  return `<section class="xcard">
    <div class="sec-h"><span class="ico">🀄</span><span class="tt">主力動向</span><span class="sp"></span><span class="meta">估算</span></div>
    <div class="row"><span class="small muted">外資買賣超（主力代理指標）</span><span class="num small ${tone(main)}">${main == null ? "—" : (main >= 0 ? "+" : "") + zhang(main)}</span></div>
    <div class="row" style="margin-top:8px"><span class="small muted">佔當日成交量</span><span class="small">${main != null && cs.length && cs[cs.length - 1].v ? (main / cs[cs.length - 1].v * 100).toFixed(1) + "%" : "—"}</span></div>
    <div class="row" style="margin-top:8px"><span class="small muted">股價 vs MA20</span><span class="small">${q && sc.tech != null ? (q.price > (buildSeries(cs).slice(-1)[0]?.ma20 || 0) ? "站上" : "跌破") : "—"}</span></div>
    <p class="small muted" style="margin-top:12px">主力分點資料需逐筆成交明細，目前以法人買賣超代理，僅供方向參考。</p>
  </section>`;
}

/* ── 繪圖 ── */
export function afterStock() {
  const key = decodeURIComponent((location.hash.split("/stock/")[1] || "").split("?")[0]);
  const cs = candleObjs(key);
  const cv = $("#stk-chart");
  if (!cv || cs.length < 5) return;
  drawTechnical(cv, buildSeries(cs), -1, 400);
}

/* ── actions ── */
registerAction("stock-tab", (el) => {
  S.stockTab = el.dataset.tab;
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
