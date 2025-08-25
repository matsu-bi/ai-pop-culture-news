# AI Pop Culture News - System Design Document

## Overview

This document outlines the architecture for an AI-powered article generation system that automatically processes RSS feeds from AI×entertainment/culture sources, generates Japanese summaries with background explanations, validates content quality, and publishes to WordPress.

## System Architecture

### Data Flow Diagram

```
RSS/Atom Feeds → [1.Ingest] → [2.Parse] → [3.Summarize] → [4.Validate] → [5.Thumbnail] → [6.Score] → [7.Publish] → [8.Distribution]
                     ↓           ↓           ↓             ↓             ↓             ↓           ↓             ↓
                  Database    Content     OpenAI API    Fact Check    SVG→PNG     Scoring     WordPress    Twitter/X
                  Queue       Extract     Generation    Similarity    Generation   Algorithm   REST API     Weekly
```

### 8-Stage Pipeline

1. **Ingest**: RSS/Atom feed parsing, deduplication, categorization
2. **Parse**: Content extraction using Readability-like algorithms
3. **Summarize**: AI-powered Japanese content generation with structured format
4. **Validate**: Fact checking, plagiarism detection, citation ratio validation
5. **Thumbnail**: Automated SVG→PNG generation with title overlay
6. **Score**: Content quality scoring for publication decisions
7. **Publish**: WordPress REST API integration with custom fields
8. **Distribution**: Social media posting and weekly summaries

## Environment Variables

### Required Configuration

| Variable | Description | Example | Status |
|----------|-------------|---------|--------|
| `WP_URL` | WordPress site URL | `https://nextpoplab.com/` | ✅ Available |
| `WP_USERNAME` | WordPress username | `improver524` | ✅ Available |
| `WP_APP_PASSWORD` | WordPress app password | `IeOt wNJN ad25...` | ✅ Available |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` | ✅ Available |
| `SEED_FEEDS` | RSS/Atom feed URLs (comma-separated) | `https://techcrunch.com/feed/,https://venturebeat.com/feed/` | ❌ Empty |

### Optional Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PUBLISH_MODE` | Publication mode | `"draft"` | No |
| `THRESHOLD` | Auto-publish threshold | `0.75` | No |
| `MAX_ITEMS_PER_RUN` | Max items per execution | `5` | No |
| `CRON_SCHEDULE` | Execution schedule | `"0 */6 * * *"` | No |
| `SLACK_WEBHOOK_URL` | Error notifications | - | No |
| `SITE_NAME` | Site branding | `"AI Culture News"` | No |
| `DATABASE_URL` | Database connection | `sqlite:./data.db` | No |

## API Integration Table

### External APIs

| Service | Endpoint | Authentication | Rate Limits | Error Handling |
|---------|----------|----------------|-------------|----------------|
| WordPress REST API | `/wp-json/wp/v2/posts` | Application Password | 60 req/min | Exponential backoff |
| OpenAI API | `/v1/chat/completions` | Bearer token | 3500 req/min | Rate limiting + retry |
| RSS/Atom Feeds | Various | None | Varies | Timeout + fallback |
| Twitter API | `/2/tweets` | OAuth 2.0 | 300 req/15min | Queue + batch |

### Internal APIs

| Module | Interface | Input | Output |
|--------|-----------|-------|--------|
| Ingest | `processFeed(url)` | RSS URL | Article candidates |
| Parse | `extractContent(url)` | Article URL | Clean content |
| Summarize | `generateSummary(content)` | Raw content | Structured summary |
| Validate | `validateContent(summary, original)` | Summary + original | Validation result |
| Score | `scoreArticle(article)` | Article data | Quality score |
| Publish | `publishToWordPress(article)` | Processed article | Publication result |

## Database Schema

### Tables

```sql
-- Feed sources configuration
CREATE TABLE feed_sources (
    id INTEGER PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    active BOOLEAN DEFAULT true,
    last_checked TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Processing queue for articles
CREATE TABLE processing_queue (
    id INTEGER PRIMARY KEY,
    url_hash TEXT UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
    feed_source_id INTEGER REFERENCES feed_sources(id),
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);

-- Generated articles
CREATE TABLE articles (
    id INTEGER PRIMARY KEY,
    queue_id INTEGER REFERENCES processing_queue(id),
    title_ja TEXT NOT NULL,
    lead_ja TEXT NOT NULL,
    facts TEXT NOT NULL, -- JSON array
    background TEXT NOT NULL, -- JSON array of {heading, body}
    editor_note TEXT NOT NULL,
    seo_data TEXT NOT NULL, -- JSON object
    source_data TEXT NOT NULL, -- JSON object
    score REAL NOT NULL,
    wordpress_post_id INTEGER,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Publication history
CREATE TABLE publication_history (
    id INTEGER PRIMARY KEY,
    article_id INTEGER REFERENCES articles(id),
    action TEXT NOT NULL, -- draft, publish, update, delete
    wordpress_post_id INTEGER,
    success BOOLEAN NOT NULL,
    response_data TEXT, -- JSON response from WordPress
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Deduplication tracking
CREATE TABLE url_hashes (
    url_hash TEXT PRIMARY KEY,
    original_url TEXT NOT NULL,
    title TEXT NOT NULL,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Title similarity tracking
CREATE TABLE title_similarities (
    id INTEGER PRIMARY KEY,
    title1_hash TEXT NOT NULL,
    title2_hash TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Error Handling Strategy

### Retry Logic

1. **Exponential Backoff**: Start with 1s, double each retry (max 5 attempts)
2. **Circuit Breaker**: Disable failing feeds after 10 consecutive failures
3. **Graceful Degradation**: Continue processing other articles if one fails
4. **Dead Letter Queue**: Store permanently failed items for manual review

### Error Categories

| Error Type | Handling | Notification |
|------------|----------|--------------|
| Network timeout | Retry with backoff | Log only |
| API rate limit | Queue for later | Log only |
| Content parsing failure | Skip article | Log + alert |
| AI generation failure | Retry with different prompt | Log + alert |
| WordPress API error | Retry + manual queue | Immediate alert |
| Validation failure | Regenerate content | Log only |

### Monitoring & Alerts

- **Slack Webhook**: Critical errors, daily summary
- **Log Levels**: DEBUG, INFO, WARN, ERROR, FATAL
- **Metrics**: Processing time, success rate, API costs
- **Health Checks**: Database connectivity, API availability

## Cost Estimation & Rate Limiting

### OpenAI API Costs

- **Model**: GPT-4 Turbo (estimated)
- **Input tokens**: ~2000 per article (original content)
- **Output tokens**: ~1000 per article (Japanese summary)
- **Cost per article**: ~$0.03-0.05
- **Daily cost** (5 articles): ~$0.15-0.25
- **Monthly cost**: ~$4.50-7.50

### Rate Limiting

- **OpenAI**: 3500 req/min → batch processing with delays
- **WordPress**: 60 req/min → queue-based publishing
- **RSS Feeds**: Respect robots.txt, 1 req/min per feed
- **Overall**: MAX_ITEMS_PER_RUN=5 to control costs

## Content Generation Format

### Required Output Structure

```typescript
interface GeneratedContent {
  title_ja: string;
  lead_ja: string; // 2-3 sentences
  facts: string[]; // 5-7 bullet points from original
  background: {
    heading: string; // Natural heading like "なぜ話題なのか"
    body: string; // 200-300 characters
  }[];
  editor_note: string; // Short original comment
  seo: {
    title: string; // 30-45 characters
    meta_description: string; // 100-120 characters
    tags: string[];
  };
  source: {
    url: string;
    name: string;
    published_at: string;
  };
}
```

### Content Validation Rules

1. **Fact Accuracy**: Names, dates, numbers must match original
2. **Similarity Check**: Embedding similarity < 0.8 with original
3. **Citation Ratio**: Quoted content < 15% of total
4. **Language Quality**: Natural Japanese for general audience
5. **Moderation**: No offensive content, bias, or misinformation

## WordPress Integration

### Custom Post Template

```html
<p class="lead">{{lead_ja}}</p>
<ul class="facts">
  {{#each facts}}
  <li>{{this}}</li>
  {{/each}}
</ul>
{{#each background}}
<h2>{{heading}}</h2>
<p>{{body}}</p>
{{/each}}
<p class="editor-note">編集部メモ: {{editor_note}}</p>
<hr/>
<p class="source">出典: {{source.name}}（{{source.published_at}}） <a href="{{source.url}}">原文</a></p>
```

### Custom Fields

- `source_url`: Original article URL
- `source_name`: Publication name
- `source_date`: Original publication date
- `category_ai`: AI-detected category
- `model_version`: AI model used
- `generated_at`: Generation timestamp
- `score`: Quality score

### Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "{{title_ja}}",
  "description": "{{lead_ja}}",
  "isBasedOn": {
    "@type": "NewsArticle",
    "url": "{{source.url}}",
    "publisher": "{{source.name}}"
  },
  "author": {
    "@type": "Organization",
    "name": "AI Culture News"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Next Pop Lab"
  }
}
```

## Deployment Strategy

### Development Environment

- Local SQLite database
- Mock RSS feeds for testing
- Staging WordPress instance
- Environment: `NODE_ENV=development`

### Production Environment

- PostgreSQL database (optional upgrade)
- Real RSS feeds
- Production WordPress
- GitHub Actions scheduling
- Environment: `NODE_ENV=production`

### CI/CD Pipeline

```yaml
# .github/workflows/main.yml
name: AI Article Pipeline
on:
  schedule:
    - cron: '0 */6 * * *' # Every 6 hours
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: pnpm start:production
```

## Security Considerations

### Data Protection

- Environment variables for all secrets
- No secrets in code or logs
- WordPress Application Passwords (not admin credentials)
- Rate limiting to prevent abuse

### Content Safety

- AI content moderation
- Source verification
- Copyright compliance (no image copying)
- Attribution requirements

### Infrastructure

- HTTPS for all API calls
- Database encryption at rest
- Secure secret management
- Regular dependency updates

## Rollback Procedures

### Emergency Rollback

1. **Stop scheduled jobs**: Disable GitHub Actions workflow
2. **Revert code**: `git revert <commit-hash>` and redeploy
3. **Database rollback**: Restore from backup if schema changed
4. **WordPress cleanup**: Delete problematic posts if needed

### Gradual Rollback

1. **Set PUBLISH_MODE="draft"**: Stop auto-publishing
2. **Reduce MAX_ITEMS_PER_RUN**: Limit processing volume
3. **Monitor logs**: Check for error patterns
4. **Manual review**: Verify content quality

### Recovery Procedures

1. **Database recovery**: Restore from daily backups
2. **Content recovery**: Re-process from RSS feeds
3. **WordPress recovery**: Restore posts from database
4. **Monitoring recovery**: Re-enable alerts and metrics

## Performance Targets

### Processing Metrics

- **Latency**: < 2 minutes per article end-to-end
- **Throughput**: 5 articles per run, 4 runs per day = 20 articles/day
- **Success Rate**: > 95% successful processing
- **Uptime**: > 99% availability

### Quality Metrics

- **Fact Accuracy**: > 98% (validated by fact checker)
- **Content Originality**: < 0.8 similarity with source
- **Citation Compliance**: < 15% quoted content
- **Publication Rate**: 70-80% articles meet quality threshold

This design document will be updated as implementation progresses and requirements evolve.
