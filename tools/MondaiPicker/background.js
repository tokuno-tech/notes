chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "toggle") {
    const { enabled } = await chrome.storage.sync.get({ enabled: true });
    await chrome.storage.sync.set({ enabled: !enabled });
  } else if (cmd === "copy-quick") {
    await copyQuick();
  }
});

async function copyQuick() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const toast = (text, ok) => chrome.tabs.sendMessage(tab.id, { type: "toast", text, ok }).catch(() => {});
  try {
    const { withExp } = await chrome.storage.sync.get({ withExp: true });
    const r = await chrome.tabs.sendMessage(tab.id, { type: "quick", withExp });
    if (!r || r.error) throw new Error((r && r.error) || "応答がありません");
    if (!r.count) throw new Error("コピー対象の問題がありません");
    await writeClipboard(r.text);
    toast(`コピーしました (${r.count}問 / ${r.text.length}文字)`, true);
  } catch (e) {
    toast("コピー失敗: " + e.message, false);
  }
}

// service worker にはクリップボードAPIが無いため、offscreen document 経由で書き込む
async function writeClipboard(text) {
  const has = await chrome.offscreen.hasDocument();
  if (!has) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "ショートカットで抽出した問題文をクリップボードにコピーするため"
    });
  }
  const res = await chrome.runtime.sendMessage({ target: "offscreen", text });
  if (!res || !res.ok) throw new Error("クリップボードに書き込めませんでした");
}
