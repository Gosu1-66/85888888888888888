// indexview.js — 指數／台指期詳情頁（#/indexv/<id>）：報價卡 + TradingView Lightweight Charts 走勢圖。
import { $, esc, fmt, pct, tone, registerAction } from "./ui.js";
import { S } from "./state.js";
import { keyOf } from "./portfolio.js";
import { indices } from "./marketdata.js";
import { mountCandle, mountLine } from "./kline.js";

const RANGES = [[21, "1月"], [63, "3月"], [126, "6月"], [243, "1年"]];
const FUT_IDS = { "fut-ah": "afterHours", "fut-reg": "regular" };

function candlesOf(key) {
  return (S.file?.candles?.[key] || []).map((r) => (Array.isArray(r) ? { t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] } : r));
}

function targetOf(id) {
  const fut = S.market?.futures || {};
  if (FUT_IDS[id]) {
    const f = fut[FUT_IDS[id]];
    if (!f) return null;
    return {
      kind: "fut",
      name: id === "fut-ah" ? "台指期盤後" : "台指期",
      sub: `${id === "fut-ah" ? "夜盤" : "日盤"} · ${f.contract || ""}`,
      icon: id === "fut-ah" ? "🌙" : "☀️",
      price: f.price, change: f.change, pct: f.pct, prev: f.ref, vol: f.vol,
      unit: "口",
      points: (f.chart || []).map((p, i) => [i, p]),
      intraday: true,
    };
  }
  const list = indices();
  const code = String(id || "").slice(0, 3);
  const hit = list.find((i) => String(i.code || "").slice(0, 3) === code);
  if (!hit) return null;
  const hist = S.idxHist?.[code] || null;
  return {
    kind: "idx", code,
    name: String(hit.name || "").replace("發行量加權股價指數", "加權指數").replace(/類指數$/, "類"),
    sub: "現貨",
    price: hit.price, change: hit.change, pct: hit.changePct, prev: hit.prev, vol: null,
    candles: candlesOf(keyOf("指數", "^TWII")),
    hist,
  };
}

export function viewIndexDetail() {
  const id = decodeURIComponent((location.hash.split("/indexv/")[1] || "").split("?")[0]);
  const t = targetOf(id);
  if (!t) return `<section class="xcard"><p class="small muted">找不到這個指數的資料。</p><a class="more-link" href="#/indexb">回指數總覽 ›</a></section>`;
  const px = (v) => (v == null ? "—" : fmt(v, v >= 1000 ? 0 : 2));
  const range = Number(S.idxRange) || 126;
  const chips = RANGES.map(([r, l]) => `<button class="chip2${r === range ? " on" : ""}" data-act="idx-range" data-range="${r}">${l}</button>`).join("");

  const isCandle = t.kind === "idx" && t.code === "t00" && t.candles.length > 5;
  const hasChart = t.kind === "fut" ? (t.points || []).length > 1 : isCandle || (t.hist && t.hist.length > 5);
  const note = hasChart ? "" : `<p class="small muted" style="margin:6px 0 0">此指數目前只有即時報價，歷史走勢序列尚未建立。</p>`;

  return `<section class="xcard" style="padding:14px 14px 8px">
    <div class="sec-h"><span class="ico">${t.kind === "fut" ? t.icon : "📈"}</span><span class="tt">${esc(t.name)}</span><span class="sp"></span><span class="meta">${esc(String(S.market?.date || "").slice(4, 6) + "/" + String(S.market?.date || "").slice(6, 8))}</span></div>
    <div class="idxv-head">
      <div>
        <div class="idxv-px ${tone(t.pct)}">${px(t.price)}</div>
        <div class="idxv-dl ${tone(t.pct)}">${t.change != null ? (t.change > 0 ? "+" : "") + fmt(t.change, t.price >= 1000 ? 0 : 2) : "—"}${t.pct != null ? " (" + pct(t.pct) + ")" : ""}</div>
      </div>
      <div class="idxv-sub"><div class="sub">${esc(t.sub)}</div><div class="small muted">前收 ${t.prev != null ? fmt(t.prev, 2) : "—"}${t.vol ? "｜成交 " + fmt(t.vol, 0) + " " + t.unit : ""}</div></div>
    </div>
    <div class="chiprow" style="margin:10px 0 6px">${chips}<span style="flex:1"></span><span class="chip2" style="pointer-events:none">${t.kind === "fut" ? "1 分鐘" : (isCandle ? "日 K" : "日線")}</span></div>
    ${t.kind === "idx" && isCandle ? `<div class="lwc-ohlc" id="idxv-ohlc"></div>` : ""}
    <div id="idxv-main" class="lwc-main"></div>
    <div id="idxv-sub" class="lwc-sub"${isCandle ? "" : ' style="display:none"'}></div>
    ${note}
  </section>
  <section class="xcard">
    <div class="sec-h"><span class="tt">指數資訊</span></div>
    <div class="row"><span class="small muted">代號</span><span class="small">${esc(t.kind === "fut" ? (id === "fut-ah" ? "TXF 盤後" : "TXF 日盤") : t.code)}</span></div>
    <div class="row" style="margin-top:8px"><span class="small muted">最新價</span><span class="small">${px(t.price)}</span></div>
    <div class="row" style="margin-top:8px"><span class="small muted">前收</span><span class="small">${t.prev != null ? fmt(t.prev, 2) : "—"}</span></div>
    <div class="row" style="margin-top:8px"><span class="small muted">資料時間</span><span class="small">${esc(String(S.market?.date || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1/$2/$3"))}</span></div>
    <p class="small muted" style="margin-top:10px">資料來源：${t.kind === "fut" ? "臺灣期貨交易所（延遲）" : "臺灣證券交易所（延遲）"}。指數不具成交量，成交量僅台指期提供。</p>
  </section>`;
}

/* ── 走勢圖（Lightweight Charts） ── */
let idxState = null;
const pad2 = (n) => String(n).padStart(2, "0");

export function afterIndexDetail() {
  const id = decodeURIComponent((location.hash.split("/indexv/")[1] || "").split("?")[0]);
  const t = targetOf(id);
  const mainEl = $("#idxv-main");
  const subEl = $("#idxv-sub");
  const box = $("#idxv-ohlc");
  if (!t || !mainEl || !subEl) return;
  const range = Number(S.idxRange) || 126;

  if (idxState && idxState.id === id) {
    idxState.range = range;
    idxState.chart && idxState.chart.setBars(range);
    return;
  }
  if (idxState) { try { idxState.chart && idxState.chart.destroy(); } catch (e) { /* ignore */ } idxState = null; }
  if (!window.LightweightCharts) {
    mainEl.innerHTML = '<p class="small muted" style="padding:20px 4px">圖表元件載入中，請稍後重新整理。</p>';
    return;
  }
  const narrow = (mainEl.clientWidth || window.innerWidth) < 520;

  if (t.kind === "fut") {
    const pts = (t.points || []).map(([i, v]) => [i, v]);
    if (pts.length < 2) return;
    // 1 分鐘序列用實際時間軸（今日 09:00 起每分鐘）
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const t0 = Math.floor(base.getTime() / 1000);
    const series = pts.map(([i, v]) => [t0 + i * 60, v]);
    const chart = mountLine(mainEl, series, {
      height: narrow ? 240 : 300, intraday: true, range,
      onHover: (d) => { /* 價格由外部卡片顯示 */ },
    });
    idxState = { id, range, chart };
    return;
  }

  if (t.code === "t00" && t.candles.length > 5) {
    const chart = mountCandle(mainEl, subEl, t.candles, {
      range,
      mainHeight: narrow ? 250 : 320,
      subHeight: narrow ? 110 : 132,
      onHover: (d, time) => {
        if (!box) return;
        if (!d || !time) { box.innerHTML = ohlcLine(t.candles[t.candles.length - 1], t.candles[t.candles.length - 2]); return; }
        const raw = t.candles.find((c) => c.t === time);
        box.innerHTML = ohlcLine(raw || { t: time, o: d.open, h: d.high, l: d.low, c: d.close, v: 0 }, t.candles[t.candles.length - 2]);
      },
    });
    if (box) box.innerHTML = ohlcLine(t.candles[t.candles.length - 1], t.candles[t.candles.length - 2]);
    idxState = { id, range, chart };
    return;
  }

  const hist = t.hist || [];
  if (hist.length < 2) return;
  const chart = mountLine(mainEl, hist, { height: narrow ? 240 : 300, range });
  idxState = { id, range, chart };
}

function ohlcLine(c, prev) {
  if (!c) return "";
  const d = new Date(c.t * 1000);
  const chg = prev ? c.c - prev.c : null;
  const pc = prev && prev.c ? (chg / prev.c) * 100 : null;
  return `<b>${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}</b>
    <span>開 ${fmt(c.o, 2)}</span><span>高 ${fmt(c.h, 2)}</span><span>低 ${fmt(c.l, 2)}</span>
    <span class="${tone(chg)}">收 ${fmt(c.c, 2)}</span>
    <span class="${tone(chg)}">${pc == null ? "" : (pc >= 0 ? "+" : "") + pc.toFixed(2) + "%"}</span>`;
}

registerAction("idx-range", (el) => {
  S.idxRange = Number(el.dataset.range) || 126;
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
