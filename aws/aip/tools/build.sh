#!/bin/bash
# exam-review-extractor.js からブックマークレット用URLを生成する。
# 使い方: ./build.sh  (このディレクトリで実行)
set -euo pipefail
cd "$(dirname "$0")"

node -e '
const fs = require("fs");
let src = fs.readFileSync("exam-review-extractor.js", "utf8");
// ブロックコメント /* ... */ を除去
src = src.replace(/\/\*[\s\S]*?\*\//g, "");
// 念のため行コメント // ... も除去(このファイルではブロックコメントのみ使用する前提)
src = src.replace(/(^|[^:])\/\/.*$/gm, "$1");
// 空白・改行をすべて単一スペースに圧縮
src = src.replace(/\s+/g, " ").trim();
const bookmarklet = "javascript:" + encodeURIComponent(src);
fs.writeFileSync("exam-review-extractor.bookmarklet.txt", bookmarklet);
console.log("生成しました: exam-review-extractor.bookmarklet.txt (" + bookmarklet.length + " 文字)");
'

node --check <(node -e '
const fs = require("fs");
const enc = fs.readFileSync("exam-review-extractor.bookmarklet.txt","utf8");
process.stdout.write(decodeURIComponent(enc.replace(/^javascript:/, "")));
') && echo "構文チェックOK"
