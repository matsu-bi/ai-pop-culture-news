import { z } from 'zod';

export const CategorySchema = z.enum(['AI_MUSIC', 'AI_ART', 'AI_VIDEO', 'AI_MANGA', 'AI_GAMES', 'BUZZ']);
export type Category = z.infer<typeof CategorySchema>;

export const StatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'published']);
export type Status = z.infer<typeof StatusSchema>;

export const BackgroundSectionSchema = z.object({
  heading: z.string().min(1).max(50),
  body: z.string().min(100).max(400)
});

export const SEODataSchema = z.object({
  title: z.string().min(20).max(45),
  meta_description: z.string().min(90).max(120),
  tags: z.array(z.string()).min(3).max(10)
});

export const SourceDataSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  published_at: z.string()
});

export const GeneratedContentSchema = z.object({
  title_ja: z.string().min(10).max(100),
  lead_ja: z.string().min(50).max(300),
  facts: z.array(z.string()).min(5).max(7),
  background: z.array(BackgroundSectionSchema).length(3),
  editor_note: z.string().min(10).max(200),
  seo: SEODataSchema,
  source: SourceDataSchema
});

export type BackgroundSection = z.infer<typeof BackgroundSectionSchema>;
export type SEOData = z.infer<typeof SEODataSchema>;
export type SourceData = z.infer<typeof SourceDataSchema>;
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

export interface FeedSource {
  id: number;
  url: string;
  name: string;
  category: Category;
  active: boolean;
  last_checked?: Date;
  created_at: Date;
}

export interface ProcessingQueueItem {
  id: number;
  url_hash: string;
  original_url: string;
  title: string;
  status: Status;
  feed_source_id: number;
  discovered_at: Date;
  processed_at?: Date;
  retry_count: number;
  error_message?: string;
}

export interface Article {
  id: number;
  queue_id: number;
  title_ja: string;
  lead_ja: string;
  facts: string[];
  background: BackgroundSection[];
  editor_note: string;
  seo_data: SEOData;
  source_data: SourceData;
  score: number;
  wordpress_post_id?: number;
  published_at?: Date;
  created_at: Date;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  factAccuracy: number;
  similarityScore: number;
  citationRatio: number;
  needsRegeneration: boolean;
}

export interface ScoringResult {
  score: number;
  factors: {
    freshness: number;
    sourceReliability: number;
    categoryBalance: number;
    contentQuality: number;
    duplicateRisk: number;
  };
  shouldPublish: boolean;
}

export interface WordPressPost {
  id?: number;
  title: string;
  content: string;
  status: 'draft' | 'publish';
  categories: number[];
  tags: number[];
  meta: Record<string, any>;
  featured_media?: number;
}

export interface Config {
  wp_url: string;
  wp_username: string;
  wp_app_password: string;
  openai_api_key: string;
  seed_feeds: string[];
  publish_mode: 'auto' | 'draft';
  threshold: number;
  max_items_per_run: number;
  cron_schedule: string;
  slack_webhook_url?: string;
  site_name: string;
  database_url: string;
}
