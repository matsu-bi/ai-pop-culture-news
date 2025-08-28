import Parser from 'rss-parser';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

interface ArticleSection {
  h2: string;
  paragraphs: string[];
  bullets?: string[];
  quotes?: Array<{ quote: string; source?: string }>;
}

interface ArticleFAQ {
  q: string;
  a: string;
}

interface ArticleSummary {
  title: string;
  lead_ja: string;
  sections: ArticleSection[];
  takeaway: string;
  facts: string[];
  faqs?: ArticleFAQ[];
  keywords?: string[];
  slug?: string;
  meta_description?: string;
  source_name: string;
  source_url: string;
  published_date: string;
}

class RSSToHTMLGenerator {
  private parser: Parser;
  private openai: OpenAI;
  private feedUrl: string;
  private model: string;
  private baseURL: string;

  constructor() {
    // Ollama-compatible OpenAI client (ローカル推奨)
    this.baseURL = process.env.BASE_URL || 'http://localhost:11434/v1';
    this.model = process.env.MODEL || 'qwen2.5:14b-instruct';

    this.openai = new OpenAI({
      apiKey: 'local-only',
      baseURL: this.baseURL
    });

    this.parser = new Parser();
    this.feedUrl = process.env.FEED_URL || 'https://techcrunch.com/category/artificial-intelligence/feed/';

    console.log(`🚀 Starting RSS to HTML generator`);
    console.log(`📡 Feed URL: ${this.feedUrl}`);
    console.log(`🤖 Using local model: ${this.model} @ ${this.baseURL}`);
  }

  async run(): Promise<void> {
    try {
      console.log('\n🔍 Step 0: Checking Ollama connection...');
      await this.checkOllamaHealth();

      console.log('\n📥 Step 1: Fetching RSS feed...');
      const latestArticle = await this.fetchLatestArticle();

      console.log('\n📖 Step 2: Extracting article content...');
      const content = await this.extractContent(latestArticle.link);

      console.log('\n🤖 Step 3: Generating Japanese summary...');
      let summary = await this.generateSummary(latestArticle, content);

      // ==== 分量しきい値：最低1400字以上。最大2回まで拡張 ====
      let bodyChars = this.countBodyChars(summary);
      let attempts = 0;
      const MIN_BODY_CHARS = 1400;

      while (bodyChars < MIN_BODY_CHARS && attempts < 2) {
        console.log(`   ✍️ Article too short (${bodyChars} chars). Expanding...`);
        summary = await this.expandIfTooShort(summary, content, latestArticle, { targetMin: 1600, targetMax: 2100 });
        bodyChars = this.countBodyChars(summary);
        console.log(`   ✨ Expanded length: ${bodyChars} chars`);
        attempts++;
      }

      if (bodyChars >= MIN_BODY_CHARS) {
        console.log(`   ✅ Length OK (${bodyChars} chars)`);
      } else {
        console.log(`   ⚠️ Still short after expansions (${bodyChars} chars). Proceeding anyway.`);
      }

      console.log('\n💾 Step 4: Saving to HTML file...');
      await this.saveToHTML(summary);

      console.log('\n✅ Complete! Check ./out/*.html');
    } catch (error) {
      console.error('\n❌ Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  private async checkOllamaHealth(): Promise<void> {
    try {
      const fetch = (await import('node-fetch')).default;
      const modelsUrl = `${this.baseURL.replace('/v1', '')}/api/tags`;

      console.log(`   🔗 Checking connection to ${this.baseURL}...`);
      const response = await fetch(modelsUrl);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as { models: Array<{ name: string }> };
      const availableModels = data.models?.map((m) => m.name) || [];

      console.log(`   ✅ Connected to Ollama (${availableModels.length} models available)`);

      if (!availableModels.some((name) => name.startsWith(this.model.split(':')[0]))) {
        console.error(`\n❌ Model "${this.model}" is not available.`);
        console.error(`Available models: ${availableModels.join(', ')}`);
        console.error(`\n💡 To install the model, run: ollama pull ${this.model}`);
        process.exit(1);
      }

      console.log(`   ✅ Model "${this.model}" is available`);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('ECONNREFUSED') || error.message.includes('failed, reason:'))
      ) {
        console.error(`\n❌ Cannot connect to Ollama server at ${this.baseURL}`);
        console.error(`💡 Make sure Ollama is running: ollama serve`);
        process.exit(1);
      }
      throw error;
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
    const system = `
あなたは日本語のテック系編集者/SEOライター。
文体は常体（だ・である調）。です・ます調は禁止。
直訳は避け、誇張と推測は不可。固有名詞・日付・数値は原文に一致。
出力は有効なJSONのみ（前置き・コードフェンス禁止）。
`.trim();

    const user = `
英語記事を基に「読み応えのある日本語ブログ記事」のJSONを出力する。
目標長: 本文合計 **1600〜2100** 文字。各段落 **140〜220** 文字。最低 **4 セクション**・各 **2 段落以上**。
見出し（h2）は内容に最適な日本語で可変。固定章名に拘らない。
**同一内容の繰り返し禁止**（同一/類似文・7語以上のn-gramを繰り返さない）。
**具体固有名詞・数値・日付を最低5件**含める（投資家・拠点・導入業界・展開形態・競合など）。
**比較章を1つ必須**（RPA/競合：例 CrewAI 等、差分を箇条書き1つ以上）。
**結論は実務的示唆で締める**（導入場面、監査/説明責任、オンプレの意味 等）。
文体は常体（です・ます禁止）。煽り語禁止。原文準拠。

要件:
- lead_ja: 250〜350字
- sections: 4章（例：背景 / 発表の要点 / 技術と実装 / 位置づけ・比較 / 今後の展望 から4つ選ぶ）
  各章は2〜4段落。必要なら bullets/quotes を追加可
- takeaway: 140〜200字（実務的示唆）
- facts: 6〜8項（検証可能な事実）
- keywords: 4〜8個
- slug: 英小文字とハイフン
- faqs: 3〜4項（導入形態、対象業務、監査・説明責任、RPAとの併用 等）

入力:
タイトル: ${article.title}
本文: ${content || '本文抽出失敗: タイトルのみで最小限を作成'}

出力（JSONのみ。コードフェンス禁止）:
{
  "lead_ja": "...",
  "sections": [
    {"h2":"...","paragraphs":["...","..."],"bullets":["..."],"quotes":[{"quote":"...","source":"..."}]}
  ],
  "takeaway": "...",
  "facts": ["...","...","...","...","...","..."],
  "keywords": ["...","...","...","..."],
  "slug": "ai-startup-raises-25m",
  "faqs": [{"q":"...","a":"..."}]
}
`.trim();

    const toArray = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);
    const normSections = (secs: any): ArticleSection[] => {
      if (!Array.isArray(secs)) return [];
      return secs
        .map((sec: any) => ({
          h2: String(sec?.h2 || '').trim() || 'セクション',
          paragraphs: toArray(sec?.paragraphs).map((p: any) => String(p || '').trim()).filter(Boolean).slice(0, 6),
          bullets: toArray(sec?.bullets).map((b: any) => String(b || '').trim()).filter(Boolean).slice(0, 10),
          quotes: toArray(sec?.quotes)
            .map((q: any) => {
              const qq = String(q?.quote || '').trim();
              if (!qq) return null;
              return { quote: qq, source: q?.source ? String(q.source) : undefined };
            })
            .filter(Boolean) as Array<{ quote: string; source?: string }>
        }))
        .filter((s) => s.paragraphs.length);
    };

    const model = this.model;

    // 1st try: JSON object 強制
    let rawStr: string | undefined;
    try {
      const r1 = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.22,
        max_tokens: 1600,
        response_format: { type: 'json_object' } as any
      });
      rawStr = r1.choices[0]?.message?.content?.trim();
    } catch {
      // fallthrough
    }

    // 2nd try: 非強制
    if (!rawStr) {
      const r2 = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system + ' JSON以外は一切出力しないこと。' },
          { role: 'user', content: user }
        ],
        temperature: 0.22,
        max_tokens: 1600
      });
      rawStr = r2.choices[0]?.message?.content?.trim();
    }
    if (!rawStr) throw new Error('No response from model');

    // Parse or sanitize
    let raw: any;
    try {
      raw = JSON.parse(rawStr);
    } catch {
      const sanitized = this.parseJsonLoose(rawStr);
      if (sanitized) {
        try {
          raw = JSON.parse(sanitized);
        } catch {}
      }
    }

    // Try a JSON fix pass if still invalid
    if (!raw) {
      const fixPrompt = `
次のテキストを有効なJSONだけに整形して返す。前置き/コードフェンスは禁止。
スキーマ: { lead_ja:string, sections:Array<{h2:string,paragraphs:string[],bullets?:string[],quotes?:Array<{quote:string,source?:string}>}>, takeaway:string, facts:string[], keywords:string[], slug:string, faqs:Array<{q:string,a:string}> }
テキスト:
${rawStr}`.trim();

      let fixStr: string | undefined;
      try {
        const r3 = await this.openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: '有効なJSONのみを返すJSON整形器。' },
            { role: 'user', content: fixPrompt }
          ],
          temperature: 0,
          max_tokens: 900,
          response_format: { type: 'json_object' } as any
        });
        fixStr = r3.choices[0]?.message?.content?.trim();
      } catch {
        const r4 = await this.openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: '有効なJSONのみを返すJSON整形器。' },
            { role: 'user', content: fixPrompt }
          ],
          temperature: 0,
          max_tokens: 900
        });
        fixStr = r4.choices[0]?.message?.content?.trim();
      }

      if (fixStr) {
        try {
          raw = JSON.parse(fixStr);
        } catch {
          const san2 = this.parseJsonLoose(fixStr);
          if (san2) raw = JSON.parse(san2);
        }
      }
    }

    // Fallback
    if (!raw) {
      const fallback: ArticleSummary = {
        title: article.title,
        lead_ja: '本記事の要点を簡潔に整理する。',
        sections: this.ensureMinimumSections([
          {
            h2: '背景と文脈',
            paragraphs: [
              content ? content.slice(0, 400) : '本文抽出に失敗。ポイントのみ記す。',
              '関連する前提を短く補う。'
            ]
          }
        ]),
        takeaway: '重要点を短くまとめる。',
        facts: [],
        source_name: 'TechCrunch',
        source_url: article.link,
        published_date: article.pubDate ? new Date(article.pubDate).toLocaleDateString('ja-JP') : '不明',
        keywords: [],
        slug: this.slugify(article.title),
        meta_description: undefined
      };
      return this.dedupeParagraphs(fallback);
    }

    const toFactsArray = (arr: any) => toArray(arr).map((f: any) => String(f || '').trim()).filter(Boolean).slice(0, 8);

    const lead = String(raw?.lead_ja || '').trim();
    const facts = toFactsArray(raw?.facts);
    let sections: ArticleSection[] = normSections(raw?.sections);
    let takeaway = String(raw?.takeaway || '').trim();

    if (!sections.length && facts.length) {
      sections = [
        { h2: '要点の整理', paragraphs: [lead || '要点を整理する。', '事実関係を短く確認する。'], bullets: facts }
      ];
    }

    sections = this.ensureMinimumSections(sections);
    if (!takeaway && lead) takeaway = lead.slice(0, 180);

    const summary: ArticleSummary = {
      title: article.title,
      lead_ja: lead || '本記事の要点を簡潔に整理する。',
      sections,
      takeaway,
      facts: facts.length ? facts : ['主要な論点を整理した。'],
      faqs: Array.isArray(raw?.faqs)
        ? raw.faqs
          .map((f: any) => ({ q: String(f?.q || '').trim(), a: String(f?.a || '').trim() }))
          .filter((f: any) => f.q && f.a)
          .slice(0, 4)
        : undefined,
      keywords: toArray(raw?.keywords).map((k: any) => String(k || '').trim()).filter(Boolean).slice(0, 8),
      slug: (raw?.slug && String(raw.slug).trim()) || this.slugify(article.title),
      meta_description: String(raw?.meta_description || '').trim() || lead.slice(0, 150),
      source_name: 'TechCrunch',
      source_url: article.link,
      published_date: article.pubDate ? new Date(article.pubDate).toLocaleDateString('ja-JP') : '不明'
    };

    return this.dedupeParagraphs(summary);
  }

  // ---- 拡張パス（1600〜2100字狙い・重複禁止・比較章必須） ----
  private async expandIfTooShort(
    s: ArticleSummary,
    content: string,
    article: any,
    opts: { targetMin: number; targetMax: number } = { targetMin: 1600, targetMax: 2100 }
  ): Promise<ArticleSummary> {
    const model = this.model;
    const { targetMin, targetMax } = opts;

    const system = `あなたは日本語のテック系編集者。文体は常体（だ・である調）。です・ますは禁止。見出しは可変。JSONのみ。`;
    const user = `
次のJSON記事を、本文合計 **${targetMin}〜${targetMax}** 文字を目安に各セクションの段落を増やして拡張する。
- 章構成（h2）は可変。必要なら章を追加してよい（最大5章）。
- 各段落は **140〜220** 文字。
- **重複禁止**（同一/類似文・7語以上のn-gramを繰り返さない）。
- **固有名詞・数値・日付を最低5件**明示（投資家名/拠点/導入業界/展開形態/競合 など）。
- **比較章を1つ含める**（RPA/競合：例 CrewAI 等、差分を箇条書き1つ以上）。
- facts と矛盾しない。数値・固有名詞・日付は原文準拠。
- 文体は常体（です・ます禁止）。煽り語禁止。
- 返答は同じスキーマのJSONのみ。

原文タイトル: ${article.title}
参考本文: ${content ? content.slice(0, 2500) : '（本文抽出なし）'}
既存JSON:
${JSON.stringify(s)}
`.trim();

    let resp: string | undefined;
    try {
      const r = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: 0.25,
        max_tokens: 1800,
        response_format: { type: 'json_object' } as any
      });
      resp = r.choices[0]?.message?.content?.trim();
    } catch {
      const r2 = await this.openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system + ' JSON以外は出力しないこと。' },
          { role: 'user', content: user }
        ],
        temperature: 0.25,
        max_tokens: 1800
      });
      resp = r2.choices[0]?.message?.content?.trim();
    }
    if (!resp) return s;

    let expanded: ArticleSummary | null = null;
    try {
      expanded = JSON.parse(resp) as ArticleSummary;
    } catch {
      const sanitized = this.parseJsonLoose(resp);
      if (sanitized) expanded = JSON.parse(sanitized) as ArticleSummary;
    }
    if (!expanded) return s;

    expanded.sections = this.ensureMinimumSections(expanded.sections);
    expanded = this.dedupeParagraphs(expanded);
    const chars = this.countBodyChars(expanded);
    console.log(`   ✨ Expanded length: ${chars} chars`);
    return expanded;
  }

  // ---- セクション最低担保（見出しは可変。足りないときだけ汎用見出しを追加） ----
  private ensureMinimumSections(sections: ArticleSection[] = []): ArticleSection[] {
    const base: ArticleSection[] = (sections || []).map((s) => ({
      h2: (s.h2 || 'セクション').trim(),
      paragraphs: Array.isArray(s.paragraphs) ? s.paragraphs.filter(Boolean) : [],
      bullets: Array.isArray(s.bullets) ? s.bullets.filter(Boolean) : undefined,
      quotes: Array.isArray(s.quotes) ? (s.quotes.filter(Boolean) as any) : undefined
    }));

    // 各セクション最低2段落
    for (const sec of base) {
      sec.paragraphs = sec.paragraphs || [];
      while (sec.paragraphs.length < 2) {
        sec.paragraphs.push('補足の段落。要点を短く整理する。');
      }
    }

    // 章が不足時のみ汎用見出しを補う（固定名の強制はしない）
    const fallbacks = ['背景と文脈', '要点の整理', '影響と含意', '今後の展望'];
    let i = 0;
    while (base.length < 4 && i < fallbacks.length) {
      const title = fallbacks[i++];
      if (!base.find((s) => s.h2.includes(title))) {
        base.push({
          h2: title,
          paragraphs: ['背景や前提を整理する。', '論点の位置づけを簡潔に示す。']
        });
      }
    }

    // 最大5章まで
    return base.slice(0, 5);
  }

  // ---- 段落の簡易デデュープ（同一テキストの連発を抑制） ----
  private dedupeParagraphs(s: ArticleSummary): ArticleSummary {
    const seen = new Set<string>();
    for (const sec of s.sections || []) {
      sec.paragraphs = (sec.paragraphs || []).filter((p) => {
        const key = p.replace(/\s+/g, ' ').trim().toLowerCase();
        if (key.length < 30) return true; // 短文は許容
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return s;
  }

  // ---- 本文文字数カウント ----
  private countBodyChars(s: ArticleSummary): number {
    const text = [s.lead_ja || '', ...((s.sections || []).flatMap((sec) => sec.paragraphs || [])), s.takeaway || ''].join(
      ''
    );
    return text.replace(/\s+/g, '').length;
  }

  // ---- HTML保存（出力先は ./out に固定） ----
  private async saveToHTML(s: ArticleSummary) {
    const keywords = (s.keywords?.length ? s.keywords : this.deriveKeywords(s)).slice(0, 8);
    const desc = s.meta_description?.slice(0, 160) || s.lead_ja.slice(0, 150);
    const title = s.title || 'AIニュース';
    const canonical = s.source_url;

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: desc,
      datePublished: s.published_date || undefined,
      author: { '@type': 'Organization', name: s.source_name || 'TechCrunch' },
      mainEntityOfPage: canonical,
      url: canonical
    };

    const minutes = this.estimateMinutes([s.lead_ja, ...s.sections.flatMap((x) => x.paragraphs)].join(' '));

    const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${this.escapeHtml(title)}</title>
<meta name="description" content="${this.escapeHtml(desc)}">
${keywords.length ? `<meta name="keywords" content="${this.escapeHtml(keywords.join(', '))}">` : ''}
<link rel="canonical" href="${canonical}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="${this.escapeHtml(title)}">
<meta property="og:description" content="${this.escapeHtml(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:840px;margin:0 auto;padding:28px;line-height:1.9}
.lead{font-size:1.1rem;color:#222;background:#f7f7f9;padding:16px 18px;border-left:4px solid #7a7aff;border-radius:6px}
.meta{color:#666;font-size:.9rem;margin-bottom:10px}
article h2{margin-top:2rem}
article h3{margin-top:1.2rem}
blockquote{margin:1rem 0;padding:.6rem 1rem;border-left:4px solid #ddd;background:#fbfbfb}
.facts{background:#fafafa;padding:16px;border-radius:8px}
.toc{background:#fcfcff;border:1px solid #eee;padding:12px 14px;border-radius:8px}
footer.source{margin-top:32px;color:#666;font-size:.9rem}
</style>
</head>
<body>
<article>
  <header>
    <h1>${this.escapeHtml(title)}</h1>
    <p class="meta">想定読了 ${minutes} 分・公開: ${s.published_date}・出典: ${this.escapeHtml(s.source_name)}</p>
    <p class="lead">${this.escapeHtml(s.lead_ja)}</p>
  </header>

  ${this.renderTOC(s.sections)}

  ${s.sections
      .map(
        (sec) => `
    <section id="${this.anchor(sec.h2)}">
      <h2>${this.escapeHtml(sec.h2)}</h2>
      ${sec.paragraphs.map((p) => `<p>${this.escapeHtml(p)}</p>`).join('')}
      ${sec.bullets?.length ? `<ul>${sec.bullets.map((b) => `<li>${this.escapeHtml(b)}</li>`).join('')}</ul>` : ''}
      ${sec.quotes?.length
          ? sec.quotes
            .map(
              (q) => `
        <blockquote>
          “${this.escapeHtml(q.quote)}”${q.source ? ` — ${this.escapeHtml(q.source)}` : ''}
        </blockquote>`
            )
            .join('')
          : ''}
    </section>
  `
      )
      .join('')}

  <section>
    <h2>要点まとめ</h2>
    <ul class="facts">
      ${s.facts.map((f) => `<li>${this.escapeHtml(f)}</li>`).join('')}
    </ul>
  </section>

  <section>
    <h2>結論</h2>
    <p>${this.escapeHtml(s.takeaway)}</p>
  </section>

  ${s.faqs?.length
      ? `
  <section>
    <h2>よくある質問</h2>
    ${s.faqs
        .map(
          (f) => `
      <h3>${this.escapeHtml(f.q)}</h3>
      <p>${this.escapeHtml(f.a)}</p>
    `
        )
        .join('')}
  </section>`
      : ''}

  <footer class="source">
    出典: <a href="${s.source_url}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(s.source_name)}</a>
  </footer>
</article>
</body>
</html>`;

    // 出力先は ./out に固定
    const outDir = path.join(process.cwd(), 'out');
    await fs.mkdir(outDir, { recursive: true });
    const filename = (s.slug || this.slugify(title)) + '.html';
    await fs.writeFile(path.join(outDir, filename), html, 'utf-8');
    console.log(`   💾 Saved to: ${path.join(outDir, filename)}`);
  }

  private renderTOC(sections: ArticleSection[] = []): string {
    if (!sections.length) return '';
    const items = sections
      .map((sec) => `<li><a href="#${this.anchor(sec.h2)}">${this.escapeHtml(sec.h2)}</a></li>`)
      .join('');
    return `<nav class="toc"><strong>目次</strong><ol>${items}</ol></nav>`;
  }

  private anchor(h: string) {
    return this.slugify(h);
  }

  private estimateMinutes(text: string) {
    const w = text.replace(/\s+/g, ' ').trim().length;
    return Math.max(1, Math.round(w / 500));
  }

  private slugify(t: string) {
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'post';
  }

  private deriveKeywords(s: ArticleSummary) {
    const base = [s.source_name, 'AI', 'Tech', ...s.facts.slice(0, 3)];
    return Array.from(new Set(base.filter(Boolean))).map((x) => String(x).toLowerCase().slice(0, 40));
  }

  private escapeHtml(text: string): string {
    return (text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // モデルが返す「ほぼJSON」を厳密JSONに近づけるサニタイズ
  private parseJsonLoose(s: string): string | null {
    if (!s) return null;
    let t = s.trim();

    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) t = fence[1].trim();

    const first = t.indexOf('{');
    const last = t.lastIndexOf('}');
    if (first >= 0 && last > first) t = t.slice(first, last + 1);

    t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    t = t.replace(/,\s*([}\]])/g, '$1');
    t = t.replace(/[\u0000-\u001F\u007F]/g, ' ');

    const open = (t.match(/{/g) || []).length;
    const close = (t.match(/}/g) || []).length;
    if (close < open) t = t + '}'.repeat(open - close);

    if (!t.startsWith('{') || !t.endsWith('}')) return null;
    return t;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new RSSToHTMLGenerator();
  generator.run();
}
