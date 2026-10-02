/* 押下時に注入され、ホスト名で選んだ抽出器を実行する。常駐はしない */
(() => {
  const SITES = [
    { re: /(^|\.)udemy\.com$/, key: "udemy" },
    { re: /(^|\.)kws-cloud-tech\.com$/, key: "cloudtech" }
  ];

  window.__tqToast = (text, ok) => {
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
  };

  /* 失敗は例外にせず {error} で返す(executeScript越しでも内容が落ちないように) */
  window.__tqRun = (id, withExp) => {
    const site = SITES.find((s) => s.re.test(location.hostname));
    const ex = site && window.__tqExtractors && window.__tqExtractors[site.key];
    if (!ex) return Promise.resolve({ error: "このサイトは対象外です(Udemy / CloudTech のみ)" });
    return ex.run(id, withExp).then(
      (r) => Object.assign({ site: ex.name }, r),
      (e) => ({ error: e && e.message ? e.message : String(e) })
    );
  };
})();
