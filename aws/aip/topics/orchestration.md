# オーケストレーション（Step Functions / Lambda / SQS）

## 並列推論処理（Step Functions Parallel × Map）

### 構成

**Step Functions（Parallel + Map） + Lambda + Bedrock**

```
Map ステート：8件のレポートをイテレート
  └─ Parallel ステート（各レポートに対して3ブランチ同時実行）
       ├─ Branch1：Lambda → Bedrock（症状抽出）
       ├─ Branch2：Lambda → Bedrock（リスク評価）
       └─ Branch3：Lambda → Bedrock（薬剤相互作用チェック）
```

- 最大24個のLambdaが同時実行
- 処理時間は「最も遅い1回のBedrock API呼び出し時間」まで短縮される
- Bedrock APIにはクライアントタイムアウトを設定し、無限待機を防止

### 監視メトリクス

| メトリクス | サービス | 用途 |
|---|---|---|
| `ExecutionTime` | Step Functions | ワークフロー全体の実行時間 |
| `Duration` | Lambda | 各関数の処理時間 |
| `InvocationLatency` | Bedrock | 推論レイテンシー |

→ 3つを組み合わせることでボトルネックを特定できる

### Step Functions ワークフロータイプの使い分け（再掲）

| タイプ | 最大実行時間 | 向いているケース |
|---|---|---|
| **Express** | 5分 | 高頻度・短時間（15秒以内など） ← 今回 |
| **Standard** | 1年 | 数時間〜数日にわたる長期ワークフロー |

### 同時実行の制限

- Lambda：アカウントレベルでデフォルト上限1,000
- Bedrock：スロットリング制限あり → 同時リクエストが多い場合はProvisioned Throughputを検討

---

## 人間承認フロー（Human-in-the-Loop）（AIP-28）

AIP-20 の `.waitForTaskToken` パターンを**製造業のコンプライアンス承認**に適用したケース。パターン自体は同一。

### 推奨構成

**Step Functions Standard（.waitForTaskToken）+ Lambda（SendTaskSuccess）+ DynamoDB**

| 要件 | 対応 |
|---|---|
| 承認待ちの間、処理フローを安全に中断 | `.waitForTaskToken` でステートマシンを一時停止（待機中コスト発生なし） |
| 担当者の判断後にフローを再開 | Lambda から `SendTaskSuccess(token)` を呼ぶ |
| 承認・差し戻し記録を永続保管（監査） | DynamoDB（永続ストア）に書き込み |

## Lambda プロビジョンドコンカレンシー

### コールドスタートとは

```
通常の Lambda 起動（オンデマンド）
  リクエスト来る → コンテナ起動（数百ms〜数秒） → 初期化 → 処理実行
                   ↑ここがコールドスタート遅延

2回目以降（コンテナ再利用）
  リクエスト来る → 処理実行（即時）← ウォームスタート
```

### プロビジョンドコンカレンシーとは

あらかじめ指定した数のコンテナを**常時起動・初期化済み状態**で待機させておく機能。

```
プロビジョンドコンカレンシー = 10 に設定した場合
  → 10 個のコンテナが常時ウォーム状態で待機
  → リクエストが来た瞬間に処理開始（コールドスタートなし）
  → 11個目以降はオンデマンド起動（コールドスタートあり）
```

### 料金

| 状態 | 課金 |
|---|---|
| プロビジョンドコンカレンシー待機中 | **発生する**（リクエストがなくても課金） |
| オンデマンド（通常Lambda） | リクエスト時のみ課金 |

→ **常時コストがかかる**点に注意。ピーク負荷が予測できる場合に有効。

### 用途別の可否

| 要件 | 評価 |
|---|---|
| 初回レスポンスのレイテンシー削減 | ◯ コールドスタートを完全に排除 |
| Bedrock の生成速度改善 | ✗ **無効**。Bedrock 側の推論時間は変わらない |
| 同期構造のタイムアウト問題の解決 | ✗ **無効**。アーキテクチャの問題は解消されない |

**引っかけパターン（AIP-31 不正解選択肢）**  
「Lambda のメモリ増強 + プロビジョンドコンカレンシー」  
→ Lambda 起動は速くなる。しかし Bedrock が全文生成し終わるまでの待機時間は変わらない  
→ 同期一括返却の構造的問題はそのまま残る → **ストリーミング化が唯一の解決策**

---

## Step Functions + Bedrock 統合パターン（AIP-49）

### Step Functions Express vs Standard の選び方

| 項目 | Express Workflow | Standard Workflow |
|---|---|---|
| **最大実行時間** | **5分** | 1年 |
| **課金単位** | 実行時間＋メモリ＋実行回数 | 状態遷移数のみ |
| **用途** | 高スループット・短時間バッチ処理 | 長時間ワークフロー・人間承認フロー・**監査が必要な処理** |
| **実行履歴の保持（公式確認済み）** | **Step Functionsサービス自体には保持されない**。CloudWatch Logsへのロギングを別途有効化しないと事後参照不可 | **Step Functionsサービス自体が最大90日間保持**し、Step Functions APIで取得可能（コンプライアンス要件があれば30日に短縮するリクエストも可） |
| **コンソールでのステップ確認** | グラフビュー・テーブルビューでの詳細確認は**不可**（CloudWatch Logs Insightsでのクエリが主手段） | **グラフビュー・テーブルビューで各ステップの入出力・所要時間・実行順序を視覚的に確認可能** |
| **実行セマンティクス** | 非同期＝at-least-once／同期＝at-most-once（**冪等な処理向け**） | **exactly-once**（EMRクラスタ起動・決済処理など非冪等な処理向け） |
| **Distributed Map / Activities** | 非対応 | 対応 |
| ワークフロータイプ | **作成後に変更不可**（Immutable） | 同左 |

→ 「処理完了後も一定期間さかのぼって各ステップを検索・閲覧したい」「コンソールでグラフィカルに確認したい」という監査系の要件が出たら**Standard一択**。Expressは「実行履歴をサービス自体が保持しない」時点でこの手の要件から即脱落する

### Lambda-less アーキテクチャ：SDK統合 + Pass状態

#### Step Functions SDK Integration（最適化統合）

Lambda を介さずに AWS API を**直接**呼び出せる。

```json
// S3 GetObject を直接呼ぶ状態定義
{
  "Type": "Task",
  "Resource": "arn:aws:states:::s3:getObject",
  "Parameters": {
    "Bucket": "my-bucket",
    "Key.$": "$.s3Key"
  },
  "ResultPath": "$.s3Content",
  "Next": "ExtractFields"
}
```

```json
// Bedrock InvokeModel を直接呼ぶ
{
  "Type": "Task",
  "Resource": "arn:aws:states:::bedrock:invokeModel",
  "Parameters": {
    "ModelId": "anthropic.claude-3-sonnet-20240229-v1:0",
    "Body": {
      "prompt.$": "$.extractedText"
    }
  }
}
```

**Lambda と比べたメリット:**
- コールドスタートなし
- Lambda 実行コスト不要
- IAM ロール管理がシンプル（Step Functions の実行ロールのみ）

---

### Amazon States Language（ASL）と Choice ステート（AIP-類似問題で頻出）

**ASL**：Step Functionsのワークフローを記述するJSON形式の言語。ループ・分岐・並列処理などの実行フローを**宣言的に**定義する。

**Choiceステート**：複数の条件ルールを持ち、入力値に応じて次の遷移先を決める分岐ノード。「継続する／終了する」のようなループ制御ロジックを、アプリケーションコードの外側（=状態機械の定義）に明示的に書ける。

```
Task（Bedrock InvokeModel呼び出し：仮説→検証）
  ↓
Choice（評価結果を見て分岐）
  ├─ 「まだ絞り込めていない」→ Task に戻る（ループ継続）
  └─ 「原因が特定できた」→ 終了ステートへ
```

- Choiceルールには反復回数カウンタや評価スコアのしきい値を条件として書ける → 無限ループ防止の上限設定も容易
- **ループ条件を変更したい時は、コードではなくASL定義（状態機械定義）を更新するだけで済む** → 「エンジニアチームが後からいつでもロジックを変更できる」という要件に直結
- TaskステートはBedrockを含む100以上のAWSサービスと**直接統合**（`arn:aws:states:::bedrock:invokeModel`等）でき、Lambdaを介さずモデル呼び出しが可能

**Bedrock Agentsのオーケストレーションループとの違い（混同注意）**：Bedrock Agentsは「仮説→検証→判断」のReActループをエージェントの**マネージドオーケストレーションエンジンが内部的に自律制御**する。ループの継続・終了条件をエンジニアがChoiceルールのような状態定義として直接記述・変更する手段は提供されない。「ループ制御ロジックを明示的に記述・変更したい」という要件が出たら、Bedrock Agentsではなく**Step FunctionsのChoiceステート**が正解になる

---

### AWS Lambda の再帰ループ検出（公式確認済み・盲点になりやすい）

Lambda関数が自分自身や特定サービスを介して再帰的に呼び出される構成には、**デフォルトで自動停止する保護機能**が備わっている。

```
対象サービス：Amazon SQS・Amazon S3・Amazon SNS・Lambda同士の相互呼び出し（同期/非同期どちらも）
  → これらを経由した連鎖の中で、同一イベント連鎖内の呼び出しが約16回に達すると
    Lambdaが次の呼び出しを自動停止し通知（CloudWatchメトリクス `RecursiveInvocationsDropped`）
  → デフォルトで有効。無効化するには `PutFunctionRecursionConfig` API で明示的に許可が必要
  → DynamoDBなど非対応サービスを介した再帰は検出されない
```

- 「Lambda関数が推論結果に応じて自分自身を再帰呼び出しして反復ループを実装する」という設計は、**意図的な多段反復では約16回で強制停止に引っかかる**ため設計上の工夫が必要（＝素朴な自己再帰実装は不正解の温床）
- Lambda単体には**Step Functionsのようなグラフィカルなワークフロービュー（グラフビュー・テーブルビュー）が存在しない**。反復ループの可視化・監査が要件にあるなら、この点でもLambda自己再帰は不利

---

#### Step Functions のネイティブ統合サービスと ElastiCache

**Step Functions にはネイティブサービス統合（Optimized Integration）が存在するサービスと存在しないサービスがある。**

```
ネイティブ統合あり（Optimized Integration）：
  ✅ Amazon Bedrock（InvokeModel, InvokeAgent等）
  ✅ AWS Lambda（関数呼び出し）
  ✅ Amazon S3（GetObject, PutObject等）
  ✅ Amazon DynamoDB（GetItem, PutItem等）
  ✅ Amazon SQS（SendMessage等）
  ✅ Amazon SNS（Publish等）
  ✅ AWS Glue（StartJobRun等）
  ✅ Amazon SageMaker（CreateTrainingJob等）
  ✅ Amazon ECS / Fargate（RunTask等）
  ✅ Amazon EventBridge（PutEvents等）

ネイティブ統合なし（Lambda経由が必要）：
  ❌ Amazon ElastiCache → Lambdaを介して操作するしかない
  ❌ Amazon RDS（直接SQL実行） → Lambda or RDS Data API経由
```

### Step Functions ペイロードサイズ上限の回避パターン（AIP-80）

**Step Functions のペイロード上限：256 KB**（ステート間で受け渡せるデータの最大サイズ）

```
問題：
  推論トレースを含む大量の中間データ（数MB〜数GB）
    ↓
  ステート間のペイロードとして渡す → 256KB超過でエラー

解決パターン（S3参照渡し）：
  大量データ → S3に書き込む
  ステート間で渡すのは「S3のパス（URI）のみ」（数十バイト）
  
  例：
  ステート A の出力: { "s3_uri": "s3://bucket/output/task1.json" }
  ステート B の入力: S3 URIを受け取ってS3から直接読む
```

### ResultSelector と ResultPath の役割

```
ResultSelector：
  タスクの生の出力から「必要な情報だけを抽出」する
  例：Bedrock の出力全体 → S3 URI とメタデータだけ抽出

ResultPath：
  抽出した結果を「ステートの出力のどこに格納するか」を指定する
  例：$.s3_reference に格納 → 次のステートが $.s3_reference.uri で参照できる

実例（AIP-80パターン）：
  "ResultSelector": {
    "output_uri.$": "$.output.s3Uri",
    "task_id.$": "$.output.taskId"
  },
  "ResultPath": "$.task_result"
  → ペイロードには軽量な参照情報のみが含まれる
```

#### Pass 状態：ゼロコスト JSON 変換

Pass 状態は**Lambdaもコンピュートも使わず**、入力を加工して次の状態に渡せる。

```json
{
  "Type": "Pass",
  "Parameters": {
    "productId.$": "$.body.product_id",
    "reviewText.$": "$.body.review_text",
    "timestamp.$": "$.body.created_at"
  },
  "ResultPath": "$.extracted",
  "Next": "InvokeBedrock"
}
```

**使える組み込み関数（States.*）:**

| 関数 | 用途 |
|---|---|
| `States.StringToJson` | 文字列 → JSONオブジェクト変換 |
| `States.JsonToString` | JSONオブジェクト → 文字列変換 |
| `States.Format` | 文字列フォーマット（テンプレート） |
| `States.ArrayGetItem` | 配列から要素取得 |
| `States.MathAdd` | 数値加算 |

---

### Amazon Bedrock Flows（フロー）詳細

#### 概要

**Amazon Bedrock Flows** は、生成AIワークフローを**ノードベースのビジュアルパイプライン**で構築するサービス。
コードを書かずにドラッグ＆ドロップで複雑なAIワークフローを設計できる。

```
┌─────────────────────────────────────────────────────────────┐
│                  Bedrock Flows のイメージ                    │
│                                                             │
│  [Input Node]                                               │
│       ↓                                                     │
│  [Prompt Node] ──(condition)──→ [Prompt Node 2]            │
│       ↓                                                     │
│  [S3 Retrieval Node]  ←── RAG用S3データソース               │
│       ↓                                                     │
│  [Agent Node] （Bedrock Agent を呼び出せる）                 │
│       ↓                                                     │
│  [Output Node]                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 利用可能なノード種別

| ノード | 役割 |
|---|---|
| **Input / Output** | フロー全体の入出力 |
| **Prompt** | FM へのプロンプト実行（Claude, Titan等） |
| **Condition** | 条件分岐（if/else ロジック） |
| **Iterator** | コレクションを繰り返し処理 |
| **Collector** | 反復処理結果の集約 |
| **S3 Retrieval** | S3からドキュメント取得 |
| **Knowledge Base Retrieval** | Bedrock Knowledge Base から検索 |
| **Agent** | Bedrock Agent の呼び出し |
| **Lambda** | カスタム処理（Lambda呼び出し） |

#### ノード詳細と試験パターン

| ノード | 役割 | 試験での注意点 |
|---|---|---|
| **Comprehendノード** | PII検出・除去 | **FMより前に配置必須**（順序ミスで不正解） |
| **プロンプトノード** | FMを呼んでセンチメント分析等 | センチメント分析はここ |
| **条件ノード** | スコア・値で分岐ルーティング | 低レイテンシ要件の解決策 |
| **ナレッジベースノード** | KBを検索してレコメンド生成 | RAG統合の標準パターン |
| **イテレーターノード** | 配列を1件ずつ逐次処理 | **大量処理・低レイテンシ要件で不正解** |
| **コレクターノード** | イテレーターとペア・結果を配列に集約 | Iterator→処理→Collectorのセット |
| **エージェントノード** | Bedrock Agentを呼び出す | **レイテンシ増 → 300ms要件で不正解** |
| **Lambdaノード** | カスタムビジネスロジック | **運用負荷増 → 最小インフラ要件で不正解** |

**⚠️ 試験頻出の禁止パターン**

```
「大量処理（5万件等）+ 低レイテンシ（300ms等）」
  → イテレーターノード ❌（1件ずつ逐次処理でボトルネック）

「PII除去が必要」
  → Comprehendノードは必ずFM処理の前 ❌後だとFMに機密データが渡る

「マネージドで低レイテンシ」
  → エージェントノード ❌（オーケストレーションでレイテンシ増）
  → Lambdaノード ❌（カスタムインフラ必要）
```

**推奨構成例**
```
Comprehendノード（PII除去）
  ↓
プロンプトノード（FMでセンチメント分析）
  ↓
条件ノード（センチメントスコアで分岐）
  ↓
ナレッジベースノード（レコメンド生成）
  ↓
コレクターノード（結果集約）
```

#### Bedrock Flows が得意なユースケース

- ✅ **RAGパイプライン**（S3/Knowledge Base → Prompt → Output）
- ✅ **プロンプトチェーン**（複数プロンプトを順次実行）
- ✅ **条件分岐を含む生成AIフロー**（回答品質に応じて別プロンプト）
- ✅ **ローコードで素早くプロトタイピング**

#### CoT / 推論ステップ管理との関係

CoT（Chain-of-Thought）自体はプロンプト設計パターン。Bedrock Flows は、複数の推論ステップをプロンプトノードとして順番に管理したい場合の実装候補になる。

```
[Input]
  ↓ Prompt Node 1: 前提を整理
  ↓ Prompt Node 2: 仮説を立てる
  ↓ Prompt Node 3: 証拠と照合して結論
  ↓ Output
```

| 文脈 | 置き場 |
|---|---|
| CoTの失敗パターン・プロンプト改善 | [bedrock_core.md](./bedrock_core.md) |
| CoTテンプレートをノードとして一貫管理 | Bedrock Flows |
| CoTとExtended Thinkingの違い | [bedrock_rag.md](./bedrock_rag.md) |

#### Bedrock Flows の**制限・不得意**なこと

| 制限 | 理由 |
|---|---|
| ❌ **決定論的なJSONフィールド抽出** | 変換はLLMベースか条件ロジックに限られ、`States.StringToJson` のような確実な変換ができない |
| ❌ **高度なエラーハンドリング** | Step Functions の Catch/Retry に相当する細かい制御が難しい |
| ❌ **SQS/Kinesis との直接統合** | イベント駆動のキュー処理には不向き |
| ❌ **非AI処理の複雑なオーケストレーション** | あくまで生成AIワークフロー用 |

#### vs Step Functions / Bedrock Agent の使い分け

```
どれを使うか判断フロー：

処理に LLM（生成AI）が含まれる？
├─ NO → Step Functions（純粋なオーケストレーション）
└─ YES
    ├─ ビジュアルにノードで設計したい・RAGパイプライン・プロンプトチェーン
    │   → Bedrock Flows
    ├─ 自律的にツールを選んでタスク実行（エージェント的動作）
    │   → Bedrock Agents
    └─ 決定論的処理（確実なJSONパース・厳密なフロー制御）+ Bedrock呼び出し
        → Step Functions（SDK Integration でBedrock直接呼び出し）
```

---

### Bedrock Agent を SQS コンシューマにできない理由

Bedrock Agent は**自然言語入力 → LLM推論 → ツール選択 → アクション実行**という非決定的な処理モデル。

```
❌ なぜ SQS の直接コンシューマになれないか：

SQS メッセージ（JSONイベント）
        ↓
  Bedrock Agent が受け取るには？
        ↓
  「Lambda で受け取り → Agent を呼び出す」という間接構成が必要
        ↓
  つまり Lambda なしでは SQS → Agent は不可能
```

**Bedrock Agent の正しい呼び出しパターン:**
- ✅ API Gateway + Lambda → Agent
- ✅ Step Functions → Agent（SDK Integration）
- ✅ Lambda（SQS トリガー）→ Agent
- ❌ SQS → Agent（直接）

---

## SQSキューイング（Bedrock FMの前段）

```
高スループット環境でのリクエスト拒否を防ぐパターン：
  アプリ → SQS（バッファ）→ Lambda → Bedrock FM

= リクエストが集中してもSQSが溜めてくれる
= Lambdaが順番に処理 → Bedrockのスロットリング回避
```

### SQS構成パターン比較

| 構成 | 正解か | 理由 |
|---|---|---|
| アプリ → SQS → Lambda → **Bedrock FM** | ✅ | FMの前段にキュー = バッファとして機能 |
| アプリ → SQS → **Bedrock Agent** | ❌ | AgentはSQSを直接コンシュームできない |
| アプリ → **Bedrock Flows** → SQS | ❌ | FlowsはSQS/Kinesisと直接統合不可 |
| 「リアルタイム応答300ms以内」でSQS | ❌ | 非同期なので遅延発生 |

---

## S3 → SQS → Lambda 非同期パイプライン（Domain 2 Practice）

「ユーザー操作を妨げない」「ノンブロッキング」「処理に数分かかる」→ このパターン

```
①ユーザーがアップロード
  ↓ S3（署名付きURL or 直接PUT）
②S3イベント通知 → SQS にメッセージ投入
③SQS → Lambda がメッセージをポーリング
  ↓ Bedrock FM を呼び出してエンティティ抽出・要約
④結果を DynamoDB に保存 → 後から参照可能
```

**⚠️ API Gateway を使った同期呼び出しが NG になる理由**

| タイムアウト | 値 |
|------------|-----|
| API Gateway（同期） | **29秒**（超えると 504 Gateway Timeout） |
| Lambda（最大） | 15分 |

→ 処理時間が 1〜2 分のドキュメント処理に API Gateway 経由の同期呼び出しは使えない。

### S3署名付きURL vs PutObject 直接呼び出し（AIP-32）

| アップロード方式 | クライアント側に必要なIAM権限 | 最小権限原則 |
|---|---|---|
| **署名付きURL**（Presigned URL） | 不要（一時的なURLトークンのみで期限付きアップロード） | ✅ 満たす |
| **PutObject を直接呼ぶ** | クライアント/アプリに S3書き込みのIAM権限を直接付与する必要がある | ❌ 反する（クライアントに恒久的な書き込み権限を持たせることになる） |

### S3イベント通知が直接呼び出せないターゲット（AIP-32）

S3イベント通知は Lambda / SQS / SNS / EventBridge が直接ターゲットになれるが、**Step Functions ステートマシンや Bedrock Data Automation ブループリントを直接呼び出すことはできない**。

```
❌ S3イベント通知 → Step Functions（直接不可）
✅ S3イベント通知 → EventBridge → Step Functions（EventBridgeルール経由でオーケストレーション開始）
✅ S3イベント通知 → Lambda → Step Functions（Lambdaを仲介にすれば可能だが、Lambda分の運用負荷が発生）
```

→ **EventBridge + Step Functions（AWSサービスAPIを直接呼び出すSDK Integration）**の組み合わせは、仲介Lambda関数を作らずにオーケストレーションできるため、運用オーバーヘッド最小化の文脈で強い候補になる。

### 疎結合エージェント：Strands + MCP

「動的ツール選択」「疎結合」が要件の場合、Strands + MCP パターンが正解。

```
Step Functions（❌ 密結合）:
  ステートマシン定義にツール呼び出しを直書き
  → ツール追加のたびにステートマシン定義を書き換え

Strands + MCP（✅ 疎結合）:
  エージェント ── MCP プロトコル ──> MCPサーバーA
                                    MCPサーバーB（追加してもエージェント無変更）
```

| 構成 | 疎結合 | 動的ツール選択 | 新ツール追加コスト |
|------|-------|-------------|-----------------|
| Step Functions | ❌ | ❌（固定ステート遷移） | ステートマシン再定義 |
| Bedrock Flows | ❌ | ❌（固定パス） | フロー定義再設計 |
| Strands + MCP | ✅ | ✅（LLMが実行時判断） | MCPサーバーを1個追加 |

---

## API Gateway レスポンスフィルタリング（Task 3.1）

FMの生レスポンスをそのままユーザーに渡さず、API Gatewayの出口で整形・検閲する仕組み。

### マッピングテンプレートで除去するもの

```
FMの生レスポンス（危険）
{
  "answer": "...",
  "internal_model_id": "anthropic.claude-xxx",   ← 内部情報漏洩
  "debug_trace": "lambda:arn:aws:...",            ← 攻撃者にヒント
  "blocked_reason": "prompt_injection"            ← 攻撃者にヒント
}
↓ マッピングテンプレートで変換
{
  "answer": "申し訳ありません、お答えできません。"
}
```

### WAF との役割分担

| | 対象 | タイミング |
|---|---|---|
| **AWS WAF** | HTTPリクエストのパターンマッチ（SQLi・XSS・DDoS） | FM処理前（入口の門番） |
| **API Gateway フィルタ** | レスポンスの整形・不要フィールド除去 | FM処理後（出口の検閲） |

---

## Step Functions 自動化インシデント対応ワークフロー（Task 3.1）

セキュリティ違反検知後の初動を手動対応なしで自動化するフロー。

```
CloudWatch アラーム（InvocationsIntervened 急増）
  ↓ SNS → Lambda → Step Functions 起動
  ↓
① 違反の深刻度を判定（Lambda）
  ├─ 軽度 → Slack 通知して終了
  ├─ 中度 → 問題ユーザーをレート制限
  └─ 重度 →
       ② ガードレールを最厳設定に自動切替
       ③ 管理者承認待ち（waitForTaskToken）
       ④ 承認後：インシデントレポートを S3 に保存
```

---

## 自動化された敵対的テストワークフロー（Task 3.1）

本番と同じ構成に対して攻撃シミュレーションを定期的に流す仕組み。

```
Step Functions（定期実行）
  ↓
① 攻撃パターンライブラリから悪意あるプロンプトを取得
  ↓
② FM + ガードレールに投げる
  ↓
③ Lambda（安全性分類器）で判定
   「ブロックされたか？ / 有害な出力が漏れたか？」
  ↓
④ 結果をS3/CloudWatchに記録
  ↓
⑤ 問題あり → SNSで開発者に通知
```

**なぜ定期実行が必要か**：FMバージョンアップやガードレール設定変更のたびにリグレッションが起きる可能性があるため。本番CI/CDに組み込むのが理想。

---

## ステートフルなツールのホスティング：ECS/Fargate vs Lambda（公式模試2週目）

Bedrock Agent のツールが「大きなモデルをメモリに常駐（例:10GB）」＋「サードパーティへの永続WebSocket接続を維持」する要件のとき：

| 要件 | Lambda | ECS/Fargate |
|---|---|---|
| 状態（モデル）のメモリ常駐 | ✗ 使い捨て・コールドスタートで再読込 | ✓ 長時間稼働で常駐維持 |
| 永続的な発信WebSocket接続 | ✗ 実行ごとに終了、張りっぱなし不可 | ✓ 常駐プロセスで維持 |
| 運用負荷最小 | – | ✓ Fargateはサーバ管理不要（EC2より低い） |

- **判断ルール**：「状態のメモリ常駐 or 永続接続が必要」→ **Lambdaを除外**し長時間稼働コンテナ(ECS/Fargate)。運用負荷最小なら **EC2よりFargate**（AMI/起動テンプレの管理が不要）
- SageMakerリアルタイム推論エンドポイントは"モデル推論"用で、外部への永続接続維持には不向き＋オーバーヘッド高
- 注意：クライアント向けストリーミングの短時間WebSocket（API Gateway WebSocket + Lambda）とは別問題（[bedrock_core.md](./bedrock_core.md)）。あちらは接続をAPI Gatewayが保持しLambdaは短時間実行
