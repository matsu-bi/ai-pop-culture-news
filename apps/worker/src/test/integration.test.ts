import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadConfig } from '@ai-pop-culture-news/shared';
import { PublishModule } from '../modules/publish.js';
import { getDatabase } from '../database/connection.js';

describe('Integration Tests', () => {
  let config: ReturnType<typeof loadConfig>;
  let publishModule: PublishModule;
  let db: ReturnType<typeof getDatabase>;

  beforeAll(async () => {
    try {
      config = loadConfig();
      publishModule = new PublishModule(config.wp_url, config.wp_username, config.wp_app_password);
      db = getDatabase(config.database_url);
    } catch (error) {
      console.log('Skipping integration tests - missing environment variables or database connection');
      return;
    }
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it('should connect to WordPress API', async () => {
    if (!config || !publishModule) {
      console.log('Skipping WordPress API test - missing configuration');
      return;
    }
    const isConnected = await publishModule.testConnection();
    expect(isConnected).toBe(true);
  });

  it('should initialize database schema', async () => {
    if (!config || !db) {
      console.log('Skipping database schema test - missing configuration');
      return;
    }
    const tables = await db.all(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    
    const tableNames = tables.map((t: any) => t.table_name);
    expect(tableNames).toContain('feed_sources');
    expect(tableNames).toContain('processing_queue');
    expect(tableNames).toContain('articles');
    expect(tableNames).toContain('publication_history');
    expect(tableNames).toContain('url_hashes');
  });
});
