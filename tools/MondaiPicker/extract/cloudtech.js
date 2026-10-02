/**
 * CloudTech (kws-cloud-tech.com) の問題演習ページから、
 * 「問題文 / 選択肢 / あなたの解答 / 正解 / 解説」だけを抜き出して
 * クリップボードにコピーするブックマークレット。
 *
 * ページ全体のHTMLを貼るのをやめるための道具。SAA/SOA/DVA/MLA/AIP など
 * LearnDash(wpProQuiz)ベースの問題集ページであれば試験区分を問わず動く想定。
 *
 */
(function () {
  "use strict";

  function qa(root, sel) {
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }
  function q1(root, sel) {
    return root.querySelector(sel);
  }
  function tidy(s) {
    return (s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function isShown(el) {
    return !!el && window.getComputedStyle(el).display !== "none";
  }

  /* 非表示の設問(display:none)は innerText が textContent 相当になり改行が失われるため、
     画面外のホストにクローンを載せてレンダリングさせてからテキスト化する */
  var host = null;
  function getHost() {
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText =
        "position:absolute;left:-100000px;top:0;width:900px;pointer-events:none;";
      document.body.appendChild(host);
    }
    return host;
  }
  function dropHost() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  function cellText(td) {
    return (td.textContent || "")
      .replace(/\s+/g, " ")
      .replace(/\|/g, "\\|")
      .trim();
  }
  function tableToMd(table) {
    var rows = qa(table, "tr");
    var lines = [];
    rows.forEach(function (tr, i) {
      var cells = Array.prototype.slice.call(tr.children).map(cellText);
      lines.push("| " + cells.join(" | ") + " |");
      if (i === 0) {
        lines.push(
          "|" +
            cells
              .map(function () {
                return "---";
              })
              .join("|") +
            "|"
        );
      }
    });
    return lines.join("\n");
  }

  function prepare(root) {
    qa(root, "img").forEach(function (img) {
      var alt = img.getAttribute("alt") || "";
      var emoji = img.className && img.className.indexOf("emoji") >= 0;
      if (emoji && alt) {
        img.parentNode.replaceChild(document.createTextNode(alt), img);
      } else if (img.parentNode) {
        img.parentNode.removeChild(img);
      }
    });
    qa(
      root,
      "iframe,script,style,noscript,svg,video,audio,textarea,input,button,.cs-bookmrk-list,.aick-ask-btn,.qbr-report-btn,.ctqd-quiz-memo,.ctqd-status-badge"
    ).forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    qa(root, "code").forEach(function (c) {
      c.textContent = "`" + (c.textContent || "").trim() + "`";
    });
    qa(root, "table").forEach(function (t) {
      var pre = document.createElement("pre");
      pre.textContent = "\n" + tableToMd(t) + "\n";
      if (t.parentNode) t.parentNode.replaceChild(pre, t);
    });
  }

  function renderText(node) {
    if (!node) return "";
    var h = getHost();
    var clone = node.cloneNode(true);
    if (clone.style) clone.style.display = "block";
    h.appendChild(clone);
    prepare(clone);
    var t = clone.innerText || clone.textContent || "";
    h.removeChild(clone);
    return tidy(t);
  }

  function parseQuestion(li, idx) {
    var type = li.getAttribute("data-type") || "single";

    var textEl = q1(li, ".wpProQuiz_question_text");
    var raw = renderText(textEl);
    var m = raw.match(/【\s*([A-Za-z0-9\-]+)\s*】/);
    var id = m ? m[1] : "";
    if (!id) {
      var memo = q1(li, ".ctqd-quiz-memo[data-label]");
      if (memo) id = memo.getAttribute("data-label") || "";
    }
    var body = raw.replace(/^【[^】]*】\s*/, "");

    var cat = "";
    for (var i = 0; i < li.children.length; i++) {
      var c = li.children[i];
      var ct = tidy(c.textContent);
      if (c.tagName === "DIV" && /^カテゴリ/.test(ct)) {
        cat = ct.replace(/^カテゴリ[ \t]*[:：][ \t]*/, "").trim();
        break;
      }
    }

    var noEl = q1(li, ".wpProQuiz_question_page span");
    var no = noEl ? (noEl.textContent || "").trim() : String(idx + 1);

    var badgeEl = q1(li, ".ctqd-status-badge");
    var badge = badgeEl ? tidy(badgeEl.textContent) : "";

    var items = qa(li, ".wpProQuiz_questionList > li.wpProQuiz_questionListItem");
    var choices = items.map(function (it, i) {
      var label = q1(it, "label");
      var input = q1(it, "input");
      var pos = parseInt(it.getAttribute("data-pos"), 10);
      var lc = label ? " " + label.className + " " : "";
      return {
        disp: i + 1,
        orig: isNaN(pos) ? i + 1 : pos + 1,
        text: renderText(label),
        correct:
          lc.indexOf("ctqd-correct-answer") >= 0 ||
          it.className.indexOf("wpProQuiz_answerCorrect") >= 0,
        selected: lc.indexOf("ctqd-selected") >= 0 || !!(input && input.checked)
      };
    });

    var hasCorrect = choices.some(function (c) {
      return c.correct;
    });
    if (!hasCorrect && window.aickData && window.aickData.originalChoices) {
      var oc = window.aickData.originalChoices[id];
      if (oc) {
        choices.forEach(function (c) {
          var o = oc[c.orig - 1];
          if (o && o.isCorrect) c.correct = true;
        });
        hasCorrect = choices.some(function (c) {
          return c.correct;
        });
      }
    }
    choices.sort(function (a, b) {
      return a.orig - b.orig;
    });

    var okBox = q1(li, ".wpProQuiz_correct .wpProQuiz_AnswerMessage");
    var ngBox = q1(li, ".wpProQuiz_incorrect .wpProQuiz_AnswerMessage");
    var okLen = okBox ? (okBox.textContent || "").length : 0;
    var ngLen = ngBox ? (ngBox.textContent || "").length : 0;
    var expEl = okLen >= ngLen ? okBox : ngBox;
    var explanation = okLen || ngLen ? renderText(expEl) : "";
    /* 動画iframeを削ったあとに残る見出しだけの行を落とす */
    explanation = explanation.replace(/\n*[^\n]{0,12}解説動画[ \t]*$/, "").trim();

    var sel = choices.filter(function (c) {
      return c.selected;
    });
    var cor = choices.filter(function (c) {
      return c.correct;
    });

    var verdict = "";
    if (sel.length) {
      var missed = cor.filter(function (c) {
        return !c.selected;
      }).length;
      var extra = sel.filter(function (c) {
        return !c.correct;
      }).length;
      verdict = missed === 0 && extra === 0 ? "正解" : "誤答";
    } else if (isShown(q1(li, ".wpProQuiz_incorrect"))) {
      verdict = "誤答";
    } else if (badge.indexOf("不正解") >= 0) {
      verdict = "誤答";
    }

    return {
      no: no,
      id: id,
      cat: cat,
      type: type,
      body: body,
      badge: badge,
      choices: choices,
      explanation: explanation,
      selected: sel.map(function (c) {
        return c.orig;
      }),
      correct: cor.map(function (c) {
        return c.orig;
      }),
      verdict: verdict,
      answered: !!(sel.length || explanation)
    };
  }

  function formatQuestion(d, withExp) {
    var L = [];
    var head = "### " + (d.id || "Q" + d.no);
    if (d.cat) head += " ［" + d.cat + "］";
    if (d.type === "multiple") head += " (複数選択)";
    if (d.verdict) head += " — " + d.verdict;
    L.push(head);
    if (d.badge) L.push("習熟度: " + d.badge);
    L.push("");
    L.push(d.body);
    L.push("");
    L.push("【選択肢】番号は解説内の「正解N / 不正解N」と対応");
    d.choices.forEach(function (c) {
      var mk = c.correct ? "○" : "×";
      if (c.selected) mk += " ←あなたの解答";
      L.push(c.orig + ". " + mk + " " + c.text);
    });
    L.push("");
    L.push(
      "あなたの解答: " +
        (d.selected.length ? d.selected.join(",") : "未回答") +
        " / 正解: " +
        (d.correct.length ? d.correct.join(",") : "不明")
    );
    if (withExp && d.explanation) {
      L.push("");
      L.push("【解説】");
      L.push(d.explanation);
    }
    return L.join("\n");
  }

  function pageTitle() {
    var h = q1(document, ".ld-focus-content h1");
    var t = h ? tidy(h.textContent) : "";
    return t || tidy(document.title).replace(/\s*–\s*CloudTech.*$/, "");
  }

  function build(list, withExp) {
    var out = ["# CloudTech " + pageTitle(), "出典: " + location.href, ""];
    list.forEach(function (d, i) {
      if (i) out.push("", "---", "");
      out.push(formatQuestion(d, withExp));
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }


  /* ---------- 公開インターフェース (bridge.js 経由で押下時に呼ばれる) ---------- */

  window.__tqExtractors = window.__tqExtractors || {};
  window.__tqExtractors.cloudtech = {
    name: "CloudTech",
    /* id: current | wrong | answered | all */
    run: function (id, withExp) {
      var lis = qa(document, "li.wpProQuiz_listItem");
      if (!lis.length) {
        return Promise.reject(new Error("問題が見つかりません。CloudTechの問題演習ページで実行してください。"));
      }
      var currentEl = lis.filter(isShown)[0] || null;
      var parsed = lis.map(parseQuestion);
      dropHost();
      var answered = parsed.filter(function (d) {
        return d.answered;
      });
      var lists = {
        current: currentEl ? [parsed[lis.indexOf(currentEl)]] : [],
        wrong: answered.filter(function (d) {
          return d.verdict === "誤答";
        }),
        answered: answered,
        all: parsed
      };
      var list = lists[id] || [];
      return Promise.resolve({ text: build(list, withExp), count: list.length, notes: [] });
    }
  };
})();
