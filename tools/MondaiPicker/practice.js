const app = document.getElementById("app");
const K_QUIZ = "mp:quiz:";
const K_HIST = "mp:hist:";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = (t) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

async function listSets() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith(K_QUIZ))
    .map((k) => all[k])
    .sort((a, b) => b.savedAt - a.savedAt);
}
const loadHist = async (quizId) => (await chrome.storage.local.get(K_HIST + quizId))[K_HIST + quizId] || {};
const saveHist = (quizId, h) => chrome.storage.local.set({ [K_HIST + quizId]: h });

/* ---------- ホーム: 保存済みの問題セット ---------- */
async function renderHome() {
  const sets = await listSets();
  app.innerHTML = `<div class="card"><h2>保存済みの問題セット</h2>
    <p class="sub">Udemyのテスト画面/結果画面で、拡張のポップアップから「間違い+見直しマークを解く」を押すとここに保存されます。</p>
    <ul class="sets"></ul></div>`;
  const ul = app.querySelector(".sets");
  if (!sets.length) ul.innerHTML = `<li class="sub">まだありません</li>`;
  sets.forEach((s) => {
    const w = s.questions.filter((q) => q.wrong).length;
    const m = s.questions.filter((q) => q.marked).length;
    const li = document.createElement("li");
    li.innerHTML = `<div><div><b>${esc(s.title)}</b></div>
      <div class="sub">間違い ${w}問 / マーク ${m}問 / 計 ${s.questions.length}問 ・ 取り込み ${fmtDate(s.savedAt)}</div></div>
      <div class="row"><button class="primary" data-go>解く</button><button class="danger" data-del>削除</button></div>`;
    li.querySelector("[data-go]").onclick = () => renderSetup(s);
    li.querySelector("[data-del]").onclick = async () => {
      if (!confirm("この問題セットを削除しますか?(解答履歴も消えます)")) return;
      await chrome.storage.local.remove([K_QUIZ + s.quizId, K_HIST + s.quizId]);
      renderHome();
    };
    ul.appendChild(li);
  });
}

/* ---------- 出題設定 ---------- */
function renderSetup(set) {
  const w = set.questions.filter((q) => q.wrong).length;
  const m = set.questions.filter((q) => q.marked).length;
  app.innerHTML = `<div class="card"><h2>${esc(set.title)}</h2>
    <p class="sub">間違い ${w}問 / マーク ${m}問 / 計 ${set.questions.length}問${set.notes && set.notes.length ? "<br>" + set.notes.map(esc).join("<br>") : ""}</p>
    <div class="row" style="margin:10px 0">
      <label class="opt"><input type="radio" name="scope" value="either" checked> 間違い+マーク</label>
      <label class="opt"><input type="radio" name="scope" value="wrong"> 間違いのみ</label>
      <label class="opt"><input type="radio" name="scope" value="marked"> マークのみ</label>
    </div>
    <div class="row" style="margin-bottom:14px"><label class="opt"><input type="checkbox" id="shuf" checked> 出題順をシャッフル</label></div>
    <div class="row"><button class="primary" id="start">開始</button><button id="back">戻る</button></div></div>`;
  app.querySelector("#back").onclick = renderHome;
  app.querySelector("#start").onclick = () => {
    const scope = app.querySelector('input[name="scope"]:checked').value;
    let qs = set.questions.filter((q) => (scope === "wrong" ? q.wrong : scope === "marked" ? q.marked : true));
    if (!qs.length) return alert("該当する問題がありません");
    if (app.querySelector("#shuf").checked) qs = shuffle(qs);
    runQuiz(set, qs);
  };
}

/* ---------- 出題 ---------- */
async function runQuiz(set, queue) {
  const hist = await loadHist(set.quizId);
  const wrongNow = [];
  let i = 0;

  function show() {
    const q = queue[i];
    const need = q.correct.length;
    const multi = need > 1;
    const h = hist[q.id];
    app.innerHTML = `<div class="sub">${esc(set.title)}</div>
      <div class="row between"><b>${i + 1} / ${queue.length}</b><button class="danger" id="quit">中断</button></div>
      <div class="progress"><div style="width:${(i / queue.length) * 100}%"></div></div>
      <div class="card">
        <div>${q.wrong ? '<span class="badge ng">前回 誤答</span>' : ""}${q.marked ? '<span class="badge mk">見直しマーク</span>' : ""}
          ${q.section ? `<span class="badge">${esc(q.section)}</span>` : ""}
          ${multi ? `<span class="badge">${need}つ選択</span>` : ""}
          ${h ? `<span class="badge">過去 ○${h.r} ×${h.w}</span>` : ""}
          <span class="badge">${esc(q.no)}</span></div>
        <div class="rich" style="margin:8px 0 12px">${q.bodyHtml}</div>
        <div id="choices"></div>
        <div id="result"></div>
        <div class="row" style="margin-top:12px"><button class="primary" id="act" disabled>解答する</button></div>
      </div>`;
    app.querySelector("#quit").onclick = () => confirm("中断してホームに戻りますか?") && renderHome();

    const box = app.querySelector("#choices");
    const inputs = [];
    q.choices.forEach((c) => {
      const lab = document.createElement("label");
      lab.className = "choice";
      lab.innerHTML = `<input type="${multi ? "checkbox" : "radio"}" name="c" value="${c.letter}">
        <span class="letter">${c.letter}</span><div class="body"><div class="rich">${c.html}</div><div class="fb" hidden>${c.feedback}</div></div>`;
      box.appendChild(lab);
      inputs.push(lab.querySelector("input"));
    });
    const act = app.querySelector("#act");
    const picked = () => inputs.filter((x) => x.checked).map((x) => x.value);
    inputs.forEach((x) => x.addEventListener("change", () => (act.disabled = !picked().length)));

    let revealed = false;
    const isLast = () => i === queue.length - 1;
    function reveal() {
      revealed = true;
      const sel = picked();
      const ok = sameSet(sel, q.correct);
      inputs.forEach((x) => (x.disabled = true));
      box.querySelectorAll(".choice").forEach((lab, k) => {
        const c = q.choices[k];
        if (c.correct) lab.classList.add("correct");
        else if (sel.includes(c.letter)) lab.classList.add("wrong");
        const fb = lab.querySelector(".fb");
        if (c.feedback) fb.hidden = false;
      });
      app.querySelector("#result").innerHTML = `<div class="verdict ${ok ? "ok" : "ng"}">${ok ? "正解" : "不正解"} (あなた: ${sel.join(",")} / 正解: ${q.correct.join(",")})</div>
        ${q.explanationHtml ? `<div class="expl rich">${q.explanationHtml}</div>` : ""}`;
      if (!ok) wrongNow.push(q);
      const r = hist[q.id] || { r: 0, w: 0 };
      if (ok) r.r++;
      else r.w++;
      hist[q.id] = r;
      saveHist(set.quizId, hist);
      act.textContent = isLast() ? "結果を見る" : "次へ";
    }
    function next() {
      if (isLast()) return renderSummary(set, queue, wrongNow);
      i++;
      show();
    }
    act.onclick = () => (revealed ? next() : reveal());
    window.onkeydown = (e) => {
      if (e.target.tagName === "TEXTAREA") return;
      if (e.key === "Enter" && !act.disabled) {
        e.preventDefault();
        act.click();
      } else if (!revealed && /^[1-9]$/.test(e.key) && inputs[+e.key - 1]) {
        inputs[+e.key - 1].click();
      }
    };
  }
  show();
}

/* ---------- 結果 ---------- */
function renderSummary(set, queue, wrongNow) {
  window.onkeydown = null;
  const n = queue.length;
  const ok = n - wrongNow.length;
  app.innerHTML = `<div class="card"><h2>結果: ${ok} / ${n} 問正解</h2>
    ${wrongNow.length ? `<p class="sub">間違えた問題</p><ul>${wrongNow.map((q) => `<li>${esc(q.no)} ${esc(q.section)}</li>`).join("")}</ul>` : "<p>全問正解です</p>"}
    <div class="row"><button class="primary" id="retry" ${wrongNow.length ? "" : "disabled"}>間違えた問題だけもう一度</button>
    <button id="again">設定に戻る</button><button id="home">ホーム</button></div></div>`;
  app.querySelector("#retry").onclick = () => runQuiz(set, shuffle(wrongNow));
  app.querySelector("#again").onclick = () => renderSetup(set);
  app.querySelector("#home").onclick = renderHome;
}

(async () => {
  const quizId = new URLSearchParams(location.search).get("quiz");
  if (quizId) {
    const set = (await chrome.storage.local.get(K_QUIZ + quizId))[K_QUIZ + quizId];
    if (set) return renderSetup(set);
  }
  renderHome();
})();
