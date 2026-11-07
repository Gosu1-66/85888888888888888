// kline.js — 以 TradingView Lightweight Charts（Apache 2.0）繪製 K 線與指數折線。
// 全域由 index.html 載入的 lightweight-charts.standalone.production.js 提供 window.LightweightCharts。

const LWC = () => window.LightweightCharts || null;

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartColors() {
  // 漲跌配色跟隨全站設定（html[data-updown]），台股預設紅漲綠跌
  const up = cssVar("--up", "#e5484d");
  const down = cssVar("--down", "#22c55e");
  return { up, down };
}

// 時間可能是 unix 秒、"YYYY-MM-DD" 字串或 {year,month,day}；不用 new Date("YYYY-MM-DD HH:mm")（Safari 會 Invalid Date）
function toDate(t) {
  let d = null;
  if (typeof t === "number") d = new Date(t * 1000);
  else if (typeof t === "string") {
    const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(t);
  } else if (t && typeof t === "object" && t.year) d = new Date(t.year, t.month - 1, t.day);
  return d && !isNaN(d.getTime()) ? d : null;
}

function baseOptions(width, height, opts = {}) {
  return {
    width,
    height,
    layout: {
      background: { type: "solid", color: opts.bg || "#0e1319" },
      textColor: "#8b939e",
      fontSize: 11,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,.05)" },
      horzLines: { color: "rgba(255,255,255,.05)" },
    },
    rightPriceScale: {
      borderColor: "rgba(255,255,255,.10)",
      scaleMargins: { top: 0.06, bottom: 0.06 },
    },
    timeScale: {
      borderColor: "rgba(255,255,255,.10)",
      rightOffset: 3,
      barSpacing: 7,
      minBarSpacing: 1.5,
      fixLeftEdge: false,
      timeVisible: false,
      secondsVisible: false,
      // tickMarkType：0 年、1 月、2 日、3 時間。分時遇到換日顯示「月/日」，其餘顯示「時:分」，避免整排都是 08:00
      tickMarkFormatter: (t, type) => {
        const d = toDate(t);
        if (!d) return "";
        const md = `${d.getMonth() + 1}/${d.getDate()}`;
        if (type === 0) return String(d.getFullYear());
        if (!opts.intraday || type <= 2) return md;
        return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      },
    },
    crosshair: {
      mode: opts.crosshairMode ?? 1, // CrosshairMode.Magnet = 1
      vertLine: { color: "rgba(255,255,255,.35)", width: 1, style: 2, labelBackgroundColor: "#1b2330" },
      horzLine: { color: "rgba(255,255,255,.35)", width: 1, style: 2, labelBackgroundColor: "#1b2330" },
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    localization: {
      locale: "zh-TW",
      timeFormatter: (t) => {
        const d = toDate(t);
        if (!d) return "";
        const md = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        return opts.intraday ? `${md} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : md;
      },
    },
    watermark: { visible: false },
  };
}

/* ── 個股 K 線（主圖 + 量 + RSI/MACD 副圖，時間軸連動） ── */
export function mountCandle(mainEl, subEl, candles, opts = {}) {
  const lib = LWC();
  if (!lib || !mainEl || !candles || !candles.length) return null;
  const { up, down } = chartColors();
  const bars = candles.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c }));
  const barsSpacing = opts.intraday ? 4 : 7;
  const hMain = opts.mainHeight || 300;
  const hSub = opts.subHeight || 150;

  const mainOpts = baseOptions(mainEl.clientWidth || 320, hMain, opts);
  mainOpts.timeScale.barSpacing = barsSpacing;

  const main = lib.createChart(mainEl, mainOpts);
  const subOpts = baseOptions(subEl.clientWidth || 320, hSub, opts);
  subOpts.timeScale.barSpacing = barsSpacing;
  subOpts.timeScale.visible = false;   // 時間軸只保留在主圖，避免兩條重複
  subOpts.rightPriceScale = { borderColor: "rgba(255,255,255,.10)", scaleMargins: { top: 0.04, bottom: 0.04 } };
  const sub = lib.createChart(subEl, subOpts);

  const candle = main.addCandlestickSeries({
    upColor: up, downColor: down, borderVisible: false,
    wickUpColor: up, wickDownColor: down,
    priceLineVisible: false, lastValueVisible: true,
  });
  candle.setData(bars);

  const vol = main.addHistogramSeries({
    priceScaleId: "vol",
    priceFormat: { type: "volume" },
    lastValueVisible: false, priceLineVisible: false,
  });
  vol.setData(candles.map((c) => ({
    time: c.t, value: c.v,
    color: (c.c >= c.o ? up : down) + "66",
  })));
  main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

  const maLine = (period, color) => {
    const s = main.addLineSeries({
      color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    const out = [];
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].c;
      if (i >= period) sum -= candles[i - period].c;
      if (i >= period - 1) out.push({ time: candles[i].t, value: sum / period });
    }
    s.setData(out);
    return s;
  };
  const ma5 = maLine(5, "#f0b90b");
  const ma20 = maLine(20, "#4f9cf9");
  const ma60 = maLine(60, "#d16bff");

  // 副圖：RSI 上、MACD 下
  const rsiSeries = sub.addLineSeries({ color: "#e0c060", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: "rsi" });
  const rsiData = [];
  let gain = 0, loss = 0;
  for (let i = 1; i < candles.length; i++) {
    const ch = candles[i].c - candles[i - 1].c;
    const g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= 14) { gain += g; loss += l; }
    else { gain = (gain * 13 + g) / 14; loss = (loss * 13 + l) / 14; }
    if (i >= 14) rsiData.push({ time: candles[i].t, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  }
  rsiSeries.setData(rsiData);
  sub.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.02, bottom: 0.5 } });

  const difSeries = sub.addLineSeries({ color: "#4f9cf9", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: "macd" });
  const deaSeries = sub.addLineSeries({ color: "#f0b90b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceScaleId: "macd" });
  const histSeries = sub.addHistogramSeries({ priceScaleId: "macd", priceLineVisible: false, lastValueVisible: false, base: 0 });
  const ema = (arr, n) => { const k = 2 / (n + 1); let e = arr[0]; return arr.map((v, i) => (i === 0 ? (e = v) : (e = v * k + e * (1 - k)))); };
  const closes = candles.map((c) => c.c);
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const difArr = closes.map((_, i) => e12[i] - e26[i]);
  const deaArr = ema(difArr, 9);
  difSeries.setData(candles.map((c, i) => ({ time: c.t, value: difArr[i] })));
  deaSeries.setData(candles.map((c, i) => ({ time: c.t, value: deaArr[i] })));
  histSeries.setData(candles.map((c, i) => ({ time: c.t, value: difArr[i] - deaArr[i], color: difArr[i] >= deaArr[i] ? up + "88" : down + "88" })));
  sub.priceScale("macd").applyOptions({ scaleMargins: { top: 0.52, bottom: 0.02 } });

  // 時間軸連動
  let syncing = false;
  const link = (from, to) => {
    from.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (!r || syncing) return;
      syncing = true;
      try { to.timeScale().setVisibleLogicalRange(r); } catch (e) { /* ignore */ }
      syncing = false;
    });
  };
  link(main, sub);
  link(sub, main);

  // 十字線 → 外部資訊列
  if (opts.onHover) {
    const handler = (param) => {
      const d = param.seriesData ? param.seriesData.get(candle) : null;
      opts.onHover(d || null, param.time || null, param.point || null);
    };
    main.subscribeCrosshairMove(handler);
    mainEl.addEventListener("mouseleave", () => opts.onHover(null, null, null));
    mainEl.addEventListener("touchend", () => opts.onHover(null, null, null));
  }

  const kick = (force) => {
    if (!mainEl.isConnected) return;
    const w1 = mainEl.clientWidth;
    const w2 = subEl.clientWidth;
    if (w1 > 0) main.resize(w1, hMain, !!force);
    if (w2 > 0) sub.resize(w2, hSub, !!force);
  };

  const setBars = (n) => {
    const total = bars.length;
    const cnt = Math.max(5, Math.min(total, n));
    main.timeScale().setVisibleLogicalRange({ from: total - cnt, to: total - 1 });
    kick(true);
  };
  setBars(opts.range || 126);

  // 指標開關（只作用在自己的 Lightweight Charts 圖）
  const indState = { ma: true, vol: true, rsi: true, macd: true, ...(opts.indicators || {}) };
  const applyIndicators = (next) => {
    Object.assign(indState, next || {});
    for (const s of [ma5, ma20, ma60]) s.applyOptions({ visible: indState.ma });
    vol.applyOptions({ visible: indState.vol });
    rsiSeries.applyOptions({ visible: indState.rsi });
    for (const s of [difSeries, deaSeries, histSeries]) s.applyOptions({ visible: indState.macd });
    // 副圖：RSI 與 MACD 都關掉就整塊隱藏，不留空白框；只開一個就讓它佔滿副圖
    const anySub = indState.rsi || indState.macd;
    subEl.style.display = anySub ? "" : "none";
    if (indState.rsi && indState.macd) {
      sub.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.02, bottom: 0.5 } });
      sub.priceScale("macd").applyOptions({ scaleMargins: { top: 0.52, bottom: 0.02 } });
    } else {
      sub.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.04, bottom: 0.04 } });
      sub.priceScale("macd").applyOptions({ scaleMargins: { top: 0.04, bottom: 0.04 } });
    }
    if (anySub) requestAnimationFrame(() => kick(true));
  };
  applyIndicators();

  const ro = new ResizeObserver(() => {
    const w1 = mainEl.clientWidth;
    if (w1 > 0) main.resize(w1, hMain);
    const w2 = subEl.clientWidth;
    if (w2 > 0) sub.resize(w2, hSub);
  });
  ro.observe(mainEl);
  ro.observe(subEl);

  // 首次掛載時容器尺寸可能尚未穩定（clientWidth 為 0 後才變寬），LWC 有時不會自動重繪，
  // 這裡再主動 resize 並強制重繪一次，避免圖表區只剩空白。
  requestAnimationFrame(() => kick(false));
  setTimeout(() => kick(true), 60);
  setTimeout(() => kick(true), 220);

  return {
    setBars,
    setIndicators: applyIndicators,
    destroy() { ro.disconnect(); main.remove(); sub.remove(); },
    mainChart: main,
  };
}

/* ── 指數折線（無 K 線資料時） ── */
export function mountLine(el, points, opts = {}) {
  const lib = LWC();
  if (!lib || !el || !points || points.length < 2) return null;
  const { up, down } = chartColors();
  const rising = points[points.length - 1][1] >= points[0][1];
  const color = rising ? up : down;
  const chart = lib.createChart(el, { ...baseOptions(el.clientWidth || 320, opts.height || 260, opts) });
  const area = chart.addAreaSeries({
    lineColor: color, lineWidth: 2,
    topColor: color + "33", bottomColor: color + "03",
    priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: true,
  });
  area.setData(points.map(([t, v]) => ({ time: t, value: v })));
  if (opts.range) {
    const total = points.length;
    const cnt = Math.max(5, Math.min(total, opts.range));
    chart.timeScale().setVisibleLogicalRange({ from: total - cnt, to: total - 1 });
  }
  if (opts.onHover) {
    chart.subscribeCrosshairMove((param) => {
      const d = param.seriesData ? param.seriesData.get(area) : null;
      opts.onHover(d || null, param.time || null);
    });
    el.addEventListener("mouseleave", () => opts.onHover(null, null));
  }
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    if (w > 0) chart.applyOptions({ width: w });
  });
  ro.observe(el);
  return {
    setBars(n) {
      const total = points.length;
      const cnt = Math.max(5, Math.min(total, n));
      chart.timeScale().setVisibleLogicalRange({ from: total - cnt, to: total - 1 });
    },
    destroy() { ro.disconnect(); chart.remove(); },
  };
}
