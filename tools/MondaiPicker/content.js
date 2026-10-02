(() => {
  const ROOT = document.documentElement;
  let on = true;
  let queued = false;

  const sel = (s) => document.querySelector(s);

  function resize() {
    queued = false;
    const sc = sel('[class*="quiz-page-layout--scroll-container"]');
    if (!sc) return;
    if (!on) {
      sc.style.removeProperty("height");
      sc.style.removeProperty("max-height");
      return;
    }
    const footer = sel('[class*="curriculum-item-footer--footer"]');
    const absTop = sc.getBoundingClientRect().top + window.scrollY;
    const fh = footer ? footer.getBoundingClientRect().height : 0;
    const h = Math.max(240, window.innerHeight - absTop - fh - 8);
    sc.style.setProperty("height", h + "px", "important");
    sc.style.setProperty("max-height", "none", "important");
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(resize);
  }

  function setOn(v) {
    on = v;
    ROOT.classList.toggle("tallquiz-on", on);
    schedule();
  }

  chrome.storage.sync.get({ enabled: true }, (r) => setOn(r.enabled));
  chrome.storage.onChanged.addListener((c) => {
    if (c.enabled) setOn(c.enabled.newValue);
  });

  window.addEventListener("resize", schedule);
  // 問題切替・サイドバー開閉などDOM変化に追従
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
})();
