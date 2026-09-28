#!/bin/bash
# *-quiz-extractor.js からブックマークレット用URL(*.bookmarklet.txt)を生成する。
# 使い方: ./build.sh                          (このディレクトリの全ソース)
#         ./build.sh udemy-quiz-extractor.js  (指定したものだけ)
set -euo pipefail
cd "$(dirname "$0")"

if [ $# -gt 0 ]; then SRCS=("$@"); else SRCS=(*-quiz-extractor.js); fi

for SRC in "${SRCS[@]}"; do
OUT="${SRC%.js}.bookmarklet.txt"

node -e '
const fs = require("fs");
const src0 = fs.readFileSync(process.argv[1], "utf8");
/* ソース中に生のU+00A0など「\s扱いされる非ASCII空白」があると圧縮で壊れるため検出する */
const bad = src0.match(/[  -​　﻿]/);
if (bad) {
  console.error("エラー: ソースに生の特殊空白(U+" + bad[0].charCodeAt(0).toString(16) + ")があります。\\\\uXXXX エスケープに直してください。");
  process.exit(1);
}
let src = src0;
src = src.replace(/\/\*[\s\S]*?\*\//g, "");          /* ブロックコメント除去 */
src = src.replace(/(^|[^:])\/\/.*$/gm, "$1");        /* 行コメント除去 */
src = src.replace(/\s+/g, " ").trim();               /* 空白圧縮 */
const bookmarklet = "javascript:" + encodeURIComponent(src);
fs.writeFileSync(process.argv[2], bookmarklet);
console.log("生成しました: " + process.argv[2] + " (" + bookmarklet.length + " 文字)");
' "$SRC" "$OUT"

node -e '
const fs = require("fs");
const enc = fs.readFileSync(process.argv[1], "utf8");
fs.writeFileSync("/tmp/.ct-bookmarklet-check.js", decodeURIComponent(enc.replace(/^javascript:/, "")));
' "$OUT"
node --check /tmp/.ct-bookmarklet-check.js && echo "構文チェックOK"
rm -f /tmp/.ct-bookmarklet-check.js
done
