import { loadConfig } from '@ai-pop-culture-news/shared';
import { IngestModule } from './modules/ingest.js';
import { ParseModule } from './modules/parse.js';
import { SummarizeModule } from './modules/summarize.js';
import { ValidateModule } from './modules/validate.js';
import { ScoreModule } from './modules/score.js';
import { ThumbnailModule } from './modules/thumbnail.js';
import { PublishModule } from './modules/publish.js';
import { DistributionModule } from './modules/distribution.js';
import { getDatabase } from './database/connection.js';

async function main() {
  console.log('🚀 AI Pop Culture News Worker Starting...');
  
  try {
    const config = loadConfig();
    console.log('✅ Configuration loaded successfully');
    console.log(`📊 Settings: ${config.publish_mode} mode, threshold: ${config.threshold}, max items: ${config.max_items_per_run}`);
    
    const db = getDatabase(config.database_url);
    const ingestModule = new IngestModule();
    const parseModule = new ParseModule();
    const summarizeModule = new SummarizeModule(config.openai_api_key);
    const validateModule = new ValidateModule(config.openai_api_key);
    const scoreModule = new ScoreModule();
    const thumbnailModule = new ThumbnailModule();
    const publishModule = new PublishModule(config.wp_url, config.wp_username, config.wp_app_password);
    
    const twitterConfig = config.twitter_api_key && config.twitter_api_secret && 
                         config.twitter_access_token && config.twitter_access_token_secret
      ? {
          apiKey: config.twitter_api_key,
          apiSecret: config.twitter_api_secret,
          accessToken: config.twitter_access_token,
          accessTokenSecret: config.twitter_access_token_secret
        }
      : undefined;
    
    const distributionModule = new DistributionModule(twitterConfig);
    
    console.log(`📡 Processing ${config.seed_feeds.length} RSS feeds...`);
    
    let totalNewItems = 0;
    for (const feedUrl of config.seed_feeds) {
      try {
        const newItems = await ingestModule.processFeed(feedUrl, feedUrl, 'BUZZ');
        totalNewItems += newItems.length;
        console.log(`✅ Processed ${feedUrl}: ${newItems.length} new items`);
      } catch (error) {
        console.error(`❌ Failed to process feed ${feedUrl}:`, error);
      }
    }
    
    console.log(`📈 Total new items discovered: ${totalNewItems}`);
    
    const pendingItems = await ingestModule.getPendingItems(config.max_items_per_run);
    console.log(`🔄 Processing ${pendingItems.length} pending items...`);
    
    for (const item of pendingItems) {
      try {
        console.log(`📖 Processing: ${item.title}`);
        
        await ingestModule.updateItemStatus(item.id, 'processing');
        
        const parsedContent = await parseModule.extractContent(item.original_url);
        
        if (!parsedContent) {
          await ingestModule.updateItemStatus(item.id, 'failed', 'Failed to extract content');
          continue;
        }
        
        const isValid = await parseModule.validateContent(parsedContent);
        
        if (!isValid) {
          await ingestModule.updateItemStatus(item.id, 'failed', 'Content validation failed');
          continue;
        }
        
        console.log(`✅ Successfully parsed: ${parsedContent.title} (${parsedContent.length} chars)`);
        
        let generatedContent = await summarizeModule.generateSummary(parsedContent, item.original_url);
        
        if (!generatedContent) {
          await ingestModule.updateItemStatus(item.id, 'failed', 'Content generation failed');
          continue;
        }
        
        let validationResult = await validateModule.validateContent(generatedContent, parsedContent);
        let retryCount = 0;
        const maxRetries = 3;
        
        while (!validationResult.isValid && retryCount < maxRetries) {
          console.log(`🔄 Regenerating content (attempt ${retryCount + 1}/${maxRetries}): ${validationResult.errors.join(', ')}`);
          const regeneratedContent = await summarizeModule.regenerateContent(generatedContent, validationResult);
          
          if (!regeneratedContent) {
            console.log(`❌ Failed to regenerate content on attempt ${retryCount + 1}`);
            break;
          }
          
          generatedContent = regeneratedContent;
          validationResult = await validateModule.validateContent(generatedContent, parsedContent);
          retryCount++;
        }
        
        if (!validationResult.isValid) {
          await ingestModule.updateItemStatus(item.id, 'failed', `Content validation failed after ${maxRetries} attempts`);
          continue;
        }
        
        const scoringResult = await scoreModule.scoreContent(generatedContent, parsedContent, item, config.threshold);
        console.log(`📊 Content scored: ${scoringResult.score.toFixed(2)} (threshold: ${config.threshold})`);
        
        const thumbnail = await thumbnailModule.generateThumbnail(generatedContent);
        
        const publishResult = await publishModule.publishToWordPress(
          generatedContent,
          thumbnail,
          config.publish_mode,
          scoringResult.shouldPublish
        );
        
        if (publishResult.success) {
          await db.run(
            `INSERT INTO articles (queue_id, title_ja, lead_ja, facts, background, editor_note, seo_data, source_data, score, wordpress_post_id, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              item.id,
              generatedContent.title_ja,
              generatedContent.lead_ja,
              JSON.stringify(generatedContent.facts),
              JSON.stringify(generatedContent.background),
              generatedContent.editor_note,
              JSON.stringify(generatedContent.seo),
              JSON.stringify(generatedContent.source),
              scoringResult.score,
              publishResult.postId,
              scoringResult.shouldPublish ? new Date().toISOString() : null
            ]
          );
          
          await ingestModule.updateItemStatus(item.id, 'published');
          console.log(`✅ Successfully published: ${publishResult.postUrl}`);
          
          if (scoringResult.shouldPublish && publishResult.postUrl) {
            await distributionModule.postToTwitter(generatedContent, publishResult.postUrl);
          }
        } else {
          await ingestModule.updateItemStatus(item.id, 'failed', publishResult.error || 'Publication failed');
        }
        
      } catch (error) {
        console.error(`❌ Failed to process item ${item.id}:`, error);
        await ingestModule.updateItemStatus(item.id, 'failed', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    if (await distributionModule.shouldGenerateWeeklySummary()) {
      console.log('📊 Generating weekly summary...');
      const weeklySummary = await distributionModule.generateWeeklySummary();
      
      if (weeklySummary) {
        const summaryThumbnail = await thumbnailModule.generateThumbnail(weeklySummary);
        const summaryPublishResult = await publishModule.publishToWordPress(
          weeklySummary,
          summaryThumbnail,
          'auto',
          true
        );
        
        if (summaryPublishResult.success) {
          console.log(`✅ Weekly summary published: ${summaryPublishResult.postUrl}`);
          if (summaryPublishResult.postUrl) {
            await distributionModule.postToTwitter(weeklySummary, summaryPublishResult.postUrl);
          }
        }
      }
    }
    
    console.log('🎉 Worker execution completed successfully');
    
  } catch (error) {
    console.error('💥 Worker execution failed:', error);
    process.exit(1);
  } finally {
    const dbInstance = getDatabase();
    await dbInstance?.close();
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  const db = getDatabase();
  await db?.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  const db = getDatabase();
  await db?.close();
  process.exit(0);
});

main().catch(console.error);
