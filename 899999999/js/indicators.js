// 技術指標。輸入為收盤價陣列，輸出與輸入等長（算不出來的位置為 null）。

export function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i];
    if (i >= n) sum -= v[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function ema(v, n) {
  const k = 2 / (n + 1);
  const out = [];
  v.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
}

/** RSI（Wilder 平滑法，與一般看盤軟體一致） */
export function rsi(v, n = 14) {
  const out = new Array(v.length).fill(null);
  if (v.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  const val = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[n] = val();
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    gain = (gain * (n - 1) + (d > 0 ? d : 0)) / n;
    loss = (loss * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = val();
  }
  return out;
}

/** MACD(12,26,9) */
export function macd(v) {
  const e12 = ema(v, 12), e26 = ema(v, 26);
  const dif = v.map((_, i) => e12[i] - e26[i]);
  const dea = ema(dif, 9);
  return dif.map((d, i) => ({ dif: d, dea: dea[i], hist: d - dea[i] }));
}

/** 一次算完圖表需要的全部指標 */
export function buildSeries(candles) {
  const closes = candles.map((c) => c.c);
  const m5 = sma(closes, 5), m20 = sma(closes, 20), m60 = sma(closes, 60);
  const r = rsi(closes), md = macd(closes);
  return candles.map((c, i) => ({ ...c, ma5: m5[i], ma20: m20[i], ma60: m60[i], rsi: r[i], ...md[i] }));
}
