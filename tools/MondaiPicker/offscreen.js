chrome.runtime.onMessage.addListener((msg, _s, send) => {
  if (msg.target !== "offscreen") return;
  const t = document.getElementById("t");
  t.value = msg.text;
  t.select();
  send({ ok: document.execCommand("copy") });
});
