# AWS AIP 学習ノート

AWS Certified AI Practitioner（AIP-C01）受験のために整理した学習メモです。

## 毎日の動線

1. **朝イチ**: [daily/](./daily/) の昨日のファイルを読む（2分）。「明日の自分へ」欄から再開する
2. **学習中**: 追記は Claude Code に依頼（CLAUDE.md のルールで3層に自動振り分け）
3. **模試後**: [exam/mistakes.md](./exam/mistakes.md) に回収し、判断ルールを [exam/cheatsheet.md](./exam/cheatsheet.md) に転記
4. **試験直前**: [exam/cheatsheet.md](./exam/cheatsheet.md) → [exam/traps.md](./exam/traps.md) → [exam/mistakes.md](./exam/mistakes.md) の順に見直す

## 構成（3層）

| 層 | 持つ情報 | 持たない情報 |
|----|---------|------------|
| [daily/](./daily/) | その日やった範囲の3行サマリー + topics へのリンク（1日1ファイル・30行上限） | 知識の本文 |
| [exam/](./exam/) | 判断ルール・引っかけ・ミスパターン | サービスの詳細説明 |
| [topics/](./topics/) | サービスの機能・ユースケース・比較表 | 日付タグ・「〜学習分」見出し |

### topics/ の内訳

- **[bedrock_core.md](./topics/bedrock_core.md)** — InvokeModel API・推論パラメータ・ストリーミング・マルチターン対話・PT vs オンデマンド
- **[bedrock_resilience.md](./topics/bedrock_resilience.md)** — 障害耐性・クロスリージョン推論・プロンプトキャッシング・ルーティング・モデルカスケード
- **[bedrock_agents.md](./topics/bedrock_agents.md)** — Bedrock Agents / AgentCore / MCP / マルチエージェント / Q Developer カスタマイズ
- **[bedrock_rag.md](./topics/bedrock_rag.md)** — RAG構成・ベクトルストア選定・チャンキング・GraphRAG・ソース帰属
- **[bedrock_guardrails_eval.md](./topics/bedrock_guardrails_eval.md)** — ガードレール・Bedrock Evaluations・LLM-as-a-judge・A2I
- **[ai_services.md](./topics/ai_services.md)** — Transcribe / Textract / Rekognition / Comprehend / Q Business
- **[orchestration.md](./topics/orchestration.md)** — Step Functions / Lambda / SQS / HITL承認フロー
- **[security_governance.md](./topics/security_governance.md)** — IDフェデレーション / Verified Permissions / KMS / PrivateLink
- **[sagemaker_mlops.md](./topics/sagemaker_mlops.md)** — SageMaker / MLOps / モデル最適化 / KVキャッシュ
- **[enterprise_integration.md](./topics/enterprise_integration.md)** — AppFlow / Amazon MQ / EventBridge / AppSync / Amplify
- **[monitoring_observability.md](./topics/monitoring_observability.md)** — CloudWatch / X-Ray / Bedrockモニタリング比較
- **[data_pipeline_integration.md](./topics/data_pipeline_integration.md)** — Glue / S3メタデータ / RAG前処理
- **[aws_appconfig.md](./topics/aws_appconfig.md)** — AppConfig 動的設定管理
- **[glossary_buzzwords.md](./topics/glossary_buzzwords.md)** — 用語集

## まとめ方の方針

- 単なる用語説明ではなく「**試験で何を判定キーワードに選ぶか**」を残す
- 似たサービスは比較表で並べる
- 1ファイル800行を超えたら分割を検討する

## ライセンス

学習用の個人メモです。内容の正確性は AWS 公式ドキュメントを確認してください。
