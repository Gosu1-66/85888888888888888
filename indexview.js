// indexview.js — 指數／台指期詳情頁（#/indexv/<id>）：報價卡 + 走勢圖（可 hover 讀值）＋區間切換。
import { $, esc, fmt, pct, tone, registerAction } from "./ui.js";
import { S } from "./state.js";
import { keyOf } from "./portfolio.js";
import { indices } from "./marketdata.js";
import { buildSeries } from "./indicators.js";
import { drawTechnical, drawLineChart } from "./charts.js";

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

  const hasChart = t.kind === "fut" ? (t.points || []).length > 1 : (t.code === "t00" && t.candles.length > 5) || (t.hist && t.hist.length > 5);
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
    <div class="chiprow" style="margin:10px 0 6px">${chips}<span style="flex:1"></span><span class="chip2" style="pointer-events:none">${t.kind === "fut" ? "1 分鐘" : "日線"}</span></div>
    <canvas id="idxv-chart"></canvas>
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

/* ── 繪圖與互動 ── */
export function afterIndexDetail() {
  const id = decodeURIComponent((location.hash.split("/indexv/")[1] || "").split("?")[0]);
  const t = targetOf(id);
  const cv = $("#idxv-chart");
  if (!t || !cv) return;
  const range = Number(S.idxRange) || 126;
  let hit = null;

  if (t.kind === "fut") {
    const pts = t.points || [];
    if (pts.length < 2) return;
    const draw = (hover) => { hit = drawLineChart(cv, pts, { hover }, 300, { intraday: true }); };
    draw(-1);
    cv.onmousemove = (e) => draw(hit ? hit.indexAt(e.clientX) : -1);
    cv.onmouseleave = () => draw(-1);
    return;
  }

  if (t.code === "t00" && t.candles.length > 5) {
    const data = buildSeries(t.candles);
    const n = data.length;
    const cnt = Math.min(n, range);
    let st = { start: n - cnt, end: n, hover: -1 };
    let state = { ...st };
    const draw = () => { hit = drawTechnical(cv, data, { start: state.start, end: state.end, hover: state.hover }, 420); };
    draw();
    cv.onmousemove = (e) => { state.hover = hit.indexAt(e.clientX); draw(); };
    cv.onmouseleave = () => { state.hover = -1; draw(); };
    cv.onwheel = (e) => {
      e.preventDefault();
      const span = state.end - state.start;
      const idx = hit.indexAt(e.clientX);
      const ns = Math.max(15, Math.min(n, Math.round(span * (e.deltaY > 0 ? 1.25 : 0.8))));
      let s0 = Math.round(idx - (idx - state.start) * (ns / span));
      s0 = Math.max(0, Math.min(n - ns, s0));
      state.start = s0; state.end = s0 + ns; state.hover = idx; draw();
    };
    return;
  }

  const hist = t.hist || [];
  if (hist.length < 2) return;
  const pts = hist.slice(-Math.min(hist.length, range + 10));
  const draw = (hover) => { hit = drawLineChart(cv, pts, { hover }, 300); };
  draw(-1);
  cv.onmousemove = (e) => draw(hit ? hit.indexAt(e.clientX) : -1);
  cv.onmouseleave = () => draw(-1);
}

registerAction("idx-range", (el) => {
  S.idxRange = Number(el.dataset.range) || 126;
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
});
