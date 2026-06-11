# AI サービス（Transcribe / Textract / Rekognition / Comprehend / Q Business）

## Amazon Transcribe：バッチ vs ストリーミング（AIP-59）

| 方式 | 特徴 | ユースケース |
|---|---|---|
| **Transcribe Streaming** | リアルタイム文字起こし。**部分的な結果（Partial Results）** 機能で発話途中のテキスト断片を逐次取得可能 | 通話中のリアルタイム解析、コールセンター支援 |
| **Transcribe Batch** | 録音ファイルを非同期ジョブで処理。完成トランスクリプトを後から取得 | 会議録、VOD 字幕生成 |

### リアルタイム通話支援のアーキテクチャ（AIP-59）
```
音声 → Transcribe Streaming（部分的結果機能）→ テキスト断片
           ↓
InvokeModelWithResponseStream（トークン単位ストリーミング）
           ↓
API Gateway WebSocket API（双方向・持続接続）→ オペレーター画面
```

### 試験での判断軸（AIP-59 パターン）
```
「発話完了前から解析を開始したい」
  → Transcribe Streaming + Partial Results → ✅

「トークン単位で段階的に回答を配信したい」
  → InvokeModelWithResponseStream → ✅

「双方向通信（サーバープッシュ＋クライアント送信）」
  → API Gateway WebSocket API → ✅

「バッチ文字起こし（Transcribe Batch）」
  → ❌ 発話完了後のみ処理できリアルタイム性がない

「SQS / ElastiCache + ポーリング」
  → ❌ 単方向かつポーリング待ちが生じる、双方向通信要件を満たさない
```

---

## Amazon Q Business：S3 データソースのアクセス制御（AIP-60）

### 重要な前提：Q Business のアクセス制御レイヤー
```
ユーザー → Amazon Q Business（アプリ層でACL評価）→ S3（サービスロールでアクセス）
```
- **S3 にアクセスするのは Q Business のサービスロール**であり、エンドユーザーではない
- S3 バケットポリシーに IAM Identity Center グループ ARN を設定しても、Q Business サービスロールへのアクセス制御にしかならず、**ユーザー単位のフィルタリングには機能しない**
- ユーザーコンテキストに基づく制御は **Q Business のアプリケーション層（ACL ファイル）** で行う

### acl.json による一元アクセス制御（正解パターン）
- S3 バケットの**ルートに acl.json を 1 ファイル**作成し、データソース設定のアクセス制御セクションで参照
- Q Business S3 コネクタが公式にサポートする仕組み

```json
[
  {
    "keyPrefix": "s3://bucket/naika/",
    "aclEntries": [
      { "Type": "GROUP", "Name": "内科グループ", "Access": "ALLOW" }
    ]
  },
  {
    "keyPrefix": "s3://bucket/geka/",
    "aclEntries": [
      { "Type": "GROUP", "Name": "外科グループ", "Access": "ALLOW" }
    ]
  }
]
```
- データソースの **同期（sync）** 実行で ACL 情報がインデックスに取り込まれる
- ユーザーがクエリを実行すると、**IAM Identity Center のグループメンバーシップに基づいて検索結果がフィルタリング**される
- 単一ファイルで全マッピングを一元管理 → 変更時は 1 ファイル更新＋再同期のみ

### 関連ファイルの使い分け
| ファイル | 用途 |
|---|---|
| **acl.json**（バケットルート） | アクセス制御（ALLOW/DENY、ユーザー/グループ） |
| **metadata.json** | ドキュメント属性（タイトル・作成日など）の付与、アクセス制御には使わない |

### 試験での判断軸（AIP-60 パターン）
```
「S3バケットポリシーで IAM Identity Center グループを条件指定」
  → ❌ S3アクセス主体はQ BusinessのサービスロールのためユーザーAが区別できない

「プレフィックスごとに個別 permissions.json を配置」
  → ❌ Q Business は複数ACLファイルを統合して読み取る機能なし

「診療科ごとに Q Business アプリを別々に作成」
  → ❌ オーバーエンジニアリング、部門横断検索不可、運用負荷増大

「バケットルートに acl.json を1つ作成してデータソース設定で参照」
  → ✅ Q Business S3コネクタ公式サポート、一元管理、最小運用負荷
```

---

## Amazon Textract：対応形式とフォーム/テーブル抽出（AIP-75）

### Textract が対応している入力形式

**PDFだけではない。スキャンした紙書類の画像にも対応。**

| 形式 | 対応 |
|---|---|
| スキャン書類画像（JPEG / PNG / TIFF） | ✅ |
| PDF（スキャン・デジタル両方） | ✅ |

→ 「紙の請求書類をスキャンし」という問題文が出ても Textract が正解になる。

### Textract の特有機能

```
通常のOCR：テキストを読み取るだけ
Textract：
  ├─ フォーム抽出：「氏名：田中太郎」のようなキーと値のペアを構造化データで取得
  ├─ テーブル抽出：行列形式のデータをそのまま取得
  └─ 各フィールドに信頼度スコア（0.0〜1.0）が付与
                  → Amazon A2I の閾値判定に使える
```

### Textract の信頼度スコア（重要）

Textract は抽出結果の**各フィールドに信頼度スコア（0.0〜1.0）を自動付与**する。

```
抽出結果の例：
{
  "BlockType": "KEY_VALUE_SET",
  "Key": "氏名",
  "Value": "田中太郎",
  "Confidence": 0.94   ← これが信頼度スコア
}
```

- スコアが高い（0.9以上） → 自動処理を継続
- スコアが低い（しきい値未満） → A2I ヒューマンレビューへ自動転送

### Textract × A2I の連携（信頼度スコアを活用）

```
Textract で書類を抽出
  ↓
各フィールドに信頼度スコアが付く
  ↓ しきい値を下回った場合
Amazon A2I ヒューマンレビューワークフローに自動転送
  ↓
同一リージョンの担当者がレビュー用UIで確認・修正
  ↓
検証済みデータとして次のステップへ
```

### ⚠️ Rekognition との混同注意

| | Textract | Rekognition |
|---|---|---|
| **用途** | 文書・書類からテキスト/フォーム/テーブルを抽出 | 画像内のオブジェクト・顔・シーン・コンテンツ検出 |
| **書類のOCR** | ✅ | ❌（テキスト検出はできるが構造認識なし） |
| **フォーム抽出** | ✅ | ❌ |
| **コンテンツモデレーション** | ❌ | ✅ |

→ 書類から構造化データを取る → **Textract**  
→ 画像の有害コンテンツ検出 → **Rekognition**

---

## Lambda + Comprehend による PII リアルタイムマスキング（AIP-75）

### ⚠️ 試験の読み方：「Lambda でPIIをマスキング」= Comprehend を呼んでいる前提

**問題文に Comprehend が明記されていなくても、Lambda = Comprehend の薄いラッパーとして読む。**

```
なぜか：
  Lambda 単体に PII 検出機能はない
  → 「Lambda でマスキング」と書かれていたら
    暗黙的に Comprehend.detect_pii_entities() を内部で呼んでいる前提
  
  「自前実装」ではなく「マネージドサービス（Comprehend）呼び出しの実装」

試験での判断：
  「Lambda でPIIをマスキング」→ ✅ マネージド（Comprehend）活用
  「Macie でPIIをマスキング」 → ❌ Macieはマスキング機能なし（検出のみ）
```

### これはアンチパターンではなく標準パターン

```
標準パターン（正解）：
  Textract で抽出した構造化データ
    ↓
  Lambda（同期処理）
    → Comprehend.detect_pii_entities() でPII箇所を検出
    → 検出した位置を *** または [MASKED] に置換
    ↓
  マスキング済みデータを FM（Bedrock）に送信

特徴：リアルタイム・低レイテンシー・サーバーレス
```

### Macie がこの用途でアンチパターンになる理由

```
Amazon Macie：
  ├─ S3バケット全体を定期バッチスキャン
  ├─ PIIを「検出・分類・レポート」する
  └─ データをリアルタイムにマスキング・編集する機能はない ❌

→ FM入力前のリアルタイムPII除去には使えない
→ 「S3に保存されたデータの可視性・コンプライアンス監視」には使える
```

### AIP-75 の選択肢3つの役割分担まとめ

```
① Textract + A2I（同一リージョン運用）
   → スキャン書類の構造化抽出 + 低信頼度のヒューマンレビュー

② Lambda + Comprehend（PII検出→マスキング）+ Bedrock ガードレール + IAM（リージョン制限）
   → FM入力前のPII除去 + データレジデンシー担保

③ Glue Data Quality + Step Functions（オーケストレーション）+ Bedrock呼び出し
   → 構造化データの品質検証 → プロンプト変換 → FM呼び出し → 判定
```

### ⚠️ 不正解の選択肢の落とし穴

| 選択肢 | 何が問題か |
|---|---|
| **Rekognition Custom Labels + Comprehend + SNS** | Rekognitionにフォーム/テーブル抽出機能なし。SNS通知はレビューUIではない（A2Iとは別物） |
| **Macie + Config + CloudWatch** | MacieはリアルタイムPIIマスキング不可。FM呼び出しパイプラインが欠落 |
| **SageMaker カスタムOCR** | Textractが存在するのに自前OCRモデルを作るのは過剰設計 |

---

## マルチモーダル分析 + ダッシュボードパターン（公式模擬 Q20）

### 正解の構成（B）

```
動画・写真（公開データ）
  → Step Functions（ワークフロー制御）
  → Bedrock マルチモーダル FM（Nova Pro / Claude Sonnet）
      ↳ 画像・動画を直接分析 → スタイル要素・トレンド抽出
  → S3（分析結果保存）
  → Amazon QuickSight（ダッシュボード可視化）
```

### 各サービスの役割

| サービス | 役割 | オーバーヘッド |
|---|---|---|
| **Bedrock マルチモーダル FM** | 画像・動画を直接分析（カスタムモデル不要）| 最小 |
| **Step Functions** | 分析ワークフローのマネージドオーケストレーション | 最小 |
| **Amazon QuickSight** | サーバーレスBIダッシュボード | 最小 |

### Amazon QuickSight Q（Quick Suite）とは

- QuickSight に**すでにあるデータ**に対して自然言語で質問できる機能
- 「このダッシュボードの売上は？」のような**データ内クエリ**に使う
- **画像・動画の分析はできない** → 今回の要件に不一致

### 不正解パターン（引っかけ）

| 選択肢 | 不正解の理由 |
|---|---|
| **C: Rekognition カスタムラベル + Grafana** | カスタムモデルのトレーニング・継続更新が必要 → **オーバーヘッド大**。Grafanaカスタムプラグイン開発も必要 |
| **D: Claude（テキスト）+ Stable Diffusion + OpenSearch** | 複数FM統合 + OpenSearchクラスター管理 → **オーバーヘッド大**。視覚コンテンツをテキスト説明で分析するのも要件と不一致 |
| **A: Quick Suite で動画・写真分析** | Quick Suiteはダッシュボード内の既存データへのQ&A機能。画像・動画分析は不可 |

### 試験での識別キーワード

| キーワード | 正解 |
|---|---|
| 「画像・動画を直接分析」「カスタムモデル不要」 | **Bedrock マルチモーダル FM**（Nova Pro / Claude Sonnet）|
| 「分析ワークフローのオーケストレーション」 | **Step Functions** |
| 「サーバーレスダッシュボード」「最小オーバーヘッドで可視化」 | **Amazon QuickSight** |
| 「ダッシュボード内のデータに自然言語で質問」 | **QuickSight Q（Quick Suite）** ← 画像分析には使えない |

---

## Amazon Rekognition Video

**動画を自動分析するマネージドサービス。**

| 機能 | 内容 |
|---|---|
| **シーン検出** | 場面の切れ目を自動検出してシーンに分割 |
| 人物・顔検出 | 顔認識・人物トラッキング |
| テキスト検出 | 動画内のテキストを読み取る |
| アクション検出 | 「走る」「座る」等の行動を認識 |
| コンテンツモデレーション | 有害コンテンツの検出 |

**「動画をシーンごとにカット」= Rekognition Videoの標準機能（自前実装不要）**

### 試験での典型フロー（動画メタデータRAG）

```
動画ファイル（大量アーカイブ）
  ↓ Rekognition Video → シーンごとにカット
  ↓ Transcribe → 音声をテキスト化
  ↓ Nova Lite（バッチ推論）→ シーン動画＋テキストからメタデータ生成
  ↓ Bedrock Knowledge Bases → メタデータをRAGで検索可能に
  ↓ 自然言語クエリ → 該当シーンを返す
```

### Rekognition vs Rekognition Video

| | Rekognition（画像） | Rekognition Video |
|---|---|---|
| 対象 | 静止画像 | 動画ファイル・ストリーム |
| シーン検出 | なし | **あり** |
| 処理方式 | 同期 | 非同期（大容量対応） |

### 試験での識別

| キーワード | 正解 |
|---|---|
| 「動画をシーンに分割」「動画シーン検出」 | **Rekognition Video** |
| 「大量動画アーカイブの処理」「運用負荷最小」 | **Rekognition Video + バッチ推論** |
| 「scikit-learn + SageMaker で動画処理」 | **不正解（動画処理機能なし・運用負荷大）** |

---
