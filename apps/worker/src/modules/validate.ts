import OpenAI from 'openai';
import stringSimilarity from 'string-similarity';
import type { GeneratedContent, ValidationResult } from '@ai-pop-culture-news/shared';
import type { ParsedContent } from './parse.js';

export class ValidateModule {
  private openai: OpenAI;
  private readonly SIMILARITY_THRESHOLD = 0.8;
  private readonly MAX_CITATION_RATIO = 0.15;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async validateContent(
    generatedContent: GeneratedContent,
    originalContent: ParsedContent
  ): Promise<ValidationResult> {
    console.log(`Validating content: ${generatedContent.title_ja}`);

    const errors: string[] = [];
    let needsRegeneration = false;

    const factAccuracy = await this.checkFactAccuracy(generatedContent, originalContent);
    const similarityScore = await this.checkSimilarity(generatedContent, originalContent);
    const citationRatio = this.calculateCitationRatio(generatedContent);

    if (factAccuracy < 0.9) {
      errors.push(`Fact accuracy too low: ${factAccuracy.toFixed(2)}`);
      needsRegeneration = true;
    }

    if (similarityScore > this.SIMILARITY_THRESHOLD) {
      errors.push(`Content too similar to original: ${similarityScore.toFixed(2)}`);
      needsRegeneration = true;
    }

    if (citationRatio > this.MAX_CITATION_RATIO) {
      errors.push(`Citation ratio too high: ${(citationRatio * 100).toFixed(1)}%`);
      needsRegeneration = true;
    }

    const moderationResult = await this.checkModeration(generatedContent);
    if (!moderationResult.passed) {
      errors.push(`Content moderation failed: ${moderationResult.reason}`);
      needsRegeneration = true;
    }

    const isValid = errors.length === 0;

    console.log(`Validation result: ${isValid ? 'PASSED' : 'FAILED'}`);
    if (!isValid) {
      console.log(`Validation errors: ${errors.join(', ')}`);
    }

    return {
      isValid,
      errors,
      factAccuracy,
      similarityScore,
      citationRatio,
      needsRegeneration
    };
  }

  private async checkFactAccuracy(
    generatedContent: GeneratedContent,
    originalContent: ParsedContent
  ): Promise<number> {
    try {
      const prompt = `
以下の元記事と生成された記事を比較し、固有名詞、日付、数値の正確性を0-1のスコアで評価してください。

【元記事】
${originalContent.textContent.substring(0, 2000)}

【生成記事】
タイトル: ${generatedContent.title_ja}
リード: ${generatedContent.lead_ja}
ポイント: ${generatedContent.facts.join(', ')}

【評価基準】
- 固有名詞（人名、会社名、製品名など）が正確か
- 日付や時期の表現が正確か
- 数値（金額、パーセンテージ、数量など）が正確か

0.9以上: ほぼ完璧
0.8-0.9: 軽微な誤りあり
0.7-0.8: 明らかな誤りあり
0.7未満: 重大な誤りあり

スコアのみを数値で回答してください（例: 0.95）
`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'あなたはファクトチェッカーです。記事の事実確認を行い、正確性をスコアで評価してください。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 10,
      });

      const response = completion.choices[0]?.message?.content?.trim();
      const score = parseFloat(response || '0');
      
      return isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
    } catch (error) {
      console.error('Failed to check fact accuracy:', error);
      return 0.5;
    }
  }

  private async checkSimilarity(
    generatedContent: GeneratedContent,
    originalContent: ParsedContent
  ): Promise<number> {
    try {
      const generatedText = [
        generatedContent.title_ja,
        generatedContent.lead_ja,
        ...generatedContent.facts,
        ...generatedContent.background.map(b => b.body),
        generatedContent.editor_note
      ].join(' ');

      const originalText = originalContent.textContent;

      const similarity = stringSimilarity.compareTwoStrings(generatedText, originalText);
      
      return similarity;
    } catch (error) {
      console.error('Failed to check similarity:', error);
      return 0;
    }
  }

  private calculateCitationRatio(generatedContent: GeneratedContent): number {
    const allText = [
      generatedContent.title_ja,
      generatedContent.lead_ja,
      ...generatedContent.facts,
      ...generatedContent.background.map(b => b.body),
      generatedContent.editor_note
    ].join(' ');

    const quotationMarks = (allText.match(/「[^」]*」/g) || []).length;
    const totalLength = allText.length;

    if (totalLength === 0) return 0;

    const estimatedQuotedLength = quotationMarks * 20;
    return estimatedQuotedLength / totalLength;
  }

  private async checkModeration(generatedContent: GeneratedContent): Promise<{ passed: boolean; reason?: string }> {
    try {
      const contentToCheck = [
        generatedContent.title_ja,
        generatedContent.lead_ja,
        ...generatedContent.facts,
        ...generatedContent.background.map(b => b.body),
        generatedContent.editor_note
      ].join('\n');

      const moderation = await this.openai.moderations.create({
        input: contentToCheck,
      });

      const result = moderation.results[0];
      
      if (result?.flagged) {
        const flaggedCategories = Object.entries(result.categories)
          .filter(([_, flagged]) => flagged)
          .map(([category, _]) => category);
        
        return {
          passed: false,
          reason: `Flagged for: ${flaggedCategories.join(', ')}`
        };
      }

      return { passed: true };
    } catch (error) {
      console.error('Failed to check moderation:', error);
      return { passed: true };
    }
  }

  generateFeedback(validationResult: ValidationResult): string {
    const feedback: string[] = [];

    if (validationResult.factAccuracy < 0.9) {
      feedback.push('固有名詞、日付、数値を元記事と照合し、正確性を向上させてください。');
    }

    if (validationResult.similarityScore > this.SIMILARITY_THRESHOLD) {
      feedback.push('元記事との類似度が高すぎます。より独自の表現で要約し直してください。');
    }

    if (validationResult.citationRatio > this.MAX_CITATION_RATIO) {
      feedback.push('引用の割合が多すぎます。直接引用を減らし、要約表現を増やしてください。');
    }

    return feedback.join(' ');
  }
}
