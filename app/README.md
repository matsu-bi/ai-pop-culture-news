# AI Pop Culture News - Minimal MVP

ローカルで `npm start` を実行すると、TechCrunch AIカテゴリの最新記事を取得し、日本語要約をHTMLファイルに保存します。

## 機能

1. **RSS取得**: TechCrunch AI カテゴリの最新記事を1件取得
2. **本文抽出**: Readabilityで本文を抽出（失敗時はタイトルのみで継続）
3. **日本語生成**: OpenAI GPT-4で「短いリード+事実箇条書き(5-7)」を生成
4. **HTML出力**: `./out/latest.html` に結果を保存

## セットアップ

```bash
cd app
npm install
```

## 実行方法

### 基本実行（TechCrunch AI RSS）
```bash
OPENAI_API_KEY="your-api-key-here" npm start
```

### カスタムフィード指定
```bash
OPENAI_API_KEY="your-api-key-here" FEED_URL="https://www.engadget.com/rss.xml" npm start
```

## 環境変数

- **必須**: `OPENAI_API_KEY` - OpenAI APIキー
- **任意**: `FEED_URL` - RSSフィードURL（デフォルト: TechCrunch AI）

## 出力

実行後、`./out/latest.html` に以下の内容が生成されます：

- 記事タイトル
- 日本語リード文（2〜3文、最大200字）
- 事実の箇条書き（5〜7項目）
- 出典情報（媒体名、公開日、リンク）

## 処理ステップ

1. 📥 RSS フィード取得
2. 📖 記事本文抽出（Readability）
3. 🤖 日本語要約生成（OpenAI GPT-4）
4. 💾 HTML ファイル保存

エラー時は、どの段階で失敗したかが標準出力で確認できます。

## 技術スタック

- Node.js + TypeScript
- RSS Parser
- Mozilla Readability
- OpenAI GPT-4
- JSDOM

## 制限事項

- WordPress連携なし
- データベースなし
- スケジューラーなし
- サムネイル生成なし
- SNS連携なし

シンプルな RSS → 日本語要約 → HTML 出力のみに特化した最小MVPです。
