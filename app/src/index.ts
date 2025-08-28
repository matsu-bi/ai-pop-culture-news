import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

interface ArticleSummary {
  title: string;
  lead_ja: string;
  facts: string[];
  source_name: string;
  source_url: string;
  published_date: string;
}

class RSSToHTMLGenerator {
  private parser: Parser;
  private openai: OpenAI;
  private feedUrl: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({ apiKey });
    this.parser = new Parser();
    this.feedUrl = process.env.FEED_URL || 'https://techcrunch.com/category/artificial-intelligence/feed/';

    console.log(`🚀 Starting RSS to HTML generator`);
    console.log(`📡 Feed URL: ${this.feedUrl}`);
  }

  async run(): Promise<void> {
    try {
      console.log('\n📥 Step 1: Fetching RSS feed...');
      const latestArticle = await this.fetchLatestArticle();

      console.log('\n📖 Step 2: Extracting article content...');
      const content = await this.extractContent(latestArticle.link);

      console.log('\n🤖 Step 3: Generating Japanese summary...');
      const summary = await this.generateSummary(latestArticle, content);

      console.log('\n💾 Step 4: Saving to HTML file...');
      await this.saveToHTML(summary);

      console.log('\n✅ Complete! Check ./out/latest.html');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async fetchLatestArticle(): Promise<any> {
    try {
      const feed = await this.parser.parseURL(this.feedUrl);

      if (!feed.items || feed.items.length === 0) {
        throw new Error('No articles found in RSS feed');
      }

      const latest = feed.items[0];
      console.log(`   📰 Found: "${latest.title}"`);
      console.log(`   🔗 URL: ${latest.link}`);

      return latest;
    } catch (error) {
      throw new Error(`Failed to fetch RSS feed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async extractContent(url: string): Promise<string> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const dom = new JSDOM(html);
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      if (!article || !article.textContent) {
        console.log('   ⚠️  Readability extraction failed, using title only');
        return '';
      }

      console.log(`   📝 Extracted ${article.textContent.length} characters`);
      return article.textContent;
    } catch (error) {
      console.log(`   ⚠️  Content extraction failed: ${error instanceof Error ? error.message : error}`);
      return '';
    }
  }

  private async generateSummary(article: any, content: string): Promise<ArticleSummary> {
    const system = `あなたは日本語編集者です。直訳せず、ライトユーザー向けに簡潔で分かりやすく書きます。固有名詞・日付・数値は原文に一致させ、主観や誇張はしないでください。JSONだけを出力してください。`;

    const user = `以下の英語記事を基に日本語で要約してください。

記事タイトル: ${article.title}
記事本文: ${content || '本文抽出に失敗したため、タイトルのみで要約してください。'}

出力形式（JSONのみ）:
{
  "lead_ja": "2〜3文（最大200字）、敬体で要約",
  "facts": ["項目1", "項目2", "項目3", "項目4", "項目5"]
}`;

    try {
      // モデルは .env の MODEL を優先。なければ gpt-4o-mini をデフォルト。
      const model = process.env.MODEL || 'gpt-4o-mini';

      const resp = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.2,
        max_tokens: 600,
        // JSONを強制
        response_format: { type: 'json_object' }
      });

      const contentStr = resp.choices[0]?.message?.content?.trim();
      if (!contentStr) throw new Error('Empty response from model');

      let parsed: { lead_ja: string; facts: string[] };
      try {
        parsed = JSON.parse(contentStr);
      } catch {
        // 念のためのフォールバック（JSONでない場合）
        const safe = contentStr.match(/\{[\s\S]*\}$/)?.[0] || '{}';
        parsed = JSON.parse(safe);
      }

      if (!parsed.lead_ja || !Array.isArray(parsed.facts)) {
        throw new Error('Invalid JSON schema from model');
      }

      return {
        title: article.title,
        lead_ja: parsed.lead_ja,
        facts: parsed.facts.slice(0, 7),
        source_name: 'TechCrunch',
        source_url: article.link,
        published_date: article.pubDate
          ? new Date(article.pubDate).toLocaleDateString('ja-JP')
          : '不明'
      };
    } catch (err: any) {
      // モデル404/権限エラー時のガイド
      if (typeof err.message === 'string' && /model .* does not exist|404/i.test(err.message)) {
        throw new Error(
          `Failed to generate summary: ${err.message}. 別モデルを指定してください（例: MODEL=gpt-4o-mini）。`
        );
      }
      throw new Error(`Failed to generate summary: ${err.message || err}`);
    }
  }

  private async saveToHTML(summary: ArticleSummary): Promise<void> {
    const template = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${this.escapeHtml(summary.title)}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
.lead { font-size: 1.2em; color: #333; margin: 20px 0; }
.facts { background: #f5f5f5; padding: 20px; border-radius: 8px; }
.facts li { margin: 8px 0; }
.source { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
</style>
</head>
<body>
<h1>${this.escapeHtml(summary.title)}</h1>
<p class="lead">${this.escapeHtml(summary.lead_ja)}</p>
<ul class="facts">
${summary.facts.map(fact => `  <li>${this.escapeHtml(fact)}</li>`).join('\n')}
</ul>
<hr/>
<p class="source">Source: ${this.escapeHtml(summary.source_name)} (${summary.published_date}) <a href="${summary.source_url}">link</a></p>
</body>
</html>`;

    const outDir = path.join(process.cwd(), 'out');
    await fs.mkdir(outDir, { recursive: true });

    const filePath = path.join(outDir, 'latest.html');
    await fs.writeFile(filePath, template, 'utf-8');

    console.log(`   💾 Saved to: ${filePath}`);
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new RSSToHTMLGenerator();
  generator.run();
}
