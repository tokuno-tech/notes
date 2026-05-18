# データ基盤・パイプライン・インフラ まとめ

## ストレージ・ファイルシステム

### HDFS（Hadoop Distributed File System）
大規模データを複数サーバーに分散して保存するファイルシステム。
データをブロック単位に分割し、複製して耐障害性を高める。

### EMRFS
S3をHDFSのように扱うための仕組み。
EMRからS3を透過的にファイルシステムとして利用できる。

### Apache Parquet
列指向のデータ形式。
必要な列だけ読み込めるためI/O効率が良く、分析やML前処理に有利。

### Snappy
高速な圧縮アルゴリズム。
圧縮率よりも圧縮・解凍速度を重視しており、大規模データ処理に向く。

### Amazon EFS（Elastic File System）
NFSプロトコルベースの汎用ファイル共有サービス。
- ファイルロック機能あり（同時編集に安全）
- 複数サーバーから同時アクセス可能
- 速度は普通

### Amazon FSx for Lustre
Lustreファイルシステムベースの高性能ファイルストレージ。
- 最大テラバイト/秒のスループット・ミリ秒未満のレイテンシー
- S3と自動同期（ネイティブ統合）
- ML訓練の高速化に最適（S3からのダウンロード不要）
- ファイルロック機能なし（同時編集には不向き）

**EFS vs FSx for Lustre：**

| 観点 | EFS | FSx for Lustre |
|---|---|---|
| プロトコル | NFS | Lustre |
| ファイルロック | ✅ あり | ❌ なし |
| 速度 | 普通 | 超高速 |
| S3統合 | △ | ✅ ネイティブ |
| 向く場面 | 共有・同時編集 | ML訓練・高速読込 |

**Scratch vs Persistent（FSx for Lustre）：**
- Scratch：短期処理向け、安い、サーバー障害時はデータ消失
- Persistent：長期保存、自動バックアップ、高可用性

### Amazon FSx for NetApp ONTAP
NetApp社の**ONTAPファイルシステム**をAWSマネージドで提供するストレージサービス。
エンタープライズ系オンプレ環境からのリフトアンドシフトに強い。

**特徴**
- **マルチプロトコル対応**：NFS / SMB / iSCSI を同時に提供（Linux/Windows/DB混在OK）
- **データ重複排除・圧縮・スナップショット**などONTAPのエンタープライズ機能をそのまま利用可
- **SnapMirror** によるオンプレONTAPとの同期 → ハイブリッドクラウド構築に最適
- **階層化（FabricPool）**：ホットデータはSSD、コールドはS3に自動移動でコスト削減
- 高可用構成（マルチAZ）対応

**他FSxとの違い**
| | Lustre | ONTAP | Windows File Server | OpenZFS |
|---|---|---|---|---|
| 主用途 | HPC・ML訓練 | エンタープライズNAS・ハイブリッド | Windows共有 | Linux汎用NAS |
| プロトコル | Lustre | NFS/SMB/iSCSI | SMB | NFS |
| S3統合 | ✅ ネイティブ | ✅ FabricPoolで階層化 | ❌ | ❌ |

**MLA出題ポイント**
- 「オンプレのNetApp環境をAWSにそのまま持ち込みたい」→ **FSx for ONTAP**
- 「NFSとSMBを両方使うMLワークロード」→ FSx for ONTAP
- 「ML訓練で最速読み込み」→ FSx for Lustre（ONTAPではない）

---

## ETL・データカタログ

### AWS Glue
大規模なETL（Extract, Transform, Load）パイプラインを構築するサービス。
汎用的なデータパイプラインツール（SageMaker専用ではない）。
- Sparkベースの分散処理エンジン
- クローラー：スキーマを自動検出してData Catalogに登録
- SageMaker連携はCallback Step経由（複雑）

### AWS Glue Data Catalog
Apache Hive Metastore互換のフルマネージドメタデータリポジトリ。
テーブル定義・スキーマ・接続情報を一元管理。
EMR、Athena、Redshift Spectrum等の複数サービスが共有参照可能。

#### 保存場所（実体）
- ❌ **S3には保存されない**
- ✅ **AWSが管理するマネージドな専用ストレージ**（Hive Metastore互換バックエンド）に格納
- カタログが持つのは「テーブル定義・スキーマ・パーティション・S3パス等のメタデータ」のみ
- **実データはS3（またはRDS/Redshift等）に存在し、カタログはそこへのポインタ＋スキーマを保持**

```
[Glue Data Catalog（AWSマネージド領域）]
  └ テーブルA：s3://bucket/data/ にParquet、カラム=id,name,age
                          ↓
[実データ（ユーザS3）]
```

#### Athena/Redshift Spectrum/EMR との関係
- これらのクエリエンジンは**Glue Data Catalog をスキーマソースとして参照**してSQL実行
- 検索能力 = **Catalog（メタ）+ Athena等（クエリエンジン）+ S3（実データ）** の三位一体

### AWS Glue DataBrew（正式名：AWS DataBrew）
ノーコードのデータクレンジング・変換・マスキングツール。
- PII（個人情報）の検出・マスキングまで対応
- SageMakerへの直接インポート機能なし
- SageMaker連携には別途ETL Jobが必要

#### DataBrew のジョブ種類
- **レシピジョブ（Recipe Job）**：レシピ（変換手順）を適用してデータを加工し出力
- **プロファイルジョブ（Profile Job）**：データの**品質レポート**を自動生成
  - カラムごとの分布・統計量・ユニーク値の数
  - **欠損値の割合**・データ型の一致率
  - 外れ値検出
  - 相関関係の可視化
  - 出力はJSONレポート＋GUIダッシュボード
  - 用途：データ品質評価・前処理方針の決定・PII存在の把握

**MLA出題：「データの品質レポートを自動生成」「欠損値や分布を可視化」→ DataBrew プロファイルジョブ**

### AWS Glue Data Quality
データセットの品質をルール定義でチェック・監視する機能。
ETLジョブの前後で実行し、品質問題を検知・アラート。
- DQ Rules（例：「null値が5%未満」「値の範囲が100〜1000」）
- CloudWatchアラームと連携
- Glue Studio上で可視化

### AWS Glue DynamicFrame
AWS Glueが提供するデータ抽象化。各レコードがデータとスキーマの両方を含む「自己記述型」。

**DynamicFrame vs Spark DataFrame：**

| 観点 | DynamicFrame | Spark DataFrame |
|---|---|---|
| スキーマ | 柔軟（後付け可） | 固定（事前定義） |
| ネストデータ | ✅ 得意 | △ 複雑 |
| スキーマ進化 | ✅ 自動対応 | ❌ 破綻 |
| 向く場面 | 複数ソース統合 | 整形済みデータ |

### JDBC接続
Java Database Connectivity。JavaアプリケーションがデータベースへアクセスするためのAPI。
GlueではAurora、PostgreSQL、MySQL等のRDBへの接続に使用。
接続情報をData Catalogに登録すると複数ジョブで再利用可能（オーバーヘッド削減）。

### Hive Metastore
Apache Hiveのメタデータリポジトリ。
テーブル・データベース・カラム・パーティションのメタデータを一元管理。
HDFS/S3内のファイルをテーブルとして見えるようにする「辞書」。
→ AWS Glue Data Catalogで代替可能（フルマネージド・Hive互換）。

---

## ストリーミング

### Amazon Kinesis Data Streams
リアルタイムデータのストリーミング取込サービス（AWSプロプライエタリ）。

### Amazon Data Firehose
ストリーミングデータをS3・Redshift・OpenSearch等に自動配信するサービス。
バッファリング・圧縮・変換も自動で行う。
※ バッチ処理寄りで、厳密なリアルタイム性には弱い

### Amazon MSK（Managed Streaming for Apache Kafka）
Apache Kafkaのフルマネージドサービス。

**MSK vs Kinesis：**

| 観点 | Kinesis | MSK |
|---|---|---|
| 基盤 | AWSプロプライエタリ | Apache Kafka（OSS） |
| 簡単さ | ✅ シンプル | △ Kafka知識必要 |
| Kafka互換 | ❌ | ✅ 完全互換 |
| スループット | 中規模 | 大規模 |
| Kafka Connect | ❌ | ✅ |
| 既存Kafka移行 | ❌ | ✅ |

**MSKを選ぶ理由：** 既存Kafkaシステムの移行、Kafka Connectでの多様なシステム連携。

### Apache Flink（Amazon Managed Service for Apache Flink）
旧：Kinesis Data Analytics。
ストリーミングデータをリアルタイムで処理するエンジン。
SQL / Java / PythonでストリームデータをリアルタイムZプロセス可能。
状態（過去データ）を保持した複雑な処理が可能。

### Kafka Connect
KafkaとDB・S3等を接続する仕組み。
コネクタ設定のみでデータ連携ができ、ETLの実装を簡略化。

---

## データウェアハウス・分析

### Amazon Redshift
AWSのクラウドデータウェアハウス（DWH）サービス。SQL中心の大規模データ分析。

**Dynamic Data Masking（DDM）：**
クエリ実行時に、ユーザーのロールに応じて機密データを動的に隠す・ぼかす機能。
同じカラムに複数のマスキングポリシーを設定でき、優先度で競合を回避。
※ DDM保護テーブルはデータシェアリングと非互換。

### Amazon Redshift Spectrum
S3内のデータをRedshiftから直接SQLクエリで分析する機能。
Redshiftにデータをロード不要。

**メリット：**
- S3にデータ保持（Redshiftより安価）
- Redshiftの容量制限を超える大規模データも分析可能
- 複数クラスタが同じS3データを共有参照可能

**パフォーマンス最適化：** Parquetフォーマット推奨、64MB以上のファイルサイズ推奨。

#### マテリアライズドビュー（Materialized View）
**S3データへのクエリ結果をキャッシュ**して、繰り返しクエリを高速化する機能。
- 通常のビュー（毎回S3を再スキャン）と違い、**結果を物理的に保存**
- 2回目以降のクエリはキャッシュからミリ秒で返る

**リフレッシュ方式**
- **フルリフレッシュ**：全データを再計算
- **インクリメンタルリフレッシュ**：差分だけ更新（軽量・高速）
- 手動 or スケジュール実行

**メリット**
- S3スキャンコスト（Spectrum課金）を大幅削減
- BIダッシュボード等の繰り返しクエリで効果絶大
- 自動クエリリライト：通常SQLでも内部で自動的にMVを参照してくれる

**MLA出題：「S3への繰り返しクエリを高速化」「Spectrumのコスト削減」→ マテリアライズドビュー（インクリメンタルリフレッシュ）**

### Amazon Redshift Streaming Ingestion
MSK（Kafka）からデータを直接Redshiftに取り込む機能。

### Amazon RedshiftML
RedshiftからSageMaker Autopilotを利用してMLモデルを構築・推論する機能。
SQLだけで機械学習が可能。定期実行のため、リアルタイム性には弱い。

### Snowflake
クラウドベースのデータウェアハウス（AWS・Azure・GCP対応）。
- ストレージ層とコンピュート層が分離
- 複数ユーザーの同時実行が可能
- Data WranglerからJDBCで直接接続・クエリ可能

**Snowflake vs Redshift：**

| 観点 | Snowflake | Redshift |
|---|---|---|
| クラウド | AWS/Azure/GCP | AWS限定 |
| 管理 | フルマネージド | マネージド（ノード管理あり） |
| 可搬性 | ✅ | ❌ |

---

## 検索・分析

### Amazon OpenSearch
全文検索・ログ分析・可視化を行うエンジン。
インデックスにより高速検索が可能。

### OpenSearch Serverless
OpenSearchのサーバーレス版。ノード管理不要で自動スケール。

### Amazon Kendra
自然言語検索に特化したサービス。
ドキュメントの意味を理解して関連情報を返す（RAGと組み合わせて使用）。

### RAG（Bedrock）
検索結果をもとにLLMが回答を生成する仕組み。
「検索（Kendra等）＋生成（LLM）」で自然な回答を作る。

---

## セキュリティ・データ保護

### AWS KMS とエンベロープ暗号化（Envelope Encryption）
KMSは**鍵管理サービス**。大きなデータを直接暗号化するのではなく、
「**KMSキー（CMK）でデータキーを暗号化、データキーで実データを暗号化**」する2段構えが基本（=エンベロープ暗号化）。

**なぜこの方式か**
- KMS直接暗号化は **4KB制限** & ネットワーク往復で遅い
- データキー（小さい）だけKMS管理、本体はローカルで高速暗号化
- 平文データキーは使い捨て・即破棄 → 漏洩リスク低

#### 暗号化フロー
```
1. アプリ → KMS: GenerateDataKey(KeyId)
2. KMS → アプリ: { 平文データキー, 暗号化データキー（CMKで暗号化済み） }
3. アプリ：平文データキーで実データを暗号化
4. アプリ：平文データキーをメモリから即破棄
5. アプリ：[暗号化データ + 暗号化データキー] をセットでS3等に保存
```

#### 復号化フロー
```
1. 読み手：[暗号化データ + 暗号化データキー] を取得
2. 読み手 → KMS: Decrypt(暗号化データキー)
   ※KMSがキーポリシー＋IAMで権限チェック
3. KMS → 読み手: 平文データキー
4. 読み手：平文データキーで暗号化データをローカル復号
5. 読み手：平文データキーを即破棄
```

#### よくある誤解
| ❌ 誤解 | ✅ 正解 |
|---|---|
| リソース側でKMSキーを使って復号する | 復号は**常にKMS内部**で実行。リソースはAPIを呼ぶだけ |
| キーポリシーはリソース（S3等）に付く | キーポリシーは**KMSキー側**に付く。リソース操作するIAMロールがKMSへのDecrypt権限を持つ必要 |
| データ全体をKMSが直接暗号化する | KMSが扱うのは**データキー**のみ。実データはローカルで暗号化 |

#### キーポリシーとIAMの関係
- **キーポリシー**：KMSキーに紐づく（誰がこの鍵を使えるか）
- **IAMポリシー**：プリンシパル側（このユーザは何のKMSキーを使えるか）
- **両方OKの時のみDecrypt成功**（AND条件）

#### MLA出題ポイント
- 「大量データを効率的に暗号化」→ **エンベロープ暗号化**
- 「KMS Decryptを呼べないエラー」→ **キーポリシー or IAMポリシー不足**
- 「S3バケットへの書き込みは成功するが読み取りで失敗」→ KMS Decrypt権限が不足の可能性
- 「ML学習ジョブが暗号化S3を読めない」→ **SageMaker実行ロールに kms:Decrypt 付与**

### AWS Lake Formation
データレイク構築・**一元的な権限管理**を提供するマネージドサービス。
S3 + Glue Data Catalog の上に**統合アクセス制御層**を被せるイメージ。

**主な機能**
- データレイクの構築・登録（S3バケットをLake Formation管理下に置く）
- **きめ細かいアクセス制御**：データベース・テーブル・**列・行・セル単位**で許可/拒否
- 監査ログ（CloudTrail連携）
- データ共有（クロスアカウント・LF経由）
- Athena / Redshift Spectrum / EMR / Glue / SageMaker からの参照を一元統制

**IAMだけとの違い**
- IAM単独：S3バケット/オブジェクト単位の粗い制御
- Lake Formation：**カラム・行レベルのフィルタ**が可能（PII列だけ隠す等）
- IAM + Lake Formation の**二重チェック**で許可される（両方OKで初めてアクセス可）

#### LF-Tag（タグベースアクセスコントロール / TBAC）
Lake Formationの権限管理を**タグで抽象化**する仕組み。リソース単位の個別付与から脱却し、スケーラブルに管理。

**仕組み**
1. **LF-Tag定義**：管理者がキー=値のタグ語彙を作成（例：`Sensitivity=PII / Confidential / Public`、`Department=Sales / HR / Finance`）
2. **リソースへタグ付与**：DB・テーブル・カラムに LF-Tag を付ける（例：`salary`列に `Sensitivity=PII`）
3. **プリンシパルへタグ条件で許可**：IAMユーザ/ロールに「`Sensitivity=Public`のリソースのみSELECT可」のようにポリシー付与
4. リクエスト時：LFがタグ条件を評価して許可/拒否

**例（HR部門のアナリスト）**
```
LF-Tag定義: Department ∈ {HR, Sales, Finance}
            Sensitivity ∈ {Public, Confidential, PII}

リソース:   employees テーブル → Department=HR
            salary 列          → Sensitivity=PII

プリンシパル: hr-analyst
権限付与:   Department=HR AND Sensitivity ∈ {Public, Confidential} → SELECT可
            → employees全体は見えるが salary列(PII) はマスク
```

**LF-Tag のメリット**
- **管理対象が爆発しない**：100テーブル × 50ユーザ = 5000権限 を、タグ数十個で表現可
- 新規テーブル追加時、既存タグを付ければ自動で適切な権限が適用される
- 部署異動・組織変更時もタグの付け替えだけで対応
- ガバナンス監査がしやすい

**LF-Tag vs 直接付与（Named Resource Method）**
| | Named Resource | LF-Tag（TBAC） |
|---|---|---|
| 付与単位 | テーブル/列を直接指名 | タグ条件で一括 |
| スケール | 小〜中規模 | **大規模データレイク向き** |
| 管理コスト | 高（個別管理） | 低（タグ語彙の設計だけ） |
| 柔軟性 | 細かいが煩雑 | 抽象的で見通し良い |

**MLA出題ポイント**
- 「データレイクで列・行レベルのアクセス制御」→ **Lake Formation**
- 「大規模データレイクで権限管理をスケーラブルに」→ **LF-Tag（TBAC）**
- 「PII列を一部のユーザだけ閲覧可にしたい」→ Lake Formation + LF-Tag
- 「ML学習データから個人情報列だけ除外して提供」→ Lake Formation の列レベル制御

### Amazon Macie
S3内の機密情報を検出・分類するサービス。
データの可視化とアラートが主目的（処理はしない）。
- **継続的・定期的にS3バケットを監視**し、PII等の存在をスキャン
- 検出結果は EventBridge / Security Hub 連携でアラート発報可能
- 静的に置かれた大量S3資産の**ガバナンス・コンプライアンス監査**向け

**Macie vs DataBrew：**
- Macie：検出（PII等の存在を検知）
- DataBrew：処理（PIIのマスキング・変換）

### AWS Glue 機密データ検出（Sensitive Data Detection）
Glue ETLジョブの**変換ステップ内**でPIIを検出し、その場でマスキング・暗号化・削除する機能。
- **ETLパイプラインの途中処理**として組み込む（DynamicFrameの変換として動作）
- 検出と処理を**1ジョブで完結**できる
- 典型ユースケース：**データレイク → データウェアハウスへの移行時にPIIを除去**
- 検出ルール：マネージドパターン（SSN・クレカ等）＋ カスタム正規表現

#### Macie vs Glue機密データ検出 の使い分け
| 観点 | Amazon Macie | AWS Glue 機密データ検出 |
|---|---|---|
| 役割 | **継続的監視・検出** | **ETL中のマスキング処理** |
| 実行タイミング | 定期スキャン（常時監視） | ETLジョブ実行時のみ |
| 出力 | 検出レポート・アラート | マスキング済みデータ |
| 対象 | S3バケット全体 | ETL入力の各レコード |
| 用途 | ガバナンス・監査・ポリシー違反検知 | DWH移行・データ加工パイプライン |

**判断基準**
- 「**S3バケットを継続的にスキャンしてPII存在を通知**」→ **Macie**
- 「**ETL中にPIIをマスクしてDWHへ流す**」→ **Glue 機密データ検出**
- 「**ノーコードでGUIマスキング**」→ DataBrew
- 「**自由記述テキストからPHI抽出**」→ Comprehend Medical

**MLA出題ポイント**
- 「S3の継続監視」→ **Macie**
- 「ETLパイプライン途中で除去」→ **Glue 機密データ検出**
- Macieは"見るだけ"、Glueは"処理する"、と覚える

### Amazon Comprehend / Comprehend Medical
**自然言語テキスト**から固有表現・PII・PHIを検出するNLPマネージドサービス。
- **Comprehend**：汎用テキストからPII（氏名・住所・電話・SSN等）を検出・マスキング
- **Comprehend Medical**：医療カルテ・診療メモなどの**非構造テキスト**からPHI（患者名・医療記録番号・診断名等）を検出
- 入力は**文字列／非構造テキスト**前提（PDF・JSON文字列・自由記述カラム等）

### PII/PHIマスキング：DataBrew vs Comprehend の使い分け

| 観点 | AWS Glue DataBrew | Amazon Comprehend (Medical) |
|---|---|---|
| 得意なデータ形式 | **構造化データ**（CSV/Parquet/テーブル） | **非構造テキスト**（自由記述・カルテ・メール本文） |
| 検出方法 | カラム単位でPII統計＋レシピでマスク変換 | 文章中のエンティティをNLPで検出 |
| 運用負荷 | 低（ノーコード、レシピ再利用） | 中（テキスト抽出→API呼び出し→置換のパイプライン構築が必要） |
| PHI対応 | △（明示的なPHI機能はなし） | ✅ Comprehend Medicalで専用対応 |
| ML連携 | S3→DataBrew→S3→学習で完結 | 前処理ジョブ内に組み込む必要あり |

**判断基準（試験の選び方）**
- データが**S3上の表形式（臨床試験データ・顧客テーブル等）** → **DataBrew**（運用負荷最小）
- データが**自由記述テキスト・カルテ・チャットログ** → **Comprehend / Comprehend Medical**
- 「**運用負荷を最小限**」「**マスキングまで一気通貫**」のキーワード → **DataBrew**寄り
- 「医療**文章**から PHI を抽出」「テキスト解析」のキーワード → **Comprehend Medical**

**MLA落とし穴**
臨床試験データ＝医療＝Comprehend Medicalと反射的に選びがちだが、
データが**表形式**なら DataBrew のほうがノーコードで完結し運用負荷が低い。
Comprehendは「テキストフィールドをパースする」というジョブ実装が必要になり負荷↑。

---

## ワークフロー・オーケストレーション

### Amazon MWAA（Managed Workflows for Apache Airflow）
Apache AirflowをフルマネージドAWSで提供するサービス。
Pythonで書いたDAG（有向非巡回グラフ）でパイプラインを定義。

**MWAA vs Step Functions vs SageMaker Pipelines：**

| サービス | 対象 | 定義方法 | 可搬性 |
|---|---|---|---|
| MWAA | 汎用・AWSサービス横断 | Python DAG | ✅ AWS外でも動く |
| Step Functions | AWSサービス横断 | JSON | ❌ AWS専用 |
| SageMaker Pipelines | ML特化 | Pipeline Steps | ❌ SageMaker内 |

**MWAA vs Step Functions（詳細）：**

| 観点 | MWAA | Step Functions |
|---|---|---|
| 基盤 | OSS（Airflow） | AWSプロプライエタリ |
| サーバー | あり（常駐） | サーバーレス |
| コスト | 固定（常時課金） | 従量課金 |
| 大規模同時実行 | △ | ✅ |

### AWS Step Functions
サーバーレスのワークフローオーケストレーションサービス。
Lambda + 各AWSサービスを組み合わせた自動化フローに向く。

---

## エッジ・IoT

### AWS IoT Greengrass
エッジデバイス上でAWS Lambdaを実行したり、MLモデルを推論できるサービス。
- オフライン動作対応（インターネット不要）
- SageMakerで訓練したモデルをエッジに配置可能
- 低レイテンシー推論が必要な場面に有効

**典型的なユースケース：**
工場カメラ → OpenCV（前処理）→ SageMakerモデル（推論）→ Greengrass（エッジ上で実行）

### OpenCV（Open Source Computer Vision Library）
コンピュータビジョン処理のためのOSSライブラリ（Python/C++）。
- 基本処理：画像読込・リサイズ・回転
- フィルタリング：ぼかし・エッジ検出・ノイズ除去
- 物体検出：顔検出・輪郭検出
- 動画処理：フレーム分割・動体検出
- GPU不要（基本はCPU動作）、CUDA対応でGPU活用も可能

---

## インフラ・デプロイ

### k8sマニフェスト
Kubernetes上でアプリやコンテナをどう動かすか定義するYAMLファイル。

**Docker Compose との違い：**

| 観点 | Docker Compose | k8sマニフェスト |
|---|---|---|
| 規模 | 単一マシン | 複数サーバー（クラスタ） |
| 用途 | ローカル開発 | 本番運用 |
| スケーリング | 手動 | 自動 |

### Pod
Kubernetesのコンテナ実行単位。1つ以上のコンテナをまとめた箱。
```
コンテナ ⊂ Pod ⊂ Node（サーバー） ⊂ Cluster
```
- 1Pod = 1コンテナが最も多い構成
- サイドカーパターン：メインコンテナ + 補助コンテナを1Podで動かす
- Pod内はlocalhost共有、ストレージ共有可能

### リフトアンドシフト（Lift and Shift）
オンプレミスのシステムをほぼそのままクラウドに移行する手法。
再設計（リアーキテクチャ）をしないため、最速・最低コストで移行可能。

### IRSAによるPodレベルのIAM権限管理
IRSA（IAM Roles for Service Accounts）を使って、Pod単位でIAMロールを割り当てる仕組み。
最小権限の原則をPod単位で適用できる。
```
Pod A → IAMロールA（S3読み取りのみ）
Pod B → IAMロールB（DynamoDB書き込みのみ）
```

### AWS CDK（Cloud Development Kit）
**プログラミング言語（TypeScript / Python / Java / Go等）でAWSインフラを定義**するIaCフレームワーク。
内部的にCloudFormationテンプレートを合成してデプロイする。

**特徴**
- 汎用プログラミング言語で書ける → ループ・条件分岐・関数化・再利用が自然
- **Construct** という再利用可能な部品単位でリソース構築
- 高レベル抽象（L2/L3 Construct）で**少ない記述量**でVPC・SageMaker・Pipelinesを構築可
- `cdk synth` でCloudFormationテンプレ生成、`cdk deploy` でデプロイ

**他IaCとの比較**
| | CDK | CloudFormation | Terraform |
|---|---|---|---|
| 記述方法 | プログラミング言語 | YAML/JSON | HCL |
| 学習コスト | 中（既存言語知識を活用） | 低〜中 | 中 |
| 抽象化 | 高（Constructで部品化） | 低 | 中（Moduleで部品化） |
| AWS専用 | ✅ | ✅ | ❌（マルチクラウド） |
| 動的構成 | ✅（コードで自由に） | △（パラメータのみ） | △ |

**MLでの使い所**
- SageMaker Pipelines・エンドポイント・学習ジョブの**インフラを再現可能に管理**
- MLOps基盤（Step Functions + Lambda + SageMaker）をコードで一括構築
- 環境（dev/staging/prod）をパラメータ化して使い回し

**MLA出題ポイント**
- 「ML基盤をコードでバージョン管理・再現可能にしたい」→ **CDK or CloudFormation**
- 「プログラミング言語で柔軟にIaCを書きたい」→ **CDK**
- 「マルチクラウド対応」→ Terraform（CDKはAWS専用）

### EFA（Elastic Fabric Adapter）
**HPC・分散ML学習向けの専用ネットワークインターフェース**。GPU間の超低レイテンシ通信を実現。
- **OSバイパス通信**：カーネルを介さず直接NIC↔NIC通信 → レイテンシ激減
- 大規模分散学習（数十〜数百GPU）でのAllReduce等の集団通信を高速化
- **NCCL（NVIDIA Collective Communications Library）** と統合
- 対応インスタンス：p4d、p5、p5e、trn1、hpc7g 等の大型GPU/HPC系
- 同一AZ・同一Placement Group内で利用

**メリット**
- 通常のEthernetより1桁低いレイテンシ
- 分散学習のスケーラビリティ大幅向上（線形に近いスケーリング）

**MLA出題：「大規模分散学習で通信ボトルネックを解消」「GPU間の高速通信」→ EFA**

---

## ネットワーク・セキュリティ

### セキュリティグループ（SG）と ネットワークACL（NACL）
VPC内のトラフィック制御の2大コンポーネント。**動作レイヤと挙動が違う**。

| 観点 | セキュリティグループ（SG） | ネットワークACL（NACL） |
|---|---|---|
| 適用範囲 | **インスタンス（ENI）単位** | **サブネット単位** |
| ルール | **許可ルールのみ** | **許可・拒否の両方** |
| 状態管理 | **ステートフル**（戻りトラフィック自動許可） | **ステートレス**（戻りも明示設定要） |
| 評価順序 | 全ルールを評価（順序関係なし） | **番号順に評価**（最初にマッチしたもの適用） |
| デフォルト | 全許可（送信） / 全拒否（受信） | 全許可（受信・送信両方） |
| 用途 | インスタンス間の細かい制御 | サブネット境界の粗い制御・拒否設定 |

**ステートフル vs ステートレス**
- **SG（ステートフル）**：「受信を許可した接続」の戻り通信は自動で許可
- **NACL（ステートレス）**：受信ルールと送信ルールを**両方明示**する必要あり

**併用パターン（多層防御）**
```
[インターネット]
   ↓ NACL（サブネット入口で粗くフィルタ・特定IPを拒否等）
[サブネット]
   ↓ SG（インスタンス手前で細かく制御）
[EC2 / RDS / SageMaker Endpoint]
```

**MLA出題ポイント**
- 「特定IPからのアクセスを**拒否**したい」→ **NACL**（SGは許可のみ）
- 「インスタンス毎に細かい許可制御」→ **SG**
- 「サブネット境界で粗くフィルタ」→ **NACL**
- 「戻り通信を自動許可」→ SG（ステートフル）

### コスト配分タグ・Cost Explorer・AWS Budgets
AWSコスト管理の3点セット。

#### コスト配分タグ（Cost Allocation Tags）
リソースにタグ（例：`Project=ML-Demo`、`Team=DataScience`）を付け、**コストレポートをタグで集計**できるようにする仕組み。
- 「AWS生成タグ」と「ユーザ定義タグ」がある
- Billing コンソールで**有効化**しないと集計対象にならない
- 有効化後のデータのみ集計対象（過去データには遡及不可）

#### Cost Explorer
コストと使用状況の**可視化・分析ツール**。
- 月別・サービス別・タグ別・アカウント別でコストをチャート表示
- 過去13ヶ月＋12ヶ月の予測まで表示
- **異常検出（Cost Anomaly Detection）**：機械学習で通常と違う支出スパイクを検知
- ⚠️ **アラート通知機能はない**（異常検出のみ）
- 用途：原因調査・トレンド分析

#### AWS Budgets
**予算設定とアラート発報**サービス。
- 予算枠を作成（例：月$1000まで、ML系タグの合計$500まで）
- 閾値超過・予測超過で**SNS / メール / Chatbot で通知**
- タグ・サービス・アカウント・リージョン単位で柔軟に設定
- アクション連動：閾値超過時にIAMポリシー停止やインスタンス停止も可（Budgets Actions）

#### 3者の役割分担
| サービス | 役割 | アラート |
|---|---|---|
| **コスト配分タグ** | 集計の切り口を作る | ー |
| **Cost Explorer** | 可視化・異常検出 | **なし**（検出のみ） |
| **AWS Budgets** | 予算管理・**アラート発報** | **あり** |

**MLA出題ポイント**
- 「コスト超過でメール通知」→ **AWS Budgets**（Cost Explorerではない）
- 「過去のコストをタグ別に分析」→ **Cost Explorer + コスト配分タグ**
- 「ML実験のコストを部門ごとに按分」→ コスト配分タグで集計
- 「異常な支出を機械学習で検知」→ Cost Explorer のCost Anomaly Detection

---

## その他AWSサービス

### Amazon EMR
Hadoopエコシステム（Spark等）を使った大規模分散処理サービス。
単一→分散の使い分け：
- 単一：scikit-learn / Notebook
- 分散：Spark / EMR

### Bedrock モデル一覧

| モデル | 特徴 |
|---|---|
| Claude | 長文理解・推論・文章生成（チャット、要約、複雑QA） |
| Titan | AWS純正（テキスト生成・埋め込み） |
| Cohere | 埋め込みと検索に強い（RAG構成でよく使用） |
| Mistral / Llama | 軽量で汎用的・コスト効率良い |
| SDXL | 画像生成（テキストから高品質画像） |

---

## 模試ミス回収メモ

### AWS Lake Formation とオンプレミスDB連携
- Lake Formation は**S3中心のデータレイク構築・カタログ化・権限管理**サービス
- オンプレDB（PostgreSQL等）は **AWS Glue JDBC接続 + Crawler/Job** 経由で取り込み、Data Catalog と連携して統合管理
- Lake Formation単体がDBに直接接続するのではなく、**Glue連携で外部DBデータを統合**する

**判定キーワード**
- 「S3 + オンプレDB + 中央データレイク + 権限管理」→ Lake Formation
- 「オンプレDB取り込み」→ Glue JDBC + Lake Formation
- 「データカタログ化」→ Glue Data Catalog
- 「データレイクのアクセス制御」→ Lake Formation

### AWS X-Ray
**分散トレーシング**サービス。リクエストがどのサービスを通り、どこで遅延・失敗したかを可視化。
- API Gateway / Lambda / ECS / EC2 / DB / 外部API などをまたぐ処理を追跡
- リクエスト単位の処理経路を `trace`、各サービスの処理単位を `segment` として記録
- サービスマップで依存関係・ボトルネックを確認

**他のCloudWatch系との違い**
- **CloudWatch Logs**：ログを見る
- **CloudWatch Metrics**：数値メトリクスを見る
- **X-Ray**：リクエストの**経路と遅延・失敗箇所**を見る

**判定キーワード**
- 「分散トレーシング」「サービスマップ」「マイクロサービスのボトルネック」→ X-Ray
- 「ログ確認」→ CloudWatch Logs
- 「メトリクス確認」→ CloudWatch Metrics

---

## 一言まとめ
データ基盤は「取込（Kinesis/MSK）→ 処理（Glue/Flink）→ 保存（S3/Redshift）→ 分析（Athena/OpenSearch）」の流れで理解する
