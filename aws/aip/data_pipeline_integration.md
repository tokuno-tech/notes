# データパイプライン・統合サービス

## Glue の実態

**「データ処理に特化したパイプライン基盤」。ETLだけではない。**

```
Step Functions：汎用ワークフロー（何でもオーケストレート）
Glue：データ処理に特化したワークフロー
```

### Glue でできること

| 機能 | 内容 |
|---|---|
| ETLジョブ | 生データ → 変換 → 出力（Spark/Python） |
| ワークフロー | ジョブの依存関係・連鎖管理 |
| トリガー | スケジュール / イベント / オンデマンド |
| Data Catalog | データの場所・スキーマのメタデータ管理 |
| クローラー | S3・RDSのスキーマを自動検出 |
| **Job Bookmarks** | **増分処理（前回処理済みの続きから実行）** |

### 増分処理（Job Bookmarks）の仕組み

```
初回：全ファイルを処理 → 「ここまで処理した」を記録
2回目以降：前回記録以降の差分だけ処理
```

S3のタイムスタンプ・ファイルサイズの変化で差分を検知。

### Glueパイプラインでのベクトル化

```
Glue ETLジョブ（Python）
  → Bedrock Embeddings APIを呼び出すコードを書く
  → ベクトル生成 → OpenSearch / Knowledge Basesに書き込み
```

技術的にはGlue + Bedrock APIの組み合わせ。試験では「データパイプライン全般を担う処理基盤」として選ぶ。

---

## Lake Formation の実態

**「データのセキュリティ・ガバナンスを一元管理する層」。**

```
Lake Formation = 鍵と入館証の管理
Data Catalog   = 建物の地図
Glue ETL       = 実際に作業する人
```

### Lake Formation × Glue の連携

```
Lake Formation
  ↓ Data Catalogを内包・管理
Glue Data Catalog（Lake Formationが管理）
  ↓ 「どこに何のデータがあるか」を把握
Glue ETLジョブ
  ↓ Data Catalogを参照して処理対象を把握
  ↓ Lake Formationの権限チェックを経てアクセス
処理実行
```

### LF-Tags（タグベースアクセス制御）

```
データ側にタグ：S3パス → tag: department=legal
ロール側にタグ：GlueジョブロールA → tag: department=legal
Lake Formation：同じタグを持つロールだけアクセス可
```

---

## データ統合の試験パターン

### 「統一システム」の正しい解釈

```
❌ 誤解：単一のベクトルストアに全部入れる
✅ 正解：複数データソースのアクセス制御・処理・同期を一元管理
```

### キーワード別の正解サービス

| キーワード | 正解 |
|---|---|
| 「統一システム」「一元管理」「アクセス制御」 | **Lake Formation** |
| 「データパイプライン」「増分同期」「ETL」 | **Glue** |
| 「単一の検索窓口」「セマンティック検索」 | **OpenSearch** |
| 「リアルタイム変更検知」「Webhook」 | **EventBridge + Lambda** |
| 「複数システム統合 + アクセス制御」 | **Lake Formation + Glue** |

### Step Functions vs Glue の使い分け

| | Glue | Step Functions |
|---|---|---|
| 得意 | データ処理・ETLの連鎖 | 汎用ワークフロー |
| 処理の主体 | データ変換・集計 | Lambda・ECS等の呼び出し |
| 試験の文脈 | 「データパイプライン・同期」 | 「HITL・複雑なビジネスフロー」 |

---

## ベクトルストア更新パターン

| 要件 | 正解 |
|---|---|
| 「増分更新・変更検出」 | **Knowledge Bases**（組み込み機能） |
| 「自動同期・ワークフロー・データ系統管理」 | **Glue** |
| 「リアルタイム変更検知・即時反映」 | **Webhook / EventBridge + Lambda** |
| 「完全更新・バッチ処理」 | Batch（ただし非効率） |
| 「ドキュメント変更 → 即ベクトルストア更新」 | **DynamoDB Streams / S3イベント → Lambda** |

---

## S3メタデータ vs DynamoDBの使い分け

| 要件 | 正解 | 理由 |
|---|---|---|
| 「バージョニング・変更履歴が必要」 | **S3メタデータ** | S3バージョニングが自動対応 |
| 「低レイテンシー・高頻度アクセス」 | **DynamoDB** | ミリ秒レイテンシー |
| 「GSI複数・属性が広範」 | DynamoDB注意 | GSI上限20個/テーブル |

---

## DynamoDB Streams

**DynamoDBテーブルへの変更をリアルタイムに検知して流す仕組み。**

```
DynamoDBでデータ変更（追加・更新・削除）
  ↓
DynamoDB Streamsがイベント記録
  ↓
Lambda がトリガーされて処理
```

| | S3イベント通知 | DynamoDB Streams |
|---|---|---|
| 監視対象 | S3ファイル操作 | DynamoDBレコード変更 |
| 典型用途 | ファイルアップロード検知 | DBデータ変更の伝搬 |
