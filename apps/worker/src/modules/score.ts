import type { GeneratedContent, ScoringResult, ProcessingQueueItem } from '@ai-pop-culture-news/shared';
import type { ParsedContent } from './parse.js';
import { getDatabase } from '../database/connection.js';

const db = getDatabase();

export class ScoreModule {
  private readonly FRESHNESS_WEIGHT = 0.3;
  private readonly SOURCE_RELIABILITY_WEIGHT = 0.2;
  private readonly CATEGORY_BALANCE_WEIGHT = 0.15;
  private readonly CONTENT_QUALITY_WEIGHT = 0.25;
  private readonly DUPLICATE_RISK_WEIGHT = 0.1;

  async scoreContent(
    generatedContent: GeneratedContent,
    originalContent: ParsedContent,
    queueItem: ProcessingQueueItem,
    threshold: number = 0.75
  ): Promise<ScoringResult> {
    console.log(`Scoring article: ${generatedContent.title_ja}`);

    const freshness = await this.calculateFreshness(originalContent);
    const sourceReliability = await this.calculateSourceReliability(generatedContent.source.name);
    const categoryBalance = await this.calculateCategoryBalance(queueItem.feed_source_id);
    const contentQuality = this.calculateContentQuality(generatedContent);
    const duplicateRisk = await this.calculateDuplicateRisk(generatedContent);

    const score = (
      freshness * this.FRESHNESS_WEIGHT +
      sourceReliability * this.SOURCE_RELIABILITY_WEIGHT +
      categoryBalance * this.CATEGORY_BALANCE_WEIGHT +
      contentQuality * this.CONTENT_QUALITY_WEIGHT +
      (1 - duplicateRisk) * this.DUPLICATE_RISK_WEIGHT
    );

    const shouldPublish = score >= threshold;

    console.log(`Article score: ${score.toFixed(3)} (threshold: ${threshold})`);
    console.log(`Should publish: ${shouldPublish}`);

    return {
      score,
      factors: {
        freshness,
        sourceReliability,
        categoryBalance,
        contentQuality,
        duplicateRisk
      },
      shouldPublish
    };
  }

  private async calculateFreshness(originalContent: ParsedContent): Promise<number> {
    try {
      const publishedDate = originalContent.publishedTime 
        ? new Date(originalContent.publishedTime)
        : new Date();
      
      const now = new Date();
      const ageInHours = (now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60);

      if (ageInHours <= 24) return 1.0;
      if (ageInHours <= 48) return 0.8;
      if (ageInHours <= 72) return 0.6;
      if (ageInHours <= 168) return 0.4;
      return 0.2;
    } catch (error) {
      console.error('Failed to calculate freshness:', error);
      return 0.5;
    }
  }

  private async calculateSourceReliability(sourceName: string): Promise<number> {
    const reliableSourcesMap: Record<string, number> = {
      'theverge.com': 0.95,
      'techcrunch.com': 0.9,
      'engadget.com': 0.85,
      'techradar.com': 0.8,
      'gigazine.net': 0.85,
      'japan.cnet.com': 0.8,
      'itmedia.co.jp': 0.9,
      'wired.com': 0.9,
      'arstechnica.com': 0.85,
      'venturebeat.com': 0.8
    };

    const domain = sourceName.toLowerCase().replace('www.', '');
    return reliableSourcesMap[domain] || 0.6;
  }

  private async calculateCategoryBalance(feedSourceId: number): Promise<number> {
    try {
      const recentArticles = await db.all<{ category: string; count: number }>(
        `SELECT fs.category, COUNT(*) as count
         FROM articles a
         JOIN processing_queue pq ON a.queue_id = pq.id
         JOIN feed_sources fs ON pq.feed_source_id = fs.id
         WHERE a.published_at > NOW() - INTERVAL '7 days'
         GROUP BY fs.category`
      );

      const currentFeedSource = await db.get<{ category: string }>(
        'SELECT category FROM feed_sources WHERE id = $1',
        [feedSourceId]
      );

      if (!currentFeedSource) return 0.5;

      const totalArticles = recentArticles.reduce((sum, item) => sum + item.count, 0);
      const categoryCount = recentArticles.find(item => item.category === currentFeedSource.category)?.count || 0;

      if (totalArticles === 0) return 1.0;

      const categoryRatio = categoryCount / totalArticles;
      
      if (categoryRatio < 0.1) return 1.0;
      if (categoryRatio < 0.2) return 0.8;
      if (categoryRatio < 0.3) return 0.6;
      if (categoryRatio < 0.4) return 0.4;
      return 0.2;
    } catch (error) {
      console.error('Failed to calculate category balance:', error);
      return 0.5;
    }
  }

  private calculateContentQuality(generatedContent: GeneratedContent): number {
    let score = 0;

    if (generatedContent.title_ja.length >= 20 && generatedContent.title_ja.length <= 80) {
      score += 0.2;
    }

    if (generatedContent.lead_ja.length >= 100 && generatedContent.lead_ja.length <= 250) {
      score += 0.2;
    }

    if (generatedContent.facts.length >= 5 && generatedContent.facts.length <= 7) {
      score += 0.2;
    }

    if (generatedContent.background.length === 3) {
      const validBackgrounds = generatedContent.background.filter(
        bg => bg.body.length >= 150 && bg.body.length <= 350
      );
      score += (validBackgrounds.length / 3) * 0.2;
    }

    if (generatedContent.editor_note.length >= 20 && generatedContent.editor_note.length <= 150) {
      score += 0.1;
    }

    if (generatedContent.seo.tags.length >= 3 && generatedContent.seo.tags.length <= 8) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  private async calculateDuplicateRisk(generatedContent: GeneratedContent): Promise<number> {
    try {
      const similarTitles = await db.all<{ title_ja: string }>(
        `SELECT title_ja FROM articles 
         WHERE created_at > NOW() - INTERVAL '30 days'`
      );

      let maxSimilarity = 0;
      for (const article of similarTitles) {
        const similarity = this.calculateStringSimilarity(
          generatedContent.title_ja,
          article.title_ja
        );
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }

      return maxSimilarity;
    } catch (error) {
      console.error('Failed to calculate duplicate risk:', error);
      return 0;
    }
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i]![0] = i;
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0]![j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1
          );
        }
      }
    }
    
    return matrix[str2.length]![str1.length]!;
  }
}
