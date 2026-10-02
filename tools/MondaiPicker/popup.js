const $ = (id) => document.getElementById(id);

// 縦広げトグル
const on = $("on");
chrome.storage.sync.get({ enabled: true }, (r) => (on.checked = r.enabled));
on.addEventListener("change", () => chrome.storage.sync.set({ enabled: on.checked }));
chrome.storage.onChanged.addListener((c) => {
  if (c.enabled) on.checked = c.enabled.newValue;
});

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

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isUdemy = /(^|\.)udemy\.com$/.test(new URL(tab.url || "http://x").hostname);
  $("tallRow").style.display = isUdemy ? "" : "none";

  const send = (m) => chrome.tabs.sendMessage(tab.id, m);
  showMsg("読み込み中…");
  let res;
  try {
    res = await send({ type: "describe" });
  } catch (e) {
    showMsg("このページは対象外です(UdemyのテストかCloudTechの問題ページを開いてください)", true);
    return;
  }
  showMsg("");
  if (res.error) return showMsg(res.error, true);
  $("site").textContent = res.name + " を検出";
  if (!res.data) return showMsg("問題が見つかりません。問題演習のページで開いてください。", true);

  const box = $("extract");
  res.data.groups.forEach((g) => {
    if (g.label) {
      const d = document.createElement("div");
      d.className = "grp";
      d.textContent = g.label;
      box.appendChild(d);
    }
    g.buttons.forEach((b) => {
      const el = document.createElement("button");
      el.textContent = `${b.label} (${b.count}問)`;
      el.disabled = !b.count;
      if (b.primary) el.className = "primary";
      el.onclick = async () => {
        const r = await send({ type: "run", id: b.id, withExp: exp.checked });
        if (r.error) return showMsg(r.error, true);
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
      };
      box.appendChild(el);
    });
  });
  $("notes").textContent = res.data.notes.join("\n");
}
init();
