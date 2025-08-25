import RSSParser from 'rss-parser';
import crypto from 'crypto';
import stringSimilarity from 'string-similarity';
import { getDatabase } from '../database/connection.js';

const db = getDatabase();
import type { Category, ProcessingQueueItem } from '@ai-pop-culture-news/shared';

const parser = new RSSParser();

export class IngestModule {
  private readonly SIMILARITY_THRESHOLD = 0.9;

  async processFeed(feedUrl: string, feedName: string, category: Category): Promise<ProcessingQueueItem[]> {
    try {
      console.log(`Processing feed: ${feedName} (${feedUrl})`);
      
      const feed = await parser.parseURL(feedUrl);
      const newItems: ProcessingQueueItem[] = [];

      for (const item of feed.items) {
        if (!item.link || !item.title) continue;

        const urlHash = this.generateUrlHash(item.link);
        
        if (await this.isDuplicate(urlHash, item.title)) {
          console.log(`Skipping duplicate: ${item.title}`);
          continue;
        }

        if (await this.isSimilarTitle(item.title)) {
          console.log(`Skipping similar title: ${item.title}`);
          continue;
        }

        const queueItem = await this.addToQueue(
          urlHash,
          item.link,
          item.title,
          category
        );

        if (queueItem) {
          newItems.push(queueItem);
          await this.recordUrlHash(urlHash, item.link, item.title);
        }
      }

      await this.updateFeedLastChecked(feedUrl);
      console.log(`Added ${newItems.length} new items from ${feedName}`);
      
      return newItems;
    } catch (error) {
      console.error(`Failed to process feed ${feedUrl}:`, error);
      throw error;
    }
  }

  private generateUrlHash(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex');
  }

  private async isDuplicate(urlHash: string, title: string): Promise<boolean> {
    const existing = await db.get(
      'SELECT 1 FROM url_hashes WHERE url_hash = $1',
      [urlHash]
    );
    return !!existing;
  }

  private async isSimilarTitle(title: string): Promise<boolean> {
    const recentTitles = await db.all<{ title: string }>(
      'SELECT title FROM processing_queue WHERE discovered_at > NOW() - INTERVAL \'7 days\''
    );

    for (const { title: existingTitle } of recentTitles) {
      const similarity = stringSimilarity.compareTwoStrings(title, existingTitle);
      if (similarity > this.SIMILARITY_THRESHOLD) {
        return true;
      }
    }

    return false;
  }

  private async addToQueue(
    urlHash: string,
    originalUrl: string,
    title: string,
    category: Category
  ): Promise<ProcessingQueueItem | null> {
    try {
      const feedSource = await this.ensureFeedSource(originalUrl, category);
      
      const result = await db.run(
        `INSERT INTO processing_queue (url_hash, original_url, title, feed_source_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [urlHash, originalUrl, title, feedSource.id]
      );

      const insertedId = result.rows[0]?.id;
      if (!insertedId) {
        throw new Error('Failed to get inserted ID');
      }

      return {
        id: insertedId,
        url_hash: urlHash,
        original_url: originalUrl,
        title,
        status: 'pending',
        feed_source_id: feedSource.id,
        discovered_at: new Date(),
        retry_count: 0
      };
    } catch (error) {
      console.error('Failed to add item to queue:', error);
      return null;
    }
  }

  private async ensureFeedSource(url: string, category: Category) {
    const domain = new URL(url).hostname;
    
    let feedSource = await db.get<{ id: number; name: string }>(
      'SELECT id, name FROM feed_sources WHERE url LIKE $1',
      [`%${domain}%`]
    );

    if (!feedSource) {
      const result = await db.run(
        'INSERT INTO feed_sources (url, name, category) VALUES ($1, $2, $3) RETURNING id',
        [domain, domain, category]
      );
      
      const insertedId = result.rows[0]?.id;
      if (!insertedId) {
        throw new Error('Failed to get inserted feed source ID');
      }
      
      feedSource = { id: insertedId, name: domain };
    }

    return feedSource;
  }

  private async recordUrlHash(urlHash: string, originalUrl: string, title: string): Promise<void> {
    await db.run(
      'INSERT INTO url_hashes (url_hash, original_url, title) VALUES ($1, $2, $3) ON CONFLICT (url_hash) DO NOTHING',
      [urlHash, originalUrl, title]
    );
  }

  private async updateFeedLastChecked(feedUrl: string): Promise<void> {
    await db.run(
      'UPDATE feed_sources SET last_checked = CURRENT_TIMESTAMP WHERE url = $1',
      [feedUrl]
    );
  }

  async getPendingItems(limit: number = 10): Promise<ProcessingQueueItem[]> {
    return db.all<ProcessingQueueItem>(
      `SELECT * FROM processing_queue 
       WHERE status = 'pending' 
       ORDER BY discovered_at ASC 
       LIMIT $1`,
      [limit]
    );
  }

  async updateItemStatus(id: number, status: string, errorMessage?: string): Promise<void> {
    if (errorMessage) {
      await db.run(
        'UPDATE processing_queue SET status = $1, processed_at = CURRENT_TIMESTAMP, error_message = $2, retry_count = retry_count + 1 WHERE id = $3',
        [status, errorMessage, id]
      );
    } else {
      await db.run(
        'UPDATE processing_queue SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, id]
      );
    }
  }
}
