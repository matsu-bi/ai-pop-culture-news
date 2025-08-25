import { z } from 'zod';

const ConfigSchema = z.object({
  wp_url: z.string().url(),
  wp_username: z.string().min(1),
  wp_app_password: z.string().min(1),
  openai_api_key: z.string().min(1),
  seed_feeds: z.string().transform((str: string) => str.split(',').map((s: string) => s.trim()).filter(Boolean)),
  publish_mode: z.enum(['auto', 'draft']).default('auto'),
  threshold: z.coerce.number().min(0).max(1).default(0.75),
  max_items_per_run: z.coerce.number().int().min(1).max(20).default(5),
  cron_schedule: z.string().default('0 3 * * *'),
  slack_webhook_url: z.string().url().optional(),
  site_name: z.string().default('AI Culture News'),
  database_url: z.string().default('postgresql://localhost:5432/ai_pop_culture'),
  twitter_api_key: z.string().optional(),
  twitter_api_secret: z.string().optional(),
  twitter_access_token: z.string().optional(),
  twitter_access_token_secret: z.string().optional()
});

export function loadConfig() {
  const defaultFeeds = 'https://www.theverge.com/rss/index.xml,https://www.theverge.com/artificial-intelligence/rss/index.xml,https://www.techradar.com/feeds/artificial-intelligence,https://www.engadget.com/rss.xml,https://gigazine.net/news/rss_2.0/,https://japan.cnet.com/rss/index.rdf,https://www.itmedia.co.jp/news/rss/news.rdf,https://www.itmedia.co.jp/business/rss/business.rdf,https://www.itmedia.co.jp/news/rss/news_sec.rdf';

  const env = {
    wp_url: process.env.WP_URL,
    wp_username: process.env.WP_USERNAME,
    wp_app_password: process.env.WP_APP_PASSWORD,
    openai_api_key: process.env.OPENAI_API_KEY,
    seed_feeds: process.env.SEED_FEEDS || defaultFeeds,
    publish_mode: process.env.PUBLISH_MODE,
    threshold: process.env.THRESHOLD,
    max_items_per_run: process.env.MAX_ITEMS_PER_RUN,
    cron_schedule: process.env.CRON_SCHEDULE,
    slack_webhook_url: process.env.SLACK_WEBHOOK_URL,
    site_name: process.env.SITE_NAME,
    database_url: process.env.DATABASE_URL,
    twitter_api_key: process.env.TWITTER_API_KEY,
    twitter_api_secret: process.env.TWITTER_API_SECRET,
    twitter_access_token: process.env.TWITTER_ACCESS_TOKEN,
    twitter_access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  };

  try {
    return ConfigSchema.parse(env);
  } catch (error) {
    console.error('Configuration validation failed:', error);
    throw new Error('Invalid configuration. Please check your environment variables.');
  }
}

export type AppConfig = z.infer<typeof ConfigSchema>;
