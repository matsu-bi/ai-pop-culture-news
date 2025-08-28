import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

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
    const prompt = `あなたは日本語編集者です。以下の英語記事を基に、日本語で要約を作成してください。

記事タイトル: ${article.title}
記事本文: ${content || '本文抽出に失敗したため、タイトルのみで要約してください。'}

以下の形式でJSONを返してください：
- lead_ja: 2〜3文（最大200字）。直訳せず、ライトユーザー向けに簡潔に要約。敬体で。
- facts: 5〜7項目の箇条書き。固有名詞/日付/数値は原文準拠。主観・誇張禁止。

{
  "lead_ja": "...",
  "facts": ["...", "...", "..."]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1000
      });

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No response from OpenAI');
      }

      console.log(`   🤖 Generated summary (${result.length} chars)`);
      
      const parsed = JSON.parse(result);
      
      return {
        title: article.title,
        lead_ja: parsed.lead_ja,
        facts: parsed.facts,
        source_name: 'TechCrunch',
        source_url: article.link,
        published_date: article.pubDate ? new Date(article.pubDate).toLocaleDateString('ja-JP') : '不明'
      };
    } catch (error) {
      throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : error}`);
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
