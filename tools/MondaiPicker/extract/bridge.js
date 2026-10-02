/* popup / background からのメッセージを、ホスト名で選んだ抽出器に中継する */
(() => {
  const SITES = [
    { re: /(^|\.)udemy\.com$/, key: "udemy" },
    { re: /(^|\.)kws-cloud-tech\.com$/, key: "cloudtech" }
  ];
  const site = SITES.find((s) => s.re.test(location.hostname));
  const ex = () => site && window.__tqExtractors && window.__tqExtractors[site.key];

  function toast(text, ok) {
    const id = "__tqToast";
    const old = document.getElementById(id);
    if (old) old.remove();
    const el = document.createElement("div");
    el.id = id;
    el.textContent = text;
    el.style.cssText =
      "position:fixed;top:16px;right:16px;z-index:2147483647;padding:10px 14px;border-radius:8px;color:#fff;" +
      "font:13px/1.5 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);" +
      "background:" + (ok ? "#16a34a" : "#dc2626") + ";";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  const fail = (send) => (e) => send({ error: e && e.message ? e.message : String(e) });

  chrome.runtime.onMessage.addListener((msg, _sender, send) => {
    const e = ex();
    if (msg.type === "toast") {
      toast(msg.text, msg.ok);
      return;
    }
    if (!e) {
      send({ error: "このページは対象外です" });
      return;
    }
    if (msg.type === "describe") {
      e.describe().then((d) => send({ name: e.name, data: d }), fail(send));
    } else if (msg.type === "run") {
      e.run(msg.id, msg.withExp).then(send, fail(send));
    } else if (msg.type === "quick") {
      e.quick(msg.withExp).then(send, fail(send));
    }
    return true; // 非同期応答
  });
})();
