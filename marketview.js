// marketview.js — 盤勢解析（首頁 AI 卡點進來）：拆解「偏多／偏空」的每一項依據，全部取自 market.json
import { esc, fmt, pct, tone } from "./ui.js";
import { S } from "./state.js";
import { marketNewsCard } from "./news.js";
import { indices, institutions, breadth, industryFlow, marketTone } from "./marketdata.js";

const yi = (n) => (n == null || isNaN(n) ? "—" : fmt(Math.round(Math.abs(n) / 1e8), 0) + "億");
const sg = (n) => (n >= 0 ? "+" : "-");

function row(ok, title, text) {
  // ok: true 偏多 / false 偏空 / null 中性
  const cls = ok == null ? "mid" : ok ? "up" : "down";
  const tag = ok == null ? "中性" : ok ? "偏多" : "偏空";
  return `<div class="mv-row"><span class="mv-tag ${cls}">${tag}</span><div class="mv-body"><div class="mv-t">${esc(title)}</div><div class="mv-x">${text}</div></div></div>`;
}

export function viewMarket() {
  const t = marketTone();
  if (!t) return `<section class="xcard"><p class="small muted">市場資料尚未更新，稍後會自動補上。</p><a class="more-link" href="#/">回首頁 ›</a></section>`;
  const idx = indices().find((i) => String(i.code).split(".")[0] === "t00");
  const b = breadth(), inst = institutions();
  const fut = S.market?.futures?.regular;
  const inds = industryFlow().slice().sort((a, c) => (c.totalNet || 0) - (a.totalNet || 0));
  const date = S.market?.date ? `${S.market.date.slice(4, 6)}/${S.market.date.slice(6, 8)}` : "";
  const rows = [];

  if (idx) rows.push(row(idx.changePct >= 0, "加權指數", `收 <b>${fmt(idx.price, 2)}</b>，<span class="${tone(idx.changePct)}">${sg(idx.changePct)}${Math.abs(idx.changePct).toFixed(2)}%（${idx.change >= 0 ? "+" : ""}${fmt(idx.change, 2)} 點）</span>。`));
  if (b) {
    const r = b.rise / Math.max(1, b.rise + b.fall);
    rows.push(row(b.rise > b.fall, "漲跌家數", `上市上漲 <b>${b.rise}</b> 檔、下跌 <b>${b.fall}</b> 檔、平盤 ${b.flat} 檔，上漲家數占 ${(r * 100).toFixed(0)}%；成交金額 ${yi(b.amount)}。`));
  }
  if (inst?.total?.net != null) {
    const f = inst.foreign?.net, tr = inst.trust?.net, d = inst.dealer?.net;
    const s = (n) => (n == null ? "—" : `${n >= 0 ? "買超" : "賣超"} ${yi(n)}`);
    rows.push(row(inst.total.net >= 0, "三大法人", `合計${s(inst.total.net)}：外資 ${s(f)}、投信 ${s(tr)}、自營商 ${s(d)}。`));
    const days = (inst.days || []).slice(0, 5);
    if (days.length >= 3) {
      const sells = days.filter((x) => x.foreignNet < 0).length;
      const sum = days.reduce((a, x) => a + (x.foreignNet || 0), 0);
      rows.push(row(sum >= 0, `外資近 ${days.length} 日`, `${sells >= days.length ? "連續" + days.length + "日賣超" : `${days.length} 日中 ${sells} 日賣超`}，累計${sum >= 0 ? "買超" : "賣超"} ${yi(sum)}。`));
    }
  }
  if (fut && typeof fut.pct === "number") rows.push(row(fut.pct >= 0, "台指期", `${esc(fut.contract || "近月")} 收 <b>${fmt(fut.price, 0)}</b>，<span class="${tone(fut.pct)}">${sg(fut.pct)}${Math.abs(fut.pct).toFixed(2)}%</span>。`));
  if (inds.length > 2) {
    const s = inds[0], w = inds[inds.length - 1];
    rows.push(row(null, "類股資金", `法人資金最偏好 <b>${esc(s.name)}</b>（淨${s.totalNet >= 0 ? "流入" : "流出"} ${yi(s.totalNet)}），最不被青睞 <b>${esc(w.name)}</b>（淨${w.totalNet >= 0 ? "流入" : "流出"} ${yi(w.totalNet)}）。`));
  }
  const bull = rows.filter((r) => r.includes("mv-tag up")).length, bear = rows.filter((r) => r.includes("mv-tag down")).length;
  const cls = t.score >= 2 ? "up" : t.score <= -2 ? "down" : "mid";
  return `<section class="xcard mv-head">
      <div class="mv-top"><span class="mv-tag big ${cls}">${esc(t.label)}</span><span class="muted small">資料日期 ${date}</span></div>
      <p class="mv-sum">${rows.length} 項指標中，${bear} 項偏空、${bull} 項偏多。判斷方式：加權指數漲跌、漲跌家數、三大法人買賣超三項各給 +1／−1，合計 ≥ +2 偏多、≤ −2 偏空，其餘中性（目前 ${t.score > 0 ? "+" : ""}${t.score}）。</p>
    </section>
    <section class="xcard"><div class="sec-h"><span class="ico">🔍</span><span class="tt">為什麼${esc(t.label)}</span></div>${rows.join("")}</section>
    ${marketNewsCard()}
    <section class="xcard"><div class="sec-h"><span class="ico">➡️</span><span class="tt">繼續看</span></div>
      <a class="mv-link" href="#/inst">法人買超排行 ›</a>
      <a class="mv-link" href="#/heat">市場熱力圖（類股強弱） ›</a>
      <a class="mv-link" href="#/indexv/t00">加權指數走勢 ›</a>
      <a class="mv-link" href="#/indexb">指數總覽 ›</a>
    </section>
    <p class="small muted" style="text-align:center;margin:10px 0">依公開盤後資料自動整理，僅供參考，不構成投資建議。</p>`;
}
