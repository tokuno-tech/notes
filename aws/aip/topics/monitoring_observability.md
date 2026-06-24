# 監視・可観測性（Monitoring & Observability）

AWSの監視サービスおよびOSSツールの整理。AIPでは主にCloudWatch系の選択問題で出題される。

---

## Amazon CloudWatch generative AI observability（Task 4.3）

CloudWatch 内に独立して存在する **GenAI 専用の目的別ダッシュボード機能**（現在 Preview）。
モデル呼び出しログやカスタムメトリクスの「総称」ではなく、固有の機能名。

### 構成

```
Amazon CloudWatch generative AI observability
  ├─ Model Invocations ダッシュボード
  │    ・Bedrock モデルの呼び出しログ・トークン使用量・レイテンシー
  │    ・AgentCore 専用ではなく、どのモデルでも使える
  │
  └─ Bedrock AgentCore タブ（エージェント集約ビュー）
       ・複数エージェントを1か所で横断監視
       ・セッション数・実行時間・エラー率・ツール使用状況
       ・Agents / Memory / Built-in Tools / Gateway / Identity を網羅
```

### テレメトリの仕組み

- **OpenTelemetry（OTEL）形式**でデータを収集
- Strands / LangGraph / CrewAI など主要フレームワークが対応済み
- **ADOT SDK** による自動計装（追加コード変更不要）
- CloudWatch の OTLP エンドポイントに直接送信

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

## CloudWatch Application Insights（AIP-68）

- **対象**: EC2上で動作するアプリケーション（.NET、Java、SQL Server等）
- **特徴**:
  - MLベースのベースラインを**自動学習**し、異常を検出
  - 関連するログ・イベント・メトリクスを**自動相関付け**して問題の根本原因を絞り込む
  - EventBridge → SNS で通知（約10分以内）

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

### ベクトルストアとしての CloudWatch 監視メトリクス（Task 4.3）

RAG の Knowledge Base に OpenSearch を使う場合に監視すべき項目。

**パフォーマンスメトリクス：**

| メトリクス | 意味 | 異常の兆候 |
|---|---|---|
| `SearchLatency` | ベクトル検索の応答時間 | 上昇 → インデックス断片化・シャード偏り |
| `IndexingRate` | 1秒あたりのインデックス作成数 | 低下 → 取り込みパイプラインの詰まり |
| `QueryRate` | 1秒あたりのクエリ数 | 急増 → 異常トラフィック |

**ヘルスインジケーター：**

```
ClusterStatus
  green  = 全シャード正常 ✅
  yellow = レプリカに問題（プライマリは正常） ⚠️
  red    = プライマリシャード消失 🚨 → データ損失リスク

JVMMemoryPressure
  85% 超 → GC 頻発 → レイテンシー急増の前兆
  95% 超 → クラスター不安定・OOM リスク

FreeStorageSpace：残り 20% 切ったらアラーム
CPUUtilization ：80% 超で継続的なら増強検討
```

---

## 監視サービス選択まとめ（AIP-68）

| 要件 | 正解サービス |
|---|---|
| EC2アプリのMLベース異常検出 + ログ相関 | CloudWatch **Application Insights** |
| ログを書くだけでカスタムメトリクスも記録 | CloudWatch **EMF** |
| ECS/EKSコンテナのメトリクス監視 | CloudWatch **Container Insights** |
| Bedrockトークン数の動的異常検出 | CloudWatch **異常検出アラーム**（→ bedrock_guardrails.md 参照） |
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

### Bedrock トークン異常監視の構成

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

## エージェントトレースの2種類（混同注意）（Task 4.3）

**同じ「トレース」でも、対象サービスと目的が異なる別物。**

| | Agents for Amazon Bedrock（enableTrace） | Bedrock AgentCore Observability |
|---|---|---|
| **対象** | 従来の Bedrock Agents | Bedrock AgentCore |
| **有効化** | `InvokeAgent` API に `enableTrace: true` | AgentCore Observability として別途設定 |
| **出力先** | InvokeAgent のレスポンスストリーム内 | CloudWatch + X-Ray（外部サービスに統合） |
| **主な用途** | **開発・デバッグ**（テスト時の推論確認） | **本番監視**（継続的なモニタリング・アラート） |
| **可視化** | JSONをアプリ側でパースして確認 | CloudWatch ダッシュボードで継続表示 |

→ 試験で「エージェントのトレース」が出たら、**開発デバッグ文脈 → enableTrace / 本番監視文脈 → AgentCore Observability** で使い分ける

---

## Bedrock Agent トレース機能（enableTrace）と 監査ログ（AIP-55）

### Bedrock Agent トレース機能（Agents for Amazon Bedrock 専用）

エージェントの各推論ステップを記録する機能。有効化すると各ステップの入出力が取得できる。

| ステップ | 内容 |
|---|---|
| **Pre-processing** | ユーザー入力の分類・整合性チェック |
| **Orchestration** | ツール選択・Knowledge Base 検索・アクション実行の一連の思考過程（ReAct ループ） |
| **Post-processing** | 最終レスポンス生成 |

- `enableTrace: true` を指定すると各ステップの `input` / `output` / `rationale` が返される
- 誤動作・意図しない推論の**デバッグ**や**監査証跡**に使用
- **AgentCore には対応しない**（AgentCore は専用の Observability サービスを持つ）

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
| **出力先** | CloudWatch Logs または S3（両方同時設定可） |
| **記録内容** | プロンプト全文（入力）＋ モデルの応答（出力） |
| **用途** | 会話内容の完全な監査証跡、コンプライアンス対応 |

#### 送信先の使い分け（重要）

| 比較項目 | CloudWatch Logs | S3 |
|---|---|---|
| テキスト・メトリクス | ✅ 対応 | ✅ 対応 |
| **バイナリ画像データ** | ❌ **非対応** | ✅ **対応** |
| **ビデオデータ** | ❌ 非対応 | ✅ 対応 |
| 本文サイズ上限 | **100 KB 制限** | 100KB超は別S3オブジェクトとして自動保存 |
| リアルタイム分析 | ✅ Logs Insights | ❌ |
| バッチ分析 | ❌ | ✅ **Athena** |

**Converse API + 画像/ドキュメント**: S3ログが有効な場合のみメディアデータが記録される（CloudWatch Logsのみでは画像は記録されない）

### CloudTrail との違い

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

### CloudWatch ServiceLens とは

X-Ray + CloudWatch を統合したダッシュボード機能。**MTTR（平均解決時間）短縮**が主目的。

```
ServiceLens が提供するもの：
  ✅ サービスマップ（X-Ray ベース、依存関係を自動可視化）
  ✅ 各サービスのメトリクス統合表示
  ✅ アラームとトレースの相関表示（アラーム発火時刻のトレースへ直接ジャンプ）
     → 「いつ（CW）」と「何が起きたか（X-Ray）」を1画面で確認 = MTTR短縮

ServiceLens の限界：
  ❌ FM別のフィルタリングには X-Ray アノテーションの付与が別途必要
  ❌ ServiceLens だけではカスタム属性での相関分析はできない
```

**後継サービス**：CloudWatch Application Signals（SLO管理機能付き）がより新しいが、AIP試験ではServiceLensが主軸。

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

### KB取り込みモニタリング構成

```
KB ログ記録 → CloudWatch Logs 送信
  ↓
CloudWatch Logs Insights でクエリ
  例: status = "EMBEDDING_FAILED" の件数・ドキュメント名を抽出
```

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

## AI導入効果のKPI計測（カスタムメトリクス＋有意性検定）（Task 2.5）

**ビジネスKPI（平均処理時間・一次解決率等）は CloudWatch に自動では存在しない** → アプリ側が業務イベントのたびに `put_metric_data` で発行する（= カスタムメトリクス）。

```python
cloudwatch.put_metric_data(
    Namespace="ContactCenter",
    MetricData=[{
        "MetricName": "HandleTimeMinutes",
        "Dimensions": [{"Name": "Group", "Value": "ai-assisted"}],  # A/B群のタグ
        "Value": 9.8
    }]
)
```

**AI導入の改善効果を証明する3点セット：**

1. **導入前ベースライン**：導入前にKPIを記録しておく（なければ比較不能）
2. **A/Bテスト**：AI支援あり群 / なし群（対照群）に分け、Dimension で系列を分離
3. **統計的有意性検定（t検定）**：p < 0.05 なら「偶然ではなくAI起因の改善」と判定。
   p ≥ 0.05 なら偶然の範囲（「たまたま簡単な問い合わせが多かった月」かもしれない）

- 計算は CloudWatch からデータを取り出して scipy `ttest_ind()` 等。試験では計算でなく**概念**（対照群との比較＋有意性検定）が問われる
- bedrock_resilience.md の A/Bテスト（モデル比較）と同じ仕組みの**ビジネス効果測定**版

---

## 合成モニタリング vs 複合アラーム（Task 2.5）

**「合成」の意味がまったく違う**ので注意（→ [exam/traps.md](../exam/traps.md)）。

| | 何をするか | キーワード |
|---|---|---|
| **合成モニタリング**（CloudWatch Synthetics / Canary） | Synthetic =「人工的」。偽ユーザーとして代表的プロンプトを定期実行し、**ユーザー影響前に**劣化を検知 | 能動的・外形監視・劣化の先回り検知 |
| **複合アラーム**（Composite Alarm） | 複数アラームを AND/OR で結合。両方満たしたときだけ通知 | 誤検知削減・条件の絞り込み |

```python
# Canary スクリプト例（5分ごと自動実行）
response = bedrock.converse(messages=[{"role":"user","content":[{"text":"S3を一文で説明"}]}])
assert latency < 3000          # レイテンシー劣化チェック
assert "ストレージ" in output   # 品質チェック
```

## GenAI のエンドツーエンド・ログ記録パイプライン（Task 2.5）

「この応答が変だった理由」を**前処理〜後処理まで全段階**で追跡できるようにする構成。

```
記録対象：
① 前処理（生入力・PIIマスク後）② RAG検索結果（取得文書・スコア）
③ 最終プロンプト全体 ④ モデル出力・トークン数 ⑤ 後処理（ガードレール適用結果）

構成：
Bedrock Invocation Logging → CloudWatch Logs（Logs Insights で横断クエリ）
Lambda（前後処理ログ）→ Kinesis Firehose → S3 → Athena で横断分析
```

- **前提：Bedrock のモデル呼び出しログ記録（Invocation Logging）はデフォルト OFF** → 明示的に有効化しないと Logs Insights で分析するログ自体が存在しない
- Logs Insights のフィルタ例：`latencyMs > 5000`（高レイテンシー）/ `ThrottlingException`（エラー）/ `outputTokenCount > 3000`（予期しないトークン量）
- **プロンプトレジストリ**（Bedrock Prompt Management）：バージョンごとに性能メトリクスを紐付け、「品質低下がどのプロンプトバージョンと一致するか」で原因特定（→ bedrock_agents.md）

---

## CloudWatch RUM（Real User Monitoring）（Task 4.3）

**実際のユーザーのブラウザ/クライアントから直接メトリクスを収集するサービス。**

```
収集できるもの：
  ・ページロード時間（モデル応答が UI に表示されるまでの時間）
  ・クライアント側エラー（レンダリング失敗等）
  ・ユーザーセッションの流れ（どこで離脱したか）
```

### Synthetics との違い（混同注意）

| | CloudWatch RUM | CloudWatch Synthetics |
|---|---|---|
| **ユーザー** | **実際のユーザー**（実測値） | **人工ユーザー**（定期的に叩く） |
| **目的** | 実体験の把握 | 外形監視・劣化の先回り検知 |
| **検知タイミング** | 問題発生と同時 | 問題発生前（プロアクティブ） |

### GenAI での使い方

```
技術メトリクス（レイテンシー 2秒）だけでは不十分な場合：
  RUM で離脱率 40% を検知
  → 「技術的には許容範囲でもユーザーには遅く感じている」を把握

CloudWatch ダッシュボードに並べることで：
  「モデルのパフォーマンス → UX への影響」を定量的に紐付けられる
```

### 試験の判断軸

```
「実際のユーザーの体験をリアルタイム計測」→ CloudWatch RUM
「人工的に定期チェック（外形監視）」      → CloudWatch Synthetics
「アプリの業務イベントを記録」            → カスタムメトリクス（PutMetricData）
```

---

## ステークホルダー向け報告パイプライン（Task 4.3）

CloudWatch はエンジニア向け、**QuickSight は経営層・ビジネスオーナー向け**という使い分け。

```
Bedrock 呼び出しログ
    ↓
S3（長期保存）
    ↓
Athena（SQL で集計）
    ↓
QuickSight（BI ダッシュボード → 週次・月次レポートを経営層に配信）
```

QuickSight の詳細は [topics/ai_services.md](./ai_services.md) を参照。

---

## 相関システム（ユーザーアクション・モデル呼び出し・ビジネス成果の紐付け）（Task 4.3）

バラバラに記録された3種類のイベントを**共通IDで結合**し、因果関係を分析する仕組み。

```
問題：各イベントが別々のログに記録されていると紐付けられない

解決：全イベントに共通の sessionId（または correlationId）を付与

[ユーザーアクション]  sessionId: "abc-123", action: "search"
[Bedrock 呼び出し]   sessionId: "abc-123", model: "claude-sonnet"
[ビジネス成果]       sessionId: "abc-123", event: "purchase"
        ↓
Athena で sessionId をキーに JOIN
→「AI回答を受けたユーザーの購入率」「再質問率」等を算出
```

---

## 自動レポートシステム（Task 4.3）

「定期的に自動生成」は **EventBridge Scheduler** が起点。

```
EventBridge Scheduler（例: 毎週月曜 9:00）
    ↓
Lambda（レポート生成処理）
    ├─ CloudWatch Metrics API → 週次パフォーマンスデータ取得
    ├─ Athena              → S3 ログから品質スコア集計
    └─ QuickSight API      → ダッシュボードを PDF 出力
    ↓
SES（Simple Email Service）→ ステークホルダーにメール配信
```

| 役割 | サービス |
|---|---|
| 定期実行トリガー | EventBridge Scheduler |
| データ集計 | Athena |
| ビジネス向け可視化 | QuickSight |
| メール配信 | SES |

---

## セマンティックドリフト検出（Task 4.3）

**正答率は変わらないのに、回答の意味・トーン・スタイルが徐々にズレていく現象**を検出する仕組み。

```
品質ドリフト（正答率ベース）：数値で測れる
  Week1: 91% → Week3: 85% → アラーム

セマンティックドリフト（意味のズレ）：正答率が正常でも発生する
  Week1: 「弊社の返品ポリシーは30日以内です」（丁寧・正確）
  Week6: 「返品は30日以内にどうぞ」（トーンが変質）
  → 正答率は変わらないが回答スタイルが変化
```

### 検出の仕組み（embedding ベース）

```
① ベースライン応答を embedding ベクトル化して保存
② 現在の応答を同じモデルで embedding 化
③ コサイン類似度で比較
   1.0 に近い → 意味的に同じ ✅
   0.8 を下回る → 意味的なズレが発生 ⚠️
④ CloudWatch にカスタムメトリクスとして送信 → 閾値割れでアラーム
```

### 発生原因

- モデルのバージョンアップ（AWS 側の更新）
- システムプロンプトの意図しない変更
- RAG ドキュメントの内容変化（規約改定後に古い・新しい内容が混在）

### 品質ドリフトとの比較

| | 品質ドリフト | セマンティックドリフト |
|---|---|---|
| **検出方法** | ゴールデンデータセットの正答率推移 | コサイン類似度の推移 |
| **検出対象** | 事実の誤り・精度低下 | トーン・スタイル・意味の変質 |
| **正答率正常でも検出できる** | ❌ | ✅ |

---
