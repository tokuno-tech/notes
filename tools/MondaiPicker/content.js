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

  // 無操作で出る「テストが一時停止されました」を自動で閉じて再開する
  let autoResume = true;
  let resumeTimer = 0;
  function tryResume() {
    resumeTimer = 0;
    if (!autoResume) return;
    const btn = sel('[data-purpose="unpause-test"]');
    if (btn) btn.click();
  }
  function scheduleResume() {
    if (resumeTimer || !autoResume) return;
    resumeTimer = setTimeout(tryResume, 300);
  }
  chrome.storage.sync.get({ autoResume: true }, (r) => (autoResume = r.autoResume));
  chrome.storage.onChanged.addListener((c) => {
    if (c.autoResume) autoResume = c.autoResume.newValue;
  });

  window.addEventListener("resize", schedule);
  // 問題切替・サイドバー開閉などDOM変化に追従
  new MutationObserver(() => {
    schedule();
    scheduleResume();
  }).observe(document.body, { childList: true, subtree: true });
})();
