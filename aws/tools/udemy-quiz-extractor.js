/**
 * Udemy の練習テスト(Practice Test)ページから、
 * 「問題文 / 選択肢 / あなたの解答 / 正解 / 選択肢ごとの説明 / 全体的な説明」だけを抜き出して
 * クリップボードにコピーするブックマークレット。
 *
 * 取り方は2系統:
 *  - 画面: いま表示されている回答済みの問題をDOMから読む(演習モードで1問答えた直後など)
 *  - API : ログイン中のCookieのまま /api-2.0/ を読み、テスト全問と最新の受験回の解答をまとめて取る
 *
 * ビルド: 同ディレクトリの ./build.sh
 */
(function () {
  "use strict";

  var PANEL_ID = "__udQuizExtractorPanel";
  var LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  var IND = new Array(4).join(" ");

  function qa(root, sel) {
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }
  function q1(root, sel) {
    return root.querySelector(sel);
  }
  function remove(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function replaceWith(el, node) {
    if (el.parentNode) el.parentNode.replaceChild(node, el);
  }
  /* 行頭のインデント(入れ子リスト・コード)は残し、行中の連続空白だけ詰める */
  function tidy(s) {
    return (s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .replace(/(\S)[ \t]+/g, "$1 ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function squash(s) {
    return (s || "").replace(/\s+/g, "");
  }

  /* クローンを画面外に置いてレンダリングさせ、innerText で改行を正しく取る */
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
    remove(host);
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
    /* 拡大表示用に display:none で重複している画像は捨て、残りは［図］の目印だけ残す */
    qa(root, "img").forEach(function (img) {
      if (/display:\s*none/.test(img.getAttribute("style") || "")) remove(img);
      else replaceWith(img, document.createTextNode("［図］"));
    });
    qa(
      root,
      "script,style,noscript,link,meta,base,object,embed,iframe,svg,video,audio,textarea,input,select,button,.ud-sr-only,[class*='popper-content'],[role='tooltip']"
    ).forEach(remove);
    qa(root, "a[href]").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      var t = tidy(a.textContent);
      if (/^https?:/.test(href) && t && t !== href) {
        replaceWith(a, document.createTextNode("[" + t + "](" + href + ")"));
      }
    });
    qa(root, "pre").forEach(function (p) {
      p.textContent = "```\n" + (p.textContent || "").replace(/\n+$/, "") + "\n```";
    });
    qa(root, "code").forEach(function (c) {
      c.textContent = "`" + (c.textContent || "").trim() + "`";
    });
    qa(root, "table").forEach(function (t) {
      var pre = document.createElement("pre");
      pre.textContent = "\n" + tableToMd(t) + "\n";
      replaceWith(t, pre);
    });
    /* li > p の段落余白で箇条書きが1行おきになるのを防ぐ */
    qa(root, "li").forEach(function (li) {
      Array.prototype.slice
        .call(li.children)
        .filter(function (c) {
          return c.tagName === "P";
        })
        .forEach(function (p, i) {
          if (i) li.insertBefore(document.createElement("br"), p);
          while (p.firstChild) li.insertBefore(p.firstChild, p);
          remove(p);
        });
    });
    /* innerText はリストの記号を出さないので自前で付ける。インデントはNBSPにしないと描画で潰れる */
    qa(root, "li").forEach(function (li) {
      var depth = 0;
      for (var a = li.parentNode; a && a !== root; a = a.parentNode) {
        if (a.tagName === "LI") depth++;
      }
      var list = li.parentNode;
      var mark =
        list && list.tagName === "OL"
          ? Array.prototype.indexOf.call(list.children, li) + 1 + ". "
          : "- ";
      li.insertBefore(
        document.createTextNode(new Array(depth * 2 + 1).join("\u00a0") + mark),
        li.firstChild
      );
    });
    qa(root, "strong,b").forEach(function (s) {
      var t = tidy(s.textContent);
      if (t) s.textContent = "**" + t + "**";
    });
    /* Udemyのクラス由来の装飾・非表示指定を外し、素のHTMLとして描画させる */
    [root].concat(qa(root, "*")).forEach(function (el) {
      for (var i = el.attributes.length - 1; i >= 0; i--) {
        var n = el.attributes[i].name;
        if (n === "class" || n === "style" || n === "id" || n.indexOf("on") === 0) {
          el.removeAttribute(n);
        }
      }
    });
  }

  function renderNode(node) {
    if (!node) return "";
    var clone = node.cloneNode(true);
    prepare(clone);
    clone.style.display = "block";
    var h = getHost();
    h.appendChild(clone);
    var t = clone.innerText || clone.textContent || "";
    h.removeChild(clone);
    return tidy(t);
  }
  /* APIのHTMLは不活性なDOMParser上でprepare(画像・スクリプト除去)してから画面に載せる */
  function renderHtml(html) {
    if (!html) return "";
    var doc = new DOMParser().parseFromString(String(html), "text/html");
    var box = doc.createElement("div");
    while (doc.body.firstChild) box.appendChild(doc.body.firstChild);
    return renderNode(box);
  }

  function pick(choices, key) {
    return choices
      .filter(function (c) {
        return c[key];
      })
      .map(function (c) {
        return c.letter;
      });
  }
  function judge(sel, cor) {
    if (!sel.length || !cor.length) return "";
    return sel.slice().sort().join(",") === cor.slice().sort().join(",") ? "正解" : "誤答";
  }

  /* ---------- 画面(DOM)から ---------- */

  function findDomRoots() {
    var roots = qa(document, '[class*="question-result--question-result--"]');
    if (roots.length) return roots;
    qa(document, '[id="question-prompt"]').forEach(function (p) {
      var r = p.parentNode;
      while (r && r !== document.body && !q1(r, '[data-purpose="answer"]')) r = r.parentNode;
      if (r && r !== document.body && roots.indexOf(r) < 0) roots.push(r);
    });
    return roots;
  }

  function parseDomQuestion(root, idx, total) {
    var titleEl = q1(root, '[class*="question-title"]');
    var no = titleEl ? renderNode(titleEl).replace(/[:：]$/, "") : "";
    var multi = false;

    var choices = qa(root, '[data-purpose="answer"]').map(function (ans, i) {
      var cls = String(ans.className || "");
      var labelEl = q1(ans, '[data-purpose="answer-result-header-user-label"]');
      var label = labelEl ? tidy(labelEl.textContent) : "";
      var use = q1(ans, '[data-purpose="answer-result-body-selection-icon"] use');
      var icon = use ? use.getAttribute("xlink:href") || use.getAttribute("href") || "" : "";
      var input = q1(ans, "input");
      if (/checkbox/.test(icon) || (input && input.type === "checkbox")) multi = true;

      /* answer-incorrect = 選んで外れ / answer-correct = 正解(選んだかはラベルかアイコンで判定) / answer-skipped = 選んでいない */
      var selected = !!(input && input.checked);
      if (/answer-incorrect/.test(cls)) selected = true;
      else if (/answer-correct/.test(cls)) {
        selected = selected || /回答|your answer/i.test(label) || (!!icon && !/empty/.test(icon));
      }

      var pane = ans.parentNode;
      var fb =
        pane && qa(pane, '[data-purpose="answer"]').length === 1
          ? q1(pane, '[id="question-explanation"]')
          : null;
      return {
        letter: LETTERS.charAt(i),
        text: renderNode(
          q1(ans, '[id="answer-text"]') || q1(ans, '[data-purpose="answer-body"]') || ans
        ),
        feedback: renderNode(fb),
        correct: /answer-correct/.test(cls),
        selected: selected
      };
    });

    /* 「全体的な説明」以外の付帯欄(ドメイン等)があれば1行で添える */
    var meta = [];
    qa(root, '[class*="question-related-fields"] .ud-form-group').forEach(function (g) {
      if (q1(g, '[id="overall-explanation"]')) return;
      var lab = q1(g, "label");
      var k = lab ? tidy(lab.textContent) : "";
      var v = renderNode(g);
      if (k && v.indexOf(k) === 0) v = v.slice(k.length);
      v = tidy(v).replace(/\n+/g, " / ");
      if (v) meta.push((k || "情報") + ": " + v);
    });

    var sel = pick(choices, "selected");
    var cor = pick(choices, "correct");
    var banner = q1(root, '[class*="alert-banner-module--alert-banner-"]');
    var bc = banner ? String(banner.className) : "";
    var verdict =
      judge(sel, cor) ||
      (/banner-error/.test(bc) ? "誤答" : /banner-success/.test(bc) ? "正解" : cor.length ? "未回答" : "");

    var countEl = total === 1 ? q1(document, '[data-purpose="question-count"]') : null;
    var body = renderNode(q1(root, '[id="question-prompt"]'));

    return {
      no: no || "問題" + (idx + 1),
      pos: countEl ? tidy(countEl.textContent) : "",
      multi: multi,
      meta: meta,
      body: body,
      choices: choices,
      explanation: renderNode(q1(root, '[id="overall-explanation"]')),
      selected: sel,
      correct: cor,
      verdict: verdict,
      answered: !!(sel.length || cor.length),
      key: squash(body).slice(0, 80)
    };
  }

  /* ---------- API から ---------- */

  function apiGet(url) {
    return fetch(url, { credentials: "include", headers: { Accept: "application/json" } }).then(
      function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status + " " + url.split("?")[0]);
        return r.json();
      }
    );
  }
  function apiAll(url) {
    var out = [];
    function step(u) {
      return apiGet(u).then(function (j) {
        out = out.concat((j && j.results) || []);
        return j && j.next ? step(String(j.next).replace(/^https?:\/\/[^\/]+/, "")) : out;
      });
    }
    return step(url);
  }

  function getCourseId() {
    try {
      var el = q1(document, '[data-module-id="course-taking"][data-module-args]');
      var id = JSON.parse(el.getAttribute("data-module-args")).courseId;
      if (id) return Promise.resolve(id);
    } catch (e) {
      /* SPA遷移で要素が無い場合はURLのslugから引く */
    }
    var slug = (location.pathname.match(/\/course\/([^\/]+)/) || [])[1];
    if (!slug) return Promise.reject(new Error("コースIDが取れません"));
    return apiGet("/api-2.0/courses/" + slug + "/?fields[course]=id").then(function (c) {
      return c.id;
    });
  }

  function latestAttempt(courseId, quizId) {
    var base =
      "/api-2.0/users/me/subscribed-courses/" +
      courseId +
      "/quizzes/" +
      quizId +
      "/user-attempted-quizzes/";
    var f = "draft=false&fields[user_attempted_quiz]=id,version,created,completion_time";
    return apiGet(base + "latest/?" + f).catch(function () {
      return apiAll(base + "?page_size=100&" + f).then(function (list) {
        list.sort(function (a, b) {
          return (b.id || 0) - (a.id || 0);
        });
        return list[0] || null;
      });
    });
  }

  /* 解答・正解は "a" / ["a","c"] / '["a"]'(JSON文字列) のどれでも来うる */
  function toLetters(v) {
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch (e) {
        /* "a" のような素の文字列 */
      }
    }
    if (!Array.isArray(v)) v = v == null || v === "" ? [] : [v];
    return v
      .map(function (x) {
        return String(x).trim().toUpperCase();
      })
      .filter(function (x) {
        return /^[A-Z]$/.test(x);
      })
      .sort();
  }

  function parseApiQuestion(a, idx, answerOf) {
    var p = a.prompt || {};
    var cor = toLetters(a.correct_response);
    var ua = answerOf[a.id];
    var sel = ua ? toLetters(ua.response) : [];
    var fbs = p.feedbacks || [];
    var choices = (p.answers || []).map(function (h, i) {
      var l = LETTERS.charAt(i);
      return {
        letter: l,
        text: renderHtml(h),
        feedback: renderHtml(fbs[i]),
        correct: cor.indexOf(l) >= 0,
        selected: sel.indexOf(l) >= 0
      };
    });
    var body = renderHtml(p.question);
    return {
      no: "問題" + (idx + 1),
      pos: "",
      multi: a.assessment_type === "multi-select",
      meta: a.section ? ["分野: " + tidy(a.section)] : [],
      body: body,
      choices: choices,
      explanation: renderHtml(p.explanation),
      selected: sel,
      correct: cor,
      verdict: judge(sel, cor) || (ua ? "未回答" : ""),
      answered: sel.length > 0,
      key: squash(body).slice(0, 80)
    };
  }

  function loadApi(quizId) {
    var notes = [];
    var quizP = apiGet(
      "/api-2.0/quizzes/" + quizId + "/?draft=false&fields[quiz]=id,title,version"
    ).catch(function () {
      return {};
    });
    var courseP = getCourseId();
    var attP = courseP
      .then(function (cid) {
        return latestAttempt(cid, quizId);
      })
      .catch(function (e) {
        notes.push("解答履歴を取得できません: " + e.message);
        return null;
      });

    return Promise.all([
      quizP,
      courseP.catch(function () {
        return null;
      }),
      attP
    ]).then(function (r) {
      var quiz = r[0] || {};
      var cid = r[1];
      var att = r[2] && r[2].id ? r[2] : null;
      var ver = (att && att.version) || quiz.version;
      function qsUrl(v) {
        return (
          "/api-2.0/quizzes/" +
          quizId +
          "/assessments/?" +
          (v ? "version=" + v + "&" : "") +
          "page_size=250&draft=false&fields[assessment]=id,assessment_type,prompt,correct_response,section,question_plain"
        );
      }
      var qsP = apiAll(qsUrl(ver)).catch(function (e) {
        if (ver) throw e;
        return apiAll(qsUrl(1));
      });
      var ansP = att
        ? apiAll(
            "/api-2.0/users/me/subscribed-courses/" +
              cid +
              "/user-attempted-quizzes/" +
              att.id +
              "/assessment-answers/?draft=false&page_size=250&fields[assessment_answer]=id,assessment,response"
          ).catch(function (e) {
            notes.push("解答を取得できません: " + e.message);
            return null;
          })
        : Promise.resolve(null);

      return Promise.all([qsP, ansP]).then(function (r2) {
        var answerOf = {};
        (r2[1] || []).forEach(function (x) {
          var id = x.assessment && typeof x.assessment === "object" ? x.assessment.id : x.assessment;
          if (id != null) answerOf[id] = x;
        });
        var list = r2[0].map(function (a, i) {
          return parseApiQuestion(a, i, answerOf);
        });
        dropHost();
        return {
          title: quiz.title || "",
          questions: list,
          attempt: r2[1] ? att : null,
          notes: notes
        };
      });
    });
  }

  /* ---------- 出力 ---------- */

  function indentRest(s) {
    return s
      .split("\n")
      .map(function (l, i) {
        return i && l ? IND + l : l;
      })
      .join("\n");
  }

  function formatQuestion(d, withExp) {
    var head = "### " + d.no;
    if (d.pos) head += " (" + d.pos + ")";
    if (d.multi) head += " (複数選択)";
    if (d.verdict) head += " — " + d.verdict;
    var L = [head].concat(d.meta);
    L.push("", d.body, "", "【選択肢】");
    var known = d.correct.length > 0;
    d.choices.forEach(function (c) {
      var mk = known ? (c.correct ? "○" : "×") : "・";
      if (c.selected) mk += " ←あなたの解答";
      L.push(c.letter + ". " + mk + " " + indentRest(c.text));
      if (withExp && c.feedback) L.push(IND + "説明: " + indentRest(c.feedback));
    });
    L.push("");
    L.push(
      "あなたの解答: " +
        (d.selected.length ? d.selected.join(",") : "未回答") +
        " / 正解: " +
        (known ? d.correct.join(",") : "不明")
    );
    if (withExp && d.explanation) {
      L.push("", "【全体的な説明】", d.explanation);
    }
    return L.join("\n");
  }

  var api = null;

  function courseTitle() {
    return tidy(document.title)
      .replace(/^(Course|コース)[:：]\s*/, "")
      .replace(/\s*\|\s*Udemy\s*$/, "");
  }

  function build(list, withExp) {
    var title = courseTitle();
    if (api && api.title) title += " / " + api.title;
    var out = ["# Udemy " + title, "出典: " + location.href, ""];
    list.forEach(function (d, i) {
      if (i) out.push("", "---", "");
      out.push(formatQuestion(d, withExp));
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
  }

  /* 画面の問題が未回答で正解が取れていなければ、API側の同じ問題(問題文で照合)に差し替える */
  function resolve(list) {
    if (!api) return list;
    return list.map(function (d) {
      if (d.correct.length) return d;
      for (var i = 0; i < api.questions.length; i++) {
        if (api.questions[i].key && api.questions[i].key === d.key) return api.questions[i];
      }
      return d;
    });
  }

  function copy(text) {
    var ok = false;
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText =
        "position:fixed;top:0;left:0;opacity:0;-webkit-user-select:text;user-select:text;";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {
      ok = false;
    }
    if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      ok = true;
    }
    return ok;
  }

  function wrongOf(list) {
    return list.filter(function (d) {
      return d.verdict === "誤答";
    });
  }

  /* ---------- main ---------- */

  remove(document.getElementById(PANEL_ID));

  var quizId = (location.pathname.match(/\/quiz\/(\d+)/) || [])[1] || "";
  var roots = findDomRoots();
  var domQs = roots.map(function (r, i) {
    return parseDomQuestion(r, i, roots.length);
  });
  dropHost();

  if (!domQs.length && !quizId) {
    alert("問題が見つかりません。Udemyの練習テストのページ(/learn/quiz/数字/)で実行してください。");
    return;
  }

  var panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.cssText =
    "position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;max-height:calc(100vh - 32px);overflow:auto;background:#111827;color:#f9fafb;font:13px/1.6 -apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.4);padding:14px;text-align:left;";

  var sub = "font-size:11px;opacity:.65;margin:10px 0 4px;";
  panel.innerHTML =
    "<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:8px'>" +
    "<b>問題を抽出 (Udemy)</b><span data-x style='cursor:pointer;padding:0 6px;opacity:.7'>×</span></div>" +
    "<label style='display:block;margin-bottom:4px;cursor:pointer'><input type='checkbox' data-exp checked> 解説を含める</label>" +
    "<div style='" + sub + "'>画面から</div><div data-dom></div>" +
    "<div style='" + sub + "'>テスト全体 (API)</div><div data-api></div>" +
    "<div data-api-msg style='font-size:12px;opacity:.85;white-space:pre-wrap'></div>" +
    "<div data-msg style='margin-top:8px;font-size:12px;opacity:.85'></div>";
  document.body.appendChild(panel);

  var msg = q1(panel, "[data-msg]");
  var expCb = q1(panel, "[data-exp]");
  var apiMsg = q1(panel, "[data-api-msg]");

  q1(panel, "[data-x]").onclick = function () {
    remove(panel);
  };

  function addBtn(box, text, list) {
    var b = document.createElement("button");
    b.textContent = text;
    b.disabled = !list.length;
    b.style.cssText =
      "display:block;width:100%;margin:0 0 6px;padding:8px 10px;border:0;border-radius:6px;cursor:pointer;font:inherit;text-align:left;background:" +
      (list.length ? "#2563eb" : "#374151") +
      ";color:#fff;";
    b.onclick = function () {
      var text2 = build(resolve(list), expCb.checked);
      var ok = copy(text2);
      msg.textContent =
        (ok ? "コピーしました" : "コピー失敗。下のテキストを手動でコピーしてください") +
        " (" +
        list.length +
        "問 / " +
        text2.length +
        "文字)";
      var ta = document.createElement("textarea");
      ta.value = text2;
      ta.style.cssText =
        "display:block;width:100%;box-sizing:border-box;height:120px;margin-top:6px;font:11px/1.4 monospace;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:6px;-webkit-user-select:text;user-select:text;";
      msg.appendChild(ta);
      ta.focus();
      ta.select();
    };
    box.appendChild(b);
  }

  var domBox = q1(panel, "[data-dom]");
  if (domQs.length <= 1) {
    var cur = domQs[0];
    addBtn(domBox, "表示中の1問" + (cur ? " (" + cur.no + ")" : " なし"), cur ? [cur] : []);
  } else {
    addBtn(domBox, "画面上の全問 (" + domQs.length + "問)", domQs);
    addBtn(domBox, "画面上の誤答 (" + wrongOf(domQs).length + "問)", wrongOf(domQs));
  }

  if (!quizId) {
    apiMsg.textContent = "URLにクイズIDが無いため取得しません";
    return;
  }
  apiMsg.textContent = "取得中…";
  loadApi(quizId).then(
    function (res) {
      api = res;
      var all = res.questions;
      var answered = all.filter(function (d) {
        return d.answered;
      });
      var apiBox = q1(panel, "[data-api]");
      addBtn(apiBox, "誤答した問題だけ (" + wrongOf(answered).length + "問)", wrongOf(answered));
      addBtn(apiBox, "回答済みすべて (" + answered.length + "問)", answered);
      addBtn(apiBox, "このテストの全問 (" + all.length + "問)", all);
      var lines = [
        res.attempt
          ? "解答履歴: 最新の受験回" + (res.attempt.completion_time ? "(完了済み)" : "(受験中)")
          : "解答履歴なし: 正解と解説のみ"
      ].concat(res.notes);
      apiMsg.textContent = lines.join("\n");
    },
    function (e) {
      dropHost();
      apiMsg.textContent = "API取得に失敗: " + e.message;
    }
  );
})();
