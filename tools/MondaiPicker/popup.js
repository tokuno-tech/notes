const $ = (id) => document.getElementById(id);

// 縦広げトグル
const on = $("on");
chrome.storage.sync.get({ enabled: true }, (r) => (on.checked = r.enabled));
on.addEventListener("change", () => chrome.storage.sync.set({ enabled: on.checked }));
chrome.storage.onChanged.addListener((c) => {
  if (c.enabled) on.checked = c.enabled.newValue;
});

// 一時停止の自動再開
const resume = $("resume");
chrome.storage.sync.get({ autoResume: true }, (r) => (resume.checked = r.autoResume));
resume.addEventListener("change", () => chrome.storage.sync.set({ autoResume: resume.checked }));

// 解説を含める
const exp = $("exp");
chrome.storage.sync.get({ withExp: true }, (r) => (exp.checked = r.withExp));
exp.addEventListener("change", () => chrome.storage.sync.set({ withExp: exp.checked }));

function showMsg(text, isErr) {
  const m = $("msg");
  m.textContent = text;
  m.className = isErr ? "err" : "";
  return m;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

document.querySelectorAll("button[data-id]").forEach((el) => {
  el.onclick = async () => {
    showMsg("抽出中…");
    $("notes").textContent = "";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const r = await mpRun(tab.id, el.dataset.id, exp.checked);
      if (r.error) return showMsg(r.error, true);
      $("site").textContent = r.site;
      if (!r.count) return showMsg("対象の問題がありません", true);
      const ok = await copy(r.text);
      const m = showMsg(
        `${ok ? "コピーしました" : "コピー失敗。下のテキストを手動でコピーしてください"} (${r.count}問 / ${r.text.length}文字)`,
        !ok
      );
      if (!ok) {
        const ta = document.createElement("textarea");
        ta.value = r.text;
        m.appendChild(ta);
        ta.select();
      }
      $("notes").textContent = r.notes.join("\n");
    } catch (e) {
      showMsg("このページでは実行できません: " + e.message, true);
    }
  };
});

// 縦広げはUdemyでしか意味がないので、他サイトでは隠す
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  let host = "";
  try { host = new URL(tab.url).hostname; } catch (e) {}
  if (!/(^|\.)udemy\.com$/.test(host)) { $("tallRow").style.display = "none"; $("resumeRow").style.display = "none"; }
});
