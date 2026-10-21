/**
 * Udemy の練習テスト(Practice Test)ページから、
 * 「問題文 / 選択肢 / あなたの解答 / 正解 / 選択肢ごとの説明 / 全体的な説明」だけを抜き出して
 * クリップボードにコピーするブックマークレット。
 *
 * 取り方は2系統:
 *  - 画面: いま表示されている回答済みの問題をDOMから読む(演習モードで1問答えた直後など)
 *  - API : ログイン中のCookieのまま /api-2.0/ を読み、テスト全問と最新の受験回の解答をまとめて取る
 *
 */
(function () {
  "use strict";

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
      key: squash(body).slice(0, 80),
      src: a
    };
  }

  function attemptById(courseId, quizId, attemptId) {
    var base =
      "/api-2.0/users/me/subscribed-courses/" + courseId + "/quizzes/" + quizId + "/user-attempted-quizzes/";
    var f = "draft=false&fields[user_attempted_quiz]=id,version,created,completion_time";
    return apiGet(base + attemptId + "/?" + f);
  }

  function loadApi(quizId, attemptId) {
    var notes = [];
    var quizP = apiGet(
      "/api-2.0/quizzes/" + quizId + "/?draft=false&fields[quiz]=id,title,version"
    ).catch(function () {
      return {};
    });
    var courseP = getCourseId();
    var attP = courseP
      .then(function (cid) {
        if (!attemptId) return latestAttempt(cid, quizId);
        return attemptById(cid, quizId, attemptId).catch(function () {
          notes.push("受験回 " + attemptId + " を直接取得できなかったため、最新の受験回で代用");
          return latestAttempt(cid, quizId);
        });
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


  function wrongOf(list) {
    return list.filter(function (d) {
      return d.verdict === "誤答";
    });
  }

  /* ---------- 演習用の取り込み (間違い + 見直しマーク) ---------- */

  var KEEP = "P,BR,UL,OL,LI,STRONG,B,EM,I,U,CODE,PRE,TABLE,THEAD,TBODY,TR,TH,TD,A,IMG,H1,H2,H3,H4,H5,H6,BLOCKQUOTE,SPAN,DIV,SUB,SUP".split(",");
  var DROP = "SCRIPT,STYLE,IFRAME,OBJECT,EMBED,SVG,VIDEO,AUDIO,NOSCRIPT,LINK,META,BASE,FORM,INPUT,BUTTON,TEXTAREA,SELECT".split(",");

  /* APIのHTMLを許可リスト方式で作り直す。属性は a[href] / img[src,alt] / セルの結合だけ残す */
  function cleanHtml(html) {
    if (!html) return "";
    var doc = new DOMParser().parseFromString(String(html), "text/html");
    var out = document.createElement("div");
    function walk(src, dst) {
      Array.prototype.slice.call(src.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          dst.appendChild(document.createTextNode(n.nodeValue));
          return;
        }
        if (n.nodeType !== 1) return;
        var tag = n.nodeName.toUpperCase();
        if (DROP.indexOf(tag) >= 0) return;
        if (KEEP.indexOf(tag) < 0) return walk(n, dst);
        if (tag === "IMG") {
          var srcUrl = n.getAttribute("src") || "";
          if (/display:\s*none/.test(n.getAttribute("style") || "") || !/^https:/.test(srcUrl)) return;
          var img = document.createElement("img");
          img.setAttribute("src", srcUrl);
          img.setAttribute("alt", n.getAttribute("alt") || "");
          dst.appendChild(img);
          return;
        }
        var el = document.createElement(tag.toLowerCase());
        if (tag === "A") {
          var href = n.getAttribute("href") || "";
          if (/^https?:/.test(href)) {
            el.setAttribute("href", href);
            el.setAttribute("target", "_blank");
            el.setAttribute("rel", "noopener noreferrer");
          }
        }
        if (tag === "TD" || tag === "TH") {
          ["colspan", "rowspan"].forEach(function (k) {
            if (/^\d{1,2}$/.test(n.getAttribute(k) || "")) el.setAttribute(k, n.getAttribute(k));
          });
        }
        walk(n, el);
        dst.appendChild(el);
      });
    }
    walk(doc.body, out);
    return out.innerHTML;
  }

  function richQuestion(d, wrong, marked) {
    var a = d.src || {};
    var p = a.prompt || {};
    var fbs = p.feedbacks || [];
    return {
      id: a.id,
      no: d.no,
      section: a.section ? tidy(a.section) : "",
      multi: d.multi,
      bodyHtml: cleanHtml(p.question),
      choices: (p.answers || []).map(function (h, i) {
        var l = LETTERS.charAt(i);
        return {
          letter: l,
          html: cleanHtml(h),
          feedback: cleanHtml(fbs[i]),
          correct: d.correct.indexOf(l) >= 0,
          selected: d.selected.indexOf(l) >= 0
        };
      }),
      explanationHtml: cleanHtml(p.explanation),
      correct: d.correct,
      selected: d.selected,
      wrong: wrong,
      marked: marked
    };
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  /* 見直しマーク・不正解はAPIから確実に取れるか未確認のため、いま開いている画面から読む。
     テスト画面: 質問一覧(右のパネル)の各項目。結果画面: 全問の一覧と「マーク済み」フィルターで絞った一覧 */
  function navInfo(items) {
    var marks = [];
    var wrongs = [];
    items.forEach(function (li) {
      var title = q1(li, ".ud-btn-label");
      var t = q1(li, '[data-purpose="safely-set-inner-html:question-navigation-item:question"]');
      var row = q1(li, '[class*="title-row"]');
      var info = { no: title ? tidy(title.textContent) : "", text: squash(t ? t.textContent : "") };
      var on =
        !!q1(li, 'button[aria-label="見直しのマークを外す"]') ||
        qa(li, "use").some(function (u) {
          return /icon-saved/.test(u.getAttribute("xlink:href") || u.getAttribute("href") || "");
        });
      if (on) marks.push(info);
      if (row && /不正解|誤答|間違/.test(row.textContent || "")) wrongs.push(info);
    });
    return { marks: marks, wrongs: wrongs };
  }

  function findPill(re) {
    return qa(document, '[class*="input-pill-module--label"]').filter(function (l) {
      return re.test(l.textContent || "");
    })[0];
  }

  function readPanes() {
    return qa(document, '[class*="result-pane--question-result-pane--"]').map(function (pane) {
      var p = q1(pane, '[id="question-prompt"]');
      var st = q1(pane, '[data-purpose="question-result-header-status-label"]');
      var m = (pane.textContent || "").match(/問題\d+/);
      return {
        no: m ? m[0] : "",
        text: squash(p ? p.textContent : ""),
        wrong: !!st && /不正解|誤答|間違/.test(st.textContent || "")
      };
    });
  }

  function infoFromResult() {
    var markedPill = findPill(/マーク済み/);
    var allPill = findPill(/すべて/);
    if (!markedPill) return Promise.resolve({ marks: null, wrongs: [], note: "「マーク済み」フィルターが見つかりません" });
    if (allPill) allPill.click();
    return sleep(500)
      .then(function () {
        var wrongs = readPanes().filter(function (x) {
          return x.wrong;
        });
        markedPill.click();
        return sleep(700).then(function () {
          return { marks: readPanes(), wrongs: wrongs };
        });
      })
      .then(function (r) {
        if (allPill) allPill.click();
        return { marks: r.marks, wrongs: r.wrongs, note: "" };
      });
  }

  function collectInfo() {
    var items = qa(document, '[data-purpose="question-navigation-item"]');
    if (items.length) {
      var r = navInfo(items);
      return Promise.resolve({ marks: r.marks, wrongs: r.wrongs, note: "" });
    }
    if (/\/result\//.test(location.pathname)) return infoFromResult();
    return Promise.resolve({
      marks: null,
      wrongs: [],
      note: "質問一覧が見つからないため、見直しマークと画面の不正解は取れません(右の質問一覧パネルを開いて再実行してください)"
    });
  }

  function sameHead(x, y) {
    var n = Math.min(x.length, y.length, 50);
    return n >= 10 && x.slice(0, n) === y.slice(0, n);
  }
  function matchMark(qs, mk) {
    if (!mk.text) return [];
    var hits = qs.filter(function (d) {
      var plain = squash((d.src && d.src.question_plain) || "");
      return sameHead(plain, mk.text) || sameHead(d.key, mk.text);
    });
    if (hits.length > 1 && mk.no) {
      var byNo = hits.filter(function (d) {
        return d.no === mk.no;
      });
      if (byNo.length) hits = byNo;
    }
    return hits.slice(0, 1);
  }

  function collectPractice() {
    var quizId = getQuizId();
    if (!quizId) {
      return Promise.reject(new Error("URLにクイズIDがありません。/learn/quiz/数字/ のテスト画面か結果画面で実行してください。"));
    }
    var attemptId = (location.pathname.match(/\/result\/(\d+)/) || [])[1] || "";
    return Promise.all([
      loadApi(quizId, attemptId).then(null, function (e) {
        return { title: "", questions: [], attempt: null, notes: ["API取得に失敗: " + e.message] };
      }),
      collectInfo()
    ]).then(function (r) {
      var res = r[0];
      var mk = r[1];
      var notes = res.notes.slice();
      if (mk.note) notes.push(mk.note);
      function resolveAll(list) {
        var set = [];
        var miss = 0;
        (list || []).forEach(function (m) {
          var hit = matchMark(res.questions, m);
          if (hit.length) {
            if (set.indexOf(hit[0]) < 0) set.push(hit[0]);
          } else miss++;
        });
        return { set: set, miss: miss };
      }
      var mkR = resolveAll(mk.marks);
      var wrR = resolveAll(mk.wrongs);
      var apiWrong = wrongOf(res.questions);
      var apiAnswered = res.questions.filter(function (d) {
        return d.answered;
      });
      notes.push(
        "診断: API 全" + res.questions.length + "問 / 解答あり" + apiAnswered.length + "問 / 誤答" + apiWrong.length +
          "問、画面 不正解" + (mk.wrongs || []).length + "件(照合" + wrR.set.length + "件)、マーク" +
          (mk.marks || []).length + "件(照合" + mkR.set.length + "件)"
      );
      if (mkR.miss || wrR.miss) notes.push("問題文を照合できなかったもの: マーク" + mkR.miss + "件 / 不正解" + wrR.miss + "件");
      var out = [];
      res.questions.forEach(function (d) {
        var wrong = d.verdict === "誤答" || wrR.set.indexOf(d) >= 0;
        var marked = mkR.set.indexOf(d) >= 0;
        if ((wrong || marked) && d.correct.length) out.push(richQuestion(d, wrong, marked));
      });
      dropHost();
      return {
        quizId: quizId,
        attemptId: attemptId || (res.attempt && res.attempt.id) || "",
        from: /\/result\//.test(location.pathname) ? "result" : "test",
        title: courseTitle() + (res.title ? " / " + res.title : ""),
        savedAt: Date.now(),
        questions: out,
        notes: notes
      };
    });
  }

  /* ---------- 公開インターフェース (bridge.js 経由で押下時に呼ばれる) ---------- */

  function getQuizId() {
    return (location.pathname.match(/\/quiz\/(\d+)/) || [])[1] || "";
  }

  window.__tqExtractors = window.__tqExtractors || {};
  window.__tqExtractors.udemy = {
    name: "Udemy",
    collect: collectPractice,
    /* id: current | wrong | answered | all
       current は画面から、それ以外はAPI(テスト全体)から取る。APIが使えなければ画面の問題で代用 */
    run: function (id, withExp) {
      var quizId = getQuizId();
      var roots = findDomRoots();
      var domQs = roots.map(function (r, i) {
        return parseDomQuestion(r, i, roots.length);
      });
      dropHost();
      if (!domQs.length && !quizId) {
        return Promise.reject(new Error("問題が見つかりません。Udemyの練習テストのページで実行してください。"));
      }
      var notes = [];
      var p = quizId
        ? loadApi(quizId).then(null, function (e) {
            dropHost();
            notes.push("API取得に失敗したため画面の問題だけで抽出: " + e.message);
            return null;
          })
        : Promise.resolve(null);
      return p.then(function (res) {
        api = res;
        var src = domQs;
        if (id !== "current") {
          if (res) {
            src = res.questions;
            notes.push(
              res.attempt
                ? "解答履歴: 最新の受験回" + (res.attempt.completion_time ? "(完了済み)" : "(受験中)")
                : "解答履歴なし: 正解と解説のみ"
            );
            notes = notes.concat(res.notes);
          }
        }
        var answered = src.filter(function (d) {
          return d.answered;
        });
        var lists = {
          current: domQs.length <= 1 ? domQs : wrongOf(domQs),
          wrong: wrongOf(answered),
          answered: answered,
          all: src
        };
        var list = lists[id] || [];
        return { text: build(resolve(list), withExp), count: list.length, notes: notes };
      });
    }
  };
})();
