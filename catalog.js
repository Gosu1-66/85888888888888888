import { keyOf } from "./portfolio.js";

// 內建常見標的（可在「市場行情」自行新增其他代號）
export const CATALOG = [
  ["台股", "2330", "台積電"], ["台股", "2317", "鴻海"], ["台股", "2454", "聯發科"], ["台股", "0050", "元大台灣50"],
  ["台股", "2881", "富邦金"], ["台股", "2882", "國泰金"], ["台股", "2891", "中信金"], ["台股", "2603", "長榮"],
  ["台股", "2412", "中華電"], ["台股", "2308", "台達電"], ["台股", "2303", "聯電"], ["台股", "0056", "元大高股息"],
  ["台股", "00878", "國泰永續高股息"], ["台股", "1301", "台塑"],
  ["美股", "AAPL", "蘋果"], ["美股", "NVDA", "輝達"], ["美股", "MSFT", "微軟"], ["美股", "TSLA", "特斯拉"],
  ["美股", "GOOGL", "Google"], ["美股", "AMZN", "亞馬遜"], ["美股", "META", "Meta"], ["美股", "AMD", "超微"],
  ["美股", "TSM", "台積電 ADR"], ["美股", "VOO", "Vanguard S&P 500"], ["美股", "QQQ", "納斯達克100 ETF"], ["美股", "SPY", "標普500 ETF"],
  ["加密貨幣", "BTC", "比特幣"], ["加密貨幣", "ETH", "以太幣"], ["加密貨幣", "SOL", "Solana"], ["加密貨幣", "BNB", "幣安幣"],
  ["加密貨幣", "XRP", "瑞波幣"], ["加密貨幣", "DOGE", "狗狗幣"], ["加密貨幣", "ADA", "艾達幣"],
].map(([market, symbol, name]) => ({ market, symbol, name, key: keyOf(market, symbol) }));

/** 全部可選標的 = 內建 + 自訂 + 已持有（依 key 去重） */
export function universe(settings, data) {
  const map = new Map();
  const add = (x) => { const key = keyOf(x.market, x.symbol); if (!map.has(key)) map.set(key, { market: x.market, symbol: String(x.symbol).toUpperCase(), name: x.name || x.symbol, key }); };
  CATALOG.forEach(add);
  (settings.custom || []).forEach(add);
  (data.assets || []).forEach(add);
  return [...map.values()];
}
