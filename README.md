# AI Pop Culture News

AI-powered article generation system that automatically processes RSS feeds from AI×entertainment/culture sources, generates Japanese summaries with background explanations, validates content quality, and publishes to WordPress.

## 🚀 Features

- **8-Stage Pipeline**: Automated content processing from RSS feeds to WordPress publication
- **AI Content Generation**: OpenAI-powered Japanese summaries with background explanations
- **Quality Validation**: Fact-checking, plagiarism detection, and citation ratio validation
- **Automated Publishing**: WordPress REST API integration with custom fields and structured data
- **Thumbnail Generation**: Automated SVG→PNG thumbnails with title overlay
- **Social Distribution**: Twitter/X integration and weekly summary generation
- **Monorepo Architecture**: Organized workspace with shared utilities

## 📋 System Requirements

- Node.js 20+
- Python 3.11+
- pnpm package manager
- SQLite or PostgreSQL database
- WordPress site with Application Passwords enabled

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/matsu-bi/ai-pop-culture-news.git
   cd ai-pop-culture-news
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the project**
   ```bash
   npm run build --workspaces
   ```

## ⚙️ Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `WP_URL` | WordPress site URL | `https://nextpoplab.com/` |
| `WP_USERNAME` | WordPress username | `improver524` |
| `WP_APP_PASSWORD` | WordPress application password | `IeOt wNJN ad25...` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |
| `SEED_FEEDS` | RSS/Atom feed URLs (comma-separated) | `https://techcrunch.com/feed/,https://venturebeat.com/feed/` |

### Optional Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLISH_MODE` | Publication mode (`auto` or `draft`) | `draft` |
| `THRESHOLD` | Auto-publish quality threshold (0-1) | `0.75` |
| `MAX_ITEMS_PER_RUN` | Maximum articles per execution | `5` |
| `CRON_SCHEDULE` | Execution schedule (cron format) | `0 */6 * * *` |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | - |
| `SITE_NAME` | Site name for branding | `AI Culture News` |
| `DATABASE_URL` | Database connection string | `sqlite:./data.db` |

### Environment Setup

Create a `.env` file in the project root:

```bash
# WordPress Configuration
WP_URL=https://nextpoplab.com/
WP_USERNAME=improver524
WP_APP_PASSWORD=your-app-password

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-api-key

# RSS Feeds (comma-separated)
SEED_FEEDS=https://www.theverge.com/rss/index.xml,https://www.theverge.com/artificial-intelligence/rss/index.xml,https://www.techradar.com/feeds/artificial-intelligence,https://www.engadget.com/rss.xml,https://gigazine.net/news/rss_2.0/,https://japan.cnet.com/rss/index.rdf,https://www.itmedia.co.jp/news/rss/news.rdf,https://www.itmedia.co.jp/business/rss/business.rdf,https://www.itmedia.co.jp/news/rss/news_sec.rdf

# Configuration
PUBLISH_MODE=auto
THRESHOLD=0.75
MAX_ITEMS_PER_RUN=5
CRON_SCHEDULE=0 3 * * *

# Database
DATABASE_URL=postgresql://localhost:5432/ai_pop_culture

# Twitter API (optional)
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret
TWITTER_ACCESS_TOKEN=your-twitter-access-token
TWITTER_ACCESS_TOKEN_SECRET=your-twitter-access-token-secret

# Optional
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
SITE_NAME=AI Culture News
```

## 🏃‍♂️ Usage

### Development Mode

```bash
# Start the worker in development mode
npm run dev:worker

# Run tests
npm run test --workspaces

# Lint code
npm run lint --workspaces

# Format code
npm run format --workspaces
```

### Production Mode

```bash
# Build and start the worker
npm run build --workspaces
npm run start:worker
```

### Manual Execution

```bash
# Process feeds once
cd apps/worker
node dist/index.js
```

## 🏗️ Architecture

### Monorepo Structure

```
ai-pop-culture-news/
├── apps/
│   └── worker/                 # Main pipeline worker
│       ├── src/
│       │   ├── modules/        # Pipeline modules
│       │   ├── database/       # Database layer
│       │   └── index.ts        # Entry point
│       └── package.json
├── packages/
│   └── shared/                 # Shared utilities
│       ├── src/
│       │   ├── types.ts        # Type definitions
│       │   ├── config.ts       # Configuration
│       │   └── index.ts
│       └── package.json
├── DESIGN.md                   # System design document
└── package.json                # Root workspace config
```

### 8-Stage Pipeline

1. **Ingest**: RSS/Atom feed parsing with deduplication
2. **Parse**: Content extraction using Readability
3. **Summarize**: AI-powered Japanese content generation
4. **Validate**: Fact-checking and quality validation
5. **Thumbnail**: Automated image generation
6. **Score**: Content quality scoring
7. **Publish**: WordPress REST API publishing
8. **Distribution**: Social media and weekly summaries

## 📊 Content Format

### Generated Article Structure

```typescript
{
  title_ja: string;           // Japanese title (10-100 chars)
  lead_ja: string;            // Lead paragraph (50-300 chars)
  facts: string[];            // Key facts (5-7 bullet points)
  background: {               // Background sections (3 sections)
    heading: string;          // Natural heading
    body: string;             // 200-300 chars explanation
  }[];
  editor_note: string;        // Editorial comment (10-200 chars)
  seo: {
    title: string;            // SEO title (30-45 chars)
    meta_description: string; // Meta description (100-120 chars)
    tags: string[];           // Tags (3-10 items)
  };
  source: {
    url: string;              // Original article URL
    name: string;             // Publication name
    published_at: string;     // Publication date
  };
}
```

### WordPress Post Template

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

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm run test --workspaces

# Run tests with coverage
npm run test --workspaces -- --coverage

# Run specific test file
npm run test --workspace=@ai-pop-culture-news/worker -- src/modules/ingest.test.ts
```

### Integration Tests

```bash
# Test WordPress API connection
npm run test:integration --workspace=@ai-pop-culture-news/worker

# Test with staging environment
NODE_ENV=staging npm run test:integration --workspace=@ai-pop-culture-news/worker
```

### End-to-End Testing

```bash
# Full pipeline test with dummy data
npm run test:e2e --workspace=@ai-pop-culture-news/worker
```

## 🚀 Deployment

### GitHub Actions

The project includes automated CI/CD with GitHub Actions:

```yaml
# Scheduled execution every 6 hours
schedule:
  - cron: '0 */6 * * *'

# Manual trigger
workflow_dispatch:

# On push to main
push:
  branches: [main]
```

### Manual Deployment

1. **Build the project**
   ```bash
   npm run build --workspaces
   ```

2. **Set environment variables**
   ```bash
   export WP_URL="https://your-site.com/"
   export WP_USERNAME="username"
   # ... other variables
   ```

3. **Run the worker**
   ```bash
   npm run start:worker
   ```

## 📈 Monitoring

### Logging

- **DEBUG**: Detailed processing information
- **INFO**: General operation status
- **WARN**: Non-critical issues
- **ERROR**: Processing failures
- **FATAL**: System-level failures

### Metrics

- Processing time per article
- Success/failure rates
- API costs and usage
- Content quality scores

### Alerts

- Slack notifications for critical errors
- Daily processing summaries
- Weekly performance reports

## 🔧 Troubleshooting

### Common Issues

1. **RSS Feed Parsing Errors**
   ```bash
   # Check feed validity
   curl -I "https://example.com/feed/"
   
   # Verify SEED_FEEDS configuration
   echo $SEED_FEEDS
   ```

2. **WordPress API Errors**
   ```bash
   # Test WordPress connection
   curl -u "username:app-password" "https://your-site.com/wp-json/wp/v2/posts"
   ```

3. **OpenAI API Errors**
   ```bash
   # Verify API key
   curl -H "Authorization: Bearer $OPENAI_API_KEY" \
        "https://api.openai.com/v1/models"
   ```

### Database Issues

```bash
# Reset database
rm data.db
npm run start:worker  # Will recreate schema

# Check database integrity
sqlite3 data.db "PRAGMA integrity_check;"
```

### Performance Issues

```bash
# Check processing queue
sqlite3 data.db "SELECT status, COUNT(*) FROM processing_queue GROUP BY status;"

# Monitor resource usage
top -p $(pgrep -f "node.*worker")
```

## 🔄 Rollback Procedures

### Emergency Rollback

1. **Stop scheduled execution**
   ```bash
   # Disable GitHub Actions workflow
   gh workflow disable main.yml
   ```

2. **Revert to previous version**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

3. **Set to draft mode**
   ```bash
   export PUBLISH_MODE=draft
   npm run start:worker
   ```

### Database Rollback

```bash
# Restore from backup
cp data.db.backup data.db

# Or reset to clean state
rm data.db
npm run start:worker
```

## 📝 Editorial Policy

### Content Guidelines

- **No direct translation**: Always use "summary + original style"
- **Citation limits**: Maximum 10-15% quoted content
- **Fact accuracy**: Names, dates, numbers must match original
- **Attribution**: Always include source with publication date and URL
- **Image policy**: Only self-generated abstract thumbnails

### Quality Standards

- **Readability**: Natural Japanese for general audiences
- **Originality**: < 0.8 similarity with source content
- **Completeness**: All required sections must be present
- **Accuracy**: Fact validation against original content

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run linting and tests
6. Submit a pull request

### Development Guidelines

- Follow TypeScript strict mode
- Use conventional commit messages
- Add JSDoc comments for public APIs
- Maintain test coverage > 80%
- Update documentation for new features

## 📄 License

ISC License - see LICENSE file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/matsu-bi/ai-pop-culture-news/issues)
- **Documentation**: [Design Document](./DESIGN.md)
- **Contact**: Create an issue for questions or support

---

**Note**: This system is designed for automated content generation with human oversight. Always review generated content before publication and ensure compliance with copyright and editorial policies.
