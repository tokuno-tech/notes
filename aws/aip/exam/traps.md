# 引っかけ・紛らわしいペア

試験の選択肢で誤答を誘うパターンを集約する。新しい引っかけに気づいたらここに追記する。

## よくある引っかけ（1行サマリー + 詳細リンク）

- **API Gateway リクエスト検証ツール（JSON スキーマ）** は「門番」（必須フィールド・型・サイズを検証して弾く）。**マッピングテンプレート**は「翻訳者」（形を変えるだけ、検証しない）→ 詳細: [topics/bedrock_core.md](../topics/bedrock_core.md)（Task 2.4）
- **Kendra の関連性スコア** は検索結果の確信度であって、RAG の評価メトリクスではない → 詳細: [topics/bedrock_guardrails_eval.md](../topics/bedrock_guardrails_eval.md)（AIP-79）
- **CloudWatch Synthetics** は外形監視（カナリア）であって、LLM 出力の品質評価ではない → 詳細: [topics/bedrock_guardrails_eval.md](../topics/bedrock_guardrails_eval.md)（AIP-79）
- **Cognito** は「人間のユーザー向け認証」。サービス間（M2M）の API 認証は IAM ロール + SigV4 → 詳細: [mistakes.md](./mistakes.md)（AIP-25）
- **SQS + KB 同期はリアルタイムではない**。リアルタイムデータはエージェントのアクショングループで API 直呼び → 詳細: [mistakes.md](./mistakes.md)（AIP-27）

---

## ⚠️ 間違えやすいポイント3つ

### ① コンテンツフィルターの強度（低・中・高）

| 強度 | 特徴 | 向いているケース |
|---|---|---|
| **低** | ゆるい。有害コンテンツを見逃しやすい | ほぼ使わない |
| **中** | バランスが良い。医療・法律用語の誤検知を抑えつつ有害コンテンツを検出 | 医療・専門分野のチャットボット |
| **高** | 厳格。医療・法律の専門用語が誤検知されやすい。過剰ブロックが増える | 汎用的な消費者向けアプリ |

**AIP試験の識別ポイント**：
- 「過剰なブロックを避けつつ」「ユーザー体験の低下を防ぐ」→ **中** が正解
- 「高」はセキュリティ最優先でUXを犠牲にするケース

---

### ② 入力側・出力側で別々のアクションを設定できる

**機密情報フィルター（PIIフィルター）は入力と出力で異なるアクションを設定可能。**

```
入力（ユーザーの質問）
  → 医療保険番号が含まれていたら → BLOCK（モデルに渡さず拒否）
  → 理由：入力段階でモデルに渡したくない情報はBLOCKで止める

出力（モデルの回答）
  → 患者氏名・住所が含まれていたら → MASK（**** に置換して返す）
  → 理由：回答の中に含まれてしまった個人情報は伏せ字にして安全に返す
```

**よくある誤解**：
「回答に含まれる患者情報はマスクし」= 出力側のMASK設定（モデルが生成した回答の中の情報を伏せる）
→ 「モデルに渡す前にマスク」ではない。入力側はBLOCKで止めるのが正解。

---

### ③ ガードレールのログはデフォルトでは記録されない

```
モデル呼び出しログ記録
  → デフォルト: OFF
  → 明示的に有効化が必要（コンソール or API）
  → 有効化すると入力プロンプト・出力・ガードレール評価詳細が記録される
  → 保存先: S3 または CloudWatch Logs

CloudWatch Logs に出力される内容
  → どのポリシーがトリガーされたか
  → ブロックの理由
  → カスタムブロックメッセージ
  → 規制対応の監査証跡として利用可能
```

**DynamoDBへの独自記録（不正解パターン）は冗長**：Bedrockネイティブのログ機能（CloudWatch Logs）で要件を満たせる。

---

（元の文脈: [topics/bedrock_guardrails_eval.md](../topics/bedrock_guardrails_eval.md)）

## 略語「SSE」の2つの意味（Task 2.5）

ストリーミングの文脈と暗号化の文脈で同じ略語が出る。Skill Builder の和訳でも混同があった。

- **Server-Sent Events**：ストリーミング応答の配信方式。`Content-Type: text/event-stream`
- **Server-Side Encryption**：S3/DynamoDB のサーバー側暗号化（SSE-S3 / SSE-KMS）

「ストリーミング・チャット・リアルタイム」の文脈 → Server-Sent Events / 「保存データ・暗号化」の文脈 → Server-Side Encryption

## 「合成モニタリング」と「複合アラーム」（Task 2.5）

- 合成（Synthetic）= **人工ユーザー**が定期的に叩く外形監視（CloudWatch Synthetics / Canary）。「ユーザー影響前に検知」
- 複合（Composite）= 複数アラームの **AND/OR 結合**（誤検知削減）

「合成＝複数を合わせる」と誤読しない。合わせるのは複合アラームの方。

---

## Amazon Pinpoint vs Bedrock（メール生成）（Task 2.5）

同じ「メール送信」文脈で両方出るが目的が全く違う。

- **Pinpoint** = セグメント × テンプレートの**一斉配信**。「30代・東京在住・購入履歴あり」への定型メール。内容の動的生成はできない
- **Bedrock + Lambda（+ SES）** = 「この顧客の通話メモを読んで文章を生成して送る」。**個別・動的・パーソナライズ**

「顧客とのやり取りのメモに基づいてパーソナライズ」→ Bedrock。「セグメントにテンプレート配信」→ Pinpoint。

## `StartAsyncInvoke` ≠ 汎用非同期推論（Domain 2 Practice）

「非同期」という名前に引っ張られて、テキスト系モデルのバッチ処理に使おうとする罠。

- **`StartAsyncInvoke`** = **Amazon Nova Reel（動画生成）専用**。他のモデルでは使えない
- テキスト系モデルの非同期・バッチ推論 = **`CreateModelInvocationJob`**

```
❌ よくある誤解
「Lambda から非同期に Bedrock を呼びたい → StartAsyncInvoke」

✅ 正解
「テキスト系モデルのバッチ推論 → CreateModelInvocationJob」
「動画生成（Nova Reel）→ StartAsyncInvoke」
```

---

## Lambda プロキシ統合の「非同期呼び出し」は低レイテンシー要件 NG（Domain 2 Practice 問題2.3）

AWS Secrets Manager から OAuth 認証情報を取得して bearer token を生成する構成（選択肢C）は **セキュリティ的に正しい**。
唯一の問題は「**Lambda プロキシ統合で Bedrock Agent を非同期に呼び出す**」こと。

- 会話型・低レイテンシー要件 → **同期呼び出し**が必要
- 非同期呼び出しはリアルタイム会話に対してレスポンスを返せない

**見落としパターン**：「認証情報の保存方法（Secrets Manager）に引っかかり、本当の問題（非同期）を見逃す」

---

## Step Functions / Bedrock Flows は「疎結合」要件を満たさない（Domain 2 Practice）

| 構成 | 疎結合か | 理由 |
|------|---------|------|
| Step Functions | ❌ | ステートマシン定義にツール呼び出しを直書き → ツール変更のたびに定義書き換え |
| Bedrock Flows | ❌ | ノードを GUI で事前設計 → 動的なツール選択不可 |
| Strands + MCP | ✅ | エージェントとツールが MCP 標準 I/F で接続 → ツール追加時にエージェント無変更 |

「疎結合」「動的ツール選択」「新ツールを追加しやすい」→ **Strands + MCP**

---

## Bedrock Prompt Flows vs Bedrock Agents（Task 2.5）

同じ「Bedrockで複数ステップを処理」に見えるが、自律性が根本的に異なる。

| | Prompt Flows | Bedrock Agents |
|---|---|---|
| フローの決定者 | **人間が事前に GUI でノードを設計** | **FMが実行時に自律的にツールを選択** |
| 対象ユーザー | 非技術者・ノーコード | 開発者 |
| 複雑さ | 固定フロー（条件分岐・Lambda呼び出しは可） | 動的推論・マルチステップ |
| キーワード | 「ノーコード・非技術者が自分で設計」「固定ステップ」 | 「自律的・複雑なタスク・マルチステップ推論」 |

Prompt Flows も Lambda ノード経由で複雑な処理を呼べるが「どのツールをいつ呼ぶかをFMが決める」のは Agents のみ。

---
