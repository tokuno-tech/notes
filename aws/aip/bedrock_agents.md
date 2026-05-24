# Amazon Bedrock Agents

## 概要

基盤モデル（FM）を中核として、ユーザーの自然言語リクエストを理解し、マルチステップのタスクを自律的に実行するフルマネージドサービス。
リクエストを分析し、ナレッジベース検索やアクショングループ呼び出しを自動的にオーケストレーションする。

---

## オーケストレーション戦略

- デフォルトは **ReAct（Reason and Action）**：FMのツールユースパターンを使って計画→実行を繰り返す
- Lambdaで独自ロジックに差し替えることも可能（Custom Orchestration）

---

## 構成要素

| 要素 | 説明 |
|---|---|
| **Foundation Model** | 推論・計画のエンジン |
| **Instructions** | エージェントの役割・目的を定義するプロンプト |
| **Action Groups** | エージェントが実行できるアクションの定義（OpenAPIスキーマ + Lambda） |
| **Knowledge Bases** | RAGソース。クエリして追加コンテキストを取得 |
| **Prompt Templates** | 前処理・オーケストレーション・後処理の各ステップのベースプロンプト（カスタマイズ可） |
| **Guardrails** | 有害コンテンツのブロック・フィルター |

---

## Bedrock Agents 固有の機能

以下はすべて **Bedrock Agents に紐づく機能**であり、Bedrock 全体の機能ではない点に注意。

### アクショングループ

- OpenAPIスキーマ（JSON/YAML）で外部APIの操作を定義
- エージェントがユーザーの意図に基づいて適切なAPI操作を自動選択
- Lambda関数経由で外部APIを呼び出す

### セッション管理

- 同一の `sessionId` 内で複数ターンの対話コンテキストを自動維持
- **Memory機能**を使えば異なるセッション間でもユーザーの過去のやり取りを記憶できる

### トレース機能（enableTrace）

オーケストレーションの各ステップを詳細に記録できる。

| トレース種別 | 内容 |
|---|---|
| `PreProcessingTrace` | 入力の分類 |
| `OrchestrationTrace` | 推論・ツール選択 |
| `PostProcessingTrace` | 出力の整形 |

---

## Bedrock 全体の機能（Agents以外でも使える）

### Model invocation logging

- Agents に限らず、FMを呼び出す際のログを全般的に取れる機能
- CloudWatch Logs や S3 に全モデル呼び出しの入出力を保存可能
- コンプライアンス要件への対応に使う

---

## ナレッジベース

- Bedrock Agents 経由でも使えるが、**単体（Knowledge Bases for Amazon Bedrock）でも独立して利用可能**
- S3などのデータソースからドキュメントを取り込み、チャンキング・ベクトル化・ベクトルストアへの格納を自動実施
- RAGパイプラインがフルマネージドで提供される
- モデルの再トレーニングなしに最新情報が反映される（データソース同期のみでOK）

### ベクトルストアの選択肢

- Amazon OpenSearch Serverless
- Amazon Aurora PostgreSQL
- など（いずれもマネージド運用）

### 運用ポイント

- データソース同期は **Amazon EventBridge** と組み合わせてスケジュール実行が可能
- チャンキング戦略の調整で検索精度を最適化できる
- 商品カタログなど頻繁に更新されるデータとの相性が良い（同期のみで反映・再学習不要）

### 検索パラメータ

| パラメータ | 内容 |
|---|---|
| `top-k` | 検索結果の取得件数。少なくするとレイテンシー改善、多くすると網羅性向上 |

### チャンク戦略の種類

| 戦略 | 特徴 |
|---|---|
| 固定サイズ | シンプル。文字数・トークン数で均等に分割 |
| セマンティック | 意味のまとまりで分割。検索精度が高い |
| 階層的 | 粗い粒度と細かい粒度を組み合わせて管理 |

### 対応フォーマット

PDF・テキスト・HTML・CSV など多岐にわたる

---

## マルチエージェント

- 2025年3月にGAになりスーパーバイザー型の分業構成が可能
- まずシングルエージェントで検証し、段階的に拡張するのが推奨

---

## Amazon Q Developer カスタマイズ（AIP-23）

### Amazon Q Developer とは

IDE（VS Code / JetBrains 等）に統合されるAIコーディングアシスタント。

| ティア | 特徴 |
|---|---|
| Q Developer（Free） | 個人利用。汎用的な提案 |
| **Q Developer Pro** | 組織管理・ユーザー割り当て・**カスタマイズ機能**が使える |

### カスタマイズ（Customization）機能

**社内のコードリポジトリをデータソースとして読み込み、Q Developer の提案をカスタマイズする機能。**

```
管理者が設定するもの
  ├─ データソース：社内フレームワーク / コーディング規約 / ユーティリティライブラリの Git リポジトリ
  ├─ カスタマイズを割り当てるチーム（Pro ユーザー単位）
  └─ プロジェクトリポジトリ自体は変更不要
         ↓
開発者が IDE で使うとき
  → Q Developer の提案に社内規約・フレームワークが反映されたコードが出てくる
```

### キーポイント（試験判断軸）

| 要件 | 判断 |
|---|---|
| 「各プロジェクトのリポジトリ構成を変更しない」 | カスタマイズ機能のみ対応（.amazonq ディレクトリ追加はリポジトリ変更になる） |
| 「全エンジニアへのサービス側からの一元設定」 | Pro ティアのカスタマイズ機能で管理者が一括設定・割り当て |
| 「社内資産を反映させたい」 | カスタマイズのデータソースに社内リポジトリを指定 |

### 不正解パターン（AIP-23）

| 選択肢 | 不正解の理由 |
|---|---|
| `.amazonq` ディレクトリにコンテキストファイルを配置 | **各プロジェクトリポジトリに変更が必要**。要件「リポジトリ構成を変更しない」に反する |
| Amazon Kendra + Amazon Q Business | Q Business は社内チャットボット。Q Developer（コーディング支援）とは別製品 |
| CodeCommit サブモジュールとして各開発者がクローン | 各リポジトリにサブモジュール設定が必要 → リポジトリ構成の変更 |

### Amazon Q Developer vs Amazon Q Business（混同注意）

| | Amazon Q Developer | Amazon Q Business |
|---|---|---|
| 用途 | **コーディング支援**（IDE に統合） | **社内チャットボット**（ドキュメント検索・Q&A） |
| データソース | コードリポジトリ | Confluence・SharePoint・S3 等のドキュメント |
| 統合先 | IDE（VS Code / JetBrains 等） | Web UI / Slack / Teams |

---

## Lambda Function URL と MCP サーバー（AIP-25）

### Model Context Protocol（MCP）とは

AI エージェントがツール（外部 API・データソース等）を呼び出すための**標準プロトコル**。
MCP サーバーは HTTPS エンドポイントとして公開し、クライアント（AI エージェント）がツールを呼び出す。

### Lambda Function URL とは

Lambda 関数に**直接 HTTPS エンドポイントを付与する機能**。API Gateway 等の追加サービス不要。

```
Lambda 関数
  ↓ Function URL を有効化（設定1回のみ）
https://xxxx.lambda-url.ap-northeast-1.on.aws/
  ← 直接 HTTPS で呼び出せる
```

### AIP-25 正解構成：Lambda Function URL（レスポンスストリーミング + AWS_IAM 認証）

```
MCP クライアント（AI エージェント）
  ↓ SigV4 署名付きリクエスト
Lambda Function URL
  ├─ auth_type: AWS_IAM（SigV4 署名を検証）
  └─ invoke_mode: RESPONSE_STREAM（ストリーマブル HTTP）
  ↓
Lambda 関数（MCP サーバーのロジック）
  ↓ ストリーミングレスポンス
クライアントに逐次返却
```

### 各設定項目の意味

| 設定 | 値 | 意味 |
|---|---|---|
| 認証タイプ | `AWS_IAM` | 呼び出し元に SigV4 署名を要求。IAM ポリシーで `lambda:InvokeFunctionUrl` 権限を付与 |
| 呼び出しモード | `RESPONSE_STREAM` | レスポンスを逐次ストリーミング。ストリーマブル HTTP に対応 |
| 外部パートナーのアクセス | クロスアカウント IAM ロール + `lambda:InvokeFunctionUrl` 権限 | 追加サービス不要で外部からの強固な認証を実現 |

### 不正解パターン（AIP-25）

| 選択肢 | 不正解の理由 |
|---|---|
| API Gateway HTTP API + Cognito オーソライザー | API Gateway は追加の管理コンポーネント。「管理コンポーネントを最小限に」に反する |
| CloudFront + Lambda@Edge + 署名付き URL | CloudFront ディストリビューション・キーペア管理が必要。「最小限のインフラ」に反する |
| SDK の Lambda Invoke API でカスタムトランスポート | HTTP トランスポートではなく SDK 呼び出し。「ストリーマブル HTTP トランスポート」要件を満たさない |

### Lambda Function URL vs API Gateway（試験での使い分け）

| 観点 | Lambda Function URL | API Gateway |
|---|---|---|
| 管理コンポーネント数 | **少ない**（Lambda だけ） | 多い（API Gateway + Lambda） |
| レスポンスストリーミング | **対応**（RESPONSE_STREAM モード） | HTTP API のみ対応（REST は非対応） |
| 認証 | AWS_IAM または NONE | Lambda オーソライザー / Cognito / IAM |
| 用途 | 単純な HTTP エンドポイント・MCPサーバー | 高度なルーティング・複数Lambda統合・スロットリング |
