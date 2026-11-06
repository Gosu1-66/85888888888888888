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
 * 技術分析圖：K 線 + 均線 / 成交量 / RSI / MACD。回傳 { redraw(hoverIndex), count }。
 * data 為 buildSeries 的輸出；台灣慣例紅漲綠跌。
 */
export function drawTechnical(canvas, data, hover = -1, cssH = 540) {
  const P = palette();
  const H = cssH, k = cssH / 540;
  const { ctx, w } = setup(canvas, H);
  const padL = 6, padR = 52, n = data.length;
  const plotW = w - padL - padR, step = plotW / n, bodyW = Math.max(1, Math.min(10, step * 0.66));
  const x = (i) => padL + step * (i + 0.5);
  const panels = [{ y: 4 * k, h: 270 * k }, { y: 292 * k, h: 52 * k }, { y: 360 * k, h: 82 * k }, { y: 458 * k, h: 78 * k }];
  ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.textBaseline = "middle";

  const frame = (p, lo, hi, ticks) => {
    ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.fillStyle = P.muted; ctx.textAlign = "left";
    ctx.strokeRect(padL + 0.5, p.y + 0.5, plotW, p.h);
    for (let k = 0; k < ticks; k++) {
      const v = lo + ((hi - lo) * k) / (ticks - 1), yy = p.y + p.h - ((v - lo) / (hi - lo || 1)) * p.h;
      if (k > 0 && k < ticks - 1) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.textBaseline = k === 0 ? "bottom" : k === ticks - 1 ? "top" : "middle";
      ctx.fillText(nice(v), padL + plotW + 4, k === 0 ? yy + 1 : k === ticks - 1 ? yy - 1 : yy);
    }
    return (v) => p.y + p.h - ((v - lo) / (hi - lo || 1)) * p.h;
  };
  const line = (arr, y, color, lw = 1.4) => {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); let started = false;
    arr.forEach((v, i) => { if (v == null) return; const px = x(i), py = y(v); if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py); });
    ctx.stroke();
  };

  // 價格 + 均線
  const p0 = panels[0];
  let lo = Math.min(...data.map((d) => d.l)), hi = Math.max(...data.map((d) => d.h));
  const padv = (hi - lo) * 0.06 || hi * 0.01; lo -= padv; hi += padv;
  const y0 = frame(p0, lo, hi, 5);
  data.forEach((d, i) => {
    const col = d.c >= d.o ? P.up : P.down;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x(i), y0(d.h)); ctx.lineTo(x(i), y0(d.l)); ctx.stroke();
    const top = y0(Math.max(d.o, d.c)), bh = Math.max(1, Math.abs(y0(d.o) - y0(d.c)));
    ctx.fillRect(x(i) - bodyW / 2, top, bodyW, bh);
  });
  line(data.map((d) => d.ma5), y0, P.warn); line(data.map((d) => d.ma20), y0, P.blue); line(data.map((d) => d.ma60), y0, P.pink);

  // 成交量
  const p1 = panels[1], vmax = Math.max(...data.map((d) => d.v), 1);
  const y1 = frame(p1, 0, vmax, 2);
  data.forEach((d, i) => { ctx.fillStyle = d.c >= d.o ? P.up : P.down; ctx.globalAlpha = 0.7; const yy = y1(d.v); ctx.fillRect(x(i) - bodyW / 2, yy, bodyW, p1.y + p1.h - yy); ctx.globalAlpha = 1; });

  // RSI
  const p2 = panels[2], y2 = frame(p2, 0, 100, 3);
  ctx.setLineDash([3, 3]); ctx.strokeStyle = P.muted; [30, 70].forEach((v) => { ctx.beginPath(); ctx.moveTo(padL, y2(v)); ctx.lineTo(padL + plotW, y2(v)); ctx.stroke(); }); ctx.setLineDash([]);
  line(data.map((d) => d.rsi), y2, P.primary);

  // MACD
  const p3 = panels[3], m = Math.max(...data.map((d) => Math.max(Math.abs(d.dif), Math.abs(d.dea), Math.abs(d.hist))), 1e-9) * 1.1;
  const y3 = frame(p3, -m, m, 3);
  data.forEach((d, i) => { ctx.fillStyle = d.hist >= 0 ? P.up : P.down; ctx.globalAlpha = 0.75; const yy = y3(d.hist), z = y3(0); ctx.fillRect(x(i) - bodyW / 2, Math.min(yy, z), bodyW, Math.max(1, Math.abs(yy - z))); ctx.globalAlpha = 1; });
  line(data.map((d) => d.dif), y3, P.blue, 1.2); line(data.map((d) => d.dea), y3, P.warn, 1.2);

  // 分頁標籤
  ctx.fillStyle = P.muted; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("成交量", padL + 4, p1.y + 8); ctx.fillText("RSI(14)", padL + 4, p2.y + 8); ctx.fillText("MACD(12,26,9)", padL + 4, p3.y + 8);

  // 十字線
  if (hover >= 0 && hover < n) {
    ctx.strokeStyle = P.fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x(hover), 4); ctx.lineTo(x(hover), H - 4); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  return { count: n, indexAt: (clientX) => { const r = canvas.getBoundingClientRect(); return Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left - padL) / plotW) * n))); } };
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
