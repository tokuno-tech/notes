# SageMaker サービス群 まとめ

## 開発環境

### SageMaker Notebook Instance

Jupyter Notebookが使える開発環境。
単一マシンでの実験や分析に適している。

### Jupyter Notebook

ブラウザ上でPythonコードを対話的に実行できるツール。データ分析・ML開発のデファクト。

- **セル単位**で実行（1ブロックずつ走らせて結果を即確認）
- コード・実行結果・グラフ・Markdownを**1ファイルに混在**可能
- ファイル拡張子は `.ipynb`（IPython Notebook）
- **JupyterLab**：後継UI。タブ・ファイラ・ターミナル統合の多機能版
- カーネルを切り替えればR / Julia / Scala等にも対応
- SageMaker構造：Notebook Instance（=EC2）上にJupyter/JupyterLabサーバが起動 → ブラウザからHTTPSで接続して`.ipynb`を編集・実行

### SageMaker ノートブックインスタンスのライフサイクル設定（Lifecycle Configuration / LCC）

ノートブックインスタンスの**作成時・起動時に自動実行されるシェルスクリプト**を定義する仕組み。
環境セットアップを自動化・標準化できる。

**2つのセクション**

- **Create（onCreate）**：インスタンスを**新規作成した時に1回だけ**実行
  - 用途：永続化したい初期セットアップ、独自パッケージのダウンロード、Gitリポジトリ初期クローン等
- **Start（onStart）**：**起動するたび毎回**実行（停止→起動でも走る）
  - 用途：pip install、環境変数設定、自動シャットダウン設定、cron登録、Gitのpull等

**典型ユースケース**

- ライブラリの自動インストール（再起動でも反映）
- アイドル時の自動停止スクリプト（コスト削減）
- IAM/プロキシ/タイムゾーン等の環境統一
- セキュリティポリシーの強制適用

**制約**

- 各スクリプトの実行時間は**最大5分**（超えると起動失敗）
- root権限で実行される
- ログは CloudWatch Logs `/aws/sagemaker/NotebookInstances` に出力

**MLA出題ポイント**

- 「ノートブック起動のたびにライブラリを入れたい」→ **onStart**
- 「初回作成時のみセットアップしたい」→ **onCreate**
- 「アイドル時に自動停止させたい」→ onStart に停止スクリプト＋cron

---

## データ準備

### SageMaker Data Wrangler

SageMaker Studio内に統合されたビジュアルデータ準備ツール。
GUIベースで40以上のデータソース（S3、Athena、Redshift、Snowflake等）に接続可能。

**主な機能：**

- 欠損値補完・スケーリング・エンコーディング
- Balance Data変換（SMOTE等）
- データ品質レポート
- ターゲットリーケージ分析

**特徴：**

- `.flow`ファイルとして保存
- SageMaker Pipelinesへエクスポート可能
- Snowflake接続にはAWS Secrets Managerを使用
- `ml.m5.4xlarge`等のインスタンス上で動作（使用時間課金）
- 他のSageMakerコンポーネント（Processing / Training）より多様なデータソースに対応

**Data Wrangler vs DataBrew vs Glue：**

| 観点          | Data Wrangler | DataBrew              | AWS Glue  |
| ------------- | ------------- | --------------------- | --------- |
| 主目的        | ML前処理特化  | データクレンジング    | 大規模ETL |
| SageMaker連携 | ✅ ネイティブ | ❌ 直接インポートなし | ❌ 複雑   |
| ノーコード    | ✅ GUI        | ✅ GUI                | △         |
| PII処理       | △             | ✅                    | △         |

#### Data Wrangler と Glue の S3 エクスポート比較

Data Wranglerは**S3に直接エクスポートする機能を持たない**。`.flow`を実行するには別サービス経由が必要。

| 観点             | Data Wrangler                                                   | AWS Glue                       |
| ---------------- | --------------------------------------------------------------- | ------------------------------ |
| S3への直接出力   | ❌ 不可                                                         | ✅ ジョブで直接書き込み        |
| 実行に必要なもの | **Processing Job / Pipelines / ノートブック実行**のいずれか経由 | Glue Job単体で完結             |
| 定期実行         | Pipelinesスケジュール or EventBridge                            | Glue Workflow / トリガーで簡単 |
| 設計思想         | **GUIで前処理レシピ（.flow）を作る → 別の実行基盤で動かす**     | ETLジョブを直接定義・実行      |
| コード生成       | Python/PySparkコードを**書き出す**                              | 自動生成 or 手書き             |
| 運用負荷         | 中（実行環境を別に組む必要あり）                                | 低〜中（単独で完結）           |
| 料金モデル       | Wrangler利用時間 + 実行先（Processing等）の料金                 | DPU課金                        |

**Data Wranglerの典型フロー**

```
[Studio GUIで .flow 作成]
        ↓
[3つの実行方法から選択]
   ├ ① ノートブック生成して実行（試行錯誤向け）
   ├ ② Processing Job として実行（単発バッチ）
   └ ③ Pipelines のステップに組み込む（定期・本番運用）
        ↓
[S3 / Feature Store へ出力]
```

**選び方**

- **GUIで前処理を組み立てたい・MLパイプラインに組み込みたい** → Data Wrangler
- **S3にスケジュール実行で書き出すだけで完結** → Glue（運用負荷低）
- **大規模ETL・複数ソース統合** → Glue
- **PIIマスキングをノーコードでS3に出力** → DataBrew

**MLA出題ポイント**

- 「Data Wranglerで作った前処理を**自動定期実行**したい」→ Pipelinesに組み込む（Wrangler単体では不可）
- 「**運用負荷を最小**でS3に変換結果を書き出す」→ Glue（Wranglerは中間サービス必要なので不利）
- 「Studio内でGUIで前処理→学習まで一気通貫」→ Data Wrangler

### SageMaker Processing

データ前処理などを行うバッチ処理ジョブ。
処理ロジックは自作だが、実行環境はマネージド。

### SageMaker Feature Store

特徴量を一元管理するストア。
訓練・推論で同じ特徴量を参照でき、Train-Serving Skewを防ぐ。

#### オンラインストア（Online Store）

**低レイテンシで最新の特徴量を返す**ストア。リアルタイム推論用。

- 物理的な実体：**専用の高速 KVS（DynamoDB系の内部ストレージ）**
- 各レコードは**最新の1件のみ**保持（履歴は持たない）
- レイテンシ：**ミリ秒単位**で取得可能
- 用途：リアルタイム推論時に「ユーザーIDから最新の特徴量を即取得」

#### オフラインストア（Offline Store）

**履歴を含む全データを蓄積**するストア。学習・バッチ推論・分析用。

- 物理的な実体：**ユーザーが指定したS3バケット**（Parquet形式）
- レコードの**全履歴**を保持（時系列で追記）
- Athena / EMR / Spark から SQLでクエリ可能
- 用途：学習データ作成、過去データの分析、Time Travel（過去時点の特徴量再現）

#### ストレージは物理的に別か？

✅ **完全に別の物理ストレージ**

- オンライン：AWS管理の高速KVS（DynamoDB類似のマネージド基盤）
- オフライン：自分のS3バケット
- 同じ特徴量を Put すると、Feature Store が**両方に自動で書き込む**（dual write）
- そのためストレージ料金もそれぞれ発生

#### 設定モード

- **Online only**：リアルタイム推論のみ（履歴不要）
- **Offline only**：学習データ蓄積のみ（リアルタイム不要、コスト最小）
- **Online + Offline**：両方に同期書き込み（一般的、推論と学習の両立）

#### Glue Data Catalog との連携（オフラインストアの検索能力の正体）

Feature Store はオフラインストア書き込み時に**Glue Data Catalog へ自動でテーブル登録**する。

1. `PutRecord` → S3にParquet書き込み
2. **同時にGlueにテーブルを自動作成**（DB名：`sagemaker_featurestore` がデフォルト、テーブル名＝Feature Group名）
3. パーティション（イベント時刻等）も自動登録
4. **Athena / EMR / Spark から即SQLで検索可能**

```
[PutRecord]
   ├→ オンライン（AWS管理KVS）：最新1件
   └→ オフライン（ユーザS3）：履歴Parquet
         └→ Glue Data Catalog 自動登録
               └→ Athena/EMR/Spark でSQL検索可能
```

→ ユーザは `CREATE TABLE` 不要。書いた瞬間に検索できる。

#### MLA出題ポイント

- 「ミリ秒で最新特徴量を返す」→ **オンライン**
- 「履歴付きで学習に使う / S3にParquetで蓄積」→ **オフライン**
- 「Train-Serving Skew防止」→ Feature Store自体（両方使う）
- 「過去時点の特徴量を再現（Time Travel）」→ オフライン
- 「Athenaから特徴量を検索できる理由」→ **Glue Data Catalogへの自動登録**

#### Feature Storeの向き不向き

**向いているデータ**

- **テーブル形式の構造化データ**（数値・カテゴリ・タイムスタンプ等）
- ユーザ属性、商品メタ情報、集計済み特徴量（過去30日購入額平均等）

**向いていないデータ**

- **画像・動画・音声などのバイナリデータ**
  → S3に直接保存し、パスだけFeature Storeに格納する運用が定石
- 高頻度に大量更新される生ログ（Kinesis/Firehose向き）

**取得性能の向き不向き**

- ✅ **推論時の特徴量取得に優れる**：オンラインストアで**ミリ秒で数件取得**
- ❌ **トレーニング時の大量バルク取得には不向き**
  - オフラインストアのS3 Parquetを直接Athena/Sparkで読む方が高速・低コスト
  - GetRecord APIで100万件をループ取得は非効率
  - 学習時は「オフラインからバッチ抽出」、推論時は「オンラインから単件取得」が正しい使い分け

**MLA出題：「リアルタイム推論で低レイテンシ取得」→ オンライン / 「大量学習データを一気に読む」→ オフライン（S3直読み）**

### Amazon Mechanical Turk

人手でデータラベリングを行うクラウドソーシングサービス。
Amazonのプラットフォームに登録した独立したクラウドワーカーがタスク単価で対応。
SageMaker Ground Truthと統合可能。

---

## 実験管理

### SageMaker Experiments

MLの実験・追跡・整理・比較を行うサービス。

**構造：**

```
Experiment（実験）
  └─ Trial（トライアル）× 複数
       └─ Trial Component（実行単位）
            ├─ パラメータ（学習率、バッチサイズ等）
            ├─ メトリクス（精度、Loss等）
            └─ アーティファクト（モデル、データ）
```

用途：モデル開発の試行錯誤を記録・比較する（開発フェーズ）。
良いモデルが決まったら Model Registry に登録する流れ。

---

## ハイパーパラメータチューニング

### SageMaker Automatic Model Tuning（AMT / HPO）

SageMakerがハイパーパラメータ探索ジョブを自動実行する機能。複数のチューニング戦略をサポート。

**チューニング戦略**

- **Random Search**：ランダム探索。シンプルで並列性◎
- **Grid Search**：全組み合わせ網羅（小規模空間向け）
- **Bayesian Optimization（ベイズ最適化）**：過去結果から有望な領域を予測。少回数で精度◎
- **HyperBand**：早期打ち切り型。大規模探索向け（次項）

### HyperBand

**早期打ち切り（Early Stopping）+ 多腕バンディット**を組み合わせた効率的なチューニング手法。

**仕組み**

1. 多数のハイパラ候補を**少ないリソース（少エポック）で並列に学習**
2. 性能の悪い候補を**早期に打ち切り**、生き残りに資源を集中
3. これを段階的に繰り返し、最終的に最強構成を探し当てる

**メリット**

- ベイズ最適化より**短時間で大量の組み合わせを試せる**
- 計算リソースを有望候補に集中投下できる
- 早期打ち切りで無駄な学習を削減 → コスト削減

**デメリット・注意点**

- **早期段階で性能が伸びる候補にバイアス**（後半で逆転するタイプは捨てられる）
- 学習曲線が安定するアルゴリズム（DL系）に向く
- 中間メトリクスを定期報告する必要あり

**他戦略との使い分け**
| 戦略 | 向く場面 |
|---|---|
| Random | シンプル・並列重視 |
| Grid | 探索空間が小さい |
| Bayesian | 試行回数を抑えたい・1試行が重い |
| **HyperBand** | **大量候補を試したい・DL学習・コスト削減重視** |

**MLA出題：「多数のハイパラ候補を効率的に探索」「早期打ち切りで時間短縮」→ HyperBand**

### SageMaker マネージドウォームプール（Managed Warm Pool）

学習ジョブ終了後もインスタンスを**一定時間温存（保持）**して、次のジョブで再利用する機能。

- 通常：ジョブ毎にインスタンス起動 → コンテナpull → 起動オーバーヘッド数分
- ウォームプール：**起動済みインスタンスをすぐ再利用** → ジョブ開始までの待機が大幅短縮

**メリット**

- 反復実験・HPO（Tuningジョブ）で**起動時間を秒単位**に短縮
- 同じイメージ・要件を使い回すと効率最大
- 開発スピード向上

**注意点**

- 温存中も**インスタンス料金は発生**する（待機時間中も課金）
- 保持期間（KeepAlivePeriodInSeconds）を設定可、最大1時間
- 過剰な保持はコスト増 → 反復間隔とのバランスで設定

**MLA出題：「HPOやハイパラ探索の試行を高速化」「学習ジョブ開始の待ち時間を削減」→ マネージドウォームプール**

---

## 訓練中の監視

### SageMaker Debugger

訓練中にモデルの内部状態（テンソル）を収集・分析するサービス。

- 重み、勾配、活性化を監視
- 組み込みルールで消失勾配・過学習等を自動検出
- 自動アクション（訓練停止等）が設定可能

※ TensorBoardは「可視化」のみ（自動検出・是正措置なし）

### TensorBoard

TensorFlowエコシステムの可視化ツール。
損失曲線・勾配ヒストグラム等をグラフィカルに確認できる。
あくまで「可視化」のみで、問題の自動検出・是正措置は別途実装が必要。

### TensorFlow

Googleが開発したオープンソースの**深層学習（Deep Learning）フレームワーク**。
PyTorchと並ぶ主要な深層学習ライブラリ。

**特徴**

- 計算をテンソル（多次元配列）の演算グラフとして表現
- GPU / TPU での高速学習に対応
- 静的グラフ（`tf.function`）と動的実行（Eager Execution）両対応
- **Keras** が高レベルAPIとして統合済み（`tf.keras`）→ 数行でモデル構築可能
- **TensorBoard** で学習の可視化（損失・精度・ヒストグラム等）
- **TFLite**（モバイル・組込み向け）、**TensorFlow.js**（ブラウザ）、**TF Serving**（推論サーバ）等エコシステムが充実

**用途**

- 画像分類・物体検出（CNN）
- 自然言語処理（RNN / Transformer）
- 時系列予測
- レコメンド・強化学習
- 大規模分散学習

**SageMakerでの扱い**

- **TensorFlow用組み込みコンテナ**が用意されている → `Estimator` でスクリプトモード学習
- Script Mode：自前の`.py`を渡すだけで分散学習実行可
- BYOC（Bring Your Own Container）も可
- TensorBoardはSageMakerで統合表示可能（出力をS3に書く）
- 推論コンテナとして TensorFlow Serving が使える

**TensorFlow vs PyTorch**
| 観点 | TensorFlow | PyTorch |
|---|---|---|
| 開発元 | Google | Meta |
| 設計思想 | 産業用途・本番デプロイ重視 | 研究・実験重視 |
| グラフ | 静的（昔）→今は動的も可 | 動的（直感的） |
| 本番デプロイ | TF Serving / TFLite で強い | TorchServe |
| シェア | 産業界で根強い | 研究界で多数派 |

**MLA出題ポイント**

- 「画像/NLPの深層学習モデルを作る」→ TensorFlow or PyTorch
- 「学習の可視化」→ **TensorBoard**（SageMaker Studioに統合表示可）
- 「自前のTFスクリプトをSageMakerで動かす」→ **Script Mode + TensorFlow Estimator**

### AWS Deep Learning Containers（DLC）

深層学習フレームワーク（TensorFlow / PyTorch / MXNet等）が**事前構築済み**のDockerイメージ群。
ECR で AWS から公式提供されており、SageMaker / EC2 / EKS / ECS で利用可能。

**特徴**

- フレームワーク本体・CUDA・cuDNN・NCCL・MKL-DNN等を**AWSが最適化済み**
- セキュリティパッチ・バージョン更新がメンテナンスされる
- 自前で環境構築するより**起動が速く、依存関係トラブルが少ない**
- 学習用と推論用が別イメージで提供

#### 大規模モデル向け DLC（Large Model Inference / LMI コンテナ）

**LLMや巨大なFoundationModel**を効率的に推論・学習するための専用DLC。

**主な特徴**

- **DeepSpeed / FasterTransformer / vLLM / TensorRT-LLM** などの大規模モデル推論ライブラリを内蔵
- **モデル並列・テンソル並列・パイプライン並列**を簡単に利用可能
- **量子化（INT8/INT4）** や **ページドアテンション** 等の高速化技術が組み込み済み
- 数十〜数千億パラメータのモデルを**1ノードに収まらないサイズでも分散実行**可能
- SageMaker Hosting と統合 → エンドポイントに直接デプロイ

**典型ユースケース**

- Llama 2/3、Falcon、Mistral等のOSS LLMを SageMakerで推論
- JumpStartの裏側でLMIコンテナが動いている
- 自社ファインチューニング済み大規模モデルの本番デプロイ

**通常DLCとの違い**
| | 通常DLC | LMI（大規模モデル向け）DLC |
|---|---|---|
| 想定モデル | 〜数億パラメータ | 数十億〜数千億パラメータ |
| 並列化 | データ並列が中心 | モデル並列・テンソル並列対応 |
| 内蔵ライブラリ | TF/PyTorch標準 | DeepSpeed / vLLM / TensorRT-LLM等 |
| 量子化 | 自前で実装 | 標準対応 |
| 用途 | 一般的なML推論・学習 | LLM・基盤モデルの推論 |

**MLA出題ポイント**

- 「**LLMをSageMakerでデプロイ**」→ **大規模モデル向けDLC（LMI）**
- 「メモリに収まらない巨大モデルを分散推論」→ LMI（モデル並列）
- 「環境構築の手間を減らしてML学習開始」→ 通常DLC
- 「JumpStartの裏側で動くコンテナ」→ LMI DLC

### SageMakerフレームワークコンテナとスクリプトモード（Script Mode）

AWSプリビルドのフレームワークコンテナ（TF/PyTorch/MXNet等のDLC）を使いつつ、**自前の学習スクリプトを持ち込む**実行方式。

- コンテナ環境はAWSがメンテナンス（依存・CUDA・ドライバ等）
- ユーザーは **train.py** など最小限のコードだけ書く
- 環境変数経由でハイパラやチャネル（入力データパス）を受け取る

**メリット**

- 環境構築不要・依存関係トラブルなし
- 自前ロジックの自由度を確保
- フレームワーク標準APIをそのまま使える

**他方式との比較**
| 方式 | コンテナ | コード | 用途 |
|---|---|---|---|
| 組み込みアルゴリズム | AWS提供 | ハイパラのみ | 鉄板アルゴリズム |
| **スクリプトモード** | **AWS提供（DLC）** | **自前train.py** | **柔軟＋楽** |
| BYOC | 自前 | 自由 | 独自ライブラリ・特殊環境 |

### BYOC（Bring Your Own Container）

SageMakerで**完全に自前のDockerコンテナ**を使って学習・推論する方式。

- フレームワーク以外の特殊ライブラリ・C++/Rust拡張・独自ランタイム等に対応
- ECRにイメージをpushして学習ジョブ／エンドポイントで指定

**必要要件（SageMakerパス規約）**

- 学習：`/opt/ml/input/`（データ）、`/opt/ml/model/`（出力）、`/opt/ml/output/`（ログ）
- 推論：`/invocations` と `/ping` のHTTPエンドポイント実装
- これらに準拠しないとSageMakerが正しく扱えない

**使い分け**

- 既存FWで足りる → スクリプトモード
- 独自ライブラリ・特殊環境必須 → **BYOC**

**MLA出題：「独自のC++ライブラリを使った推論」「FW非対応の特殊環境」→ BYOC**

### SageMaker Neo

学習済みモデルを**ターゲットハードウェア向けにコンパイル・最適化**するサービス。

- 入力：学習済みモデル（TF/PyTorch/XGBoost/MXNet/ONNX等）
- 出力：ターゲットHW（CPU/GPU/エッジデバイス）に最適化された軽量・高速モデル
- 推論速度向上、メモリ削減、レイテンシ短縮を実現
- **AWS IoT Greengrass連携でエッジデバイスへデプロイ**可能（カメラ・ラズパイ・産業機器等）

**ターゲット例**

- クラウド：EC2 instance type別の最適化（c5, g4dn 等）
- エッジ：Jetson、Raspberry Pi、Cortex-A、各種ARMボード

**MLA出題：「モデルをエッジデバイスに展開」「推論を軽量化」→ SageMaker Neo + Greengrass**

### SageMaker Profiler

**学習ジョブのハードウェア利用状況を可視化・プロファイリング**するツール。

- CPU / GPU / メモリ / I/O / ネットワーク使用率を時系列で取得
- カーネルレベル・オペレータレベルで処理時間を分解表示
- GPU使用率の谷間、データロード待ち、通信ボトルネック等を特定

**Debuggerとの違い**
| | Debugger | Profiler |
|---|---|---|
| 監視対象 | **モデルの内部状態**（重み・勾配・活性化） | **ハードウェア利用状況**（CPU/GPU/IO） |
| 用途 | 消失勾配・過学習の検出 | パフォーマンスボトルネック特定 |
| 出力 | テンソル値・自動ルール検知 | 時系列プロファイル・タイムライン |

**用途**

- 大規模分散学習でGPUがフル稼働してない原因調査
- データロード（DataLoader）がボトルネックか確認
- ノードや通信のレイテンシ可視化
- 最適なインスタンスタイプ選定の判断材料

**MLA出題：「GPU使用率が低い原因を調べたい」「分散学習のボトルネック特定」→ SageMaker Profiler**

### SageMaker LCNC（Low-Code/No-Code）ツールの使い分け

SageMakerには**コードを書かずにML構築・運用できる**サービスが複数あり、用途で使い分ける。

#### 各サービスの位置づけ

| サービス                | 主目的                               | 対象データ        | 主な利用者                  |
| ----------------------- | ------------------------------------ | ----------------- | --------------------------- |
| **SageMaker Canvas**    | 表形式データのMLモデル構築           | CSV/表形式        | ビジネスユーザ・アナリスト  |
| **SageMaker JumpStart** | 基盤モデル活用・ファインチューニング | 画像/テキスト/LLM | データサイエンティスト・MLE |
| **SageMaker Autopilot** | 自動MLワークフロー（AutoML）         | 表形式            | エンジニア・DS              |

#### SageMaker Canvas

- **完全ノーコードGUI**で表データから予測モデルを構築
- 内部的にAutopilotを呼び出してモデル選定・学習
- ビジネス担当でも触れる「Excel的UI」
- 用途：売上予測、顧客解約予測、需要予測の初期PoC

#### SageMaker JumpStart

- 事前学習済み**基盤モデル（Foundation Model）** のカタログ
- LLM（Llama, Falcon等）、画像生成、CV、NLPモデルを**ワンクリックでデプロイ**
- **ファインチューニングもUI/コード両対応**
- 自社データでチューニング → そのまま**リアルタイム推論エンドポイントへ直接デプロイ**可能
- LCNCで「データ準備→ファインチューン→デプロイ」が完結

#### SageMaker Autopilot

- **AutoML**：データを与えるだけで複数アルゴリズムを試行・最適モデル選定
- 自動で**特徴量エンジニアリング・アルゴリズム選択・ハイパーパラメータチューニング**を実施
- ノートブック自動生成（モデルの中身を確認・改造可）
- Canvas/Redshift MLの裏側でも使われる
- 透明性が高い（ブラックボックスでない）のが特徴

**対応タスク（重要）**

- ✅ **表形式データの分類・回帰**（二値分類・多クラス分類・回帰）
- ✅ 時系列予測（一部）
- ❌ **LLM・大規模言語モデルのトレーニングは非対応**
- ❌ 画像・音声・動画のモデル学習は非対応（→ JumpStartや組み込みアルゴリズム）

**MLA落とし穴**
「Autopilot で LLM をチューニングする」は**誤答**。

- 表形式データ分類/回帰 → **Autopilot**
- LLMファインチューン → **JumpStart**
- 画像/物体検出 → **組み込みアルゴリズム or JumpStart**

#### 使い分けの判断軸

- **ビジネスユーザがGUIで予測したい** → **Canvas**
- **LLM/基盤モデルを自社データで微調整して即デプロイ** → **JumpStart**
- **AutoMLで複数モデルを試して最適解を見つけたい** → **Autopilot**
- **完全コーディング前提のカスタム学習** → 通常のSageMaker Training（LCNCではない）

#### MLA出題ポイント

- 「コードを書かずに表データから予測」→ **Canvas**
- 「事前学習済みLLMを自社データでファインチューン→即デプロイ」→ **JumpStart**
- 「AutoMLで最良モデルを自動選定」→ **Autopilot**
- 「ファインチューニング済みモデルをLCNCのみでリアルタイム推論」→ JumpStart + エンドポイント直接デプロイ

---

## モデル管理

### SageMaker Model Registry

モデルのバージョン管理サービス。
以下を紐付けて管理：

- モデルアーティファクトのS3パス
- 推論イメージURI
- 承認ステータス
- カスタムメタデータ

SageMaker Pipelinesと統合でき、`RegisterModel Step`で自動登録可能。
承認済みモデルはCI/CDで自動デプロイ可能。

### SageMaker ML Lineage Tracking

SageMakerで実行されるジョブに関連するアーティファクト間の関係を自動追跡・記録するサービス。
データセット・アルゴリズム・モデル・エンドポイント間の関連を有向グラフとして保持。

**用途：**

- 本番モデルの訓練に使ったデータを特定（遡り）
- 規制対応での監査証跡
- モデルの再現性確保

**Experimentsとの違い：**

|          | Experiments            | Lineage Tracking             |
| -------- | ---------------------- | ---------------------------- |
| 目的     | 実験の比較・管理       | 来歴の追跡                   |
| 視点     | どのパラメータが最良か | このモデルは何から生まれたか |
| 活用場面 | 開発中の試行錯誤       | 監査・再現性確認             |

---

## デプロイ・推論

### SageMaker Endpoint

モデルをリアルタイム推論エンドポイントとしてデプロイするサービス。
Auto Scalingによるインスタンスのスケーリングもフルマネージドで対応。

**デプロイ方式の比較：**

| 方式                            | インスタンス追加      | ダウンタイム       | 追加インスタンス       |
| ------------------------------- | --------------------- | ------------------ | ---------------------- |
| ローリングデプロイ              | 1台ずつ順次置き換え   | なし               | 最小（バッチサイズ分） |
| ブルー・グリーン（All at Once） | 新環境を全台同時構築  | なし（切り替え時） | 全台分（2倍必要）      |
| カナリアリリース                | 段階的（例：10%刻み） | なし               | 新旧両方並行で増加     |

**フラッピング（Flapping）：**
スケールイン・スケールアウトが無限ループする状態。
対策：閾値マージンを広くとる、Cooldownを設定する。

#### SageMaker Endpoint の Auto Scaling

**Application Auto Scaling** と統合されており、**CloudWatchメトリクス**をトリガーにインスタンスを動的増減。

```
[推論リクエスト増]→[CloudWatch メトリクス更新]
   →[Application Auto Scaling 閾値判定]→[インスタンス数を増減]
```

**スケーリングポリシー**
| 種別 | 内容 | 用途 |
|---|---|---|
| Target Tracking | メトリクスを目標値に保つよう自動調整 | 推奨・一番ラク |
| Step Scaling | 閾値超過量に応じて段階的にスケール | 細かい制御 |
| Scheduled Scaling | 時刻指定で増減 | 業務時間帯固定の場合 |

**代表的メトリクス**

- **`SageMakerVariantInvocationsPerInstance`**（推奨）：1インスタンスあたりの推論リクエスト数
- `CPUUtilization` / `GPUUtilization` / `MemoryUtilization`
- カスタムCloudWatchメトリクスも指定可

**注意点**

- スケール反映に**数十秒〜数分のラグ**（コンテナ起動含む）
- **Cooldown** 設定でフラッピング対策
- **MinCapacity / MaxCapacity** 必須（暴走・コスト爆発防止）
- **Serverless推論** はAuto Scaling不要（リクエスト単位で自動スケール）

**MLA出題ポイント**

- 「トラフィックに応じて自動スケール」→ Application Auto Scaling + Target Tracking
- 「最も推奨されるスケーリングメトリクス」→ `SageMakerVariantInvocationsPerInstance`
- 「業務時間だけインスタンス増やす」→ Scheduled Scaling
- 「断続トラフィック・コスト最小」→ Serverless推論（Auto Scaling不要）

### SageMaker マルチコンテナエンドポイント（Multi-Container Endpoint）

1つのエンドポイント上に**最大15個の異なるコンテナ（モデル）**を同居させる方式。
各コンテナは独立して推論リクエストを受け付けられる。

**呼び出しモード**

- **Direct（直接呼び出し）**：`TargetContainerHostname` で特定コンテナを指定して推論
  → 異なるモデルを独立に呼び分けたい場合に最適
- **Serial（直列パイプライン）**：複数コンテナを順番に通す（前処理→推論→後処理など）

**メリット**

- インスタンスを共有 → コスト削減（個別エンドポイントを複数立てるより安い）
- 異なるFW（TensorFlow / PyTorch / XGBoost等）を1エンドポイントに混載可能
- モデルごとに独立呼び出しできる（Direct モード）

**マルチモデルエンドポイント（MME）との違い**
| | Multi-Container | Multi-Model |
|---|---|---|
| 同居の単位 | 異なるコンテナ（FW/環境が違ってOK） | 同じコンテナ上の多数モデル |
| 用途 | 異FW・少数モデル（〜15） | 同FW・大量モデル（数千〜） |
| 呼び分け | TargetContainerHostname | TargetModel |

**MLA出題ポイント**
質問の通り、「**異なるモデルを1エンドポイントで、かつ独立して推論したい**」なら
**マルチコンテナエンドポイント（Directモード）が最適解**。
（直列処理したいだけなら Serial、同FWで大量モデルなら MME を選ぶ）

### SageMaker マルチモデルエンドポイント（Multi-Model Endpoint / MME）

**同一コンテナ（同じFW・推論コード）**上に**多数のモデル**（数千〜数万）をホストする方式。
モデル本体はS3に保存され、リクエスト時に動的にロードされる。

**仕組み**

- 推論時に `TargetModel` でS3上のモデルファイル（`.tar.gz`）を指定
- 初回呼び出し：S3からコンテナのメモリにロード → 推論
- 2回目以降：メモリキャッシュからすぐ推論（コールドスタート回避）
- 使われないモデルはメモリから自動アンロード（LRU）

**メリット**

- 大量モデルを1エンドポイントに集約 → **コスト大幅削減**
- 顧客ごと・地域ごと・SKUごとなど、モデルが大量にある業務に最適
- モデル追加はS3にアップするだけ（再デプロイ不要）

**注意点・使わない方が良いケース**

- **異なるFW混在は不可**（同一コンテナ前提）→ 異FWは Multi-Container を使う
- 初回呼び出しはロード分のレイテンシ増（コールドスタート）
- 全モデルが常時高頻度に呼ばれる場合は逆に非効率（キャッシュが効かない）
- モデルサイズが大きすぎるとメモリ圧迫

**MLA出題ポイント**

- 「同FWで多数モデル・コスト最適化」→ MME
- 「異FW・独立呼び出し」→ Multi-Container（Direct）
- 「前処理→推論→後処理を直列」→ Multi-Container（Serial）または推論パイプライン

### SageMaker 推論コンポーネント（Inference Component）

1つのSageMakerエンドポイント（=インスタンス群）上に**複数モデルを共存させて**、それぞれを独立にスケール・管理する仕組み。

- モデルごとに必要なCPU/GPU/メモリを宣言してデプロイ
- **コンポーネント単位でAuto Scaling**可能（モデルAだけ増やす等）
- 同一インスタンスのリソースを複数モデルで共有 → **GPU効率化・コスト削減**

**Multi-Model / Multi-Container との違い**
| 方式 | 想定 | スケール単位 |
|---|---|---|
| Multi-Model（MME） | 同FWで多数モデル | エンドポイント全体 |
| Multi-Container | 異FW混載 | エンドポイント全体 |
| **推論コンポーネント** | 複数モデルを**個別に管理** | **コンポーネント単位** |

**ユースケース**

- 1台のGPUインスタンスで複数のLLMをロード（vRAMを共有）
- モデルごとに異なるトラフィックパターン → 個別にスケール
- A/Bテスト・複数バージョン共存

**MLA出題：「複数モデルをコスト効率よく1エンドポイントに」「モデルごとに独立スケール」→ 推論コンポーネント**

### 推論パイプライン（Inference Pipeline）

**前処理 → モデル推論 → 後処理**を**直列に連結**したエンドポイント。

- 最大15個のコンテナを順番に通せる
- 各ステップで`InvokeEndpoint`は1回だけ（内部で連鎖実行）
- 例：[テキスト正規化] → [TF-IDF変換] → [XGBoost推論] → [スコア整形]

**メリット**

- **Train-Serving Skew対策の決定打**：学習で使った前処理を推論時もそのまま再現できる
- 1エンドポイントで完結 → ネットワーク往復削減
- 各ステップを独立した再利用可能なコンテナとして管理

**MLA出題：「学習と推論で前処理を統一」「前処理から推論まで1コール」→ 推論パイプライン**

### SageMaker Inference Recommender

登録されたモデルに対してベンチマークジョブを実行し、
レイテンシー・スループット・コストの観点から最適なインスタンスタイプと構成を推奨するサービス。
※ Model Registryへの登録、またはSageMakerモデルの作成が必要。

---

## 本番モニタリング

### SageMaker Model Monitor

デプロイ後のMLモデルの品質を自動監視するサービス。

- 入出力データの変化（データドリフト）を監視
- モデル品質の低下を検知してアラート

### SageMaker Clarify

バイアス検出・特徴の重要性分析を行うサービス。
Model Monitorと組み合わせて4つの次元で監視：

1. データ品質
2. モデル品質
3. バイアスドリフト
4. 特徴属性ドリフト

**4サービスの時系列整理：**

| タイミング | サービス       | 目的                 |
| ---------- | -------------- | -------------------- |
| 開発中     | Experiments    | 試行錯誤の記録・比較 |
| 訓練中     | Debugger       | 学習バグの検出       |
| 開発完了後 | Model Registry | 本番候補モデルの管理 |
| デプロイ後 | Model Monitor  | 本番モデルの監視     |

#### Clarify と Model Monitor の役割分担

両者は本番モデルの監視で連携するが、見るものが違う。

| 観点     | SageMaker Clarify                              | SageMaker Model Monitor                        |
| -------- | ---------------------------------------------- | ---------------------------------------------- |
| 主目的   | **バイアス・公平性・説明性**                   | **データ品質・モデル品質の統計的監視**         |
| 見るもの | 保護属性（性別・人種等）に対する偏り、SHAP寄与 | 入出力データの分布変化、精度低下               |
| 指標     | DPL / DI / DPPL / SHAP値                       | KLダイバージェンス・統計量（平均・分散）の乖離 |
| 使う場面 | 「差別的予測を出していないか」                 | 「データドリフトしていないか」                 |
| 連携     | Model Monitor基盤上で実行                      | 本体（ベースラインと比較）                     |

→ **「保護属性のバイアス検知」→ Clarify** / **「統計指標のドリフト検知」→ Model Monitor**

#### KLダイバージェンス（Kullback-Leibler Divergence）

**2つの確率分布のズレを測る指標**。Model Monitorのデータドリフト検知に使われる。

- 値が0：完全一致 / 大きいほど分布が違う
- 非対称：`KL(P||Q) ≠ KL(Q||P)`
- 用途：本番データと学習データの分布比較（特徴量ごとに計算）
- Model Monitorは閾値超過でアラート発報

**MLA出題：「データドリフト検知の指標」「2分布のズレを定量化」→ KLダイバージェンス**

---

## 組み込みアルゴリズム

### SageMaker DeepAR

時系列予測用の教師あり学習アルゴリズム。
RNNを使用して複数の関連する時系列を同時に学習し、未来を予測する。

**ARIMAとの違い：**

- ARIMA：1つの時系列ごとに個別モデル
- DeepAR：複数の関連時系列を同時学習

**出力：** 確率分布（信頼区間付きの予測）

**入力：** ターゲット時系列 + 静的カテゴリ特徴（cat）+ 動的時系列特徴（dynamic_feat）

### RecordIO-Protobuf

SageMakerネイティブのバイナリデータフォーマット。

- バイナリ形式（CSVより圧縮効率が高い）
- Pipe Modeでのストリーミング配信対応（訓練中にS3から段階的に受け取れる）
- Factorization Machines、NTM、BlazingText等が対応

---

## パイプライン

### SageMaker Pipelines

ML特化のワークフローオーケストレーションサービス。

**典型的なフロー：**

```
Training Step（訓練）
  → Evaluation Step（評価）
  → RegisterModel Step（Model Registryへ自動登録）
  → 承認後、自動デプロイ
```

Data WranglerはSageMaker Pipelinesへ直接エクスポート可能（大きな差別化ポイント）。

**他のオーケストレーションサービスとの比較：**

| サービス            | 対象             | 統合                     |
| ------------------- | ---------------- | ------------------------ |
| SageMaker Pipelines | ML特化           | ✅ SageMakerにネイティブ |
| MWAA（Airflow）     | 汎用ワークフロー | △                        |
| AWS Step Functions  | AWSサービス横断  | △                        |

#### SageMaker Pipelines キャッシュ機能（Step Caching）

同じ入力・同じ設定のステップを再実行する際に、**前回の結果を再利用**して計算をスキップする機能。

- 各ステップに `cache_config` で有効化可能
- **キャッシュキー**：入力データ・パラメータ・コード・コンテナイメージのハッシュ
- 入力が変わっていなければ前回結果を即返す → コスト・時間を削減

**仕組み**

- `enable_caching=True` で有効化
- `expire_after` で有効期限指定（例：30日）
- ハッシュが一致すれば**ステップ実行をスキップ**して下流に値を渡す

**典型ユースケース**

- 前処理ステップが重く・入力が変わらない時
- パイプラインのデバッグで下流だけ何度も流したい
- HPOで前処理は固定・モデル学習だけ変える時

**注意点**

- 入力に依存する乱数（時刻ベース等）があるとキャッシュヒットしない
- データソースのバージョン管理を組み合わせると効果最大

**MLA出題：「同じ前処理を毎回走らせたくない」「パイプラインの実行コストを削減」→ Pipelinesキャッシュ**

---

## 生成AI・LLM 関連サービス

### Amazon Bedrock Knowledge Bases

**フルマネージドのRAG（Retrieval-Augmented Generation）基盤**。S3のドキュメントを取り込んでベクトル化し、LLMの回答精度を上げる。

**主な機能**

- S3のデータを自動でチャンク分割・**ベクトル化（Embedding）**・インデックス化
- 内蔵ベクトルストア：OpenSearch Serverless / Aurora PostgreSQL（pgvector）/ Pinecone / Redis 等から選択
- **2つの主要API**
  - `Retrieve`：質問に関連する文書チャンクだけ取得（自分でLLMに渡す）
  - `RetrieveAndGenerate`：取得+LLM回答生成を一気通貫

**メリット**

- ベクトル化・チャンク分割・検索ロジックを自前実装不要
- BedrockのLLM（Claude等）と直接連携
- 出典（Source Citation）も返してくれる

**MLA出題：「RAGをフルマネージドで構築」「ベクトルストア統合のRAG」→ Bedrock Knowledge Bases**

### リトリーバー（Retriever）

RAGアーキテクチャの**検索取得コンポーネント**。質問に関連する文書チャンクをベクトルストアから引っ張ってくる役割。

- 入力：ユーザのクエリ
- 出力：関連性の高い文書チャンク（上位N件）
- 検索方式：
  - **ベクトル類似度検索（Dense Retrieval）**：Embeddingベース
  - **キーワード検索（Sparse Retrieval）**：BM25等
  - **ハイブリッド**：両方を組み合わせ
- Bedrock Knowledge Basesの`Retrieve` APIや、OpenSearch・Kendraがリトリーバーとして使われる

### ファセット（Facet）定義

**検索結果の絞り込み条件**を定義する仕組み。カテゴリ・日付・著者など、属性で絞り込めるようにする。

- 例：「カテゴリ=技術」「公開日=2024年以降」「言語=日本語」
- Amazon Kendra / OpenSearch / Q Business で定義可能
- ユーザがフィルターUIで絞り込めるようになる
- MLA出題：「検索結果をカテゴリで絞り込む設計」→ ファセット定義

### Amazon Q Business

**社内文書を理解するAIアシスタント**サービス。社内データソース（S3 / SharePoint / Salesforce / Confluence等）と接続し、自然言語で質問応答できる。

**主な機能**

- 40+のコネクタで社内データソースを統合
- **ドキュメント属性フィルター**：メタデータ（部門・公開日・機密区分）で検索範囲を制限
- **ソース引用（Source Citation）**：回答の根拠ドキュメントを明示
- IAM Identity Center / SAML 連携でユーザ単位の権限制御
- 質問応答だけでなくアクション実行（プラグイン）にも対応

#### ブロックされたフレーズ機能（Blocked Phrases）

不適切な質問・回答を**最大20フレーズまで**ブロックリスト登録できる機能。

- 登録ワードを含む質問は応答拒否
- 機密情報・社内NG用語・コンプライアンス対応
- 制限：**1チャットアプリにつき最大20フレーズ**

**MLA出題ポイント**

- 「社内文書ベースのAIアシスタント」→ Q Business
- 「不適切な質問をブロック」→ ブロックされたフレーズ機能（最大20）
- 「部門メタデータで検索範囲制限」→ ドキュメント属性フィルター
- 「回答の出典を表示」→ ソース引用

---

## 模試ミス回収メモ

### SageMaker データ入力モードとストレージ選択

| モード/ストレージ       | 特徴                                                      | 向く場面                                                       |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| **File mode**           | S3からトレーニング前に全量DL                              | 小〜中規模、Local Mode互換                                     |
| **FastFile mode**       | S3をPOSIXファイルとして見せ、必要時にオンデマンド読み込み | 中規模、全量DLを避けたい（manifest非対応）                     |
| **Pipe mode**           | S3から直接FIFOストリーミング                              | 数TB級・高スループット、起動待ち短縮                           |
| **S3 Express One Zone** | 同一AZ・超低レイテンシのS3クラス                          | File/FastFile/Pipeの入力先として高速化                         |
| **FSx for Lustre**      | 低レイテンシ・高スループットFS                            | HPC・画像/動画・分散学習・VPC必要                              |
| **EFS**                 | 共有FS                                                    | 複数インスタンスで共有、高速ストリーミングはS3+Pipe/Lustre優先 |

**判定キーワード**

- 「全量DLしてローカルで学習」→ File mode
- 「全量DL不可・POSIX的に扱う」→ FastFile mode
- 「数TB級ストリーミング」→ Pipe mode
- 「同一AZ超低レイテンシS3」→ S3 Express One Zone
- 「HPC・高速共有FS」→ FSx for Lustre

### SageMaker Feature Store の基本手順

1. **Feature Group作成**（スキーマ・器を先に作る）
2. **特徴量データをロード**（`PutRecord` / Data Wrangler / EMR）
3. **学習用データセット取得**（Offline Store から Athena / SDKで取得）

**判定キーワード**

- 「先にデータをロード」は誤り。**先にFeature Group定義**が正しい順序

### SageMaker Script Mode のコード配置

- **`image_uri`**：実行環境のコンテナイメージ（ECR）
- **`entry_point`**：実行する学習スクリプト
- **`source_dir`**：学習コード一式
- **`fit()`**：S3データを指定してTraining Job開始
- Script Modeは**ECRイメージ + 自前スクリプト + SageMaker Training Job**
- **ECSタスク起動は不要**（混同注意）
- 本番監査重視ならコードをイメージに含める構成もあり（build/push必要）

### Model Monitor と Clarify の役割分担（モニタリング観点）

| 観点                                   | Model Monitor    | Clarify                      |
| -------------------------------------- | ---------------- | ---------------------------- |
| データ品質（欠損・分布・統計量変化）   | ✅ Data Quality  |                              |
| モデル性能（Accuracy/F1/AUC/RMSE劣化） | ✅ Model Quality |                              |
| バイアス・公平性ドリフト               |                  | ✅ Bias Drift                |
| 特徴量寄与度（SHAP）の変化             |                  | ✅ Feature Attribution Drift |

**判定キーワード**

- 「データドリフト / 欠損 / 分布変化」→ Model Monitor Data Quality
- 「Accuracy / F1 / Recall / RMSE劣化」→ Model Monitor Model Quality
- 「bias / fairness / demographic disparity」→ Clarify Bias Monitor
- 「SHAP値・特徴量寄与の変化」→ Clarify Feature Attribution Monitor
- 「モデル性能ダッシュボード+バージョン管理のみ」→ データ品質検出が弱く誤答寄り
- 「監視なしの定期再学習」→ 原因特定できず不適切

### AWS Inferentia / Trainium

- **Inferentia**：**推論**用AIチップ（Inf1 / Inf2）
- **Trainium**：**学習**用AIチップ（Trn1 / Trn2）
- AWS Neuron SDK でPyTorch/TF最適化
- 用途：低レイテンシ・高スループット・推論コスト削減

**判定キーワード**

- 「推論 / 低レイテンシ / コスト最適化 / AWS Neuron」→ Inferentia
- 「学習用専用チップ」→ Trainium

### Hyperband 補足

- 複数構成を並列に試し、**中間結果が悪い構成は早期停止**
- 性能良い構成にエポック・リソース集中
- マルチフィデリティ・ランダム/ベイズより高速になりやすい

### マルチモデルエンドポイント 補足

- 「**多数の似たモデルを低コストで提供**」→ MMEを優先
- モデルごとに依存FWが違う → Multi-Container
- 低レイテンシ必須・高TPS → 個別エンドポイント検討

### CloudFormation での SageMaker リアルタイム推論構成

| リソース                         | 役割                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `AWS::SageMaker::Model`          | **何を動かすか**（モデルアーティファクト、推論コンテナ、IAMロール） |
| `AWS::SageMaker::EndpointConfig` | **どう動かすか**（インスタンスタイプ、台数、Variant）               |
| `AWS::SageMaker::Endpoint`       | **どこで公開するか**（推論入口）                                    |

**判定キーワード**

- 「モデル定義」→ `AWS::SageMaker::Model`（「SageMakerエンドポイントにホスト」と書かれていてもこれが正解になり得る）
- 「インスタンスタイプ・台数」→ `EndpointConfig`

### SageMaker Inference Recommender 補足

- 複数インスタンスでロードテスト → レイテンシ/スループット/コスト比較
- **「最も安いインスタンス」を選ぶのは誤答寄り**。**要件を満たす中でバランス最適**が正解
- 一般リソース最適化 → Compute Optimizer
- 負荷で台数増減 → Auto Scaling

### ベースラインモデル

- 高度なモデルを使う前の**比較用シンプル基準モデル**
- 数値予測/回帰の基準 → **Linear Learner**
- 分類の基準 → **Linear Learner**
- 表形式で高性能 → XGBoost
- テキスト → BlazingText
- 自動探索 → Autopilot
- 事前学習済み即使用 → JumpStart

**注意**：「ベースライン」は最適モデル探索ではなく**比較しやすい基準**

### AWS Glue と SageMaker Studio Classic の使い分け

- **AWS Glue**：データ取り込み・前処理・ETLパイプライン
- **SageMaker Studio Classic**：ML開発・学習・デプロイ・監視のWeb IDE
- **SageMaker Pipelines**：MLワークフロー自動化
- 「データ取り込みパイプライン」が出たら、文脈で**S3 rawデータをML用に整形するETL**と読む → Glue
- 手動スクリプトでのデプロイ → 運用負荷が高く不正解寄り

### SageMaker Studio Classic

旧版のSageMaker Studio。ML開発用Web IDE。

- Notebook、データ準備、Training Job、Experiments、Debugger、デプロイ、監視を統合

### SageMaker Model Registry

- **Model Group**：同じユースケース・ML問題のモデルバージョン管理単位
- **Collection**：複数のモデルパッケージグループを整理する機能（プロジェクト/チーム/用途別）

### SageMaker Managed Spot Training

- スポットインスタンスで**学習コスト削減**
- 中断あり → **checkpointで再開**できるようにする
- 長時間学習・コスト重視で有効
- 推論コスト最適化はInferentia / Inference Recommender

### SageMaker Training Compiler

- 深層学習モデルの**学習をコンパイル最適化**して高速化
- GPU使用時の学習速度向上・コスト削減
- PyTorch/TFで利用
- 推論高速化は Neo / Inferentia 系

### SageMaker Pipelines の Callback Step

- **外部処理の完了を待ってパイプラインを継続**するためのステップ
- 例：Glue Job を起動し、完了通知を受けて次のステップへ
- SageMaker外部処理をMLワークフローに統合する場面で使う

### Data Wrangler の代表的な変換

- **Balance Data**：クラス不均衡補正（過剰/過少サンプリング）
- **Corrupt Image**：破損画像の検出・除外
- **Outlier Detection**：外れ値検出
