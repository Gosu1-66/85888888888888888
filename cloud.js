// cloud.js — Firebase（免費 Spark 方案）第三方登入 + Firestore 雲端同步。
//   登入：Google / Yahoo OAuth（Firebase 原生支援，不需另外註冊帳號密碼；以 Google email 為身分識別）。
//   同步：把 S.data（投資組合）與 S.set（設定/警報/通知…）寫入 Firestore users/{uid}，換機登入同一帳號即可取回。
//   未設定雲端時，本機 localStorage 模式完全不受影響。
//   設定向導：#/cloud 頁面，逐步引導不熟技術的使用者建立 Firebase 專案並貼入 config。
import { S, save } from "./state.js";
import { registerAction, esc, toast, ageText, fmt } from "./ui.js";

const APP = "https://www.gstatic.com/firebasejs/10.12.0/";
let mod = null; // { app, auth, db, google, oauth, providers… }
let subs = [];  // 清理用

/* ── 動態載入 Firebase SDK（gstatic CDN） ── */
async function loadFirebase() {
  if (mod) return mod;
  const [{ initializeApp }, { getAuth, GoogleAuthProvider, signInWithPopup, signOut, OAuthProvider, onAuthStateChanged }, { getFirestore, doc, getDoc, setDoc, serverTimestamp }] = await Promise.all([
    import(APP + "firebase-app.js"),
    import(APP + "firebase-auth.js"),
    import(APP + "firebase-firestore.js"),
  ]);
  mod = { app: null, auth: null, db: null, google: GoogleAuthProvider, oauth: OAuthProvider, signInWithPopup, signOut, onAuthStateChanged, getFirestore, doc, getDoc, setDoc, serverTimestamp };
  return mod;
}

const configOk = (c) => c && typeof c.apiKey === "string" && typeof c.authDomain === "string" && typeof c.projectId === "string";

/* ── 現況（供 app.js 品牌列 chip 使用） ── */
export function cloudStatus() {
  const c = S.set.cloud || {};
  if (!c.enabled || !configOk(c.config)) return { state: "off", user: null, error: null };
  if (!c.user) return { state: "setup", user: null, error: null };
  return { state: "online", user: c.user, lastSync: c.lastSync, error: c.error || null };
}

/* ── 登入 ── */
export async function login(providerName) {
  const c = S.set.cloud || {};
  if (!configOk(c.config)) { toast("尚未設定 Firebase 設定"); return null; }
  const m = await loadFirebase();
  try {
    if (!m.app || m.app.options.projectId !== c.config.projectId) {
      m.app = (await import(APP + "firebase-app.js")).initializeApp(c.config);
      m.auth = m.getAuth(m.app);
      m.db = m.getFirestore(m.app);
      m.unsubAuth = m.onAuthStateChanged(m.auth, (u) => {
        if (u) { S.set.cloud.user = { uid: u.uid, email: u.email, name: u.displayName, photoURL: u.photoURL }; save(); }
      });
    }
    const provider = providerName === "google" ? new m.google()
      : (() => { const p = new m.oauth("yahoo.com"); p.setCustomParameters({ prompt: "select_account" }); return p; })();
    const res = await m.signInWithPopup(m.auth, provider);
    S.set.cloud.user = { uid: res.user.uid, email: res.user.email, name: res.user.displayName, photoURL: res.user.photoURL };
    save();
    toast(`已登入：${res.user.email}`);
    await push();
    return res.user;
  } catch (e) {
    const msg = e?.code === "auth/popup-blocked" ? "彈出視窗被擋下，請允許本頁面開啟彈出視窗後再試"
      : e?.code === "auth/operation-not-supported-in-this-environment" ? "此瀏覽器不支援第三方登入（請用 Safari／Chrome／Edge）"
      : e?.message || "登入失敗";
    toast("登入失敗：" + msg);
    S.set.cloud.error = msg; save();
    return null;
  }
}

export async function logout() {
  const m = await loadFirebase();
  try { if (m?.auth?.currentUser) await m.signOut(m.auth); } catch {}
  S.set.cloud.user = null;
  save(); toast("已登出（本機資料保留）");
}

/* ── 同步 ── */
function pushPayload() {
  return {
    data: S.data,
    set: { ...S.set, cloud: { ...S.set.cloud, user: null, lastSync: Date.now() } },
    ts: Date.now(), app: "gosu-invest", v: 3,
  };
}
async function push() {
  const c = S.set.cloud || {};
  if (!c.enabled || !configOk(c.config) || !c.user?.uid) return false;
  try {
    const m = await loadFirebase();
    await m.setDoc(m.doc(m.db, "users", c.user.uid), { ...pushPayload(), ts: m.serverTimestamp() }, { merge: true });
    S.set.cloud.lastSync = Date.now(); S.set.cloud.error = null; save();
    return true;
  } catch (e) {
    S.set.cloud.error = e?.message || "同步失敗";
    save();
    return false;
  }
}
async function pull() {
  const c = S.set.cloud || {};
  if (!c.enabled || !configOk(c.config) || !c.user?.uid) return null;
  try {
    const m = await loadFirebase();
    const snap = await m.getDoc(m.doc(m.db, "users", c.user.uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    S.set.cloud.error = e?.message || "讀取雲端資料失敗"; save();
    return null;
  }
}

/** 立即同步：先拉取比對時間，遠端較新則套用，否則上傳本機。 */
export async function syncNow() {
  const c = S.set.cloud || {};
  if (!c.enabled || !configOk(c.config) || !c.user?.uid) { toast("請先完成雲端設定並登入"); return; }
  toast("同步中…");
  const remote = await pull();
  if (remote && remote.ts && remote.ts.seconds) {
    const rts = remote.ts.seconds * 1000;
    if (rts > (S.__localAt || 0) + 2000) {
      const ok = confirm("雲端資料較新，是否以雲端資料覆蓋本機？（本機未同步的變更會遺失）");
      if (!ok) { toast("已取消；同步仍會在本機變更時上傳"); }
      else {
        S.data = remote.data; S.set = { ...S.set, ...remote.set, cloud: { ...S.set.cloud, ...(remote.set?.cloud || {}) } };
        save(); toast("已從雲端還原資料");
      }
    } else {
      const ok = await push(); toast(ok ? "已上傳本機資料到雲端" : "上傳失敗，請稍後再試");
    }
  } else {
    const ok = await push(); toast(ok ? "已上傳本機資料到雲端" : "上傳失敗，請稍後再試");
  }
}

/* 延遲推送：本機任何 save() 之後 2 秒內合併上傳（避免連動觸發過度寫入） */
let pushTimer = null;
function debouncedPush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { const c = S.set.cloud || {}; if (c.enabled && c.user?.uid) push(); }, 2000);
}

export function initCloud() {
  if (!subs.length) subs.push(S.__hooks.save);
  if (!subs.includes(debouncedPush)) S.__hooks.save.push(debouncedPush);
  // 啟用且已登入時，啟動時自動拉取一次
  const c = S.set.cloud || {};
  if (c.enabled && configOk(c.config) && c.user?.uid) setTimeout(syncNow, 1500);
}

/* ── 設定頁 ── */
const STEPS = [
  ["1. 建立 Firebase 專案", "到 <b>console.firebase.google.com</b> 用 Google 帳號登入 →「建立專案」（名稱隨意，如 my-invest-sync）→ 建議關閉 Google Analytics。免費方案 Spark 不需信用卡。"],
  ["2. 啟用登入方式", "左側「Authentication」→「Sign-in method」→ 啟用 <b>Google</b> 與 <b>Yahoo</b>（都選「啟用」並儲存）。Yahoo 需在彈出頁填 Client ID／Secret（見下方 Yahoo 說明）。"],
  ["3. 建立資料庫", "左側「Firestore Database」→「建立資料庫」→ 選 <b>asia-east1</b>（台灣）→ 安全規則選「production mode」（稍後用下方規則開放本機存取）。"],
  ["4. 取得設定檔", "「專案設定」→ 往下到「你的應用程式」→ 選網頁圖示 <b>&lt;/&gt;</b> → 註冊應用程式（名稱隨意）→ 畫面上出現一段 <b>firebaseConfig</b> JSON → 複製整段貼到下方。"],
];

const RULES_HINT = "資料庫安全規則（Rules）建議：<pre style='white-space:pre-wrap;font-size:11px'>rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}</pre>貼上後按「發佈」。";

export function viewCloud() {
  const c = S.set.cloud || {};
  const st = cloudStatus();

  if (!c.enabled || !configOk(c.config)) {
    const cfg = c.config || {};
    return `<h1>雲端同步（免費方案）</h1>
      <div class="banner info">本工具為純前端 App，未設定雲端時所有資料只存在這台裝置。設定雲端後，可用 <b>Google／Yahoo 帳號登入</b>並把投資組合同步到雲端資料庫，換機登入同一帳號即可取回。以下導向專為不熟悉技術的人準備，跟著做即可。</div>
      <div class="card">
        ${STEPS.map(([t, d]) => `<div class="step"><b>${esc(t)}</b><p class="small">${d}</p></div>`).join("")}
        <details><summary class="h2">Yahoo 登入額外設定（若想用 Yahoo 才需要）</summary>
        <p class="small">Firebase 的 Yahoo 登入需要你提供「Client ID／Client Secret」：到 <b>developer.yahoo.com/apps</b> 建立 App（Name 隨意；Redirect URI 填 Firebase 顯示的那組，格式為 <i>https://{你的專案}.firebaseapp.com/__/auth/handler</i>）→ 把取得的 Client ID／Secret 貼回 Firebase 的 Yahoo 設定頁。若不想麻煩，用 Google 登入即可。</p></details>
        <details><summary class="h2">資料庫安全規則（照貼即可）</summary><p class="small">${RULES_HINT}</p></details>
        <div class="sub" style="margin-top:12px">貼上 firebaseConfig JSON：</div>
        <textarea id="cloud-config" rows="7" spellcheck="false" placeholder='{\n  "apiKey": "…",\n  "authDomain": "…firebaseapp.com",\n  "projectId": "…",\n  …\n}'></textarea>
        <div class="err-text" id="cloud-err"></div>
        <div class="row" style="gap:8px;margin-top:8px">
          <button type="button" class="btn primary" data-act="cloud-save-config" style="flex:1">儲存設定並繼續</button>
        </div>
        <p class="small muted" style="margin-top:8px">沒有設定檔？沒關係，繼續用本機模式即可，全部功能不受影響。</p>
      </div>`;
  }

  if (!c.user) {
    return `<h1>雲端同步</h1>
      <div class="card" style="text-align:center;padding:28px 18px">
        <div style="font-size:26px">🔐</div>
        <h2 style="margin:10px 0 4px">登入以開始同步</h2>
        <p class="small muted">用你既有的 Google 或 Yahoo 帳號即可，不需另外註冊帳號密碼。<br>登入後本機資料會自動上傳；換機登入同一帳號可取回。</p>
        <div class="row" style="justify-content:center;gap:10px;margin-top:14px">
          <button type="button" class="btn" data-act="cloud-login-google" style="min-width:140px">G 使用 Google 登入</button>
          <button type="button" class="btn" data-act="cloud-login-yahoo" style="min-width:140px">Y 使用 Yahoo 登入</button>
        </div>
        <p class="small muted" style="margin-top:12px">雲端資料以你登入的 <b>Google email</b> 為身分識別：同一帳號在不同裝置登入，看到的就是同一份資料。</p>
        <div class="err-text" id="cloud-err"></div>
      </div>`;
  }

  const err = c.error ? `<div class="banner warn">${esc(c.error)}</div>` : "";
  return `<h1>雲端同步</h1>
    <div class="card">
      <div class="row" style="align-items:center;gap:12px">
        ${c.user.photoURL ? `<img src="${esc(c.user.photoURL)}" alt="" style="width:44px;height:44px;border-radius:50%">` : `<div style="width:44px;height:44px;border-radius:50%;background:var(--primary,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center">${esc((c.user.email || "U")[0].toUpperCase())}</div>`}
        <div style="flex:1">
          <div style="font-weight:700">${esc(c.user.name || c.user.email)}</div>
          <div class="small muted">${esc(c.user.email)}</div>
        </div>
        <span class="cloudchip ok">已連線</span>
      </div>
      <div class="small muted" style="margin-top:10px">
        上次同步：${c.lastSync ? ageText(Date.now() - c.lastSync) : "尚未同步"}（本機任何變更會在儲存後自動上傳）<br>
        免費額度：Firebase Spark 方案（每月約 1 GiB 儲存、50K 讀取、20K 寫入，對個人投資紀錄綽綽有餘；超過才會收費）。
      </div>
      ${err}
      <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">
        <button type="button" class="btn primary" data-act="cloud-sync">立即同步</button>
        <button type="button" class="btn" data-act="cloud-logout">登出</button>
        <button type="button" class="btn danger sm" data-act="cloud-clear">清除雲端設定（回本機模式）</button>
      </div>
    </div>`;
}

/* ── actions ── */
registerAction("cloud-save-config", async () => {
  const el = document.getElementById("cloud-config"), err = document.getElementById("cloud-err");
  const txt = (el?.value || "").trim();
  try {
    const cfg = JSON.parse(txt);
    if (!configOk(cfg)) throw new Error("缺少 apiKey / authDomain / projectId");
    S.set.cloud = { ...(S.set.cloud || {}), enabled: true, config: cfg, error: null };
    save(); toast("已儲存 Firebase 設定");
    location.hash = "#/cloud";
  } catch (e) {
    if (err) err.textContent = "設定格式不正確：" + e.message;
    toast("設定格式不正確");
  }
});
registerAction("cloud-login-google", () => login("google"));
registerAction("cloud-login-yahoo", () => login("yahoo"));
registerAction("cloud-sync", () => syncNow());
registerAction("cloud-logout", () => logout());
registerAction("cloud-clear", () => {
  if (!confirm("清除雲端設定？本機資料保留，此裝置將回到本機模式。")) return;
  S.set.cloud = { enabled: false, config: null, lastSync: null, user: null, error: null };
  save(); toast("已回到本機模式");
  location.hash = "#/profile";
});
