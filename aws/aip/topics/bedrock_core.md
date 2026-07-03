# Bedrock コア（API・推論パラメータ・スループット）

## InvokeModel API パラメータ

### PerformanceConfigLatency

`InvokeModel API` で指定できるレイテンシー最適化パラメータ。

| 値 | 挙動 |
|---|---|
| `standard` | 通常の推論実行 |
| `optimized` | 推論レイテンシーを最小化するようにモデル実行を最適化 |

応答速度を重視する場合は `optimized` を指定する。

---

## ストリーミング応答のアーキテクチャ

### 構成

**API Gateway WebSocket API + Lambda + Bedrock InvokeModelWithResponseStream**

```
クライアント
  ↕ WebSocket（持続接続）
API Gateway WebSocket API
  ↓
Lambda
  ↓ InvokeModelWithResponseStream
Bedrock FM
  ↓ チャンク（EventStream形式）
Lambda → postToConnection → クライアントへプッシュ
```

---

### 各コンポーネントの役割

| コンポーネント | 役割 |
|---|---|
| **API Gateway WebSocket API** | クライアントとの持続的な双方向接続を確立。サーバー側から任意タイミングでプッシュ可能 |
| **InvokeModelWithResponseStream** | 推論途中のチャンクをEventStream形式で順次返すBedrock API |
| **API Gateway Management API（postToConnection）** | LambdaからWebSocket接続経由でクライアントへメッセージを送る |

---

### 各要件との対応

| 要件 | 対応手段 |
|---|---|
| トークンごとの逐次描画 | InvokeModelWithResponseStream でチャンク取得 + WebSocketサーバープッシュ |
| 数千名の同時アクセス | WebSocket APIのデフォルト同時接続数10,000（引き上げ可）+ Lambdaの同時実行スケーリング |
| 最初のトークンまでの待ち時間最小化 | 持続接続のため接続確立オーバーヘッドなし・ポーリング遅延なし |
| 20〜60秒の生成時間 | WebSocketアイドルタイムアウト：デフォルト10分 / Lambda最大実行時間：15分 → 十分な余裕あり |

---

### 制約・運用上の注意点

- **Lambda同時実行数**：リージョンあたりデフォルト1,000 → 数千同時ユーザーには事前の引き上げ申請が必要
- **WebSocket APIのメッセージペイロード上限**：128KB（ストリーミングチャンクは通常数十〜数百バイトなので問題なし）
- **IAMポリシー**：LambdaからWebSocketへ送るには `execute-api:ManageConnections` の許可が必要
- **課金**：WebSocket APIは接続時間（分単位）＋メッセージ数ベース。同時接続数が多いほどポーリング方式よりコスト効率が良い

---

## バッファリング vs ストリーミング（基本概念）（AIP-77）

### バッファリング（Buffering）とは

> **データを一旦「バッファ（一時保管場所）」に溜めてから、まとめて送る仕組み。**

```
バッファリングあり（API Gateway REST / HTTP API）:
  Bedrock が「A」→「B」→「C」を順番に生成
  API Gateway が内部バッファに溜める: [A, B, C]
  全部揃ったらクライアントへ一括送信: "ABC"
  → ユーザーはABC全部が来るまで何も見えない（待ち時間＝生成時間全体）

バッファリングなし（ストリーミング）:
  Bedrock が「A」を生成 → 即クライアントへ送信（表示）
  Bedrock が「B」を生成 → 即クライアントへ送信（表示）
  Bedrock が「C」を生成 → 即クライアントへ送信（表示）
  → ユーザーはAを受け取った時点で表示される（TTFT大幅短縮）
```

**TTFT（Time To First Token）**：最初のトークンが表示されるまでの待ち時間。ストリーミングで最小化できる。

---

## Lambda レスポンスストリーミング と API Gateway のバッファリング問題（AIP-77）

### 重要な誤解：「API Gateway 経由でもストリーミングできる」→ ❌

```
API Gateway REST API  → バッファリング（ストリーミング不可）
API Gateway HTTP API  → バッファリング（ストリーミング不可）
→ Lambda 側を RESPONSE_STREAM に設定しても、
  API Gateway が間に入るとチャンク転送の効果が失われる
```

### WebSocket API はストリーミングとは別概念

```
API Gateway WebSocket API：
  双方向の「メッセージベース通信」
  サーバーから任意タイミングでメッセージをプッシュできる
  
  ≠ HTTPストリーミング（チャンク転送）
  
  WebSocket でも逐次表示は可能だが：
  ・接続管理（connect/disconnect ハンドラ）が必要
  ・接続IDの永続化（DynamoDB等）が必要
  ・postToConnection API の呼び出し実装が必要
  → 構成が複雑、運用負荷が増える
```

### WebSocket + DynamoDB によるチャットアプリの基本パターン（AWS公式サンプル準拠）

複数クライアントへのブロードキャストやセッション状態の保持が要件に含まれる場合は、上記の「複雑・運用負荷増」を許容してでもこの構成が正解になる（単発ストリーミングの Lambda Function URL では複数クライアント間のブロードキャストができないため）。

Lambda が担う3つのルートの役割:

| ルート | Lambdaがやること |
|---|---|
| `$connect` | 接続IDとユーザー名などのセッション情報を DynamoDB に書き込む |
| カスタムルート（例: `sendmessage`） | DynamoDB から現在の接続一覧を取得 → 各接続IDに対して `API Gateway Management API` の `postToConnection` でメッセージを配信（ブロードキャスト） |
| `$disconnect` | 対応する接続レコードを DynamoDB から削除（クリーンアップ） |

- DynamoDBは「接続ID一覧を引くための索引」として機能する。API Gateway自体は接続IDを永続化しないため、複数接続への配信・再接続後の状態復元にはDynamoDB（またはそれに類する外部ストア）が必須
- TTLを設定すれば、異常切断で `$disconnect` が呼ばれなかった古い接続レコードも自動的に掃除される

### Lambda Function URL が正解になる理由

```
Lambda 関数 URL（Function URL）：
  Lambda 関数に直接 HTTPS エンドポイントを付与
  呼び出しモード RESPONSE_STREAM を設定
  → HTTP/1.1 chunked transfer encoding でチャンクをそのままクライアントへ転送
  
  メリット：
  ・API Gateway のバッファリング問題を回避
  ・接続管理・メッセージ管理の実装が不要
  ・サービス数は Lambda + Bedrock の2つだけ（運用最小）
  
  CloudFront を前段に置く場合：
  CloudFront のオリジンを「Lambda 関数 URL」に設定すれば
  ストリーミングを保ちながらグローバル配信・WAF連携が可能
```

### ストリーミング対応の比較表

| 構成 | ストリーミング | サービス数 | 運用負荷 |
|---|---|---|---|
| **Lambda Function URL + RESPONSE_STREAM** | ✅ ネイティブ | 2 | 最小 |
| API Gateway REST API + Lambda | ❌ バッファリング | 2 | 中 |
| API Gateway HTTP API + Lambda | ❌ バッファリング | 2 | 中 |
| API Gateway WebSocket + Lambda | △ メッセージベース | 2〜4 | 高（接続管理要） |
| CloudFront + Lambda Function URL | ✅ | 3 | 中（WAF等必要な場合） |

### CloudFront Functions とは

```
CloudFront Functions：
  CloudFront のエッジで動作する超軽量な関数
  
  できること：
  ・リクエスト/レスポンスのヘッダー操作
  ・URLリダイレクト
  ・簡単なルーティング
  
  できないこと：
  ・ストリーミング処理
  ・外部サービスへの接続（Bedrock等）
  ・トークン数のカウント・制限
  
  制限：
  ・実行時間 1ミリ秒以下
  ・メモリ 2MB
  → LLMレスポンス処理には全く適さない
  
  ≠ Lambda@Edge（こちらは数秒の実行が可能）
```

---

## マルチターン対話・追加質問の制御（AIP-20）

### 要件
- ユーザーへ追加質問を行い、**応答を受け取ってから処理を継続**（明確化フロー）
- セッションをまたいで過去の対話内容を参照
- 保存データを暗号化
- 数千同時ユーザーに低レイテンシ対応

### 構成

**Step Functions Standard（.waitForTaskToken）+ DynamoDB（オンデマンド + SSE）**

```
ユーザー入力
  ↓
Step Functions Standard ステートマシン起動
  ↓ Bedrock 呼び出し → 不明点あり
  ↓
Task（.waitForTaskToken）でトークンを発行 → ステートマシン一時停止
  ↓ トークンを保存してユーザーへ追加質問を提示
ユーザーが追加回答
  ↓ アプリが SendTaskSuccess(token) を呼ぶ
ステートマシン再開
  ↓ 続きを処理 → Bedrock で最終回答
  ↓
対話履歴を DynamoDB に書き込み（partition: userId, sort: timestamp）
```

### .waitForTaskToken パターンの肝

| 項目 | 内容 |
|---|---|
| 仕組み | ステートがタスクトークンを外部に渡して**一時停止**。外部が `SendTaskSuccess` / `SendTaskFailure` を呼ぶまで待機 |
| 待機中のコスト | **発生しない**（状態遷移ベース課金のStandardのみ） |
| 状態の永続性 | Step Functions が安全に保持 |
| 最大待機時間 | Standardの最大実行時間（1年）の範囲内なら任意 |

#### ライフサイクル詳細（試験で問われる流れ）

```
① ステートマシンが Task リソースに "Resource": "arn:...λ:invoke.waitForTaskToken" を指定して実行
        ↓
② Step Functions が一意の taskToken を生成し、Lambda/SQS 等に渡す
        ↓
③ ステートマシンはその時点で【一時停止】（コスト発生なし）
        ↓ 外部システム（Lambda, API Gateway, 人間etc.）がトークンを受取・保持
        ↓ 必要な外部処理（ユーザーへの質問提示、承認フロー、ML推論 etc.）を実施
        ↓
④ 処理完了後、外部システムが Step Functions API を呼び出す
   ┌ 成功 → SendTaskSuccess(taskToken, output)
   └ 失敗 → SendTaskFailure(taskToken, error, cause)
        ↓
⑤ ステートマシンが【再開】し、output を次ステートへ引き渡す
```

#### ポーリング方式との比較（なぜ `.waitForTaskToken` が優れているか）

| 観点 | `.waitForTaskToken`（コールバック） | ポーリング（定期確認ループ） |
|---|---|---|
| 待機中コスト | **なし**（状態遷移課金のみ） | あり（Lambda/ECSが定期実行） |
| 実装複雑度 | **低い**（Step Functionsが管理） | 高い（完了判定ロジックを自前実装） |
| 完了検知の遅延 | **ほぼゼロ**（コールバック即時） | ポーリング間隔分の遅延あり |
| 状態の永続性 | Step Functionsが保証 | 自前で状態管理が必要 |

### Standard vs Express — 課金モデルとユースケースの違い

課金モデルが根本的に異なるため、**要件を見た瞬間にどちらか絞れるようにする**。

#### 課金モデル比較

| 項目 | Standard | Express |
|---|---|---|
| **課金単位** | **状態遷移の回数** × 処理時間 | **実行回数** × **実行時間（秒）** × **メモリ** |
| 待機中のコスト | **なし**（遷移が発生しない間は無課金） | **あり**（待機していても実行時間が加算される） |
| 最大実行時間 | **1年** | **5分** |
| 実行履歴 | **Step Functions コンソールで参照可能**（監査・デバッグ向き） | CloudWatch Logs への書き出しが必要（コンソールで追跡不可） |
| 冪等性保証 | **Exactly-once**（重複実行なし） | **At-least-once**（重複実行あり得る） |
| `.waitForTaskToken` | **使える**（1年以内なら任意の時間待機可） | **使えるが最大5分で強制終了** |

#### ユースケースの選び方

| 要件キーワード | 選ぶべき | 理由 |
|---|---|---|
| 人間の承認・応答待機（分〜時間単位） | **Standard** | 5分超の待機に対応。待機中コストなし |
| 長時間ML再学習パイプライン（数時間） | **Standard** | 最大1年の実行時間。冪等性保証で再試行安全 |
| 監査ログ・実行履歴を残したい | **Standard** | コンソールで全遷移を追跡可能 |
| 高頻度・短時間バッチ（秒〜分単位、1日数千〜数万回） | **Express** | 実行回数×時間課金のため、短時間大量実行でコスト有利 |
| イベントストリーム処理（Kinesis/SQS連携） | **Express** | 高スループット向け。重複許容できるストリーム処理と相性◎ |
| リアルタイムAPI応答オーケストレーション（〜秒） | **Express** | 5分以内に完結するなら低コスト |

### DynamoDB を選ぶ理由（対話履歴ストア）

| 候補 | 評価 |
|---|---|
| **DynamoDB（オンデマンド + SSE）** | ◯ ミリ秒読み取り・自動スケール・暗号化デフォルト有効・永続性 |
| S3 + SSE-S3 | ✗ レイテンシが数十〜数百ms。リアルタイム対話には遅い |
| Aurora Serverless v2 | △ RDBのオーバーヘッド。単純なキーバリューアクセスにはオーバースペック |
| ElastiCache for Redis | ✗ **揮発性キャッシュ**。「セッションをまたぐ永続参照」要件を満たせない |

### DynamoDB の設計ポイント

- パーティションキー：`userId`、ソートキー：`timestamp` で対話履歴を時系列取得
- **オンデマンドキャパシティモード**：キャパシティ計画不要、急増に自動対応
- **サーバーサイド暗号化**：デフォルト有効（AWS所有キー / マネージドキー / CMKを選択）
- 単一テーブル設計で会話履歴とメタデータをまとめると、1クエリで取得可能

## Bedrock API 設計パターン（AIP-52 / AIP-53）

### Converse API vs InvokeModel API（AIP-52）

| 比較軸 | **Converse API** | InvokeModel API |
|---|---|---|
| インターフェース | **統一された messages 形式** | モデルごとに異なる JSON 形式 |
| マルチターン対話 | messages 配列に履歴を含めるだけ | 外部 DB など自前実装が必要 |
| モデル切り替え | modelId 変更のみ | フォーマット変換ロジックも変更必要 |
| 対応 SDK | Python(Boto3) / JavaScript / Java… 全言語共通 | 同上 |
| ストリーミング | `ConverseStream` で対応 | `InvokeModelWithResponseStream` |
| ツール呼び出し | `toolUse` で標準対応 | モデル固有の形式 |
| 追加コスト | なし（トークン課金は同じ） | なし |

```
「複数環境(Lambda / EKS)から統一APIで呼び出す」
「マルチターン会話を外部DBなしで維持」
「Python SDK と JavaScript SDK で同一インターフェース」
  → 全部 Converse API が正解

「InvokeModel + Lambda ごとに認証方式が違う」
  → ❌ 統一認証要件に違反
```

---

### CDK での Bedrock モデル参照方法（AIP-53）

#### fromFoundationModelId() ← オンデマンド（通常はこちら）

```python
from aws_cdk import aws_bedrock as bedrock

model = bedrock.FoundationModel.fromFoundationModelId(
    self, "Model",
    bedrock.FoundationModelIdentifier.ANTHROPIC_CLAUDE_3_SONNET_20240229_V1_0
)
```

- **オンデマンドスループット**：従量課金、即時利用開始
- モデル ID を外部から注入（Parameter Store 等）すれば**コード変更なしに切り替え**可能
- 複数モデルの比較評価フェーズに最適

#### fromProvisionedModelArn() ← プロビジョンドスループット（慎重に）

```python
model = bedrock.ProvisionedModel.fromProvisionedModelArn(
    self, "Model",
    "arn:aws:bedrock:us-east-1::provisioned-model/xxxxx"
)
```

- **専用キャパシティを事前購入**（最低1時間〜、長期契約は1〜6ヶ月）
- 安定したスループットが必要な本番環境向け
- 比較評価フェーズで複数モデルに使うと**コストが大幅増**
- ARN ベースなのでモデル切り替えに手間がかかる

```
「複数FMを比較評価」「コード変更なしに切り替え」「スタートアップ・低コスト」
  → fromFoundationModelId()（オンデマンド）

「本番で安定スループット確保」「長期運用コミット済み」
  → fromProvisionedModelArn()（プロビジョンド）

「比較評価中にプロビジョンドを複数購入」
  → ❌ コスト過大
```

#### 一元パイプライン構成パターン（AIP-53 正解）

```
単一 CDK アプリケーション
  ├── StageA (Staging)
  │     └── AppStack (modelId = staging用FM)
  └── StageB (Production)
        └── AppStack (modelId = 本番用FM)

単一 CodePipeline
  ├── Source ステージ
  ├── Staging デプロイステージ（CodeBuild）
  ├── 手動承認ステージ（任意）
  └── Production デプロイステージ（CodeBuild）
```

「環境ごとに別リポジトリ・別パイプライン」→ コード重複・管理分散 → ❌

---

## 推論パラメータ一覧（公式模擬 Q9）

### stop sequences（重要）
- **役割**: 指定したフレーズが出力されたら**即座に生成を停止**する
- **特徴**: API レベルで制御される（モデルの指示に依存しない確実な停止）
- **用途**: チャット区切り文字、特定フォーマットの終端検出、出力の長さ制御
- **設定方法**: `InvokeModel` の推論パラメータに `stopSequences` として文字列リストを指定

```json
{
  "stopSequences": ["Human:", "---END---"]
}
```

### 推論パラメータ比較

| パラメータ | 役割 | 「出力を止める」用途に使えるか |
|---|---|---|
| **stop sequences** | 特定フレーズで生成停止 | ✅ **唯一の正解** |
| temperature | 出力のランダム性（創造性）制御 | ❌ 停止には無関係 |
| top_k | サンプリングするトークン候補数の制限 | ❌ 停止には無関係 |
| top_p | 累積確率によるトークン絞り込み | ❌ 停止には無関係 |
| max_tokens | 最大トークン数で強制終了 | △ 上限設定。フレーズ指定不可 |

### 推論パラメータ詳細（Task 4.2）

**temperature**：次トークンの確率分布をどれだけ平らにするか。
- 0.0 = 最高確率のトークンを必ず選ぶ（決定論的）
- 高い = 確率分布が平らになりランダムに選ぶ（多様）

**top-k**：上位k個の候補に絞ってからサンプリング（候補数固定）。

**top-p（核サンプリング）**：累積確率がp%に達するまでの候補に絞る（適応的）。
- 高確率候補が少なければ候補数が自動的に減る → top-kより汎用的

| ユースケース | temperature | top-p | top-k |
|---|---|---|---|
| SQL生成・分類・構造化出力 | 0.0〜0.2 | 0.9 | 50 |
| Q&A・要約 | 0.3〜0.5 | 0.9 | 50 |
| 創作・会話・アイデア出し | 0.7〜1.0 | 0.95 | 100 |

## Amazon Nova モデル比較

| モデル | モダリティ | 特徴 | 試験での注意点 |
|---|---|---|---|
| **Nova Micro** | **テキストのみ** | 超高速・最安値 | **画像・動画は処理不可 → 引っ掛け頻出** |
| **Nova Lite** | テキスト・画像・動画 | 軽量・高速・低コスト | マルチモーダルで低コスト |
| **Nova Pro** | テキスト・画像・動画 | 高性能・複雑タスク | 最高精度が必要な場合 |

```
「動画・画像のメタデータ生成」でNova Microを選択肢に出す
→ Nova Micro = テキスト専用 → 即脱落
→ Nova Lite / Nova Pro が正解
```

---

## プロビジョンドスループット vs オンデマンド

```
低トラフィック（1日100件等）：
  オンデマンド → 使った分だけ払う → 最安
  プロビジョンド → アイドル時も固定費 → 割高

高トラフィック（大量リクエスト）：
  プロビジョンド → 単価が下がる → コスト効率◎
  オンデマンド → 積み上がって割高
```

| キーワード | 正解 |
|---|---|
| 「低トラフィック」「1日100件」「使った分だけ」 | **オンデマンド + Lambda** |
| 「高トラフィック」「安定したスループット」「需要が高い」 | **プロビジョンドスループット** |

---

### インタラクティブ AI システムの構成要素まとめ

| サービス | 役割 |
|---|---|
| **Comprehend** | インテント認識（ユーザーが何をしたいか分類） |
| **Step Functions** | インテントに応じたワークフロー制御・エッジケーステスト |
| **DynamoDB** | 会話履歴・状態の永続保存 |
| **Lambda** | 出力検証・カスタムロジック |
| **CloudWatch** | プロンプトリグレッション監視 |

## グレースフルデグラデーション（Graceful Degradation）（Task 2.4）

**「一部が壊れても完全停止せず、機能を縮退させながら動き続けること」**

### フォールバックパス（段階的縮退）

```
① プライマリモデル（Claude Sonnet）
  ↓ 障害
② 小型モデル（Claude Haiku）
  ↓ 障害
③ キャッシュ済みの過去回答を返す
  ↓ キャッシュなし
④ 固定の静的レスポンス（「現在混雑中です」）
```

各段階に「移行する品質しきい値」と「移行ロジック」を定義する。

---

## HTTP接続プーリング（Task 2.4）

AWS SDK の HTTP クライアント（boto3 内部）レベルで管理する。**データベース接続プールと同じ概念**。

```python
from botocore.config import Config
config = Config(max_pool_connections=20)
client = boto3.client('bedrock-runtime', config=config)
```

- リクエストのたびに TCP コネクションを張り直さず使い回す → レイテンシー削減
- Redis / ElastiCache / API Gateway の設定ではない

---

## API Gateway エラーコード分類（Task 2.4）

再試行の可否を HTTPステータスコードで判断する。

| エラーコード | 意味 | 再試行 |
|---|---|---|
| **429** | Too Many Requests（スロットリング） | ✅ 可（ジッター付き指数バックオフ） |
| **500** | Internal Server Error | ✅ 可 |
| **503** | Service Unavailable | ✅ 可 |
| **400** | Bad Request（リクエスト不正） | ❌ 不可（直さないと永遠に失敗） |
| **401** | Unauthorized（認証失敗） | ❌ 不可 |
| **403** | Forbidden（権限なし） | ❌ 不可 |

Bedrock で最頻出は **429**（クォータ超過）。

---

## API Gateway：マッピングテンプレート vs リクエスト検証ツール（Task 2.4）

```
リクエスト検証ツール（JSON スキーマ）：
  「門番」→ 必須フィールド・型・サイズを検証してBedrock到達前に弾く

マッピングテンプレート：
  「翻訳者」→ リクエストの形式を変換するだけ。検証はしない
```

→ 詳細: [exam/traps.md](../exam/traps.md)

---

## トークンウィンドウ管理とコンテキスト圧縮（Task 2.5）

長い会話・長文処理でコンテキストウィンドウ上限（4K〜32K等）に近づいたときの対処テクニック群。

### スライディングウィンドウ

会話の「最新部分だけを切り取る窓」がスライドしていくイメージ。古い会話は捨てずに**要約して圧縮保持**する。

```
[会話1][会話2][会話3][会話4][会話5]  ← 窓
            ↓ 会話が進むと
[会話1〜2の要約(50tok)][会話3][会話4][会話5][会話6]
 ↑ 重要度の低い部分は圧縮   ↑ 直近の詳細は保持
```

### プロンプトチェーン間のコンテキスト引き継ぎ

前ステップの出力**全文**ではなく「蒸留した情報」だけを次ステップへ渡す。

```
Step1: 契約書を要約（出力8,000tok → 要約500tokだけ次へ）
Step2: 要約からリスク条項を抽出
Step3: リスク条項への対応策を提案
```

手法は3つ：**圧縮 / 要約 / キー情報の抽出**。長文を分割して送る場合（チャンキング）は、各チャンクに「前チャンクの要約」を付けて一貫性を維持（再帰的要約）。

### ストリーミング応答の Content-Type と接続維持

- **SSE（Server-Sent Events）**: `Content-Type: text/event-stream`。ブラウザがトークン単位でリアルタイム受信
- **チャンク化JSON**: `application/json`。SSE非対応クライアント（モバイル等）向け
- **WebSocket の接続維持**（長時間生成タスク）: アイドルタイムアウト 10〜30分、Ping/Pong 30〜60秒間隔

---

## バッチ推論 API の使い分け（Domain 2 Practice）

テキスト系モデルの非同期・バッチ推論と、Nova Reel の動画生成で API が異なる。混同しやすい。

| API | 用途 | 対応モデル |
|-----|------|-----------|
| `InvokeModel` | リアルタイム同期推論 | テキスト・マルチモーダル全般 |
| `InvokeModelWithResponseStream` | ストリーミング同期推論 | 同上 |
| **`CreateModelInvocationJob`** | **テキスト系モデルのバッチ推論** | Nova / Claude 等 |
| **`StartAsyncInvoke`** | **動画生成の非同期呼び出し** | **Nova Reel 専用** |

### リアルタイム + バッチ 2系統アーキテクチャ

```
リアルタイム: API Gateway → Lambda → InvokeModel → 即返却
                                                 （Lambda は結果を待つ）

バッチ:       SQS → Lambda → CreateModelInvocationJob 起動して即 return
                              ↑ ジョブは裏で動く。Lambda は完了を待たない
                              ↑ Lambda 15分タイムアウトを超えるジョブも安全
```

**⚠️ Step Functions で2系統を1ステートマシンに収めようとすると失敗する**
- Express ワークフロー（最大5分）→ バッチ処理時間を超える可能性
- Standard ワークフロー（同期実行）→ 呼び出し元がバッチ完了まで長時間ブロック

→ 応答時間が異なる2系統は **別アーキテクチャで捌く** のが正解

---

## 決定論的出力の実現手法（Task 3.1）

FMの出力は確率的（毎回変わる）。以下の手法で「毎回同じ形式・同じ結果」にできる。

### Text-to-SQL

**用途**：ユーザーの自然言語をSQLに変換してDBに投げる。数値の計算はDBが行うため結果が決定論的。

```
ユーザー「先月の売上トップ5を教えて」
  ↓ FM が SQL に変換
SELECT product, SUM(amount) FROM sales
WHERE month='2026-05'
GROUP BY product ORDER BY SUM(amount) DESC LIMIT 5;
  ↓ DB に投げる → 毎回同じ数値が返る
```

### JSON スキーマ強制・形式不一致の検出（Task 5.2）

**用途**：FMの出力形式を固定して後続システムに安全に渡す。

```python
# FMへの指示にスキーマを含める
# 期待出力: {"name": "...", "confidence": 0.xx, "category": "..."}

import jsonschema
jsonschema.validate(fm_output, schema)  # 形式が違えばエラー → リトライor拒否
```

**形式不一致が起きた場合の対処フロー：**

```
① FM 出力に対して JSON パースを試行
② 失敗 → CloudWatch Logs にバリデーションエラーとして記録
③ 自動リトライ（プロンプトを強化：「必ず JSON で返すこと。例：{...}」）
④ 再三失敗 → フォールバック処理（デフォルト値を返す等）
```

**JSON 出力を強制するもう一つの方法：** `converse` API の `toolUse`（ツール定義）でスキーマを固定すると、FM がツールの引数として JSON を返さざるを得なくなる。

### 信頼度スコアリング

| 方法 | 概要 | 向いている場面 |
|---|---|---|
| **KB の score** | RAG検索時に自動返却（0.0〜1.0）。低スコアは「情報なし」と返す | RAG構成 |
| **FM自己評価** | FMに `{"confidence": 0.xx}` を含むJSON出力させる | KBがない汎用Q&A |
| **セマンティック類似性** | 回答と原典をベクトル化してコサイン類似度を比較 | ハルシネーション厳格検証 |

---

## Amazon Bedrock モデル蒸留（Model Distillation）

**大きな教師モデルの知識を小さな生徒モデルに転送し、低コストで同等性能を実現する手法。**

### 教師・生徒モデルの選択ルール

- 生徒モデルは教師モデルより**大幅に小さい**必要がある
- Nova Pro を教師にする場合の有効な生徒：**Nova Lite / Nova Micro**（Nova Premier は不可・同等サイズ）
- Nova Premier を教師にする場合の有効な生徒：Nova Lite / Nova Micro / Nova Pro

```
Nova Premier（最大）
    ↓ 蒸留可能
Nova Pro（教師として使う場合）
    ↓ 蒸留可能
Nova Lite / Nova Micro（生徒として最適）
```

### データ合成方式（重要）

#### ① プロンプトのみ（Prompts only）

```
自分のプロンプト集
    ↓
Bedrock が教師モデルに応答を生成させる
    ↓
独自合成技術を適用（類似プロンプトを自動生成・多様化）
    ↓
最大 15,000 ペアまで拡張
    ↓
生徒モデルをファインチューニング
```

合成技術を使う分だけ**追加課金**（教師モデルのオンデマンドレートで請求）

#### ② プロンプト + 応答ペア（Prompt-response pairs）

```
呼び出しログ（プロンプト + 教師の応答 セット）
    ↓
そのまま生徒モデルのファインチューニングに使用

※ 合成技術は適用されない（多様化なし）
```

追加課金なし。ただし多様性・品質向上の恩恵がない。

→ **「独自のデータ合成技術を使いたい」→ プロンプトのみを渡す**

### 呼び出しログ（CloudWatch Logs）の活用

```
呼び出しログ → プロンプトのみ抽出 → Bedrockの合成技術適用 ✅
呼び出しログ → プロンプト+応答ペアで使用 → 合成技術は使えない ❌
```

Bedrock に呼び出しログへのアクセス許可を付与すれば、ログから直接トレーニングデータを取得できる。

### 対応モデル（公式テーブル）

| 教師モデル | 生徒モデル | リージョン |
|---|---|---|
| Nova Pro | Nova Lite / Nova Micro | US East (N. Virginia) |
| Nova Premier | Nova Lite / Nova Micro / **Nova Pro** | US East (N. Virginia) |
| Llama 3.1 405B | Llama 3.1 8B / 70B / 3.2 1B / 3.3 70B | US West (Oregon) |
| Llama 3.1 70B | Llama 3.1 8B / 3.2 1B / 3B | US West (Oregon) |

⚠️ **Anthropic（Claude）は現在非対応**（復旧時期未定）

### コスト注意事項

- 合成技術を使う（プロンプトのみ渡す）場合 → 教師モデルへの追加API呼び出しコストが発生（オンデマンドレートで請求）
- 応答ペアを渡す場合 → 再生成なし → 追加課金なし（ただし合成技術OFF）

### 呼び出しログ使用時の注意

- 呼び出しログのモデルIDと蒸留ジョブで指定した教師モデルIDが**一致しないとログが使われない**
- `requestMetadata` でフィルタリング可能（ユースケース別に絞り込み）

### 試験の判断軸

```
「コスト削減 + 精度維持」           → モデル蒸留
「教師より大幅に小さい生徒」        → Nova Pro教師ならNova Lite/Micro
「Bedrockの独自合成技術を使う」     → プロンプトのみ（応答ペアは不可）
「Anthropic モデルを蒸留したい」    → 現在非対応（罠選択肢に注意）
```

---

## プロンプトエンジニアリング トラブルシューティング（Task 5.2）

### CoT 推論失敗のパターンと対処

CoT（Chain-of-Thought）プロンプトで期待通りの推論が得られない場合の診断。

| 失敗パターン | 症状 | 対処 |
|------------|------|------|
| **推論の途中飛躍** | 中間ステップをスキップして結論に飛ぶ | 「ステップごとに番号を振れ」と明示指示 |
| **前提の誤り** | 最初の思考が間違い → 全体が崩れる | Few-shot で正しい推論例を提示 |
| **推論ループ** | 同じステップを繰り返して結論に至らない | max_tokens 増加 or プロンプト再設計 |

→ Bedrock Agents の `enableTrace` でステップごとの `rationale` を確認して失敗箇所を特定するのが診断の基本

### プロンプト複雑さメトリクス

モデルを混乱させる「過度に複雑な命令」を定量的に検出する観点。

```
① 命令数     → 1プロンプト内の「〜してください」の数が多い
② 条件分岐数  → 「もし〜なら / そうでなければ」の数が多い
③ トークン数  → 長すぎるプロンプトは後半の指示を忘れやすい
④ 曖昧語の数  → 「適切に」「なるべく」等の非定量表現が多い

スコアが高い → 命令を分割 / Few-shot で補完 / 具体的な基準に置き換える
```

---

## Bedrock Custom Model Import（外部/FT済みモデルの取り込み）（公式模試2週目）

- 外部でファインチューニングしたモデル（Meta Llama等、Hugging Face形式・Safetensors・設定・トークナイザー）をS3から**Bedrockにインポート**して、Bedrockモデルとして呼び出す機能。**形式変換は不要**（HF対応）。数十GB規模も可
- デプロイ時のスループット：「**特定レベル/保証されたスループット**（本番の定常負荷）」→ **プロビジョンドスループット**（専用容量）。**オンデマンドはスループットを保証しない**
- 不正解パターン：Bedrock形式に変換して**再ファインチューニング**（既にFT済みなら無駄・overhead大）／SageMakerエンドポイント+API Gatewayで自前統合（overhead大・"インポート"要件を満たさない）

## 会話履歴ストアの選定（チャットアプリ）（公式模試2週目）

- Lambda+Bedrockのチャットで、会話履歴（同時セッション・任意地点から再開・メタデータ検索・低レイテンシ・保存ポリシー）を**最もスケーラブル**に → **DynamoDB**
  - 単一テーブル設計＋**階層ソートキー**（例: `USER#..` / `CONV#..#MSG#<ts>`）で再開・メッセージ取得
  - **GSI**（userID/conversationID/topic 等のメタデータ）で検索・フィルタ
  - **DAX**で最近の会話を低レイテンシ取得／**TTL**で期限切れ自動削除
- Aurora PostgreSQL+pgvector+Redisのハイブリッドは overhead高＆スケール劣る（"最スケーラブル"に反する。網羅感の罠）
- メタデータ＝本文以外の識別子・属性・時刻すべて（ID・timestampもメタデータ）。DynamoDBは本文をペイロード、メタデータをキーにして引く方式（アクセスパターン駆動設計）

## Bedrock Prompt Management の設定（公式模試2週目）

- 再利用可能・パラメータ化テンプレート（クライアント別トーン/フォーマット）
- **アクティベーション前のレビュー・承認** → **バージョニング＋レビューワークフロー**（「保存ごとに自動で新バージョン有効化」は承認前レビューに反するので✗）
- スタイル制約の強制（絵文字/カジュアル表現の制限）→ **Bedrockガードレール**（ワード/コンテンツフィルター）
- 使用状況・テンプレート変更の**監査** → **CloudTrail**（誰が何を操作/変更したかの証跡）
