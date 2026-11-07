// stock.js — 個股頁（對齊參考 App）：頭部報價、四格數據、K 線、六個頁籤（概覽／AI 研究／ETF／當沖／法人／主力）。
import { $, esc, fmt, pct, tone, toast, registerAction } from "./ui.js";
import { S, save, uni } from "./state.js";
import { keyOf } from "./portfolio.js";
import { buildSeries, rsi } from "./indicators.js";
import { mountCandle } from "./kline.js";
import { stockLogo, sparkLine } from "./home.js";
import { industryFlow, instRank, institutions, daytrade, etfMetrics, indices } from "./marketdata.js";
import { loadBinanceCandles, tvSymbol } from "./quotes.js";

/* ── K 線週期與指標偏好 ── */
const PERIOD_KEY = "gu1.stkPeriod";
const IND_KEY = "gu1.stkInd";
const PERIODS = [["1m", "1M"], ["5m", "5M"], ["15m", "15M"], ["1h", "1H"], ["4h", "4H"], ["8h", "8H"], ["1d", "日線"]];
const INDS = [["ma", "MA"], ["vol", "量"], ["rsi", "RSI"], ["macd", "MACD"]];
const TV_INTERVAL = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "8h": "480" };
const readLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 忽略 */ } };
function stkPeriod() {
  const p = S.stkPeriod || readLS(PERIOD_KEY) || "1d";
  return PERIODS.some(([k]) => k === p) ? p : "1d";
}
function stkInd() {
  try { return JSON.parse(readLS(IND_KEY) || "{}") || {}; } catch { return {}; }
}

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
  const fund = null;   // 基本面分數另由 BWIBBU 估值資料呈現
  const arr = [chip, mood, tech].filter((x) => x != null);
  const score = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
  return { chip, mood, tech, fund, score, chg, vr, nets };
}

/* 有資料才顯示的頁籤（避免點進去是空白區塊） */
const isEtfSym = (s) => /^00\d{3,4}[A-Z]?$/.test(String(s || "").toUpperCase());
function availTabs(u, sc, cs) {
  const nets = sc.nets || {};
  const out = ["概覽"];
  if (sc.tech != null || sc.chip != null) out.push("AI 研究");
  if (isEtfSym(u.symbol) && cs.length >= 30) out.push("ETF");
  if ((daytrade()?.list || []).some((x) => String(x.code) === String(u.symbol))) out.push("當沖");
  if (Object.values(nets).some((v) => v != null)) out.push("法人");
  if (nets.foreign != null && cs.length >= 30) out.push("主力");
  return out;
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
  const vol = (q && q.vol) || (cs.length ? cs[cs.length - 1].v : null);
  const amt = vol && q ? vol * q.price : null;
  const avail = availTabs(u, sc, cs);
  const tab = avail.includes(S.stockTab) ? S.stockTab : avail[0];
  const fund = S.file?.fundamentals?.[String(u.symbol)] || null;
  const hasFund = !!(fund && (fund.pe != null || fund.dy != null || fund.pb != null));

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
        <div class="d ${q ? tone(chg) : "muted"}">${q && chgPct != null ? `${chg >= 0 ? "+" : ""}${fmt(chg, 2)} (${pct(chgPct)})` : "報價資料建置中"}</div>
      </div>
    </div>
    <div class="stat4">
      <div><div class="k">總量</div><div class="v">${vol != null ? fmt(Math.round(vol / 1000)) : "—"}</div></div>
      <div><div class="k">量能比</div><div class="v">${sc.vr ? sc.vr.toFixed(2) : "—"}</div></div>
      <div><div class="k">成交額</div><div class="v">${amt ? yi(amt) : "—"}</div></div>
      <div><div class="k">技術分</div><div class="v" style="color:var(--gold2)">${sc.tech ?? "—"}</div></div>
    </div>
  </section>`;

  const RANGES = [[21, "1月"], [63, "3月"], [126, "6月"], [243, "1年"]];
  const rng = Number(S.stkRange) || 126;
  const rangeChips = RANGES.map(([r, l]) => `<button class="chip2${r === rng ? " on" : ""}" data-act="stk-range" data-range="${r}">${l}</button>`).join("");

  const canIntraday = u.market === "加密貨幣" ? true : u.market === "美股" ? cs.length >= 60 : false;
  const period = canIntraday ? stkPeriod() : "1d";
  const isDaily = period === "1d";
  const periodChips = PERIODS.filter(([p]) => p === "1d" || canIntraday)
    .map(([p, l]) => `<button class="chip2${p === period ? " on" : ""}" data-act="stk-period" data-period="${p}">${l}</button>`).join("");
  const useTv = !isDaily && canIntraday && u.market !== "加密貨幣";
  // TradingView 有資料的商品（美股／加密貨幣）才給「完整圖表」入口；台股免費嵌入無分時資料，不顯示
  const canTv = u.market === "美股" || u.market === "加密貨幣";
  const inds = stkInd();
  const indChips = INDS.map(([k, l]) => `<button class="chip2${inds[k] !== false ? " on" : ""}" data-act="stk-ind" data-ind="${k}">${l}</button>`).join("");
  const hasChart = cs.length >= 5 || u.market === "加密貨幣";

  const kline = hasChart ? `<section class="xcard" style="padding:12px 12px 8px">
    <div class="chiprow" style="margin:0 0 6px">
      ${periodChips}
      <span style="flex:1"></span>
      ${canTv ? `<button class="chip2 gold" data-act="stk-full" data-key="${esc(key)}" title="用 TradingView 完整圖表查看">完整圖表 ›</button>` : ""}
      <span class="chip2" style="pointer-events:none" id="stk-bars">${isDaily ? `${cs.length} 根` : ""}</span>
    </div>
    <div class="chiprow" id="stk-range-row" style="margin:0 0 6px${isDaily && !useTv ? "" : ";display:none"}">${rangeChips}</div>
    <div class="chiprow" id="stk-ind-row" style="margin:0 0 8px${useTv ? ";display:none" : ""}">${indChips}</div>
    <div class="lwc-ohlc" id="stk-ohlc"></div>
    <div id="stk-tv" class="tv-host" style="display:none"></div>
    <div id="stk-main" class="lwc-main"></div>
    <div id="stk-sub" class="lwc-sub"></div>
    <div class="legend" id="stk-legend"><span><i style="background:var(--warn)"></i>MA5</span><span><i style="background:var(--blue)"></i>MA20</span><span><i style="background:var(--pink)"></i>MA60</span><span>成交量・RSI・MACD</span><span class="muted">拖曳平移・滾輪縮放・雙指縮放</span></div>
  </section>` : "";

  const tabs = avail.length > 1 ? `<div class="tabbar">${avail.map((t) => `<button type="button" class="${t === tab ? "on" : ""}" data-act="stock-tab" data-tab="${t}">${t}</button>`).join("")}</div>` : "";

  return `${head}${kline}${tabs}<div id="stk-panel">${panel(u, key, tab, sc, q, chgPct, fund, hasFund)}</div>`;
}

/* ── 各頁籤內容 ── */
function panel(u, key, tab, sc, q, chgPct, fund, hasFund) {
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
    const tag = (v, l) => v == null ? "" : `<div style="flex:1"><div class="small muted">${l}</div><div class="tag ${v >= 60 ? "bull" : v <= 40 ? "bear" : "mid"}" style="margin-top:6px;font-size:12.5px">${v >= 60 ? "偏多" : v <= 40 ? "偏空" : "中性"}</div></div>`;
    const sum = [];
    if (chgPct != null) sum.push(`今日${chgPct >= 0 ? "上漲" : "下跌"} ${Math.abs(chgPct).toFixed(2)}%`);
    if (ret5 != null) sum.push(`近 5 日報酬 ${ret5 >= 0 ? "+" : ""}${ret5.toFixed(1)}%`);
    if (ret20 != null) sum.push(`近 20 日 ${ret20 >= 0 ? "+" : ""}${ret20.toFixed(1)}%`);
    if (sc.tech != null) sum.push(`技術面 ${sc.tech} 分${rsiVal != null ? `（RSI ${rsiVal.toFixed(0)}）` : ""}`);
    if (sc.chip != null) sum.push(`籌碼面 ${sc.chip} 分`);
    const summary = sum.length ? sum.join("，") + "。" : `${u.name}（${u.symbol}）日 K 資料建置中，技術與籌碼評分待補齊後顯示。`;
    return `<section class="xcard">
      <div class="sec-h"><span class="ico">✦</span><span class="tt">AI 綜合摘要</span><span class="sp"></span><span class="meta">${S.market?.date ? S.market.date.slice(4, 6) + "/" + S.market.date.slice(6, 8) : ""}</span></div>
      <p class="small" style="line-height:1.75;color:#b6bdc6;margin:0 0 12px">${esc(summary)}</p>
      <div class="row" style="gap:10px;margin-bottom:14px">${tag(sc.chip, "短線籌碼")}${tag(sc.mood, "中線情緒")}${hasFund && fund.pe != null ? tag(Math.min(100, Math.max(0, Math.round((fund.dy || 0) * 8 + 30))), "長線基本面") : ""}</div>
      <div class="sec-h" style="margin-top:6px"><span class="tt">逐項分析</span></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">技術面</div><div class="sub">均線／RSI／MACD 綜合</div></div><div class="rpx"><div class="p" style="font-size:14px">${sc.tech != null ? sc.tech + " / 100" : "待補"}</div></div></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">籌碼面</div><div class="sub">三大法人當日買賣超</div></div><div class="rpx"><div class="p" style="font-size:14px">${sc.chip != null ? sc.chip + " / 100" : "待補"}</div></div></div>
      <div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">情緒面</div><div class="sub">漲跌幅與量能</div></div><div class="rpx"><div class="p" style="font-size:14px">${sc.mood != null ? sc.mood + " / 100" : "待補"}</div></div></div>
      ${hasFund ? `<div class="rrow" style="grid-template-columns:minmax(0,1fr) auto"><div class="rmid"><div class="nm">基本面</div><div class="sub">本益比 ｜ 殖利率 ｜ 股價淨值比</div></div><div class="rpx"><div class="p" style="font-size:12.5px">${fund.pe != null ? fmt(fund.pe, 1) : "—"}｜${fund.dy != null ? fund.dy.toFixed(2) + "%" : "—"}｜${fund.pb != null ? fmt(fund.pb, 2) : "—"}</div></div></div>` : ""}
      ${cs.length >= 20 ? `<div class="chiprow" style="margin-top:12px"><span class="chip2" style="color:var(--gold2);border-color:rgba(217,177,106,.35)">價格攻防</span></div>
      <div class="small muted">支撐 ${fmt(Math.min(...cs.slice(-20).map((c) => c.l)), 2)}｜壓力 ${fmt(Math.max(...cs.slice(-20).map((c) => c.h)), 2)}（近 20 日區間）</div>` : ""}
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
          <div class="c"><div class="k">基本</div><div class="v">${hasFund && fund.pe != null ? fmt(fund.pe, 1) : hasFund && fund.pb != null ? fmt(fund.pb, 2) : "—"}</div></div>
        </div>
      </div>
      <div class="row" style="margin-top:12px"><span class="small muted">AI 綜合評估</span><span class="small">信心 ${conf}% · 風險 ${risk}</span></div>
      <div class="barline"><i style="width:${sc.score || 0}%"></i></div>
      <p class="small muted" style="margin-top:12px;line-height:1.7">評分由技術指標、法人籌碼與當日量價以規則式加權計算（0–100），非投資建議；基本面以本益比／殖利率／股價淨值比呈現。</p>
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
      <p class="small muted" style="margin-top:12px">此頁為報酬與風險統計；成分股持股明細未提供，故不顯示權重區塊。</p>
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

/* ── K 線：TradingView Lightweight Charts ── */
let klineState = null;

function pad(n) { return String(n).padStart(2, "0"); }
function ohlcText(c, prev) {
  if (!c) return "";
  const d = new Date(c.t * 1000);
  const chg = prev ? c.c - prev.c : null;
  const pc = prev && prev.c ? (chg / prev.c) * 100 : null;
  return `<b>${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}</b>
    <span>開 ${fmt(c.o, 2)}</span><span>高 ${fmt(c.h, 2)}</span><span>低 ${fmt(c.l, 2)}</span>
    <span class="${tone(chg)}">收 ${fmt(c.c, 2)}</span>
    <span class="${tone(chg)}">${pc == null ? "" : (pc >= 0 ? "+" : "") + pc.toFixed(2) + "%"}</span>
    <span class="muted">${c.v == null ? "" : c.v >= 1000 ? `量 ${fmt(Math.round(c.v / 1000))} 張` : `量 ${fmt(c.v, 2)}`}</span>`;
}

/* ── TradingView 免費嵌入圖表（台股／美股分時週期） ── */
let tvState = null;
function mountTv(el, sym, interval) {
  el.innerHTML = "";
  const holder = document.createElement("div");
  holder.className = "tradingview-widget-container";
  holder.style.height = "100%";
  const inner = document.createElement("div");
  inner.className = "tradingview-widget-container__widget";
  inner.style.height = "100%";
  holder.appendChild(inner);
  el.appendChild(holder);
  const s = document.createElement("script");
  s.type = "text/javascript";
  s.async = true;
  s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  s.innerHTML = JSON.stringify({
    autosize: true,
    symbol: sym,
    interval: String(interval),
    timezone: "Asia/Taipei",
    theme: "dark",
    style: "1",
    locale: "zh_TW",
    withdateranges: true,
    hide_side_toolbar: true,
    allow_symbol_change: false,
    save_image: false,
    calendar: false,
    studies: ["Volume@tv-basicstudies"],
    support_host: "https://www.tradingview.com",
  });
  holder.appendChild(s);
  tvState = { el, sym, interval };
}

let binanceSeq = 0;

export function afterStock() {
  const key = decodeURIComponent((location.hash.split("/stock/")[1] || "").split("?")[0]);
  const u = uni().find((x) => x.key === key) || {
    key, market: key.split(":")[0] || "台股", symbol: key.split(":")[1] || "", board: "",
  };
  const period = stkPeriod();
  const mainEl = $("#stk-main");
  const subEl = $("#stk-sub");
  const box = $("#stk-ohlc");
  const tvEl = $("#stk-tv");
  const legend = $("#stk-legend");
  if (!mainEl || !subEl) return;
  const cs = candleObjs(key);
  const canIntraday = u.market === "加密貨幣" ? true : u.market === "美股" ? cs.length >= 60 : false;
  const effPeriod = canIntraday ? period : "1d";
  const isDaily = effPeriod === "1d";
  const range = Number(S.stkRange) || 126;
  const narrow = (mainEl.clientWidth || window.innerWidth) < 520;

  const clearLwc = () => {
    if (klineState) { try { klineState.chart && klineState.chart.destroy(); } catch (e) { /* ignore */ } klineState = null; }
  };
  const clearTv = () => { if (tvState) { tvState.el.innerHTML = ""; tvState = null; } };

  // 台股／美股的分時週期 → TradingView 免費嵌入圖表
  if (!isDaily && u.market !== "加密貨幣") {
    const sym = tvSymbol(key, { board: u.board });
    clearLwc();
    mainEl.style.display = "none";
    subEl.style.display = "none";
    if (legend) legend.style.display = "none";
    if (box) box.textContent = "";
    if (tvEl) {
      tvEl.style.display = "";
      // 頁面重繪會換掉容器元素，因此只要容器不是同一個（或尚未掛過）就重掛 widget
      const need = !tvState || tvState.el !== tvEl || tvState.sym !== sym
        || tvState.interval !== TV_INTERVAL[effPeriod] || !tvEl.querySelector("script");
      if (need) mountTv(tvEl, sym, TV_INTERVAL[effPeriod]);
    }
    const barsEl = $("#stk-bars");
    if (barsEl) barsEl.textContent = `${PERIODS.find(([p]) => p === effPeriod)[1]} · TradingView`;
    return;
  }

  clearTv();
  if (tvEl) tvEl.style.display = "none";
  mainEl.style.display = "";
  subEl.style.display = "";
  if (legend) legend.style.display = "";
  const barsEl = $("#stk-bars");
  if (barsEl) barsEl.textContent = isDaily ? `${cs.length} 根` : "";

  // 加密貨幣分時：Binance klines 前端直取，一樣畫在自己的 Lightweight Charts
  if (!isDaily && u.market === "加密貨幣") {
    clearLwc();
    const ind = stkInd();
    const seq = ++binanceSeq;
    if (box) box.textContent = "分時 K 線載入中…";
    loadBinanceCandles(u.symbol, effPeriod, 400).then((rows) => {
      if (seq !== binanceSeq || !mainEl.isConnected || !rows || !rows.length) return;
      const chart = mountCandle(mainEl, subEl, rows, {
        range: rows.length, mainHeight: narrow ? 232 : 320, subHeight: narrow ? 138 : 132, intraday: true, indicators: ind,
        onHover: (d, time) => {
          if (!box) return;
          if (!d || !time) { box.innerHTML = ohlcText(rows[rows.length - 1], rows[rows.length - 2]); return; }
          const raw = rows.find((c) => c.t === time);
          box.innerHTML = ohlcText(raw || { t: time, o: d.open, h: d.high, l: d.low, c: d.close, v: 0 }, rows[rows.length - 2]);
        },
      });
      klineState = { key, range, chart, el: mainEl, period: effPeriod };
      if (box) box.innerHTML = ohlcText(rows[rows.length - 1], rows[rows.length - 2]);
      if (barsEl) barsEl.textContent = `${rows.length} 根 · ${PERIODS.find(([p]) => p === effPeriod)[1]}`;
    }).catch(() => { if (box) box.textContent = "此標的暫無分時 K 線。"; });
    return;
  }

  // 日線：自己的 Lightweight Charts
  if (!mainEl || !subEl || cs.length < 5) return;
  if (box) box.innerHTML = ohlcText(cs[cs.length - 1], cs[cs.length - 2]);
  const ind = stkInd();
  if (klineState && klineState.key === key && klineState.el === mainEl && mainEl.isConnected) {
    klineState.range = range;
    if (klineState.chart) { klineState.chart.setBars(range); klineState.chart.setIndicators(ind); }
    return;
  }
  clearLwc();
  if (!window.LightweightCharts) {
    mainEl.innerHTML = '<p class="small muted" style="padding:20px 4px">圖表元件載入中，請稍後重新整理。</p>';
    return;
  }
  const chart = mountCandle(mainEl, subEl, cs, {
    range,
    mainHeight: narrow ? 232 : 320,
    subHeight: narrow ? 138 : 132,
    indicators: ind,
    onHover: (d, time) => {
      if (!box) return;
      if (!d || !time) { box.innerHTML = ohlcText(cs[cs.length - 1], cs[cs.length - 2]); return; }
      const raw = cs.find((c) => c.t === time);
      box.innerHTML = ohlcText(raw || { t: time, o: d.open, h: d.high, l: d.low, c: d.close, v: 0 }, cs[cs.length - 2]);
    },
  });
  klineState = { key, range, chart, el: mainEl, period: effPeriod };
}
/* ── actions ── */
registerAction("stk-range", (el) => {
  S.stkRange = Number(el.dataset.range) || 126;
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});

/* 週期：日線用自己的 LWC；台股/美股分時用 TradingView，加密用 Binance */
registerAction("stk-period", (el) => {
  const p = el.dataset.period || "1d";
  S.stkPeriod = p;
  writeLS(PERIOD_KEY, p);
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});

/* 指標開關（只作用在自己的 Lightweight Charts） */
registerAction("stk-ind", (el) => {
  const k = el.dataset.ind;
  const cur = stkInd();
  const next = { ...cur, [k]: cur[k] === false };   // 反向切換
  writeLS(IND_KEY, JSON.stringify(next));
  el.classList.toggle("on", next[k] !== false);
  if (klineState && klineState.chart) klineState.chart.setIndicators(next);
});

/* 完整圖表：開 TradingView 進階圖表頁（美股／加密貨幣） */
registerAction("stk-full", (el) => {
  const key = el.dataset.key || decodeURIComponent((location.hash.split("/stock/")[1] || "").split("?")[0]);
  location.hash = "#/tvchart/" + encodeURIComponent(key);
});

/* ── 完整圖表頁（TradingView Advanced Chart，全螢幕＋可返回） ── */
export function viewTvChart() {
  const key = decodeURIComponent((location.hash.split("/tvchart/")[1] || "").split("?")[0]);
  const u = uni().find((x) => x.key === key) || { key, market: key.split(":")[0] || "", symbol: key.split(":")[1] || "", board: "", name: key.split(":")[1] || "" };
  const sym = tvSymbol(key, { board: u.board }) || "";
  return `<section class="tvfull">
    <div class="tvfull-head">
      <div style="min-width:0">
        <div class="nm">${esc(u.name || u.symbol)}</div>
        <div class="small muted">${esc(sym)} · TradingView 進階圖表（可加畫線工具、切週期）</div>
      </div>
      <button type="button" class="btn sm" data-act="go-back">‹ 返回</button>
    </div>
    <div id="tvfull" class="tv-host tv-full" data-sym="${esc(sym)}"></div>
    <p class="small muted" style="margin:8px 2px 0">圖表由 TradingView 提供；手機可雙指縮放，右上角可切換週期與全螢幕。</p>
  </section>`;
}

export function afterTvChart() {
  const el = $("#tvfull");
  if (!el || !el.dataset.sym) return;
  el.innerHTML = "";
  const holder = document.createElement("div");
  holder.className = "tradingview-widget-container";
  holder.style.height = "100%";
  const inner = document.createElement("div");
  inner.className = "tradingview-widget-container__widget";
  inner.style.height = "100%";
  holder.appendChild(inner);
  el.appendChild(holder);
  const s = document.createElement("script");
  s.type = "text/javascript";
  s.async = true;
  s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  s.innerHTML = JSON.stringify({
    autosize: true,
    symbol: el.dataset.sym,
    interval: "60",
    timezone: "Asia/Taipei",
    theme: "dark",
    style: "1",
    locale: "zh_TW",
    withdateranges: true,
    hide_side_toolbar: false,
    allow_symbol_change: false,
    save_image: true,
    calendar: false,
    details: true,
    hotlist: false,
    studies: ["Volume@tv-basicstudies", "MASimple@tv-basicstudies", "RSI@tv-basicstudies", "MACD@tv-basicstudies"],
    support_host: "https://www.tradingview.com",
  });
  holder.appendChild(s);
}

registerAction("stock-tab", (el) => {
  S.stockTab = el.dataset.tab;
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
