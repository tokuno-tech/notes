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
