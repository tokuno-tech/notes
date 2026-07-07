# exam-review-extractor

AWS BenchPrep (AIP-C01 Official Pretest) の模擬試験復習画面から、
Claudeに貼るための最小限の情報だけを抜き出すブックマークレット。

これまで復習のたびにページ全体のHTML(数万トークン)をそのまま貼っていたが、
それをやめて「問題文 / 選択肢 / あなたの解答 / 正解 / 選択肢ごとの解説(+参照URL)」
だけを整形してクリップボードにコピーする。

## セットアップ (最初の1回だけ)

1. `exam-review-extractor.bookmarklet.txt` の中身(`javascript:...`で始まる1行)を全部コピーする。
2. ブラウザでブックマークバーを表示し、空欄を右クリック→「ページを追加」(Chrome)
   または任意のページをブックマークしてから編集(Safari)。
3. 名前: 任意 (例: `模試を抽出`)、URL: 手順1でコピーした文字列を貼り付けて保存。

## 使い方

1. BenchPrepで模擬試験の復習モードに入り、1問を表示する
   (`#question-app` が表示されている画面。選択肢と解説が見えている状態)。
2. ブックマークバーの `模試を抽出` をクリックする。
3. 「クリップボードにコピーしました」というアラートが出たらOK。
4. そのままClaudeに貼り付ける。

## 出力フォーマット

```
## 問題
(問題文)

## 選択肢
A. ...
B. ...
C. ...
D. ...

あなたの解答: D / 正解: D

## 解説
A: (Aの解説)
B: (Bの解説)
C: (Cの解説)
D: (Dの解説)
   参照: https://docs.aws.amazon.com/...
```

複数選択(MAMC)問題の場合、「あなたの解答」「正解」はカンマ区切りで複数文字になる。

## ソース更新時の手順

`exam-review-extractor.js` を編集したら、同ディレクトリで以下を実行してブックマークレットを再生成する。

```sh
./build.sh
```

`exam-review-extractor.bookmarklet.txt` が更新されるので、中身をブックマークのURL欄に上書きする。

## 動作対象

- BenchPrepの復習ビュー(`.aws-question-content` / `.choices-container` / `.answer-button-wrapper` /
  `.aws-answer-content` / `.aws-rationale-content` を使う画面)であれば、単一選択・複数選択問わず動作する想定。
- ページ内には非表示の同名要素が大量に存在するため、`checkVisibility()`(非対応ブラウザは
  `getBoundingClientRect()`)で可視要素のみを対象にしている。
- BenchPrep側のマークアップ変更(クラス名変更など)があれば追従修正が必要。
