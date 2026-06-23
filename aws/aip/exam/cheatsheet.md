# 直前見直しチートシート

1行 = 1判断ルール。試験前夜に通読する用。テーマ別に整理。
[mistakes.md](./mistakes.md) に追記したら、導出した判断ルールをここにも1行転記する。
「なぜ誤答か」の詳細は [traps.md](./traps.md)、サービスの機能詳細は [topics/](../topics/) を参照。

## 大原則

- **"Bedrock Way"**: 2択で迷ったらマネージドサービス側（自前実装・自前運用の選択肢は大抵不正解）
- 「管理コンポーネント最小限」→ 構成要素の**数**を数える（少ない方が正解）
- 「〜**のみ**」が入った選択肢は多層防御・複合要件の問題で即アウト（単一手段では要件を満たさない）
- DynamoDB 等への独自ログ記録はほぼ冗長 → サービスネイティブのログ（CloudWatch Logs）で足りる
- 自前構築・カスタムモデル訓練・ポーリングは「運用負荷最小」要件でほぼ不正解
- 暗号化はデフォルト済み → 「暗号化を追加」が選択肢に出たら罠になりやすい

## Bedrock コア・API・推論パラメータ

- レスポンスストリーミングが要件 → **Lambda Function URL（RESPONSE_STREAM）**。API Gateway HTTP API は非対応
- REST API はリアルタイムストリーミング不可（タイムアウト・サイズ制限）/ 双方向リアルタイム → **WebSocket API**
- 「複数モデルを比較・切り替え」「マルチターン対話」→ **Converse API**（統一インターフェース）
- temperature 高 = 多様性増 → ハルシネーション増。「事実精度を高めたい」で temperature を上げる選択肢は**必ず不正解**
- 推論パラメータ識別：特定フレーズで停止 → **stop sequences** / ランダム性・創造性 → **temperature** / トークン多様性 → **top_k / top_p**
- 「トークン上限に近づいたら重要度の低い文脈を削除・保持」→ **スライディングウィンドウ**（古い会話は要約圧縮）
- CoT は**プロンプトへの指示**（追加インフラ不要）。Extended Thinking（拡張思考）とは別物 → レイテンシ要件では混同しない
- API Gateway「検証」→ **リクエスト検証ツール（JSONスキーマ）** /「変換」→ **マッピングテンプレート**
- API Gateway の同期タイムアウト = **29秒**。1分超なら非同期パイプライン（S3→SQS→Lambda）へ
- FM 出力を後続システムに渡す → **JSON スキーマ強制**で形式固定 / 決定論的なDB操作 → **Text-to-SQL**（計算はDB側）

## スループット・コスト最適化

- 「アイドル長め＋突発スパイク」→ **オンデマンド推論**（アイドル時コストゼロ）/「安定高トラフィック」→ **プロビジョンド**
- 「コスト効率＝プロビジョンド」は罠 → 必ずトラフィック量を確認してから判断
- テキスト系モデルのバッチ推論 → **CreateModelInvocationJob**。`StartAsyncInvoke` は **Nova Reel（動画生成）専用**
- 「安定性・スロットリング防止・バッチ推論」→ **Provisioned Throughput**
- オンデマンドのクォータ引き上げは対症療法。プロビジョンド済みキャパシティの未使用問題は解決しない（別枠）→ 根本原因特定が先
- 分散推論：**テンソル並列化**=重み行列を複数GPUに分割（レイテンシ低下、`tensor_parallel_degree`=分割GPU数）/ **データ並列化**=モデル複製で別バッチ（スループット向上）
- 「初期レイテンシ削減」「コールドスタート改善」→ **量子化**（モデルサイズ削減）/「GPU使用率最大化・変動負荷」→ **動的バッチ処理**
- 「オンプレで推論」「データを外に出せない」「エッジ」→ **SageMaker Neo**（コンパイル→ローカルデプロイ）

## 耐障害性・リトライ・ルーティング・キャッシュ

- 再試行OK → **429 / 500 / 503**（一時的）。再試行NG → **400 / 401 / 403**（リクエスト・権限の問題）
- 「再試行間隔を分散」「多数クライアントの同時リトライ」→ **ジッター付き指数バックオフ**（固定/線形リトライはNG）
- HTTP 429 に `Retry-After` があればその値を優先して待機
- 「障害中の送信を自動停止」→ **サーキットブレーカー**（AWS SDK標準リトライには含まれず、アプリ層で実装）
- ストリーミング中断からの復旧 → チャンクバッファリング + 途中再開（`InvokeModelWithResponseStream` は途中再開を提供しない＝アプリ責務）
- 「共通プレフィックス」「同じシステムプロンプト」「会話履歴の使い回し」+ コスト最小 → **プロンプトキャッシング**
- 「難易度に応じて最適モデルへ振り分け」「少ない開発工数」「品質と速度の両立」→ **インテリジェントプロンプトルーティング**
- キャッシュ（投げない）+ カスケード（どのモデルに投げるか）はセットでコスト最適化
- クロスリージョン推論：ソースリージョンのみモデルアクセス有効化が必要。ラウンドロビンではない（マネージドなフェイルオーバー＋最適化）

## RAG・ベクトルストア・検索精度

- チャンキング：意味のまとまり・ハルシネーション削減・高精度要約 → **セマンティック** / 概要と詳細両立 → **階層的** / シンプル → **固定サイズ**
- 「取得結果の順序・ランキングが悪い」「最関連が下位」→ **Bedrock リランカー**（取りこぼしは救えない＝初回検索の問題は別）
- 「ベクトル＋キーワード両方」「略称・専門用語の取りこぼし」→ **ハイブリッド検索（Dense+Sparse / k-NN+BM25）**
- 「多段階の関係性推論」「エンティティのつながり」→ **GraphRAG + Neptune Analytics**（Neptune **Database** はベクトル非対応）
- 「ユーザー語↔専門用語のギャップ」「ドメイン特化」「最小実装で精度向上」→ **クエリ拡張**（分解より軽量）/ 仮想答え文書 → **HyDE**
- ベクトルストア選定：低頻度・大量・コスト最適 → **S3 Vectors** / 高スループット低レイテンシ → **OpenSearch** / 既存RDS活用・中規模・SQL併用 → **pgvector** / マネージド・Bedrock統合 → **Knowledge Bases**
- 「サーバーレス≠低コスト」: OpenSearch Serverless はOCU課金で低頻度では割高。「サーバーレス＋最小運用負荷」なら OpenSearch Serverless
- 量子化（数値精度: FP16/Binary=メモリ削減）と検索アルゴリズム（FLAT=厳密100%/HNSW=ANN高速）は直交 → 「メモリも速度も」=**HNSW+FP16**
- 100% recall 必須 → **Flat（MemoryDB）**。ef_search を上げても100%は保証されない / 大規模・低レイテンシ許容 → HNSW
- Kendra の関連性スコアは検索の確信度であって評価メトリクスではない
- 選択肢の **Elasticsearch はベクトル非対応で即脱落** / **Comprehend がクエリ理解・拡張の選択肢なら不正解**（構文レベル止まり）
- 「OpenSearch への取り込み」→ **OpenSearch Ingestion** /「汎用ETL・増分」→ **Glue** /「品質・GUI変換」→ **Glue DataBrew**

## Knowledge Base 運用

- リアルタイムデータ（空室状況等）→ KB同期ではなく**アクショングループでAPI直呼び**。KBは静的文書用
- KB のテナント分離は**テナントごとにKB（別インデックス）**。単一インデックス+メタデータフィルタは「厳密な分離」要件で不正解
- KB の上限は約10個 → 拠点が多いならメタデータフィルタ併用を検討
- KB アクセス制御は **IAM Identity Center の許可セット**（Cognito ではない）
- 埋め込みは Bedrock の InvokeModel（Titan/Cohere）で完結。HuggingFace+Glue は運用負荷大でほぼ不正解
- ソース帰属（citations）は RetrieveAndGenerate / Converse で**自動付与**（別途記録コード不要）

## Agents・MCP・Prompt Flows・オーケストレーション

- **Bedrock 単体は Lambda を呼べない**（受動的API）。Lambda を呼ぶのは **Agents の Action Group** か Strands 等のコード側ループ
- 「複数ステップ・推論・複雑なタスク」→ **エージェント基盤（Strands / Bedrock Agents）**。「Lambda + Bedrock」は基本統合で不正解側
- 「ノーコード・FM呼び出しをノードでつなぐ」「CoTテンプレ・推論ステップ管理」→ **Prompt Flows** /「自律的にツール選択」→ **Agents**
- 「疎結合」「動的ツール選択」→ **Strands + MCP**（Step Functions/Flows は密結合・固定パス）
- MCP：「複数FMで標準化されたツール接続」「FMを変えても接続を変えたくない」「運用負荷最小」→ **MCP**（相互運用性）
- Agents 構築：マネージドで素早く → **Bedrock Agents** / コードで細かく・マルチプロバイダ → **Strands** / 専門エージェント振り分け → **Agent Squad**
- AgentCore：既存Pythonをデプロイ・インフラ最小 → **Runtime** / HTTPサーバ自動管理 → **SDK(@app.entrypoint)** / コンテナ化自動 → **スターターツールキット**
- マルチターン文脈維持：エージェントなら **sessionId**（追加実装不要）/ 自前FM呼び出しなら messages[]自己管理 or DynamoDB
- Step Functions **Standard vs Express**：人間の応答待ち・承認・数時間処理・監査証跡・重複不可 → **Standard** / 高頻度・短時間・低コスト → **Express**（5分制限。処理内容から常識判断、問題文に明記なくてもよい）
- 人間レビューの承認ワークフロー → **Step Functions + waitForTaskToken**（外部完了待ち→ `SendTaskSuccess` で再開。ポーリングは不正解）
- 「順次実行＋エラー時フォールバック・運用負荷最小」→ **Step Functions（ASL宣言的）**。Lambda自前実装は引っかけ
- 「種類の違う処理を同時実行して全部待つ」→ **Parallel** /「可変個数に同じ処理」→ **Map**
- 「自動化インシデント対応」（複数ステップ・分岐・承認待ち）→ **Step Functions** /「単純通知だけ」→ **SNS**
- Bedrock Flows のプロンプトノードには **プロンプト管理テンプレート + ガードレール**を関連付け可（エージェント組み込みは「エージェントノード」）

## ガードレール・コンテンツ安全性

- 「過剰ブロックを避けつつUX維持」→ コンテンツフィルター強度は**中**
- PII フィルター：入力は **BLOCK**（モデルに渡さない）、出力は **MASK**（伏せて返す）。入出力で別アクション可。「PII入力を止めたい」は MASK でなく **BLOCK**
- 「検知・記録はするが配信は止めない」→ **検出モード**（ブロックモードは配信を止める）
- ガードレールのログ（モデル呼び出しログ）はデフォルト **OFF** → 明示的に有効化（S3/CloudWatch Logs）
- 「どのポリシーが発動したか詳しく」→ **ガードレールトレース**（モデル呼び出しログとは別物）
- 「ユーザーロール別にフィルター強度を変える」→ Lambda で `guardrailIdentifier` を動的選択して InvokeModel
- 「ドメイン固有の脅威検出」（汎用ガードレールで不可）→ **SageMaker カスタム安全性分類器**
- 画像の不適切判定 → **Rekognition DetectModerationLabels** / テキストPII → **Comprehend DetectPiiEntities**
- Macie / GuardDuty はセキュリティ監視であってコンテンツモデレーションではない（引っかけ）
- **S3のPII検出・コンプライアンスレポート** → **Macie**（継続的自動検出） + Comprehend（テキスト内PII API）+ EventBridge + Lambda（自動修復）
- Macie の「機密データの自動検出」= 常時監視。週次・月次の検出ジョブより「自動修復・継続監視」要件に合う
- 「S3にあるデータ = バッチでいい」は罠 → 要件に「自動修復」「継続的コンプライアンス」があれば Macie 自動検出が正解
- Lambda+正規表現はルールベースで巧妙なプロンプトインジェクションを検出できない

## 多層防御・セキュリティ統合

- 「包括的な保護」「悪意あるプロンプト」→ **Bedrock ガードレール + Step Functions + Lambda**
- 「複数レイヤー・前処理〜後処理」→ **Comprehend（入口）+ Guardrails + Lambda（後処理）+ API Gateway（出口）** の4層
- WAF = 入口の門番（HTTPリクエスト層）/ API Gateway フィルタ = 出口の検閲（レスポンス整形）。役割が違う
- WAF + GuardDuty はネットワーク/インフラ層 → AIコンテンツの安全性とは別レイヤー（引っかけ）
- 「ハルシネーション低減・防止」→ **KB（グラウンディング）+ JSON スキーマ検証**
- 「脅威インテリジェンス統合」→ **EventBridge + Lambda** で外部フィードを定期取得し各レイヤーに反映
- プロンプトインジェクション vs ジェイルブレイクの検出は多段（入力サニタイズ→Guardrails→出力検査）
- 「Bedrock の包括的セキュリティ」→ **IAM + CloudTrail + CloudWatch**（CloudTrail が監査を担う）
- **セキュリティ実装順序**（PII対応 GenAI）: **IAM（基盤）→ Comprehend（入力PII検出・マスク）→ Bedrock Guardrails（出力フィルタ）→ CloudWatch（ログ・監視）**
- EventBridge = イベントルーティング → コンテンツフィルタリング防御層にはならない（多層防御問題での引っかけ）
- EventBridge = イベント駆動アーキテクチャ用 → **継続的なメトリクス監視（信頼度スコア等）には不適**。監視は CloudWatch カスタムメトリクス
- 「SQL インジェクション・セマンティクス上有害なクエリの検出」→ **Lambda + SQL AST 解析**（正規表現は複雑な構文を悪用した攻撃を検出できない）
- 「専門ドメイン（SQL等）でハルシネーション防止・確定的出力」→ **フューショットプロンプティング**（ゼロショットは一貫性なし・ハルシネーション増）
- SQS = キューイング・可用性 → コンテンツフィルタリング機能なし（多層防御問題での引っかけ）
- WAF は AIコンテンツ（PII・有害コンテンツ）をフィルタリングできない → SQLi/XSS 等のWeb攻撃層のみ（引っかけ）

## 評価・バイアス・データセット

- **属性バイアス（性別・人種・職業・年齢）の評価** → **BOLD データセット** + Bedrock モデル評価ジョブ
- RealToxicityPrompts = **有害性（Toxicity）専用** → 属性バイアス評価には使えない（引っかけ）
- WikiText2 = 一般テキスト生成精度（Perplexity）評価用 / T-REx = 事実的知識評価用 → バイアス評価用ではない
- SageMaker Clarify = 伝統的 ML のバイアス検出 → LLM のプロンプトバリアントテスト・セカンダリモデル検証には不向き
- 「バイアスの継続的モニタリング＋アラート」→ **CloudWatch カスタムメトリクス**（デフォルト機能ではなくカスタム。バイアス数値を自前プッシュ）
- 「制御されたプロンプトバリアントテスト」→ **Bedrock Prompt Management**

## 評価・モニタリング・オブザーバビリティ

- RAG 評価：取得のみ → **retrieve-only** / 取得+生成の総合（本番前）→ **retrieve-and-generate**
- 自動採点 → **LLM-as-a-judge**。モデル自身の自己採点は自己バイアスで客観性ゼロ → 規制業界で不適切
- CloudWatch Synthetics は外形監視（合成ユーザーの定期実行）。LLM出力の品質評価には使わない
- 「基準値が自動更新」→ **CloudWatch 異常検出アラーム**（固定しきい値・Contributor Insights は自動更新不可）
- 「どれが一番多いか可視化・ランキング」→ **Contributor Insights** /「複数条件が重なった時だけ警告」→ **複合アラーム**
- 「会話内容を監査」「プロンプト履歴を記録」→ **モデル呼び出しのログ記録（Model Invocation Logging）**（CloudTrail はAPIメタデータのみでプロンプト内容なし）
- 「エージェントの推論過程」→ **Agent トレース（enableTrace）** /「RAG回答のソース」→ **KB citations**
- トラブルシュート3点：遅延箇所 → **X-Ray**（サブセグメント）/ ログ検索集計 → **Logs Insights** / AI固有パターンの知見 → **Q Developer**
- 「ログとメトリクスを同時に・カスタムメトリクスを手軽に」→ **EMF** / EC2アプリのML自動ベースライン → **Application Insights**
- 「信頼度スコアを実正解率に合わせる」→ **キャリブレーション**（Bedrockネイティブ機能ではない＝プロンプトでJSON出力+外部評価）
- Bedrock カスタムメトリクスは**カスタム名前空間**（`AWS/Bedrock` は不正解）

## AIサービス（Transcribe / Textract / Rekognition / Comprehend / Q）

- 「発話完了前から解析」→ **Transcribe Streaming + Partial Results**（Batch はリアルタイム不可）
- 「コールセンター・通話分析・感情」→ **Transcribe Call Analytics** / Connect 通話に追加実装なし → **Contact Lens**
- 「専門用語の音声認識精度」→ **Custom Vocabulary** /「分野固有語・業界用語」→ **カスタム言語モデル** /「言語自動判定」→ バッチ言語識別
- 「スキャンPDF・画像からテキスト抽出」→ **Textract**
- 「動画をシーン分割・動画シーン検出」→ **Rekognition Video**（大量アーカイブはバッチ推論）
- 「センチメント分析」→ **Comprehend DetectSentiment** / PII検出 → **Comprehend DetectPiiEntities**（Macie は検出のみでマスキング不可）
- 「Lambda でPIIマスキング」= 内部で Comprehend を呼ぶ前提（マネージド活用）として読む
- Q Developer = IDEコーディング支援（補完/チャット/`/review`、提案のみ・決定は人間）/ Q Business = 社内ドキュメント検索チャットボット
- 「リポジトリ構成を変更せず組織全体に反映」→ **Q Developer カスタマイズ機能**（サービス側設定）
- 「クロスアカウントで検索アクセスを委譲」→ Q Business **Data Accessor ロール**
- 「マルチモーダル文書の構造化を自前パイプラインなしで」→ **Bedrock Data Automation**（ブループリント+信頼度）
- 「画像・動画を直接分析・カスタムモデル不要」→ **Bedrock マルチモーダルFM** / 可視化 → **QuickSight**（QuickSight Q は画像分析不可）

## 開発ツール・フロントエンド・統合パターン

- 「フロントエンド開発者がUI・認証・Bedrock接続を素早く」→ **Amplify**（宣言的・UI込み）/ インフラエンジニアのIaC → **CDK**
- 「GraphQL・リアルタイム・フロントからBedrock呼び出し」→ **AppSync**（Subscription=WebSocket、`useAIConversation` フック）
- 「DynamoDB + AppSync」→ カスタムResolver不要・最小実装 / 複雑ロジック → Lambda Resolver
- 「SaaS名（Salesforce等）が出たら」→ **AppFlow**（双方向同期）
- 「レガシー・既存メッセージング・移行」→ **Amazon MQ** /「新規・AWSネイティブ」→ SQS/SNS
- 「シンプルな正規化」→ **EventBridge（入力トランスフォーマー）** /「複雑な処理」→ Lambda
- 「オフラインファースト・モバイル」→ **Amplify DataStore**
- 「データを国外に出せない・オンプレ統合」→ **Outposts**（暗号化・VPNでも施設外に出るなら不正解）/「5G・エッジ・超低レイテンシ」→ **Wavelength**
- 「リアルタイム・高スループット・双方向・取引/金融/センサー」→ **Kinesis + WebSocket API** /「ミリ秒未満＋認証」→ IAM + VPCエンドポイント
- 「複数の解決策を実装前に評価」→ **ReAct + CoT** /「明確な制御階層」→ **スーパーバイザーパターン**
- 「顧客データからパーソナライズメール生成」→ Bedrock + Lambda /「セグメントに一斉配信」→ **Pinpoint**
- 「プロンプトのバージョン管理・劣化バージョン特定」→ **Bedrock Prompt Management**

## データ統合・パイプライン・設定管理

- 「統一システム＝一元管理・アクセス制御」→ **Lake Formation**（単一ストアに全部入れる、ではない）
- 「複数システム統合＋アクセス制御」→ **Lake Formation + Glue** /「単一検索窓口・セマンティック」→ OpenSearch
- 「データパイプライン・増分同期・ETL」→ **Glue**（クローラー+ETL+Data Quality で3要件を1サービス完結）
- 「リアルタイム変更検知・Webhook」→ **EventBridge + Lambda**
- オブジェクト単位のメタデータ付与のみ → **S3 メタデータ/タグで完結**（DynamoDB/Glue追加はオーバーエンジニアリング）
- AppConfig：「デプロイなしで動的設定」「段階的ロールアウト」「事前バリデーション」「自動ロールバック」「機能フラグ」→ **AppConfig**
  - Parameter Store は即時全反映・バリデーションなし / CodeDeploy はコード切替で設定値変更に不向き

## ガバナンス・IAM・コンプライアンス・データ保護

- M2M（サービス間）認証 → **IAM ロール + SigV4**（改ざん検知可）。Cognito は人間のユーザー向け（JWT/OAuth）
- 認証主体の識別：社員・内部ユーザー → **IAM Identity Center** / アプリユーザー・顧客 → **Cognito**
- 「既存IdP統合・長期認証情報を排除・一時的アクセス」→ **IAM Identity Center + SAML**（Lambda Authorizer はJWTのみでSTS一時認証情報を出せず引っかけ）
- 「きめ細かい認可・データ分類ベース」→ **Verified Permissions（+ Cedar）** /「AWSリソースへのアクセス」→ IAM
- 「JWTにカスタム情報追加」→ Cognito プレトークン生成 Lambda トリガー
- 「承認済みテンプレートをバージョン管理して部門配布・セルフサービス」→ **AWS Service Catalog**（ポートフォリオ・起動制約）
- 統制：予防的（事前にブロック）vs 検出的（事後に記録）。Config は構成記録+ルール評価、Control Tower はマルチアカウントのガードレール
- 「コンテナのセキュリティスキャン」→ **Inspector** /「コンプライアンス証明書のダウンロード」→ **Artifact** /「証拠の自動収集・監査レポート」→ **Audit Manager**
- 「オープンソース基盤モデルを使いたい」→ **SageMaker JumpStart**
- 「インターネット経由させない・プライベート接続」→ **PrivateLink（インターフェイスVPCエンドポイント）** /「オンプレ接続」→ Direct Connect + PrivateLink
- 「特定VPCエンドポイント経由のみ許可」→ `aws:SourceVpce` 条件キー
- 「列単位アクセス制御をクロスアカウント」→ **Lake Formation LF-Tag**（Athena WG・Glue リソースポリシーは列単位不可）
- 「複数リージョンで同じデータを復号」→ **KMS マルチリージョンキー** /「複数アカウントでリソース共有」→ **RAM**
- 「クロスアカウントで Bedrock KB を共有」→ リソースベースポリシー
- 「プロンプト・応答を長期保持・規制対応」→ Bedrock 呼び出しログ → **S3 + Object Lock（コンプライアンスモード）**（削除不可・改ざん防止）
- 「組織全体でAIデータのオプトアウトを強制」→ Organizations の **AI Services Opt-Out Policy** /「タグ書式統一」→ タグポリシー
- 「規制業界でデプロイ権限を分離」→ IAM ロールによる責務分離 + Step Functions 承認
- 「生成AIアプリのセキュリティフレームワーク」→ **OWASP Top 10 for LLM**（LLM専用設計のため優先）
- ネットワーク制御：パケット中身・ドメインフィルタ → **Network Firewall** / IP・ポート → SG・NACL / HTTP攻撃 → WAF

## 透明性・責任あるAI・人間関与

- 「AI生成であることを明示・信頼度表示・ソース引用」→ **透明性**（責任あるAIの柱）。Q Business は出典リンクをデフォルト表示
- 「信頼度しきい値で人間にハンドオフ」「専門家が後から精査・監査証跡」→ **A2I**（重要な決定ほどしきい値を高く 80〜90%）。全件手動承認・完全自律はどちらも不正解
- 「即時ブロック・リアルタイム制御」→ Guardrails /「後から確認・審査ワークフロー」→ A2I（Connect はコールセンターで引っかけ）
- 「承認待ちの間フローを安全に中断・監査永続」→ Step Functions Standard + waitForTaskToken /「アクション前にユーザー確認・対話的修正」→ Bedrock Agent HITL
- 「AIと人間の編集が衝突」→ 人間優先の競合解決 + AI変更の監査ログ（変更前後・モデル版・信頼度）
- 「AI導入の改善効果を証明」→ 導入前**ベースライン** + **A/B対照群** + **統計的有意性検定（p<0.05）**
- 「包括的コンプライアンス」の2択 → **Model Cards（文書化）+ Glue（データ追跡）**（Model Cards はリネージュ追跡ではない）
- 「モデルの来歴情報を追跡」→ **SageMaker Lineage Tracking** /「特性・用途・制約を文書化」→ **Model Cards** /「バイアス検出」→ **Clarify**
- 「AI出力の根拠・出典を記録」→ メタデータタグ付け + 構造化ログ（CloudWatch Logs / Glue Data Catalog）

## パフォーマンス最適化・検索・レイテンシー（Task 4.2）

- 「最小レイテンシー」+「DynamoDB」→ **DAX**（マイクロ秒。DynamoDB専用インメモリキャッシュ）
- RedshiftはDWH（分析用）≠ Redis（キャッシュ）：読み間違い注意
- 「体感レイテンシー改善」→ **ストリーミング**（実際の処理時間は変わらない）/「実際の処理時間短縮」→ **Step Functions Parallel State**
- 「ハイブリッド検索」= ベクトル検索（意味）+ BM25（キーワード）の組み合わせ（OpenSearch）
- 「鮮度・権威スコアのカスタムスコアリング」→ **OpenSearch直接クエリ**（KB Retrieve APIでは不可）
- 「複雑なワークフロー・並列＋マージ・分岐」→ **Step Functions** /「大量リクエストの流量制御・キューイング」→ **SQS**
- HNSWパラメータはインデックス作成時に決まる（後から変更は再インデックス必要）
- 「階層型チャンキング」→ **Bedrock KB の構築設定**（KB作成フェーズの判断・後から変更不可）
- top-p = 累積確率で適応的に絞る（top-kより汎用）/ temperature=0 = 決定論的出力

## コスト最適化・キャッシュ・スケーリング（Task 4.1）

- 「モデル呼び出しメトリクスでオートスケール」→ **プロビジョンドスループット**（EC2/Lambda/SageMakerは不正解。Bedrockはフルマネージド）
- Bedrockオンデマンド = AWSが完全自動スケール（設定不要）/ プロビジョンドスループット = MU購入で保証スループット確保
- 「定型・FAQ・完全一致クエリのキャッシュ」→ **CloudFront エッジキャッシュ**（決定論的ハッシュ・完全一致のみ）
- 「類似クエリのキャッシュ」→ **セマンティックキャッシュ（OpenSearch）**（embedding類似度で判定・FMを呼ばない）
- 「結果フィンガープリンティング」→ **出力ハッシュで重複排除**（HIT判定はしない。保存フェーズのDB効率化が主目的）
- キャッシュHIT判定の順序：L1（CloudFront/完全一致）→ L2（ElastiCache/完全一致）→ L3（OpenSearch/類似）→ FM呼び出し
- 「コスト配分追跡・機能別コスト可視化」→ **Cost Explorer + タグ戦略**（bedrock:feature/team/env タグを付与）
- 「エラー時にサービスを継続」→ **モデルフォールバック**（Fable5→Sonnet→Haiku の段階切替。可用性優先）
- 「エージェント暴走・無限ループ防止」→ **停止条件**（Bedrockエージェント: maxSessionDuration / Step Functions: TimeoutSeconds）
- 「プロンプト最適化の自動化」→ **Step Functions**（チューニングフェーズ専用。本番リクエスト処理には使わない）
- 「トークン使用量を削減しながら品質維持」→ **コンテキストプルーニング**（「常に最小サイズ」は品質犠牲で誤り）

## モデル選択・ファインチューニング

- 「コスト効率よくドメイン特化」→ **LoRA / PEFT** /「最高精度・コスト度外視」→ **Full Fine-tuning** /「モデルを変えたくない」→ **RAG / プロンプトエンジニアリング**
- 「指示追従の改善」→ インストラクションチューニング /「ドメイン知識・専門用語の追加」→ 継続事前学習
- Nova Micro = テキスト専用（画像・動画不可）
- 「汎用埋め込み」が不正解な理由 = パラメータ調整の余地がなくAWS統合・スケールもない（Titan Embeddings V2 はFT非対応）
