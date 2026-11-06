// 以 Canvas 繪圖，無任何外部套件。
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const palette = () => ({ fg: css("--fg"), muted: css("--muted"), border: css("--border"), up: css("--up"), down: css("--down"), primary: css("--primary"), warn: css("--warn"), blue: css("--blue"), pink: css("--pink"), orange: css("--orange"), card: css("--card") });

function setup(canvas, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(280, Math.floor(canvas.clientWidth || canvas.parentElement.clientWidth));
  canvas.style.height = cssHeight + "px";
  canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, cssHeight);
  return { ctx, w, h: cssHeight };
}

const nice = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2));

/**
 * 技術分析圖（TradingView 風格）：可視窗區間、十字線、右軸價格標籤、頂部 OHLC、平移縮放。
 * data 為 buildSeries 輸出；view = { start, end, hover }，台灣慣例紅漲綠跌。
 */
export function drawTechnical(canvas, data, view = {}, cssH = 420) {
  const P = palette();
  const H = cssH, n = data.length;
  const { ctx, w } = setup(canvas, H);
  if (!n) return { count: 0, indexAt: () => 0 };
  const padL = 6, padR = 58, padT = 24, padB = 16;
  const s = Math.max(0, Math.min(n - 2, view.start ?? 0));
  const e = Math.max(s + 2, Math.min(n, view.end ?? n));
  const cnt = e - s;
  const plotW = Math.max(60, w - padL - padR);
  const step = plotW / cnt;
  const bw = Math.max(1, Math.min(11, step * 0.62));
  const xOf = (i) => padL + (i - s + 0.5) * step;
  const hitIdx = view.hover >= s && view.hover < e ? view.hover : e - 1;
  const d = data[hitIdx] || data[e - 1];
  const prevC = hitIdx > 0 ? data[hitIdx - 1].c : d.o;
  const chgPct = prevC ? ((d.c - prevC) / prevC) * 100 : 0;

  const totalH = H - padT - padB;
  const gap = 7;
  const pMain = { y: padT, h: totalH * 0.56 - gap };
  const pVol = { y: pMain.y + pMain.h + gap, h: Math.max(26, totalH * 0.13) };
  const pRsi = { y: pVol.y + pVol.h + gap, h: Math.max(26, totalH * 0.12) };
  const pMacd = { y: pRsi.y + pRsi.h + gap, h: Math.max(30, H - padB - (pRsi.y + pRsi.h + gap)) };

  ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.textBaseline = "middle";

  const axisLabel = (yy, txt, color) => {
    ctx.fillStyle = color || P.muted; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(txt, padL + plotW + 5, yy);
  };
  const frame = (p, lo, hi, ticks, opt = {}) => {
    ctx.strokeStyle = P.border; ctx.lineWidth = 1;
    ctx.strokeRect(padL + 0.5, p.y + 0.5, plotW, Math.max(1, p.h - 1));
    for (let k = 0; k < ticks; k++) {
      const v = lo + ((hi - lo) * k) / (ticks - 1);
      const yy = p.y + p.h - ((v - lo) / (hi - lo || 1)) * p.h;
      if (k > 0 && k < ticks - 1) {
        ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke(); ctx.globalAlpha = 1;
      }
      const ty = Math.max(p.y + 7, Math.min(p.y + p.h - 7, yy));   // 標籤限制在面板內，避免跨面板重疊
      axisLabel(ty, (opt.fmt || nice)(v));
    }
    if (opt.title) { ctx.fillStyle = P.muted; ctx.textAlign = "left"; ctx.fillText(opt.title, padL + 5, p.y + 9); }
    return (v) => p.y + p.h - ((v - lo) / (hi - lo || 1)) * p.h;
  };
  const line = (arr, y, color, lw = 1.4) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); let started = false;
    for (let i = s; i < e; i++) {
      const v = arr[i]; if (v == null) continue;
      const px = xOf(i), py = y(v);
      if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  // ── 主圖 ──
  let lo = Infinity, hi = -Infinity;
  for (let i = s; i < e; i++) { if (data[i].l < lo) lo = data[i].l; if (data[i].h > hi) hi = data[i].h; }
  for (const key of ["ma5", "ma20", "ma60"]) for (let i = s; i < e; i++) { const v = data[i][key]; if (v == null) continue; if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.08 || hi * 0.01; lo -= pad; hi += pad;
  const y0 = frame(pMain, lo, hi, 6);
  for (let i = s; i < e; i++) {
    const dd = data[i], col = dd.c >= dd.o ? P.up : P.down;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xOf(i), y0(dd.h)); ctx.lineTo(xOf(i), y0(dd.l)); ctx.stroke();
    const top = y0(Math.max(dd.o, dd.c)), bh = Math.max(1, Math.abs(y0(dd.o) - y0(dd.c)));
    ctx.fillRect(xOf(i) - bw / 2, top, bw, bh);
  }
  line(data.map((x) => x.ma5), y0, P.warn); line(data.map((x) => x.ma20), y0, P.blue); line(data.map((x) => x.ma60), y0, P.pink);

  // ── 成交量 ──
  let vmax = 0; for (let i = s; i < e; i++) vmax = Math.max(vmax, data[i].v || 0);
  const y1 = frame(pVol, 0, vmax || 1, 2, { title: "成交量", fmt: (v) => (v >= 1e8 ? (v / 1e8).toFixed(2) + "億" : v >= 1e4 ? Math.round(v / 1000) + "張" : Math.round(v)) });
  for (let i = s; i < e; i++) {
    const dd = data[i]; ctx.fillStyle = dd.c >= dd.o ? P.up : P.down; ctx.globalAlpha = 0.7;
    const yy = y1(dd.v || 0); ctx.fillRect(xOf(i) - bw / 2, yy, bw, Math.max(1, pVol.y + pVol.h - yy)); ctx.globalAlpha = 1;
  }

  // ── RSI ──
  const y2 = frame(pRsi, 0, 100, 2, { title: "RSI(14)" });
  ctx.setLineDash([3, 3]); ctx.strokeStyle = P.muted; ctx.globalAlpha = 0.7;
  [30, 70].forEach((v) => { ctx.beginPath(); ctx.moveTo(padL, y2(v)); ctx.lineTo(padL + plotW, y2(v)); ctx.stroke(); });
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  line(data.map((x) => x.rsi), y2, P.primary);

  // ── MACD ──
  let m = 1e-9; for (let i = s; i < e; i++) m = Math.max(m, Math.abs(data[i].dif || 0), Math.abs(data[i].dea || 0), Math.abs(data[i].hist || 0));
  const y3 = frame(pMacd, -m * 1.1, m * 1.1, 2, { title: "MACD(12,26,9)" });
  for (let i = s; i < e; i++) {
    const dd = data[i]; ctx.fillStyle = dd.hist >= 0 ? P.up : P.down; ctx.globalAlpha = 0.75;
    const yy = y3(dd.hist), z = y3(0);
    ctx.fillRect(xOf(i) - bw / 2, Math.min(yy, z), bw, Math.max(1, Math.abs(yy - z))); ctx.globalAlpha = 1;
  }
  line(data.map((x) => x.dif), y3, P.blue, 1.2); line(data.map((x) => x.dea), y3, P.warn, 1.2);

  // ── 時間軸 ──
  const dstr = (t) => {
    if (!t && t !== 0) return "";
    const dt = new Date(Number(t) * 1000);
    if (isNaN(dt.getTime())) return String(t).slice(5, 10);
    return `${dt.getMonth() + 1}/${String(dt.getDate()).padStart(2, "0")}`;
  };
  ctx.fillStyle = P.muted;
  const tickN = Math.max(3, Math.min(7, Math.floor(plotW / 96)));
  for (let k = 0; k < tickN; k++) {
    const i = s + Math.round(((cnt - 1) * k) / (tickN - 1));
    const tx = xOf(i);
    ctx.textAlign = k === 0 ? "left" : k === tickN - 1 ? "right" : "center";
    const adj = k === 0 ? -4 : k === tickN - 1 ? 4 : 0;
    ctx.fillText(dstr(data[i].t), tx + adj, H - padB / 2 + 1);
  }

  // ── 頂部資訊列 ──
  const dcol = d.c >= d.o ? P.up : P.down;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = "11px ui-monospace, Menlo, monospace";
  const dt = new Date(Number(d.t) * 1000);
  const dlabel = isNaN(dt.getTime()) ? String(d.t) : `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
  let cx = padL + 2;
  const seg = (txt, color) => { ctx.fillStyle = color; ctx.fillText(txt, cx, padT / 2 + 1); cx += ctx.measureText(txt).width + 10; };
  seg(dlabel, P.fg);
  seg("開 " + nice(d.o), P.muted); seg("高 " + nice(d.h), P.muted); seg("低 " + nice(d.l), P.muted);
  seg("收 " + nice(d.c), dcol);
  seg((chgPct >= 0 ? "+" : "") + chgPct.toFixed(2) + "%", dcol);
  seg("量 " + fmtVol(d.v), P.muted);

  // ── 十字線 ──
  if (view.hover >= s && view.hover < e) {
    const hx = xOf(view.hover), hy = y0(d.c);
    ctx.strokeStyle = P.fg; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, H - padB); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, hy); ctx.lineTo(padL + plotW, hy); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // 右軸價格標籤
    const tag = nice(d.c), tw = ctx.measureText(tag).width + 8;
    ctx.fillStyle = "#1b1e23"; ctx.fillRect(padL + plotW + 1, hy - 9, tw, 18);
    ctx.strokeStyle = P.warn; ctx.strokeRect(padL + plotW + 1, hy - 9, tw, 18);
    ctx.fillStyle = P.warn; ctx.textAlign = "left"; ctx.fillText(tag, padL + plotW + 5, hy);
    // 底部日期標籤
    const dtag = dstr(d.t), dw = ctx.measureText(dtag).width + 8;
    ctx.fillStyle = "#1b1e23"; ctx.fillRect(hx - dw / 2, H - padB + 1, dw, padB - 2);
    ctx.strokeStyle = P.warn; ctx.strokeRect(hx - dw / 2, H - padB + 1, dw, padB - 2);
    ctx.fillStyle = P.warn; ctx.textAlign = "center"; ctx.fillText(dtag, hx, H - padB / 2 + 1);
  }

  return {
    count: n, start: s, end: e,
    indexAt: (clientX) => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, s + Math.floor((clientX - r.left - padL) / step))); },
    spanAt: (clientX) => { const r = canvas.getBoundingClientRect(); return (clientX - r.left - padL) / step; },
  };
}

const fmtVol = (v) => (v == null ? "—" : v >= 1e8 ? (v / 1e8).toFixed(2) + "億" : v >= 1e4 ? Math.round(v / 1000) + "張" : Math.round(v));

/**
 * 折線圖（指數／期貨走勢）：十字線、右軸價格、時間軸。points = [[t, price], ...]
 */
export function drawLineChart(canvas, points, view = {}, cssH = 260, opt = {}) {
  const P = palette();
  const H = cssH;
  const { ctx, w } = setup(canvas, H);
  const n = points.length;
  if (n < 2) { ctx.fillStyle = P.muted; ctx.font = "13px sans-serif"; ctx.fillText("走勢資料不足", 12, H / 2); return { count: n, indexAt: () => 0 }; }
  const padL = 8, padR = 56, padT = 18, padB = 16;
  const plotW = w - padL - padR, plotH = H - padT - padB;
  const min = Math.min(...points.map((p) => p[1])), max = Math.max(...points.map((p) => p[1]));
  const lo = min - (max - min) * 0.08 || min * 0.99, hi = max + (max - min) * 0.08 || max * 1.01;
  const y = (v) => padT + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const up = points[n - 1][1] >= points[0][1];
  const col = up ? P.up : P.down;

  ctx.strokeStyle = P.border; ctx.lineWidth = 1;
  ctx.strokeRect(padL + 0.5, padT + 0.5, plotW, plotH - 1);
  ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.textBaseline = "middle"; ctx.fillStyle = P.muted;
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, yy = y(v);
    if (k > 0 && k < 4) { ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.textAlign = "left"; ctx.fillText(nice(v), padL + plotW + 5, yy);
  }
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, up ? "rgba(232,90,90,.18)" : "rgba(46,190,140,.18)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath(); ctx.moveTo(x(0), y(points[0][1]));
  points.forEach((p, i) => ctx.lineTo(x(i), y(p[1])));
  const lastX = x(n - 1), base = y(lo);
  ctx.lineTo(lastX, base); ctx.lineTo(x(0), base); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(x(0), y(points[0][1]));
  points.forEach((p, i) => ctx.lineTo(x(i), y(p[1])));
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();

  // 時間軸
  const tickN = Math.max(3, Math.min(6, Math.floor(plotW / 110)));
  ctx.fillStyle = P.muted;
  const dstr = (t) => {
    const dt = new Date(Number(t) * 1000);
    if (isNaN(dt.getTime()) || Number(t) < 1e9) return String(t);
    return opt.intraday ? `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}` : `${dt.getMonth() + 1}/${dt.getDate()}`;
  };
  for (let k = 0; k < tickN; k++) {
    const i = Math.round(((n - 1) * k) / (tickN - 1));
    const tx = x(i);
    ctx.textAlign = k === 0 ? "left" : k === tickN - 1 ? "right" : "center";
    ctx.fillText(dstr(points[i][0]), tx + (k === 0 ? -4 : k === tickN - 1 ? 4 : 0), H - padB / 2 + 1);
  }

  // 十字線
  if (view.hover >= 0 && view.hover < n) {
    const hx = x(view.hover), hy = y(points[view.hover][1]);
    ctx.strokeStyle = P.fg; ctx.globalAlpha = 0.5; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + plotH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(padL, hy); ctx.lineTo(padL + plotW, hy); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    const tag = nice(points[view.hover][1]), tw = ctx.measureText(tag).width + 8;
    ctx.fillStyle = "#1b1e23"; ctx.fillRect(padL + plotW + 1, hy - 9, tw, 18);
    ctx.strokeStyle = P.warn; ctx.strokeRect(padL + plotW + 1, hy - 9, tw, 18);
    ctx.fillStyle = P.warn; ctx.textAlign = "left"; ctx.fillText(tag, padL + plotW + 5, hy);
    const dtag = dstr(points[view.hover][0]), dw = ctx.measureText(dtag).width + 8;
    ctx.fillStyle = "#1b1e23"; ctx.fillRect(hx - dw / 2, H - padB + 1, dw, padB - 2);
    ctx.strokeStyle = P.warn; ctx.strokeRect(hx - dw / 2, H - padB + 1, dw, padB - 2);
    ctx.fillStyle = P.warn; ctx.textAlign = "center"; ctx.fillText(dtag, hx, H - padB / 2 + 1);
  }

  return { count: n, indexAt: (clientX) => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left - padL) / plotW) * (n - 1)))); } };
}

/** 甜甜圈圖。items: [{label, value, color}] */
export function drawDonut(canvas, items) {
  const { ctx, w, h } = setup(canvas, 170);
  const P = palette(), total = items.reduce((s, i) => s + i.value, 0);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 6, r = R * 0.62;
  if (!total) { ctx.strokeStyle = P.border; ctx.lineWidth = R - r; ctx.beginPath(); ctx.arc(cx, cy, (R + r) / 2, 0, Math.PI * 2); ctx.stroke(); return; }
  let a = -Math.PI / 2;
  items.forEach((it) => {
    const da = (it.value / total) * Math.PI * 2;
    ctx.fillStyle = it.color; ctx.beginPath(); ctx.arc(cx, cy, R, a, a + da); ctx.arc(cx, cy, r, a + da, a, true); ctx.closePath(); ctx.fill();
    a += da;
  });
}
