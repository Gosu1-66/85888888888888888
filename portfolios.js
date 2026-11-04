// portfolios.js — 投資組合頁（多組合總覽 + 單一組合明細）
// 純前端 ES module；紅漲綠跌（up=紅、down=綠）。
// 路由：#/portfolio ＝ 總覽；#/portfolio?p=<portfolioId> ＝ 單一組合。
// 全域 action：new-portfolio / submit-new-portfolio / del-portfolio / add-trade / edit-trade /
//              del-trade / del-asset / set-manual / clear-manual / submit-tf / close-sheet-btn
// 改動後派發 "portfolios:changed" 由 app.js 重新渲染。

import { $, esc, fmt, pct, tone, money, toast, openSheet, closeSheet,
         uid, today, badge, statusBanner, registerAction, parseRoute } from "./ui.js";
import { S, save, fxRate, fxSource, quoteOf, holdings } from "./state.js";
import { MARKETS, currencyOf, keyOf, computePosition, validateTrades,
         holdingStats, portfolioStats, toTWD } from "./portfolio.js";
import { universe } from "./catalog.js";
import { refreshQuotes } from "./quotes.js";
import { palette, drawDonut } from "./charts.js";

/* ───────── 小工具 ───────── */
const COLORS = () => { const P = palette(); return { 台股: P.primary, 美股: P.blue, 加密貨幣: P.warn }; };
const unitOf = (m) => (m === "加密貨幣" ? "顆" : "股");
const thisPid = () => parseRoute().params.get("p");
const portfolioById = (id) => S.data.portfolios.find((p) => p.id === id) || null;
const holdingsOf = (pid) => holdings().filter((h) => h.portfolioId === pid);

function ensureDefaultPortfolio() {
  let p = S.data.portfolios.find((x) => x.name === "預設投資組合");
  if (!p) { p = { id: uid(), name: "預設投資組合" }; S.data.portfolios.push(p); }
  return p;
}

/** 今年已實現損益（TWD）：各 asset「年初累計已實現」與「目前累計已實現」之差 */
function ytdRealized(fx) {
  const cut = `${new Date().getFullYear()}-01-01`;
  let ytd = 0;
  for (const a of S.data.assets) {
    const ts = S.data.trades.filter((t) => t.assetId === a.id);
    const before = ts.filter((t) => t.date < cut);
    const r0 = before.length ? computePosition(before).realized : 0;
    const r1 = computePosition(ts).realized;
    ytd += toTWD(a.market === "台股" ? "TWD" : "USD", r1 - r0, fx);
  }
  return ytd;
}

/* ───────── View：總覽 ───────── */
function viewList() {
  const fx = fxRate();
  const all = holdings();
  const s = portfolioStats(all, quoteOf, fx);
  const col = COLORS();
  const byMarket = MARKETS.map((m) => ({
    label: m, color: col[m],
    value: all.filter((h) => h.shares > 0 && h.market === m)
              .reduce((a, h) => a + holdingStats(h, quoteOf(h), fx).value, 0),
  })).filter((d) => d.value > 0);

  const rows = S.data.portfolios.map((p) => {
    const hs = holdingsOf(p.id);
    const st = portfolioStats(hs, quoteOf, fx);
    return { p, st, actives: hs.filter((h) => h.shares > 0).length };
  });
  const ytd = ytdRealized(fx);
  const thisYear = new Date().getFullYear();

  const stats = [
    ["總資產", `NT$ ${fmt(s.value)}`, ""],
    ["投入成本", `NT$ ${fmt(s.cost)}`, ""],
    ["未實現損益", `NT$ ${fmt(s.pnl)}`, tone(s.pnl)],
    ["報酬率", pct(s.ret), tone(s.ret)],
    ["已實現損益", `NT$ ${fmt(s.realized)}`, tone(s.realized)],
  ];

  return `<h1>投資組合</h1>
  <p class="sub">以新台幣計算 · 美元匯率 ${fx.toFixed(3)}（${fxSource()}）</p>
  ${statusBanner()}
  ${s.missing ? `<div class="banner">有 ${s.missing} 檔持股目前沒有報價，暫以成本價計算，損益可能不準。</div>` : ""}

  <div class="grid g4 g2" style="grid-template-columns:repeat(2,1fr)">
    ${stats.map(([l, v, c]) => `<div class="card stat" style="margin:0"><div class="label">${l}</div><div class="value num ${c}">${v}</div></div>`).join("")}
  </div>

  <div class="grid split" style="margin-top:12px">
    <div class="card" style="margin:0">
      <h2>資產配置（依市場）</h2>
      ${byMarket.length ? `<canvas id="donut"></canvas>
      <div class="list" style="margin-top:8px">
        ${byMarket.map((d) => `<div class="row small item" style="padding:6px 0">
          <span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${d.color};margin-right:8px"></i>${d.label}</span>
          <span class="num">${s.value ? ((d.value / s.value) * 100).toFixed(1) : 0}%</span>
        </div>`).join("")}
      </div>` : `<div class="empty small">尚無持股，新增交易後會自動長出配置圖。</div>`}
    </div>

    <div class="card" style="margin:0">
      <h2>績效追蹤</h2>
      <div class="list">
        ${rows.map(({ p, st, actives }) => `
          <a class="item row" style="text-decoration:none;color:inherit" href="#/portfolio?p=${encodeURIComponent(p.id)}">
            <div><div style="font-weight:600">${esc(p.name)}</div>
              <div class="small muted">${actives} 檔持股 · 成本 NT$ ${fmt(st.cost)}</div></div>
            <div class="right">
              <div class="num ${tone(st.pnl)}">${st.pnl >= 0 ? "+" : ""}${fmt(st.pnl)}</div>
              <div class="num small ${tone(st.ret)}">${pct(st.ret)}</div>
            </div>
          </a>`).join("") || '<div class="empty small">尚無組合</div>'}
        <div class="row small item" style="padding:8px 0">
          <span>今年（${thisYear}）已實現損益</span>
          <span class="num ${tone(ytd)}">${ytd >= 0 ? "+" : ""}NT$ ${fmt(ytd)}</span>
        </div>
      </div>
    </div>
  </div>

  <h2 style="margin-top:18px">我的組合</h2>
  <div class="grid g2 g3" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
    ${rows.map(({ p, st, actives }) => `
      <a class="card quote" style="margin:0;text-decoration:none;color:inherit" href="#/portfolio?p=${encodeURIComponent(p.id)}">
        <div class="row">
          <div><div style="font-weight:700">${esc(p.name)}</div>
            <div class="small muted">${actives} 檔持股</div></div>
          <div class="right">
            <div class="num" style="font-weight:700">NT$ ${fmt(st.value)}</div>
            <div class="num small ${tone(st.ret)}">${pct(st.ret)}</div>
          </div>
        </div>
      </a>`).join("")}
    <button class="card empty" style="margin:0;border-style:dashed;cursor:pointer" data-act="new-portfolio">
      <div style="font-size:28px;line-height:1">＋</div>
      <div class="small" style="margin-top:6px">新增組合</div>
    </button>
  </div>`;
}

/* ───────── View：單一組合 ───────── */
function assetRow(h) {
  const q = quoteOf(h), fx = fxRate(), r = holdingStats(h, q, fx);
  const id = h.id;
  const trades = S.data.trades.filter((t) => t.assetId === id).slice()
                              .sort((a, b) => b.date.localeCompare(a.date));
  const key = keyOf(h.market, h.symbol);
  const manual = S.set.manual?.[key];
  const u = unitOf(h.market);
  return `<details class="asset" data-id="${id}" ${S.open.has(id) ? "open" : ""}>
    <summary><div class="row">
      <div>
        <div style="font-weight:600">${esc(h.name)} <span class="muted small">${esc(h.symbol)}</span></div>
        <div class="small muted">${h.market} · ${fmt(h.shares, h.market === "加密貨幣" ? 6 : 4).replace(/\.?0+$/, "")} ${u} ${badge(q)}</div>
      </div>
      <div class="right">
        <div class="num">NT$ ${fmt(r.value)}</div>
        <div class="num small ${h.shares ? tone(r.ret) : ""}">${h.shares ? `${r.pnl >= 0 ? "+" : ""}${fmt(r.pnl)} (${pct(r.ret)})` : "已出清"}</div>
      </div>
    </div></summary>
    <div class="small" style="padding:0 0 12px">
      <div class="grid g2" style="gap:6px 12px;margin-bottom:10px">
        <div class="muted">現價</div><div class="num right">${q ? money(h.currency, q.price) : "—"}</div>
        <div class="muted">平均成本</div><div class="num right">${h.shares ? money(h.currency, h.avgCost) : "—"}</div>
        <div class="muted">已實現損益（${h.currency}）</div>
        <div class="num right ${tone(h.realized)}">${fmt(h.realized, 2)}</div>
      </div>
      ${!q || q.source === "manual" ? `
        <div class="row" style="gap:8px;margin-bottom:10px">
          <input id="mp-${id}" inputmode="decimal" placeholder="手動輸入現價（${h.currency}）" value="${manual ? manual.price : ""}">
          <button class="btn sm" data-act="set-manual" data-key="${esc(key)}" data-id="${id}">儲存</button>
          ${manual ? `<button class="btn sm" data-act="clear-manual" data-key="${esc(key)}">清除</button>` : ""}
        </div>` : ""}
      <div class="row" style="gap:8px;margin-bottom:6px">
        <button class="btn sm primary" data-act="add-trade" data-asset="${id}">＋ 新增交易</button>
        <button class="btn sm danger" data-act="del-asset" data-asset="${id}">刪除此標的</button>
      </div>
      ${trades.map((t) => `
        <div class="trade">
          <div>
            <b class="${t.type === "buy" ? "up" : "down"}">${t.type === "buy" ? "買進" : "賣出"}</b>
            <span class="num">${fmt(t.qty, 6).replace(/\.?0+$/, "")}</span> @
            <span class="num">${fmt(t.price, 4).replace(/\.?0+$/, "")}</span>
            ${t.fee ? ` · 手續費 ${fmt(t.fee, 2)}` : ""}
            <div class="muted">${t.date}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <button class="btn sm" data-act="edit-trade" data-trade="${t.id}">修改</button>
            <button class="btn sm danger" data-act="del-trade" data-trade="${t.id}">刪除</button>
          </div>
        </div>`).join("")}
    </div>
  </details>`;
}

function viewSingle(pid) {
  const p = portfolioById(pid);
  if (!p) {
    setTimeout(() => { location.hash = "#/portfolio"; toast("找不到該組合"); }, 0);
    return `<h1>投資組合</h1><div class="card empty">組合不存在，正在返回…</div>`;
  }
  const fx = fxRate();
  const hs = holdingsOf(pid);
  const actives = hs.filter((h) => h.shares > 0);
  const st = portfolioStats(hs, quoteOf, fx);
  const col = COLORS();
  const byMarket = MARKETS.map((m) => ({
    label: m, color: col[m],
    value: actives.filter((h) => h.market === m).reduce((a, h) => a + holdingStats(h, quoteOf(h), fx).value, 0),
  })).filter((d) => d.value > 0);

  const stats = [
    ["市值", `NT$ ${fmt(st.value)}`, ""],
    ["投入成本", `NT$ ${fmt(st.cost)}`, ""],
    ["未實現損益", `NT$ ${fmt(st.pnl)}`, tone(st.pnl)],
    ["報酬率", pct(st.ret), tone(st.ret)],
  ];

  return `<div class="row">
    <div><h1>${esc(p.name)}</h1><p class="sub"><a href="#/portfolio">← 所有組合</a></p></div>
    <div class="right" style="display:flex;gap:8px">
      <button class="btn primary" data-act="add-trade">＋ 新增交易</button>
      <button class="btn danger sm" data-act="del-portfolio" data-pid="${esc(p.id)}">刪除組合</button>
    </div>
  </div>
  ${statusBanner()}
  ${st.missing ? `<div class="banner">有 ${st.missing} 檔持股目前沒有報價，暫以成本價計算。</div>` : ""}

  <div class="grid g4 g2" style="grid-template-columns:repeat(2,1fr)">
    ${stats.map(([l, v, c]) => `<div class="card stat" style="margin:0"><div class="label">${l}</div><div class="value num ${c}">${v}</div></div>`).join("")}
  </div>

  <div class="grid split" style="margin-top:12px">
    <div class="card" style="margin:0">
      <h2>持倉（${actives.length}）</h2>
      ${!hs.length ? `<div class="empty small">此組合尚無持股。</div>` : ""}
      <div>${hs.map(assetRow).join("")}</div>
    </div>
    <div class="card" style="margin:0">
      <h2>資產配置</h2>
      ${byMarket.length ? `<canvas id="donut"></canvas>
      <div class="list" style="margin-top:8px">
        ${byMarket.map((d) => `<div class="row small item" style="padding:6px 0">
          <span><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${d.color};margin-right:8px"></i>${d.label}</span>
          <span class="num">${st.value ? ((d.value / st.value) * 100).toFixed(1) : 0}%</span>
        </div>`).join("")}
      </div>` : `<div class="empty small">尚無持股。</div>`}
    </div>
  </div>`;
}

export function viewPortfolios() {
  const pid = thisPid();
  return pid ? viewSingle(pid) : viewList();
}

export function afterPortfolios() {
  const c = $("#donut"); if (!c) return;
  const fx = fxRate();
  const pid = thisPid();
  const hs = (pid ? holdingsOf(pid) : holdings()).filter((h) => h.shares > 0);
  const col = COLORS();
  drawDonut(c, MARKETS.map((m) => ({
    label: m, color: col[m],
    value: hs.filter((h) => h.market === m).reduce((a, h) => a + holdingStats(h, quoteOf(h), fx).value, 0),
  })).filter((d) => d.value > 0));
}

/* ───────── 組合 CRUD ───────── */
function newPortfolioForm() {
  openSheet(`<h2>新增組合</h2>
    <form id="npf" autocomplete="off">
      <label>組合名稱</label>
      <input id="npf-name" placeholder="例如 存股組合" maxlength="20">
      <div class="err-text" id="npf-err"></div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button type="button" class="btn" data-act="close-sheet-btn" style="flex:1">取消</button>
        <button type="button" class="btn primary" data-act="submit-new-portfolio" style="flex:1">建立</button>
      </div>
    </form>`);
  setTimeout(() => $("#npf-name")?.focus(), 50);
}
function submitNewPortfolio() {
  const v = ($("#npf-name")?.value || "").trim();
  if (!v) { $("#npf-err").textContent = "請輸入組合名稱"; return; }
  if (S.data.portfolios.some((p) => p.name === v)) { $("#npf-err").textContent = "已有同名組合"; return; }
  const p = { id: uid(), name: v };
  S.data.portfolios.push(p); save(); closeSheet();
  toast(`已建立「${v}」`);
  location.hash = `#/portfolio?p=${encodeURIComponent(p.id)}`;
}
function delPortfolio(pid) {
  const p = portfolioById(pid); if (!p) return;
  const assets = S.data.assets.filter((a) => a.portfolioId === pid);
  if (!confirm(`刪除組合「${p.name}」？`)) return;
  if (assets.length) {
    if (!confirm(`此組合尚有 ${assets.length} 檔持股。\n按「確定」將全部移到「預設投資組合」後再刪除；按「取消」中止。`)) return;
    const def = ensureDefaultPortfolio();
    for (const a of assets) a.portfolioId = def.id;
  }
  S.data.portfolios = S.data.portfolios.filter((x) => x.id !== pid);
  save(); toast("已刪除組合"); location.hash = "#/portfolio";
}

/* ───────── 交易表單 ───────── */
function openTradeSheet({ assetId, tradeId, preset } = {}) {
  const asset = assetId ? S.data.assets.find((a) => a.id === assetId) : null;
  const tr = tradeId ? S.data.trades.find((t) => t.id === tradeId) : null;
  const a = tr ? S.data.assets.find((x) => x.id === tr.assetId) : asset;
  // preset：由個股詳情頁帶過來的「市場:代號」（如 台股:2330），尚未建 asset 時預填並鎖定
  let market = a?.market || (preset ? preset.split(":")[0] : "台股");
  let symbol = a?.symbol || (preset ? preset.slice(preset.indexOf(":") + 1) : "");
  const locked = !!(a || (preset && symbol));
  const bindPid = a?.portfolioId || thisPid() || S.data.portfolios[0]?.id || "";

  openSheet(`<h2>${tr ? "修改交易" : "新增交易"}</h2>
    <form id="tf" autocomplete="off" data-trade="${tr?.id || ""}" data-asset="${a?.id || ""}" data-pid="${esc(bindPid)}">
      <div class="formgrid">
        <div><label>市場</label>
          <select id="tf-market" ${locked ? "disabled" : ""}>
            ${MARKETS.map((m) => `<option ${m === market ? "selected" : ""}>${m}</option>`).join("")}
          </select></div>
        <div><label>代號</label>
          <input id="tf-symbol" list="tf-list" value="${esc(symbol)}" ${locked ? "disabled" : ""}
                 placeholder="${market === "加密貨幣" ? "BTC" : market === "美股" ? "AAPL" : "2330"}" autocapitalize="characters"></div>
      </div>
      <datalist id="tf-list"></datalist>
      <label>名稱</label><input id="tf-name" value="${esc(a?.name || "")}" ${locked ? "disabled" : ""} placeholder="例如 台積電">
      <div class="formgrid">
        <div><label>買／賣</label>
          <select id="tf-type">
            <option value="buy" ${tr?.type !== "sell" ? "selected" : ""}>買進</option>
            <option value="sell" ${tr?.type === "sell" ? "selected" : ""}>賣出</option>
          </select></div>
        <div><label>日期</label><input id="tf-date" type="date" value="${tr?.date || today()}"></div>
        <div><label>數量</label><input id="tf-qty" inputmode="decimal" value="${tr ? tr.qty : ""}" placeholder="股數／顆數"></div>
        <div><label>單價（<span id="tf-cur">${currencyOf(market)}</span>）</label>
          <input id="tf-price" inputmode="decimal" value="${tr ? tr.price : ""}"></div>
      </div>
      <label>手續費／稅（選填，同幣別）</label>
      <input id="tf-fee" inputmode="decimal" value="${tr ? tr.fee : ""}" placeholder="0">
      <div class="err-text" id="tf-err"></div>
      <div class="row" style="gap:8px;margin-top:10px">
        <button type="button" class="btn" data-act="close-sheet-btn" style="flex:1">取消</button>
        <button type="button" class="btn primary" data-act="submit-tf" style="flex:1">儲存</button>
      </div>
    </form>`);
  fillTfDatalist();
}
function fillTfDatalist() {
  const m = $("#tf-market")?.value, dl = $("#tf-list"); if (!dl) return;
  dl.innerHTML = universe().filter((u) => u.market === m)
                          .map((u) => `<option value="${esc(u.symbol)}">${esc(u.name)}</option>`).join("");
  const cur = $("#tf-cur"); if (cur) cur.textContent = currencyOf(m);
}

async function submitTradeForm() {
  const form = $("#tf"); if (!form) return;
  const err = (m) => { $("#tf-err").textContent = m; };
  const num = (sel) => { const v = $(sel).value.trim().replace(/,/g, ""); return v === "" ? NaN : Number(v); };
  const tradeId = form.dataset.trade, assetId = form.dataset.asset, bindPid = form.dataset.pid;
  const market = $("#tf-market").value;
  const symbol = ($("#tf-symbol").value || "").trim().toUpperCase();
  const type = $("#tf-type").value, date = $("#tf-date").value;
  const qty = num("#tf-qty"), price = num("#tf-price");
  const feeRaw = $("#tf-fee").value.trim();
  const fee = feeRaw === "" ? 0 : num("#tf-fee");

  if (!symbol) return err("請輸入代號");
  if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return err("代號格式不正確（英數字，例如 2330、AAPL、BTC）");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return err("請選擇日期");
  if (!(qty > 0)) return err("數量必須大於 0");
  if (!(price > 0)) return err("單價必須大於 0");
  if (!(fee >= 0)) return err("手續費不可為負數");

  const data = {
    portfolios: S.data.portfolios.map((p) => ({ ...p })),
    assets: S.data.assets.map((a) => ({ ...a })),
    trades: S.data.trades.map((t) => ({ ...t })),
  };
  let asset = assetId ? data.assets.find((a) => a.id === assetId)
                      : data.assets.find((a) => a.portfolioId === bindPid &&
                                                keyOf(a.market, a.symbol) === keyOf(market, symbol));
  let isNew = false;
  if (!asset) {
    const known = universe().find((u) => u.key === keyOf(market, symbol));
    asset = {
      id: uid(), market, symbol,
      name: ($("#tf-name").value || "").trim() || known?.name || symbol,
      portfolioId: bindPid || ensureDefaultPortfolio().id,
    };
    data.assets.push(asset); isNew = true;
  }
  if (tradeId) {
    const i = data.trades.findIndex((t) => t.id === tradeId);
    data.trades[i] = { ...data.trades[i], type, date, qty, price, fee };
  } else {
    data.trades.push({ id: uid(), assetId: asset.id, type, date, qty, price, fee });
  }
  const bad = validateTrades(data.trades.filter((t) => t.assetId === asset.id));
  if (bad) return err(`${bad}，請檢查數量與日期`);

  S.data = data; save(); closeSheet(); toast(tradeId ? "已更新交易" : "已新增交易");
  if (isNew) {
    const crypto = universe().filter((u) => u.market === "加密貨幣").map((u) => u.symbol);
    try {
      const r = await refreshQuotes({ cryptoSymbols: crypto, manual: S.set.manual, fileCache: null });
      S.quotes = r.quotes; S.status = r.status; S.lastRefresh = Date.now();
      if (r.file) { S.file = r.file; S.fileAt = Date.now(); }
    } catch {}
  }
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
}

function delTrade(tradeId) {
  const t = S.data.trades.find((x) => x.id === tradeId); if (!t) return;
  if (!confirm("刪除這筆交易？")) return;
  const rest = S.data.trades.filter((x) => x.id !== tradeId);
  const bad = validateTrades(rest.filter((x) => x.assetId === t.assetId));
  if (bad) return alert(`無法刪除：刪除後 ${bad}。請先處理後續賣出紀錄。`);
  S.data = { ...S.data, trades: rest }; save(); toast("已刪除交易");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
}
function delAsset(assetId) {
  const a = S.data.assets.find((x) => x.id === assetId); if (!a) return;
  if (!confirm(`刪除「${a.name}」及其所有交易紀錄？`)) return;
  S.data = {
    ...S.data,
    assets: S.data.assets.filter((x) => x.id !== assetId),
    trades: S.data.trades.filter((t) => t.assetId !== assetId),
  };
  save(); toast("已刪除標的");
  window.dispatchEvent(new CustomEvent("portfolios:changed"));
}

/* ───────── 註冊全域 action ───────── */
registerAction("new-portfolio", () => newPortfolioForm());
registerAction("submit-new-portfolio", () => submitNewPortfolio());
registerAction("del-portfolio", (el) => delPortfolio(el.dataset.pid));

registerAction("add-trade", (el) => openTradeSheet({ assetId: el.dataset.asset, preset: el.dataset.key }));
registerAction("edit-trade", (el) => openTradeSheet({ tradeId: el.dataset.trade }));
registerAction("del-trade", (el) => delTrade(el.dataset.trade));
registerAction("del-asset", (el) => delAsset(el.dataset.asset));

registerAction("submit-tf", () => submitTradeForm());
registerAction("close-sheet-btn", () => closeSheet());

// 手動報價（持股列）
registerAction("set-manual", (el) => {
  const inp = $(`#mp-${el.dataset.id}`); if (!inp) return;
  const v = Number(inp.value.replace(/,/g, ""));
  if (!(v > 0)) return toast("請輸入大於 0 的價格");
  S.set.manual = { ...(S.set.manual || {}), [el.dataset.key]: { price: v, time: Date.now() } };
  save(); toast("已儲存現價");
  window.dispatchEvent(new CustomEvent("portfolios:refresh-quotes"));
});
registerAction("clear-manual", (el) => {
  const m = { ...(S.set.manual || {}) }; delete m[el.dataset.key]; S.set.manual = m;
  save(); window.dispatchEvent(new CustomEvent("portfolios:refresh-quotes"));
});
