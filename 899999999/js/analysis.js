// 規則式分析解讀：依固定規則把技術指標轉成文字。不是 AI 模型，也不是投資建議。

const f2 = (n) => (Math.abs(n) >= 100 ? n.toFixed(1) : n.toFixed(2));

export function analyze(series) {
  if (!series || series.length < 30) return null;
  const n = series.length;
  const last = series[n - 1], prev = series[n - 2];
  const closes = series.map((s) => s.c);
  let score = 0;
  const trend = [], indicator = [], risk = [];

  // —— 趨勢 ——
  if (last.ma20 != null) {
    if (last.c > last.ma20) { score++; trend.push(`收盤價 ${f2(last.c)} 在 20 日均線（${f2(last.ma20)}）之上，短中期偏強。`); }
    else { score--; trend.push(`收盤價 ${f2(last.c)} 跌破 20 日均線（${f2(last.ma20)}），短中期偏弱。`); }
  }
  if (last.ma5 != null && last.ma20 != null && last.ma60 != null) {
    if (last.ma5 > last.ma20 && last.ma20 > last.ma60) { score++; trend.push("5 日 > 20 日 > 60 日均線，呈多頭排列。"); }
    else if (last.ma5 < last.ma20 && last.ma20 < last.ma60) { score--; trend.push("5 日 < 20 日 < 60 日均線，呈空頭排列。"); }
    else trend.push("三條均線互相糾結，趨勢尚不明確。");
  }
  const back = series[Math.max(0, n - 21)];
  const chg20 = ((last.c - back.c) / back.c) * 100;
  trend.push(`近 20 個交易日漲跌幅 ${chg20 >= 0 ? "+" : ""}${chg20.toFixed(1)}%。`);

  // —— 指標 ——
  if (last.rsi != null) {
    if (last.rsi >= 70) { score -= 0.5; indicator.push(`RSI ${last.rsi.toFixed(0)}，進入超買區（≥70），短線追高風險較大。`); }
    else if (last.rsi <= 30) { score += 0.5; indicator.push(`RSI ${last.rsi.toFixed(0)}，進入超賣區（≤30），可能出現反彈，但弱勢股也可能持續鈍化。`); }
    else indicator.push(`RSI ${last.rsi.toFixed(0)}，位於中性區間（30–70）。`);
  }
  if (last.hist != null && prev.hist != null) {
    const crossedUp = prev.dif <= prev.dea && last.dif > last.dea;
    const crossedDown = prev.dif >= prev.dea && last.dif < last.dea;
    if (crossedUp) { score++; indicator.push("MACD 的 DIF 剛向上穿越 DEA（黃金交叉），動能轉強。"); }
    else if (crossedDown) { score--; indicator.push("MACD 的 DIF 剛向下穿越 DEA（死亡交叉），動能轉弱。"); }
    else if (last.hist > 0) { indicator.push(`MACD 柱狀體為正（${last.hist.toFixed(2)}），多方動能仍在。`); if (last.hist > prev.hist) score += 0.5; }
    else { indicator.push(`MACD 柱狀體為負（${last.hist.toFixed(2)}），空方動能仍在。`); if (last.hist < prev.hist) score -= 0.5; }
  }

  // —— 風險 ——
  const rets = [];
  for (let i = Math.max(1, n - 20); i < n; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const dailyVol = sd * 100;
  risk.push(`近 20 日平均單日波動約 ${dailyVol.toFixed(2)}%（${dailyVol >= 3 ? "波動偏大" : dailyVol >= 1.5 ? "波動中等" : "波動較小"}）。`);
  let peak = closes[0], mdd = 0;
  for (const c of closes) { peak = Math.max(peak, c); mdd = Math.min(mdd, (c - peak) / peak); }
  risk.push(`圖表期間內最大回檔約 ${(mdd * 100).toFixed(1)}%。`);
  const hi = Math.max(...series.slice(-60).map((s) => s.h)), lo = Math.min(...series.slice(-60).map((s) => s.l));
  const pos = hi === lo ? 50 : ((last.c - lo) / (hi - lo)) * 100;
  risk.push(`目前價格位於近 60 日區間（${f2(lo)}–${f2(hi)}）的 ${pos.toFixed(0)}% 位置。`);

  const label = score >= 1.5 ? "偏多" : score <= -1.5 ? "偏空" : "中性";
  return { label, score, trend, indicator, risk, volatility: dailyVol, asOf: last.t };
}
