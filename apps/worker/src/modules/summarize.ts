import OpenAI from 'openai';
import { GeneratedContentSchema } from '@ai-pop-culture-news/shared';
import type { GeneratedContent } from '@ai-pop-culture-news/shared';
import type { ParsedContent } from './parse.js';
import type { ValidationResult } from '@ai-pop-culture-news/shared';

export class SummarizeModule {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async generateSummary(parsedContent: ParsedContent, sourceUrl: string): Promise<GeneratedContent | null> {
    try {
      console.log(`Generating summary for: ${parsedContent.title}`);

      const prompt = this.buildPrompt(parsedContent, sourceUrl);
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'あなたは日本のAI×エンタメ・カルチャー専門のライターです。海外記事を元に、ライト層向けの要約記事を日本語で作成してください。直訳ではなく、独自の文体で噛み砕いて説明し、専門用語は分かりやすく解説してください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content generated from OpenAI');
      }

      const generatedContent = this.parseGeneratedContent(content, parsedContent, sourceUrl);
      
      if (!generatedContent) {
        throw new Error('Failed to parse generated content');
      }

      console.log(`✅ Successfully generated summary: ${generatedContent.title_ja}`);
      return generatedContent;

    } catch (error) {
      console.error('Failed to generate summary:', error);
      return null;
    }
  }

  private buildPrompt(parsedContent: ParsedContent, sourceUrl: string): string {
    return `
以下の海外記事を元に、日本のライト層向けの記事を作成してください。

【元記事情報】
タイトル: ${parsedContent.title}
サイト名: ${parsedContent.siteName || 'Unknown'}
公開日: ${parsedContent.publishedTime || 'Unknown'}
URL: ${sourceUrl}

【元記事本文】
${parsedContent.textContent.substring(0, 4000)}

【出力形式】
以下のJSON形式で出力してください：

{
  "title_ja": "日本語タイトル（10-100文字）",
  "lead_ja": "リード文（2-3文、50-300文字）",
  "facts": [
    "重要なポイント1",
    "重要なポイント2",
    "重要なポイント3",
    "重要なポイント4",
    "重要なポイント5"
  ],
  "background": [
    {
      "heading": "なぜ話題なのか",
      "body": "背景説明1（200-300文字）"
    },
    {
      "heading": "関連する流れ",
      "body": "背景説明2（200-300文字）"
    },
    {
      "heading": "今後の影響",
      "body": "背景説明3（200-300文字）"
    }
  ],
  "editor_note": "編集部の短いコメント（10-200文字）",
  "seo": {
    "title": "SEO用タイトル（30-45文字）",
    "meta_description": "メタディスクリプション（100-120文字）",
    "tags": ["AI", "音楽", "エンタメ", "テクノロジー", "イノベーション"]
  },
  "source": {
    "url": "${sourceUrl}",
    "name": "${parsedContent.siteName || 'Unknown'}",
    "published_at": "${parsedContent.publishedTime || new Date().toISOString()}"
  }
}

【重要な注意事項】
1. 直訳は禁止。必ず独自の文体で要約してください
2. 専門用語は一般の人にも分かるよう噛み砕いて説明
3. 固有名詞、日付、数値は元記事と完全に一致させる
4. 引用は最小限に留める（全体の10-15%以内）
5. 背景説明の見出しは記事内容に合わせて自然なものにする
6. 敬語（です・ます調）で統一
7. JSON形式を厳密に守る
`;
  }

  private parseGeneratedContent(content: string, _parsedContent: ParsedContent, _sourceUrl: string): GeneratedContent | null {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in generated content');
      }

      const jsonStr = jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      const validated = GeneratedContentSchema.parse(parsed);
      
      return validated;
    } catch (error) {
      console.error('Failed to parse generated content:', error);
      console.error('Raw content:', content);
      return null;
    }
  }

  async regenerateWithFeedback(
    parsedContent: ParsedContent, 
    sourceUrl: string, 
    feedback: string
  ): Promise<GeneratedContent | null> {
    try {
      console.log(`Regenerating summary with feedback: ${feedback}`);

      const prompt = this.buildPrompt(parsedContent, sourceUrl);
      const feedbackPrompt = `\n\n【修正指示】\n${feedback}\n\n上記の指示に従って内容を修正してください。`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'あなたは日本のAI×エンタメ・カルチャー専門のライターです。フィードバックに基づいて記事を修正してください。'
          },
          {
            role: 'user',
            content: prompt + feedbackPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content generated from OpenAI');
      }

      const generatedContent = this.parseGeneratedContent(content, parsedContent, sourceUrl);
      
      if (!generatedContent) {
        throw new Error('Failed to parse regenerated content');
      }

      console.log(`✅ Successfully regenerated summary: ${generatedContent.title_ja}`);
      return generatedContent;

    } catch (error) {
      console.error('Failed to regenerate summary:', error);
      return null;
    }
  }

  async regenerateContent(content: GeneratedContent, validationResult: ValidationResult): Promise<GeneratedContent | null> {
    const feedback = `Issues found: ${validationResult.errors.join(', ')}. Please fix these issues while maintaining the same JSON format.`;
    return this.regenerateWithFeedback(
      { 
        title: content.title_ja, 
        content: '',
        textContent: '', 
        length: 0,
        excerpt: '',
        byline: undefined,
        siteName: undefined,
        publishedTime: content.source.published_at
      } as ParsedContent,
      content.source.url,
      feedback
    );
  }
}
