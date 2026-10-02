/* popup と background 共通: 押下したタブに抽出器を注入して実行する */
async function mpRun(tabId, id, withExp) {
  const [{ result: loaded }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => !!window.__tqRun
  });
  if (!loaded) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["extract/udemy.js", "extract/cloudtech.js", "extract/bridge.js"]
    });
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (i, w) => window.__tqRun(i, w),
    args: [id, withExp]
  });
  return result || { error: "応答がありません" };
}

function mpToast(tabId, text, ok) {
  return chrome.scripting
    .executeScript({ target: { tabId }, func: (t, o) => window.__tqToast && window.__tqToast(t, o), args: [text, ok] })
    .catch(() => {});
}
