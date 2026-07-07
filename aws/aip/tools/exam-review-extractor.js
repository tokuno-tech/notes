/**
 * AWS BenchPrep (AIP-C01 模擬試験) の問題復習画面から、
 * 「問題文 / 選択肢 / あなたの解答 / 正解 / 選択肢ごとの解説(+参照URL)」だけを
 * 抜き出してクリップボードにコピーするブックマークレット。
 *
 * 使い方:
 *   1. このファイルの中身(IIFE全体)を https://www.toptal.com/developers/javascript-minifier
 *      などで1行に圧縮するか、build.sh (同ディレクトリ) を使って
 *      `javascript:...` 形式の1行ブックマークレットを生成する。
 *   2. ブラウザのブックマークバーに新規ブックマークを作り、URL欄に
 *      生成した `javascript:...` を貼り付ける。
 *   3. BenchPrepで模擬試験を復習中(1問表示中)にそのブックマークをクリックすると、
 *      整形済みテキストがクリップボードにコピーされる。
 *   4. それをそのままClaudeに貼り付ける。
 *
 * 対応画面: exams_section の復習ビュー (#question-app, 単一選択/複数選択問題)
 */
(function () {
  function clean(el) {
    if (!el) return "";
    var raw = el.innerText !== undefined ? el.innerText : el.textContent;
    return (raw || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function isVisible(el) {
    if (!el) return false;
    if (typeof el.checkVisibility === "function") {
      try {
        return el.checkVisibility({
          checkOpacity: false,
          checkVisibilityCSS: true,
        });
      } catch (e) {
        /* fall through */
      }
    }
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /* ページ内には非表示の同名要素が大量に存在するため、可視のものだけを対象にする */
  var questionEl = Array.from(
    document.querySelectorAll(".aws-question-content")
  ).find(isVisible);

  var choicesContainer = Array.from(
    document.querySelectorAll(".choices-container")
  ).find(isVisible);

  if (!questionEl || !choicesContainer) {
    alert(
      "問題が見つかりませんでした。模擬試験の復習画面(1問表示中)で実行してください。"
    );
    return;
  }

  var question = clean(questionEl);

  var choiceBlocks = Array.from(choicesContainer.children).filter(function (
    c
  ) {
    return c.querySelector(".answer-button-wrapper");
  });

  if (!choiceBlocks.length) {
    alert("選択肢が見つかりませんでした。");
    return;
  }

  var selectedLetters = [];
  var correctLetters = [];
  var choiceLines = [];
  var rationaleLines = [];

  choiceBlocks.forEach(function (block) {
    var wrapper = block.querySelector(".answer-button-wrapper");
    var letterEl = block.querySelector(".answer-choice-value");
    var letter = letterEl ? letterEl.textContent.trim() : "?";
    var textEl = block.querySelector(".aws-answer-content");
    var text = clean(textEl);

    var isSelected = wrapper.classList.contains("is-selected");
    var isCorrect = wrapper.classList.contains("correct");
    if (isSelected) selectedLetters.push(letter);
    if (isCorrect) correctLetters.push(letter);

    choiceLines.push(letter + ". " + text);

    var rationaleEl = block.querySelector(
      ".answer-solution .aws-rationale-content"
    );
    var rationaleText = clean(rationaleEl);
    var links = rationaleEl
      ? Array.from(rationaleEl.querySelectorAll("a[href]")).map(function (a) {
          return a.href;
        })
      : [];

    var line = letter + ": " + (rationaleText || "(解説なし)");
    if (links.length) {
      line += "\n   参照: " + links.join(" , ");
    }
    rationaleLines.push(line);
  });

  var out = [];
  out.push("## 問題");
  out.push(question);
  out.push("");
  out.push("## 選択肢");
  out.push.apply(out, choiceLines);
  out.push("");
  out.push(
    "あなたの解答: " + (selectedLetters.join(",") || "不明") +
      " / 正解: " + (correctLetters.join(",") || "不明")
  );
  out.push("");
  out.push("## 解説");
  out.push.apply(out, rationaleLines);

  var text = out.join("\n");

  function fallbackCopy(str) {
    var ta = document.createElement("textarea");
    ta.value = str;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch (e) {
      /* ignore */
    }
    document.body.removeChild(ta);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }

  alert(
    "クリップボードにコピーしました (" +
      text.length +
      "文字)。\n\n" +
      text.slice(0, 200) +
      (text.length > 200 ? "\n..." : "")
  );
})();
