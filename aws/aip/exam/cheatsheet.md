# 直前見直しチートシート

1行 = 1判断ルール。試験前夜に15分で全部読める分量（300行）を上限とする。
[mistakes.md](./mistakes.md) に追記したら、導出した判断ルールをここにも1行転記する。

## 大原則

- **"Bedrock Way"**: 2択で迷ったらマネージドサービス側（自前実装・自前運用の選択肢は大抵不正解）
- 「管理コンポーネント最小限」と言われたら、構成要素の**数**を数える（少ない方が正解）
- DynamoDB 等への独自ログ記録はほぼ冗長 → サービスネイティブのログ機能（CloudWatch Logs）で足りる

## Bedrock コア・API

- レスポンスストリーミングが要件 → **Lambda Function URL（RESPONSE_STREAM）**。API Gateway HTTP API は非対応（AIP-25）
- サービス間（M2M）の API 認証 → **IAM ロール + SigV4**。Cognito は人間のユーザー向け（AIP-25）

## RAG・Knowledge Base

- リアルタイムデータ（空室状況等）→ KB 同期ではなく**アクショングループで API 直呼び**（AIP-27）
- 組織の AWS リソースアクセス制御 → Cognito ではなく **IAM Identity Center の許可セット**（AIP-27）
- KB の上限は約10個 → テナント/拠点が多い場合はメタデータフィルタを検討（AIP-27）
- Kendra の関連性スコアは検索の確信度であって評価メトリクスではない（AIP-79）

## ガードレール・評価

- 「過剰ブロックを避けつつ」「UX低下を防ぐ」→ コンテンツフィルター強度は**中**
- PII フィルター: 入力は **BLOCK**、出力は **MASK**（入力と出力で別アクション設定可）
- ガードレールのログはデフォルト OFF → モデル呼び出しログ記録を明示的に有効化
- CloudWatch Synthetics は外形監視。LLM 出力の品質評価には使わない（AIP-79）

## Q Developer / Q Business

- 「リポジトリ構成を変更せず」組織全体に反映 → **Q Developer カスタマイズ機能**（サービス側設定 = リポジトリ変更ゼロ）（AIP-23）
- Q Developer = IDE のコーディング支援 / Q Business = 社内ドキュメント検索チャットボット
