# 監視・可観測性（Monitoring & Observability）

AWSの監視サービスおよびOSSツールの整理。AIPでは主にCloudWatch系の選択問題で出題される。

---

## Prometheus（プロメテウス）

**メトリクス収集・保存専用**のOSSツール。

### 仕組み

```
アプリ/サーバー  ←  Prometheus が定期的に「Pull」してメトリクスを取得
                         ↓
                    時系列DB（内蔵）に保存
```

- **Pullモデル**: Prometheusが監視対象に定期的に取りに行く（CloudWatchはアプリ側がPushする逆方向）
- **時系列DB内蔵**: `cpu_usage{host="web01"} 72.3` 形式で保存
- **PromQL**: メトリクスを集計・フィルタするクエリ言語
- **得意分野**: Kubernetes / コンテナ環境との親和性が高い
- **弱点**: 可視化機能がない → Grafanaと組み合わせて使う

---

## Grafana（グラファナ）

**可視化専用**のOSSダッシュボードツール。

- Prometheusだけでなく**多様なデータソースに接続できる**
  - CloudWatch、Elasticsearch、MySQL、InfluxDB、Loki など
- グラフ・ヒートマップ・アラートを柔軟に設定
- **しきい値は自分で設定する（静的）**

### よくある組み合わせ

```
Prometheus（収集・保存） + Grafana（可視化）
```

Kubernetesの監視ではデファクトスタンダード。

---

## AWS マネージド版

| OSS | AWSマネージド版 | 概要 |
|---|---|---|
| Prometheus | **Amazon Managed Service for Prometheus（AMP）** | サーバー管理不要でPrometheusを運用 |
| Grafana | **Amazon Managed Grafana（AMG）** | サーバー管理不要でGrafanaを運用 |

機能はOSSと同じ。運用負荷が下がるだけ。

### ⚠️ 試験の引っかけ（AIP-68）

- 可視化・監視基盤としては強力だが**静的しきい値のみ**
- ML自動学習によるベースライン自動生成は**なし**
- 「ML自動ベースライン + 動的異常検出」が要件 → CloudWatch 異常検出 / Application Insights が正解

---

## CloudWatch Application Insights（AIP-68）

- **対象**: EC2上で動作するアプリケーション（.NET、Java、SQL Server等）
- **特徴**:
  - MLベースのベースラインを**自動学習**し、異常を検出
  - 関連するログ・イベント・メトリクスを**自動相関付け**して問題の根本原因を絞り込む
  - EventBridge → SNS で通知（約10分以内）
- **試験ポイント**: EC2ベースのアプリ監視でMLによる自動ベースライン学習が必要 → Application Insights が正解

---

## CloudWatch EMF（Embedded Metric Format / 埋め込みメトリクスフォーマット）（AIP-68）

- **概念**: 構造化JSON形式のログを書き込むだけで、CloudWatchメトリクスを**自動抽出・記録**する仕組み

```json
// こういう構造化ログを出力するだけで...
{ "_aws": { "Metrics": [{"Name": "Latency", "Unit": "ms"}] }, "Latency": 123 }
// → CloudWatch メトリクス「Latency=123ms」が自動で記録される
```

- **特徴**:
  - ログとメトリクスを**同時に記録**できる（ログを書けばメトリクスも生成される）
  - `PutMetricData` APIで別途送信する必要がない
  - Lambda、ECS、EC2など幅広い環境で利用可能
- **試験ポイント**: 「ログとメトリクスを同時に記録したい」「カスタムメトリクスを手軽に生成したい」→ EMF

---

## CloudWatch Container Insights（AIP-68）

- **対象**: **ECS / EKS 専用**（コンテナ環境のCPU・メモリ・ネットワーク等を収集）
- **⚠️ 試験の引っかけ**: EC2ベースのアプリケーション監視には**不向き**
  - Container Insightsはコンテナオーケストレーターのメトリクスをクラスタレベルでとる設計
  - EC2上の.NETアプリのログ相関・ML異常検出は → Application Insights が正解

---

## Amazon OpenSearch Service のログ分析・異常検出用途（AIP-68）

- **できること**:
  - ログ分析・リアルタイム分析（大量ログの全文検索・集計）
  - 機械学習を使った**異常検出機能**あり
  - **Amazon Kinesis Data Firehose から配信**してデータを取り込める
- **⚠️ 試験の引っかけ**:
  - クラスタの管理・運用負荷が大きい
  - AIPの問題で「最も効率的」「マネージド」が求められる場合は CloudWatch が優先される
  - EC2アプリのML監視 → OpenSearch より Application Insights の方がフィット

---

## 監視サービス選択まとめ（AIP-68）

| 要件 | 正解サービス |
|---|---|
| EC2アプリのMLベース異常検出 + ログ相関 | CloudWatch **Application Insights** |
| ログを書くだけでカスタムメトリクスも記録 | CloudWatch **EMF** |
| ECS/EKSコンテナのメトリクス監視 | CloudWatch **Container Insights** |
| Bedrockトークン数の動的異常検出 | CloudWatch **異常検出アラーム**（→ bedrock_guardrails_eval.md 参照） |
| 可視化ダッシュボード（静的しきい値） | **Managed Grafana + Managed Prometheus** |
| 大量ログの全文検索・リアルタイム分析 | **OpenSearch Service**（Firehose配信可） |

### CloudWatch vs Prometheus + Grafana

| | CloudWatch | Prometheus + Grafana |
|---|---|---|
| **メトリクス収集** | AWSサービスと自動連携 | 自分で設定が必要 |
| **ML異常検出** | ✅ あり（異常検出アラーム） | ❌ なし（静的しきい値のみ） |
| **可視化** | 標準ダッシュボード | Grafanaは非常に柔軟・高機能 |
| **マルチクラウド** | AWSのみ | ✅ どこでも使える |
| **Kubernetes親和性** | △ | ✅ 非常に高い |

---

## CloudWatch 複合アラーム

「**複数のアラームを AND/OR で組み合わせて1つの判定を出す**アラーム」。

```
通常のアラーム（単一メトリクス）：
  「レイテンシーが500ms超えたら警告」
  → 一時的なスパイクでも誤検知が多い

複合アラーム：
  「レイテンシー > 500ms」
  AND「エラー率 > 5%」
  AND「スロットリング発生」
  → 3つ全部満たした時だけ警告
  → 本当の障害の時だけ発火
```

**試験での識別：** 「誤検知を減らしたい」「複数条件が重なった時だけ警告」→ CloudWatch複合アラーム

---

## X-Ray サンプリングルール

「**通常時は低いサンプリングレート、問題発生時は詳細トレース**を取得する設定」。

```
通常時：1%のリクエストだけトレース取得（コスト節約）
エラー発生時：100%に自動引き上げ（詳細調査）
```

カスタムサブセグメント：重要な処理ステージ（Bedrock呼び出し・DB処理等）を個別にトレース。

## CloudWatch モニタリング：Contributor Insights vs 異常検出アラーム（AIP-50）

### CloudWatch Contributor Insights

**目的**：ログデータから「最も影響の大きい上位N件の貢献者」をリアルタイムでランキング表示する。

```
例）
・エラーを最も多く発生させている IP アドレス Top10
・最もトークンを消費しているツール呼び出し Top5
・最もリクエストが多いユーザー ID Top20
```

**仕組み**：
- CloudWatch Logs のログに対してルールを定義
- 指定フィールドの値ごとにカウント / sum を集計してランキング化
- リアルタイムで「誰が / 何が一番多いか」を可視化

**⚠️ 限界**：
- アラームのしきい値は**固定値（静的）**
- 「利用パターンに追従して基準値が自動更新」はできない
- → **「自動更新」要件があれば Contributor Insights は不正解**

---

### CloudWatch 異常検出アラーム（Anomaly Detection Alarm）

**目的**：ML でメトリクスの「正常な振る舞い」を自動学習し、逸脱を検知する。

```
通常の CloudWatch アラーム：
  「値が 1000 を超えたら ALARM」← しきい値は固定

異常検出アラーム：
  ML が過去データを学習 → 上限/下限バンドを動的生成
  「バンドを外れたら ALARM」← 基準値が自動更新 ✅

  例）平日昼はトークン消費が自然と多い
    → バンドが昼は高め、深夜は低めに自動調整
    → 本当の異常だけを検知
```

**特徴**：
- 時間帯・曜日などの季節性パターンを自動考慮
- しきい値の手動メンテナンスが不要
- 標準偏差の倍数でバンドの幅を調整可能

---

### AIP-50 の正解構成（Bedrock トークン異常監視）

```
Bedrock モデル呼び出しログ
        ↓
CloudWatch Logs（ログ収集）
        ↓
メトリクスフィルター（ツール名をディメンションに指定）
        ↓
カスタムメトリクス（ツール別 InputTokenCount / OutputTokenCount）
        ↓
CloudWatch 異常検出アラーム（ML ベース・自動更新）✅
```

**メトリクスフィルターのポイント**：
- JSON ログからツール名フィールドを抽出してディメンションに設定
- ツールごとに別々のメトリクスとして発行 → 「どのツールが異常か」を特定可能

---

### 試験での判断軸（AIP-50 パターン）

```
「アラートの基準値が自動的に更新される」
  → CloudWatch 異常検出アラーム（固定しきい値は不正解）

「どの〇〇が一番多いか可視化・ランキング表示したい」
  → CloudWatch Contributor Insights

「Contributor Insights でアラーム設定」
  → ❌ しきい値は固定。自動更新要件があれば不適

「SageMaker Random Cut Forest で異常検出」
  → ❌ 構成が複雑すぎ。CloudWatch 単体で完結するなら CloudWatch が正解
```

---

## Bedrock Agent トレース機能 と 監査ログ（AIP-55）

### Bedrock Agent トレース機能

エージェントの各推論ステップを記録する機能。有効化すると各ステップの入出力が取得できる。

| ステップ | 内容 |
|---|---|
| **Pre-processing** | ユーザー入力の分類・整合性チェック |
| **Orchestration** | ツール選択・Knowledge Base 検索・アクション実行の一連の思考過程（ReAct ループ） |
| **Post-processing** | 最終レスポンス生成 |

- `enableTrace: true` を指定すると各ステップの `input` / `output` / `rationale` が返される
- 誤動作・意図しない推論の**デバッグ**や**監査証跡**に使用

#### Orchestration の詳細：ReAct ループ

Bedrock Agent のオーケストレーションは **ReAct（Reasoning + Acting）** パターンで動作する。

```
ユーザー入力
  ↓
① Reasoning（思考）：「次に何をすべきか」を考える（Chain of Thought）
② Acting（アクション）：Knowledge Base検索 / Lambda呼び出し / 外部API実行
③ Observation（観察）：ツールの返り値を受け取る
④ 再思考 → 目標達成まで①〜③をループ
  ↓
Post-processing へ（最終回答生成）
```

| 要素 | 内容 |
|---|---|
| **Reasoning** | 次に何をすべきか考える |
| **Action** | Knowledge Base検索・Lambda（Action Group）・外部API実行 |
| **Observation** | ツールの返り値を受け取る |
| **繰り返し** | 目標達成まで何周でもループ |

トレース有効時はこのループの**各周の入出力**（何を考え・何を呼び出し・何が返ってきたか）が全記録される  
→ 「なぜその回答になったか」を事後追跡 = デバッグ・監査に活用

### Model Invocation Logging（モデル呼び出しログ）

| 項目 | 内容 |
|---|---|
| **出力先** | CloudWatch Logs または S3 |
| **記録内容** | プロンプト全文（入力）＋ モデルの応答（出力） |
| **用途** | 会話内容の完全な監査証跡、コンプライアンス対応 |

### CloudTrail との違い（試験頻出）

| サービス | 記録内容 | 監査用途 |
|---|---|---|
| **CloudTrail** | API呼び出しメタデータ（誰が・いつ・どのAPIを） | 操作ログ・API監査 |
| **Model Invocation Logging** | プロンプト本文＋モデル応答の**内容** | 会話内容の監査 |

> ポイント：「チャット内容を監査したい」→ CloudTrail では**不十分**。Model Invocation Logging が必要。

### Bedrock Knowledge Base の引用（citations）フィールド

- `RetrieveAndGenerate` API のレスポンスには **`citations`** フィールドが自動付与される
- どのドキュメント・どのチャンクを参照したかが明示 → ソース帰属の自動化
- 別途ソース追跡の仕組みを構築する必要がない

### AIP-55 アーキテクチャパターン（チャットボット監査対応）

```
ユーザー
  ↓
Amazon CloudFront（エッジ最適化・レイテンシー軽減 ※AI応答そのものではなく配信レイヤー）
  ↓
API Gateway + Lambda
  ↓
Bedrock Agent（enableTrace: true）
  ├─ Knowledge Base（RAG・citations付き）
  └─ Model Invocation Logging → CloudWatch Logs / S3（会話内容の監査証跡）
```

**CloudFront の役割**：AI応答のストリーミングや静的コンテンツの配信を最適化。AIの推論そのものを高速化するわけではない。

### 試験での判断軸（AIP-55 パターン）

```
「会話内容を監査したい」
  → CloudTrail だけ → ❌（API メタデータのみ、プロンプト内容なし）
  → Model Invocation Logging → ✅（プロンプト＋応答の完全記録）

「エージェントの推論過程を把握したい」
  → Agent トレース機能（enableTrace）→ ✅

「RAG の回答のソース元を示したい」
  → Knowledge Base の citations フィールド → ✅（自動付与）

## Bedrock モニタリング手法の比較（AIP-57）

### ユースケース別の正解アーキテクチャ

| 要件 | 正解 | 理由 |
|---|---|---|
| リクエスト単位の詳細分析・柔軟なクエリ | **CW Logs Insights** | ログを SQL ライクにクエリ、ダッシュボードにログウィジェット追加可能 |
| リアルタイム集計 + 閾値アラーム | **CW ネイティブメトリクス** | InputTokenCount / OutputTokenCount 等が自動発行、CW Alarm で閾値通知 |
| 分散トレーシング（サービス間レイテンシー把握） | X-Ray | ❌ トークン集計・アラームには不向き |
| バッチ分析・可視化ダッシュボード | Athena + QuickSight | ❌ バッチ処理のみ、ネイティブアラーム機能なし |
| ストリームリアルタイム処理 | Kinesis + Lambda + DynamoDB | ❌ 3 サービス管理のオーバーエンジニアリング、CW で十分 |

### Bedrock ネイティブメトリクスの特徴
- **追加設定不要**：Bedrock が自動で CloudWatch にパブリッシュ
- **ModelId ディメンション**：モデルごとのトークン使用量を分解可能
- **Inference Profile ID ディメンション**：アプリケーション単位での追跡が可能
- CW Alarm と組み合わせることでコスト超過・異常使用の即時通知が実現

### 試験での判断軸（AIP-57 パターン）
```
「リクエストごとに詳細ログを分析したい」
  → CW Logs Insights → ✅（柔軟クエリ、ダッシュボード対応）

「トークン使用量をリアルタイムで監視してアラートを出したい」
  → CW ネイティブメトリクス + CW Alarm → ✅

「分散トレーシングで遅延箇所を特定したい」
  → X-Ray → ✅（ただしトークン集計・閾値アラームには❌）

「Kinesis + Lambda + DynamoDB でリアルタイム集計」
  → ❌ CW で代替できるのにオーバーエンジニアリング
```

---

## AWS X-Ray の詳細（AIP-83）

### X-Ray の役割

**分散トレーシングサービス。** リクエストが複数のマイクロサービス・AWS サービスを横断する際の経路・レイテンシーを可視化する。

```
通常のログ分析：
  「サービスAのログ」「サービスBのログ」を別々に見る
  → サービス間の依存関係やボトルネックが見えにくい

X-Ray 分散トレーシング：
  1つのリクエストが A → B → Bedrock と流れる全経路を
  1つのトレースとして追跡・可視化
  → どのサービスで何ミリ秒かかっているか一目でわかる
  → サービスマップを自動生成（依存関係の視覚化）
```

### アノテーション vs メタデータ（重要）

| | アノテーション（Annotation） | メタデータ（Metadata） |
|---|---|---|
| **インデックス** | ✅ される | ❌ されない |
| **フィルタ検索** | ✅ 高速検索可能 | ❌ 検索不可 |
| **用途** | FM の種類・ユーザーIDなど「検索したい属性」 | デバッグ用の詳細情報 |

```python
# アノテーションの付与例（FM別分析に使う）
subsegment.put_annotation("model_id", "anthropic.claude-3-sonnet")
subsegment.put_annotation("department", "sales")

# → X-Ray コンソールで "model_id = claude" でフィルタリングして
#   Claude だけのレスポンスタイム統計を抽出できる
```

### AWS SDK 標準リトライモード（AIP-83）

| モード | 内容 |
|---|---|
| **legacy** | 旧来の固定リトライ。ジッターなし |
| **standard** | ジッター付きエクスポネンシャルバックオフ。**推奨** |
| **adaptive** | クライアント側レートリミッティングも行う。実験的機能 |

→ **「スロットリング時のリトライ集中を防ぐ」→ standard モード** が正解

### CloudWatch ServiceLens とは

X-Ray + CloudWatch + AWS Health を統合したダッシュボード機能。

```
ServiceLens が提供するもの：
  ✅ サービスマップ（X-Ray ベース）
  ✅ 各サービスのメトリクス統合表示
  ✅ アラームとトレースの相関表示

ServiceLens の限界：
  ❌ FM別のフィルタリングには X-Ray アノテーションの付与が別途必要
  ❌ ServiceLens だけではカスタム属性での相関分析はできない
```

### CloudTrail vs X-Ray（試験で混同しやすい）

| | AWS CloudTrail | AWS X-Ray |
|---|---|---|
| **目的** | 監査・ガバナンス（誰がいつ何をしたか） | パフォーマンス分析（どこで遅いか） |
| **記録内容** | API呼び出しイベントログ | リクエストのセグメント・レイテンシー |
| **レイテンシー計測** | ❌ | ✅ |
| **サービスマップ** | ❌ | ✅ |
| **フィルタリング** | 基本的なフィールド検索 | アノテーションによる高速フィルタ |

## Bedrock Knowledge Base モニタリング（公式模擬Q7）

### Bedrock のログ種類を区別する

| ログ種類 | 何を記録するか | 用途 |
|---|---|---|
| **ナレッジベースログ → CloudWatch Logs** | ドキュメント取り込みステータス | 取り込み失敗のトラブルシュート |
| **モデル呼び出しログ** | 推論リクエスト・レスポンス | モデル使用量・コスト分析 |
| **CloudTrail** | API コール監査 | 誰がいつ何の API を呼んだか |

**引っかけ：** Dの「モデル呼び出しログ」もBedrockのログだが、**KBドキュメント取り込みプロセスとは別の仕組み**。

### KBログで確認できるステータスコード

```
RESOURCE_IGNORED  - 対象外ファイル
EMBEDDING_FAILED  - 埋め込み生成失敗  
INDEXING_FAILED   - インデックス登録失敗
```

### 正解パターン

```
KB ログ記録 → CloudWatch Logs 送信
  ↓
CloudWatch Logs Insights でクエリ
  例: status = "EMBEDDING_FAILED" の件数・ドキュメント名を抽出
```

### 試験での判断軸

```
「ドキュメント取り込みの失敗をトラブルシュート」
  → KBログ → CloudWatch Logs + Logs Insights → ✅

「モデル呼び出し（推論）のログ」
  → Model Invocation Logging → ✅（でも今回の要件には不一致）

「API コール監査（誰がStartIngestionJob呼んだか）」
  → CloudTrail → ✅（でもドキュメント単位の詳細は取れない）
```

---

## レイテンシーパーセンタイル（p50/p90/p99）（Task 2.4）

**全リクエストを速い順に並べたとき、何%目のレイテンシーか。**

```
p50 = 中央値。「普通のユーザーが体感する速さ」
p90 = 「ちょっと遅めのユーザーが体感する速さ」
p99 = 「最悪に近いユーザーが体感する速さ」
```

### なぜ平均値では不十分か

```
99件が100ms、1件が10,000msの場合：
  平均値 ≈ 200ms → 「速い！」に見える
  p99   = 10,000ms → 「100人に1人が10秒待っている」が見える
```

**SLAは p99 で設定するのがベストプラクティス**（平均は外れ値に騙される）。

---

## X-Ray トレーシング詳細（Task 2.4）

### 用語整理

**サブセグメント**：1リクエスト内の処理単位の内訳

```
Trace（全体）
  └ Segment（Lambda関数）
       ├ Subsegment：前処理      20ms
       ├ Subsegment：Bedrock呼び出し  2,400ms  ← ボトルネック特定
       └ Subsegment：後処理      15ms
```

**注釈（Annotation）/ スパン属性**：トレースに付加する検索可能なメタデータ

```
model_name = "claude-sonnet"
input_tokens = 1200
user_tier = "premium"
← 後からこの値で絞り込み検索できる
```

**サービスマップ**：サービス間の依存関係を自動可視化した図

```
[API GW] → [Lambda] → [Bedrock]
               ↓
           [DynamoDB]
← どこでエラーが多いかが一目でわかる
```

---

## メトリクス保存先の使い分け（Task 2.4）

| サービス | 得意なデータ | FM監視での用途 |
|---|---|---|
| **Amazon Timestream** | 時系列メトリクス | レイテンシー・コストの推移分析 |
| **DynamoDB** | キーバリュー | モデルごとの最新スコアを高速取得（ルーティング判断に使う） |
| **OpenSearch** | テキスト・ログ | ログの全文検索・可視化 |
| **Kinesis** | ストリーム転送 | メトリクスを他サービスへ流す「パイプ」 |

```
「時系列」「推移」「トレンド分析」 → Timestream
「低レイテンシーで最新値取得」   → DynamoDB
「ログ検索・全文検索」           → OpenSearch
「配管役」                       → Kinesis
```

---
