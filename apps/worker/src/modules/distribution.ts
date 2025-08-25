import { TwitterApi } from 'twitter-api-v2';
import type { GeneratedContent } from '@ai-pop-culture-news/shared';
import { getDatabase } from '../database/connection.js';

const db = getDatabase();

export interface TwitterConfig {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

export class DistributionModule {
  private twitterClient?: TwitterApi;

  constructor(twitterConfig?: TwitterConfig) {
    if (twitterConfig) {
      this.twitterClient = new TwitterApi({
        appKey: twitterConfig.apiKey,
        appSecret: twitterConfig.apiSecret,
        accessToken: twitterConfig.accessToken,
        accessSecret: twitterConfig.accessTokenSecret,
      });
    }
  }

  async postToTwitter(generatedContent: GeneratedContent, postUrl: string): Promise<boolean> {
    if (!this.twitterClient) {
      console.log('Twitter client not configured, skipping social media posting');
      return false;
    }

    try {
      console.log(`Posting to Twitter: ${generatedContent.title_ja}`);

      const hashtags = generatedContent.seo.tags
        .slice(0, 3)
        .map(tag => `#${tag.replace(/\s+/g, '')}`)
        .join(' ');

      const tweetText = `${generatedContent.title_ja}\n\n${hashtags}\n\n${postUrl}`;

      if (tweetText.length > 280) {
        const maxTitleLength = 280 - hashtags.length - postUrl.length - 6;
        const truncatedTitle = generatedContent.title_ja.length > maxTitleLength
          ? generatedContent.title_ja.substring(0, maxTitleLength - 3) + '...'
          : generatedContent.title_ja;
        
        const finalTweet = `${truncatedTitle}\n\n${hashtags}\n\n${postUrl}`;
        await this.twitterClient.v2.tweet(finalTweet);
      } else {
        await this.twitterClient.v2.tweet(tweetText);
      }

      console.log('✅ Successfully posted to Twitter');
      return true;
    } catch (error) {
      console.error('Failed to post to Twitter:', error);
      return false;
    }
  }

  async generateWeeklySummary(): Promise<GeneratedContent | null> {
    try {
      console.log('Generating weekly TOP5 summary...');

      const topArticles = await db.all<{
        title_ja: string;
        lead_ja: string;
        score: number;
        wordpress_post_id: number;
        published_at: string;
        seo_data: string;
        source_data: string;
      }>(
        `SELECT title_ja, lead_ja, score, wordpress_post_id, published_at, seo_data, source_data
         FROM articles 
         WHERE published_at > NOW() - INTERVAL '7 days'
         AND wordpress_post_id IS NOT NULL
         ORDER BY score DESC 
         LIMIT 5`
      );

      if (topArticles.length === 0) {
        console.log('No articles found for weekly summary');
        return null;
      }

      const summaryContent: GeneratedContent = {
        title_ja: `今週のAIカルチャーTOP${topArticles.length}`,
        lead_ja: `今週話題になったAI×エンタメ・カルチャーの注目記事をまとめました。最新のトレンドをチェックしてみてください。`,
        facts: topArticles.map((article, index) => 
          `${index + 1}位: ${article.title_ja} (スコア: ${article.score.toFixed(2)})`
        ),
        background: [
          {
            heading: '今週の傾向',
            body: `今週は${topArticles.length}本の記事が公開され、AI技術の進歩とエンターテインメント業界への影響が注目を集めました。特に高スコアを獲得した記事は、実用性と話題性を兼ね備えた内容となっています。`
          },
          {
            heading: '注目ポイント',
            body: `最高スコア${Math.max(...topArticles.map(a => a.score)).toFixed(2)}を記録した記事をはじめ、多様なAI活用事例が紹介されました。読者の関心も高く、今後のトレンド予測に重要な示唆を与えています。`
          },
          {
            heading: '来週の展望',
            body: `AI技術の発展は加速しており、来週もエンターテインメント分野での新たな活用事例や技術革新に関するニュースが期待されます。引き続き最新情報をお届けします。`
          }
        ],
        editor_note: '編集部が厳選した今週の注目記事をお楽しみください。',
        seo: {
          title: `今週のAIカルチャーTOP${topArticles.length} - 注目記事まとめ`,
          meta_description: `今週話題になったAI×エンタメ・カルチャーの記事TOP${topArticles.length}をまとめました。最新トレンドをチェック！`,
          tags: ['AI', 'まとめ', 'ランキング', 'エンタメ', 'カルチャー', 'トレンド']
        },
        source: {
          url: 'https://nextpoplab.com/',
          name: 'AI Culture News 編集部',
          published_at: new Date().toISOString()
        }
      };

      console.log(`✅ Generated weekly summary with ${topArticles.length} articles`);
      return summaryContent;
    } catch (error) {
      console.error('Failed to generate weekly summary:', error);
      return null;
    }
  }

  async shouldGenerateWeeklySummary(): Promise<boolean> {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    if (dayOfWeek === 0 && hour >= 10 && hour <= 12) {
      const lastSummary = await db.get<{ published_at: string }>(
        `SELECT published_at FROM articles 
         WHERE title_ja LIKE '今週のAIカルチャーTOP%'
         AND published_at > NOW() - INTERVAL '7 days'
         ORDER BY published_at DESC 
         LIMIT 1`
      );

      return !lastSummary;
    }

    return false;
  }
}
