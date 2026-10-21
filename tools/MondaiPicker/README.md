# MondaiPicker

UdemyとCloudTechの問題を、Claudeに貼る用のテキストとして抽出するChrome拡張。
Udemyの演習画面で問題エリアを縦に広げる機能も持つ。

## インストール
`chrome://extensions` → デベロッパーモード → 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ。

## 使い方
- ポップアップ: 対象ページで拡張アイコンを押すと、検出したサイトに応じたボタンが並ぶ。
- `Alt+Shift+C`: 表示中の1問を抽出してコピー(結果はページ右上のトースト)。
- `Alt+Shift+T`: 縦広げのON/OFF(Udemy)。
- ショートカットは `chrome://extensions/shortcuts` で変更できる。

## 演習(間違い+見直しマークだけを解く)
Udemyのテスト画面または結果画面で、ポップアップの「間違い+見直しマークを解く」を押す。
APIで全問・正解・解説・解答履歴を取り、見直しマークは画面から読む(テスト画面は質問一覧パネル、結果画面は「マーク済み」フィルター)。
取り込んだ問題は `chrome.storage.local` に保存され、拡張内の `practice.html` で解く(Udemyを開かなくても可)。Udemy側への書き込みはしない。
- 質問一覧パネルを閉じているテスト画面では、マークは取れない(間違いだけ取り込まれ、ポップアップに注意が出る)。
- 解答履歴は `mp:hist:<quizId>` に保存(○×の回数)。

## 構成
- `extract/cloudtech.js`, `extract/udemy.js`: サイトごとの抽出ロジック。`window.__tqExtractors` に登録する(`run(id, withExp)` のみ)。
- `extract/bridge.js`: ホスト名で抽出器を選んで実行する。`run.js` が、ボタン押下時(popup/ショートカット)にタブへ注入する。常駐しない。
- `background.js` + `offscreen.*`: ショートカット時のクリップボード書き込み。
- `practice.html/js/css`: 取り込んだ問題を解く画面。`run.js` の `mpCollect` → `udemy.js` の `collectPractice` が取り込み。
- `content.js` / `content.css`: Udemyの縦広げ。

新しいサイトを足すときは `extract/<site>.js` を作り、`bridge.js` の `SITES` に追加する(manifestの変更は不要。押下したタブに注入するため)。
