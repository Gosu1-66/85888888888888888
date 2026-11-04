// 持股計算：交易紀錄 → 持股部位（加權平均成本法）。純函式，不碰 DOM / localStorage。

export const MARKETS = ["台股", "美股", "加密貨幣"];
export const currencyOf = (market) => (market === "台股" ? "TWD" : "USD");
export const keyOf = (market, symbol) => `${market}:${String(symbol).trim().toUpperCase()}`;

/** 以加權平均成本法計算部位。賣出依平均成本扣除投入成本，差額計入已實現損益。 */
export function computePosition(trades) {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let shares = 0, cost = 0, realized = 0;
  for (const t of sorted) {
    if (t.type === "buy") {
      shares += t.qty;
      cost += t.qty * t.price + t.fee;
    } else {
      if (t.qty > shares + 1e-9) throw new Error(`賣出數量 ${t.qty} 超過當時持有 ${shares}`);
      const avg = shares ? cost / shares : 0;
      realized += t.qty * t.price - t.fee - avg * t.qty;
      cost -= avg * t.qty;
      shares -= t.qty;
      if (shares < 1e-9) { shares = 0; cost = 0; }
    }
  }
  return { shares, cost, avgCost: shares ? cost / shares : 0, realized };
}

/** 檢查交易組合是否仍合法（不會賣超）。合法回傳 null，否則回傳錯誤訊息。 */
export function validateTrades(trades) {
  try { computePosition(trades); return null; } catch (e) { return e.message; }
}

export function toHoldings(data) {
  return data.assets.map((a) => {
    const p = computePosition(data.trades.filter((t) => t.assetId === a.id));
    return { ...a, currency: currencyOf(a.market), shares: p.shares, avgCost: p.avgCost, realized: p.realized };
  });
}

export const toTWD = (currency, amount, fx) => (currency === "TWD" ? amount : amount * fx);

/** 單一持股的損益。quote 可為 null（沒有報價時以成本價計，並標示 hasQuote=false）。 */
export function holdingStats(h, quote, fx) {
  const hasQuote = !!quote;
  const price = hasQuote ? quote.price : h.avgCost;
  const cost = toTWD(h.currency, h.shares * h.avgCost, fx);
  const value = toTWD(h.currency, h.shares * price, fx);
  const pnl = value - cost;
  return { price, hasQuote, cost, value, pnl, ret: cost ? (pnl / cost) * 100 : 0, realized: toTWD(h.currency, h.realized, fx) };
}

export function portfolioStats(holdings, quoteOf, fx) {
  const rows = holdings.filter((h) => h.shares > 0).map((h) => holdingStats(h, quoteOf(h), fx));
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const value = rows.reduce((s, r) => s + r.value, 0);
  const pnl = value - cost;
  const realized = holdings.reduce((s, h) => s + toTWD(h.currency, h.realized, fx), 0);
  return { cost, value, pnl, ret: cost ? (pnl / cost) * 100 : 0, realized, missing: rows.filter((r) => !r.hasQuote).length };
}
