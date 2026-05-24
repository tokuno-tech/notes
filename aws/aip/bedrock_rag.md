# Bedrock RAG / ベクトルストア選定

## RAG構成の全体像

```
ドキュメント（S3 等）
  ↓ チャンク分割・埋め込み生成
ベクトルストア（OpenSearch / Aurora pgvector / Pinecone 等）
  ↓ クエリ → 類似検索（k-NN/ANN）+ メタデータフィルタ
取得した関連チャンクをコンテキストとしてプロンプトに挿入
  ↓
Bedrock FM（Claude など）→ 回答生成
```

Bedrock Knowledge Bases はこの一連を**マネージドで自動化**してくれる仕組み。

---

## Kendra vs OpenSearch（RAGでの使い分け）

両方ともBedrockに接続できるが、**設計思想と適用シーンが根本的に異なる**。

### サービスの本質

| | Amazon Kendra | Amazon OpenSearch（Service / Serverless） |
|---|---|---|
| 本来の用途 | **エンタープライズ検索**（社内ドキュメント検索エンジン） |  全文検索 + 分析 + ベクトル検索の汎用エンジン |
| 検索方式 | ML組み込みの**意味検索**（埋め込みは内部で自動生成） | 全文検索（BM25）+ **k-NN/ANN によるベクトル検索** |
| 埋め込みの扱い | **ユーザーが意識しなくてよい**（Kendraが裏で生成） | **ユーザーが埋め込みを生成して投入**する必要あり |
| データソースコネクタ | S3・SharePoint・Confluence・Salesforce 等の**公式コネクタ多数** | 基本はS3 + 自前のETL（Bedrock Knowledge Bases経由なら自動化） |
| インフラ管理 | フルマネージド（インデックス管理のみ） | OpenSearch Service：ノード管理あり / **Serverless：自動スケール** |

### Bedrock との接続方式

| | Kendra | OpenSearch Serverless |
|---|---|---|
| Bedrock Knowledge Bases のベクトルストアとして使えるか | **✕（公式サポートなし）** | **◯（公式サポートあり）** |
| Bedrock からの利用方法 | RetrieveAndGenerate API で Kendra をデータソース指定 | Knowledge Bases 経由で透過的に利用 |
| カスタム埋め込みモデルの選択 | **不可**（Kendra内蔵） | **可**（Titan・Cohere Multilingual 等を選択） |

### 適用シーンの判断軸

| シーン | 推奨 | 理由 |
|---|---|---|
| 社内文書を自然言語で検索したい（埋め込みを管理したくない） | **Kendra** | コネクタが多く、埋め込みを意識せず使える |
| 自前で生成した埋め込みを大量に管理したい | **OpenSearch** | カスタム埋め込みモデルに対応 |
| Bedrock Knowledge Bases で RAG パイプラインを構築したい | **OpenSearch Serverless** | Knowledge Bases の公式ベクトルストア |
| 多言語（日本語・英語・中国語等）を**単一空間**で扱う | **OpenSearch + Cohere Embed Multilingual** | 多言語埋め込みモデルを明示的に選べる |
| メタデータ（カテゴリ・日付・地域）で絞り込み + 類似検索 | **OpenSearch** | k-NN + keyword/date フィルタの同時実行が可能 |
| 数百万件以上のベクトルを低レイテンシで検索 | **OpenSearch（HNSW/IVF）** | ANN専用アルゴリズムで最適化済み |
| インフラ管理を完全に避けたい | **OpenSearch Serverless** | OCU課金で自動スケール、ノード管理不要 |

### AIPでの引っかけパターン

| 選択肢 | 不正解になる理由 |
|---|---|
| Kendra + カスタムドキュメントエンリッチメントで埋め込み生成 | Kendra は**カスタムベクトルを直接格納・検索する設計ではない**。Knowledge Bases のベクトルストアにもなれない |
| EC2上にElasticsearch + k-NNプラグイン | 機能的にはOpenSearchと同等だが、**ノード・シャード・パッチ等の管理が自前**。「インフラ管理を最小化」要件に反する |
| DynamoDB + Lambdaで類似度計算 | DynamoDB に ANN 機能なし。**全件スキャン**になりレイテンシ・コスト共に破綻 |
| Aurora pgvector + SQL ORDER BY | ベクトル検索自体は可能だが、**大規模ANNに最適化されていない**。低レイテンシ要件に劣る |

---

## OpenSearch Serverless ベクトルコレクション（AIP-19）

### 構成（正解パターン）

**Bedrock Knowledge Bases + OpenSearch Serverless（ベクトルコレクション）+ Bedrock FM（Claude）**

```
ドキュメント（S3）
  ↓ Bedrock Knowledge Bases が同期
チャンク分割 → 埋め込み生成（Titan / Cohere Multilingual）
  ↓
OpenSearch Serverless（ベクトル + メタデータ）
  ↓ k-NN（HNSW）+ メタデータフィルタ
取得チャンク → Claude にコンテキスト挿入
  ↓
回答生成
```

### 各要件との対応

| 要件 | 対応する仕組み |
|---|---|
| 約800万件のベクトル埋め込み | OpenSearch Serverless（HNSWでミリ秒検索） |
| 製品カテゴリ・作成年・対象地域でフィルタ | `keyword` / `date` 型メタデータフィールドで k-NN と**同時クエリ** |
| 日本語・英語・中国語の多言語対応 | **Cohere Embed Multilingual**で単一ベクトル空間に統合 |
| インフラ管理の最小化 | Serverless：ノード・シャード・スケーリング自動 |
| 低レイテンシ | HNSW + OCU自動スケール |
| RAGパイプライン構築 | Bedrock Knowledge Bases が同期〜回答生成まで一貫提供 |

### OpenSearch Serverless の料金モデル

- **OCU（OpenSearch Compute Units）単位**で課金
- 検索処理量に応じて自動スケール → 固定インスタンス料金なし
- アクセス変動の大きいチャットボット用途と相性がよい

---

## セマンティックキャッシュ（AIP-17 再掲・参照）

「表現は違うが同じ意図」の問い合わせを意味ベクトルで検出し、Bedrock呼び出しを削減するパターン。詳細は [bedrock_guardrails.md](./bedrock_guardrails.md) のセマンティックキャッシュセクション参照。

### 要点

- **完全一致系（ElastiCache のハッシュキー等）では意味の類似は検出不可**
- **キーフレーズ抽出（Comprehend）は構文レベル**で、意味レベルではない
- **OpenSearch k-NN + 埋め込み**が唯一意味ベースのキャッシュを実現できる組み合わせ

---

## ベクトルストア選定フローチャート

```
Bedrock Knowledge Bases を使いたい？
  ├─ Yes → 公式サポートされるストアから選択
  │         （OpenSearch Serverless / Aurora pgvector / Pinecone / Redis Enterprise 等）
  │         インフラ管理を避けたい → OpenSearch Serverless
  │
  └─ No  → 社内文書検索が主目的？
            ├─ Yes（埋め込みを意識したくない）→ Kendra（RetrieveAndGenerate）
            └─ No（カスタム埋め込みを大規模管理）→ OpenSearch Service / Serverless
```

---

## Knowledge Bases ソース帰属 + Converse API（AIP-22）

### 要件キーワードと対応機能

| 要件 | 対応機能 |
|---|---|
| 社内ドキュメントから関連情報を検索して回答に使用 | **Knowledge Bases for Amazon Bedrock**（RAG） |
| 回答の根拠となった参照元ドキュメントを明示 | **ソース帰属（Source Attribution）機能** |
| 結論までの判断過程を段階的に提示 | **Converse API** + Claude のチェーン推論 |
| 応答時間 3 秒以内 | Knowledge Bases + Converse API（軽量構成） |
| インフラ管理負担を最小化 | Knowledge Bases + Bedrock（フルマネージド） |

### ソース帰属（Source Attribution）

Knowledge Bases を RetrieveAndGenerate API または Converse API 経由で使うと、レスポンスに **引用情報（citations）が自動付与**される。

```json
// レスポンスに含まれる引用フィールド（イメージ）
{
  "output": "税率は 10% です。",
  "citations": [
    {
      "retrievedReferences": [
        {
          "content": { "text": "消費税率は 10% です。" },
          "location": { "s3Location": { "uri": "s3://bucket/doc.pdf" } }
        }
      ]
    }
  ]
}
```

- 参照元 S3 URI・ドキュメント名・引用チャンクのテキストが含まれる
- **別途 S3 に記録するコードを書く必要はない**（引用情報はAPIレスポンスに含まれる）

### Converse API とは

複数のモデルを**統一インターフェース**で呼び出せる Bedrock の API。

```
InvokeModel API  → モデルごとにリクエスト形式が異なる（移植性が低い）
Converse API     → 全モデル共通フォーマット。マルチターン対話に対応
```

- Knowledge Bases と組み合わせることで、RAG + マルチターン + ソース帰属を一体で実現

### 不正解パターン（AIP-22）

| 選択肢 | 不正解の理由 |
|---|---|
| Extended Thinking（拡張思考） | 内部推論トークンが大量に生成される → **3 秒以内**の応答要件に反する可能性が高い |
| SageMaker + OpenSearch + Lambda | 自前構築でインフラ管理コスト大。「管理負担の最小化」に反する |
| Bedrock Agents + プロンプトエンジニアリング | エージェントのオーケストレーション（ReAct ループ）でレイテンシが増加。3 秒以内の達成が困難 |

---

## マルチテナント Knowledge Base 構成（AIP-27）

### 要件

- 複数テナント（ビルごと）のデータを**厳密に分離**
- 空室状況の問い合わせに**ほぼリアルタイムの応答**
- 管理スタッフのアクセスを**テナント単位で制御**

### 正解構成

**ビルごとに独立した Knowledge Base + SQS + Lambda + Cognito ユーザープール**

```
各ビルの BMS（ビル管理システム）
  ↓ 変更イベント
Amazon SQS（ビルごとのキュー）
  ↓
Lambda → Knowledge Base のデータソースを更新
         （Knowledge Base はビルごとに分離して作成）
  ↓
管理スタッフ → Cognito ユーザープール（ビルごとのグループ）
               → 対応する Knowledge Base のみアクセス許可
```

### 各コンポーネントの役割

| コンポーネント | 役割 |
|---|---|
| **ビルごとに独立した Knowledge Base** | データの物理的分離。他ビルのデータへのアクセス経路がない |
| **Amazon SQS** | BMS からのリアルタイム変更イベントを受信・バッファリング。Lambda でポーリング処理 |
| **Amazon Cognito ユーザープール（グループ）** | ビル単位でグループを作成し、IAM ポリシーで対応 KB へのアクセスのみ許可 |

### 不正解パターン（AIP-27）

| 選択肢 | 不正解の理由 |
|---|---|
| 全ビルを単一 OpenSearch インデックスに統合 | データが混在。メタデータフィルタは「論理的」な分離で、物理的分離ではない |
| 中央集権的な Bedrock Agents でビル KB を統合 | エージェントがすべての KB にアクセス可能な状態。アクセス制御が複雑になる |
| CloudWatch Logs でビルごとのクエリログを記録 | 事後的な監査ログ。事前の認可制御（何ができるか）を満たさない |
| ビルごとに専用 AWS アカウント + Organizations SCP | 技術的には可能だが、アカウント数が増え運用コストが爆発的に増大。オーバーエンジニアリング |
| Kendra インデックス | Kendra は Bedrock Knowledge Bases のベクトルストアとして使えない（Kendra vs OpenSearch の重要区別） |

---

## ハルシネーション削減アプローチ（AIP-30）

### 問題：ハルシネーション（原文にない情報を生成）

現象：文書全体をそのままプロンプトに入力するだけでは、FM が原文にない統計データ・研究結果を生成する。

### 正解：2 つの組み合わせ（複数選択）

#### ① ゼロショット Chain-of-Thought（CoT）プロンプティング

```
プロンプトの設計：
「要約を生成する前に、以下のステップを実行すること。
 ①ソース文書のどの部分に根拠があるかを特定する
 ②その根拠と結論の論理的なつながりを説明する
 ③根拠のない情報は含めないこと」
```

- **追加インフラ不要**（プロンプト変更のみ）
- モデルが明示的に「ソース文書との照合」を行うため、ハルシネーションが減少
- 「ゼロショット」= Few-shot の例示なしで、指示だけで推論プロセスを誘導

#### ② RAG（Bedrock Knowledge Bases + セマンティックチャンキング）

```
ドキュメント
  ↓ セマンティックチャンキング（意味のまとまりで分割）
  ↓ 埋め込みモデルでベクトル化
ベクトルストア
  ↓ クエリに最も関連するチャンクを取得
FM（「提供されたコンテキストのみを使って要約すること」と指示）
  ↓
コンテキストに基づいた回答
```

- FM に「取得したコンテキストに根拠を置く」という制約が生まれ、ハルシネーションが減少
- セマンティックチャンキングにより文脈の切れ目が少なく、検索精度が向上

### 不正解パターン（AIP-30）

| 選択肢 | 不正解の理由 |
|---|---|
| SageMaker フルファインチューニング | ハルシネーション解決策として不十分。実装・学習コスト大。「3 秒以内」「毎時 1500 件」という運用要件にも影響 |
| Comprehend Medical で前処理しエンティティのみ入力 | エンティティ抽出は文脈を失う。重要な数値や因果関係が落ちる可能性があり、かえって品質が下がる |
| temperature=1.0 / top_p 最大値 | **逆効果**。temperature が高いほど多様性（ランダム性）が増し、ハルシネーションが増加する |

### temperature とハルシネーションの関係（試験頻出）

```
temperature = 0    → 最も確実な（高確率の）トークンを選択 → ハルシネーション少ない
temperature = 1.0  → 確率分布の多様性を最大化 → ハルシネーション増加
```

→ 「事実精度を高めたい」要件で temperature を上げる選択肢は**必ず不正解**。
