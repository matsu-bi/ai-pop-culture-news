import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import axios from 'axios';

export interface ParsedContent {
  title: string;
  content: string;
  textContent: string;
  length: number;
  excerpt: string;
  byline?: string | undefined;
  siteName?: string | undefined;
  publishedTime?: string | undefined;
}

export class ParseModule {
  private readonly USER_AGENT = 'Mozilla/5.0 (compatible; AI-Pop-Culture-News/1.0)';
  private readonly TIMEOUT = 30000; // 30 seconds

  async extractContent(url: string): Promise<ParsedContent | null> {
    try {
      console.log(`Extracting content from: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        timeout: this.TIMEOUT,
        maxRedirects: 5,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const dom = new JSDOM(response.data, { url });
      const document = dom.window.document;

      const reader = new Readability(document);
      const article = reader.parse();

      if (!article) {
        throw new Error('Failed to parse article content');
      }

      if (article.textContent.length < 500) {
        throw new Error('Article content too short (< 500 characters)');
      }

      const publishedTime = this.extractPublishedTime(document);
      const siteName = this.extractSiteName(document, url);

      const parsedContent: ParsedContent = {
        title: article.title,
        content: article.content,
        textContent: article.textContent,
        length: article.length,
        excerpt: article.excerpt,
        byline: article.byline || undefined,
        siteName: siteName || undefined,
        publishedTime: publishedTime || undefined,
      };

      console.log(`Successfully extracted content: ${parsedContent.title} (${parsedContent.length} chars)`);
      return parsedContent;

    } catch (error) {
      console.error(`Failed to extract content from ${url}:`, error);
      return null;
    }
  }

  private extractPublishedTime(document: any): string | undefined {
    const selectors = [
      'meta[property="article:published_time"]',
      'meta[name="article:published_time"]',
      'meta[property="og:published_time"]',
      'time[datetime]',
      '.published-date',
      '.post-date',
      '.article-date'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const content = element.getAttribute('content') || 
                       element.getAttribute('datetime') || 
                       element.textContent;
        if (content) {
          try {
            const date = new Date(content);
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          } catch {
            continue;
          }
        }
      }
    }

    return undefined;
  }

  private extractSiteName(document: any, url: string): string {
    const siteNameMeta = document.querySelector('meta[property="og:site_name"]') ||
                        document.querySelector('meta[name="application-name"]');
    
    if (siteNameMeta) {
      const content = siteNameMeta.getAttribute('content');
      if (content) return content;
    }

    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return 'Unknown Source';
    }
  }

  async validateContent(content: ParsedContent): Promise<boolean> {
    if (!content.title || content.title.length < 10) {
      console.warn('Title too short or missing');
      return false;
    }

    if (!content.textContent || content.textContent.length < 500) {
      console.warn('Content too short');
      return false;
    }

    const aiKeywords = [
      'artificial intelligence', 'ai', 'machine learning', 'neural network',
      'music', 'art', 'video', 'game', 'entertainment', 'culture',
      'anime', 'manga', 'film', 'movie', 'creative'
    ];

    const contentLower = content.textContent.toLowerCase();
    const hasRelevantKeywords = aiKeywords.some(keyword => 
      contentLower.includes(keyword)
    );

    if (!hasRelevantKeywords) {
      console.warn('Content does not contain relevant AI/entertainment keywords');
      return false;
    }

    return true;
  }

  splitContent(content: string, maxChunkSize: number = 4000): string[] {
    if (content.length <= maxChunkSize) {
      return [content];
    }

    const chunks: string[] = [];
    const paragraphs = content.split('\n\n');
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length + 2 <= maxChunkSize) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = paragraph;
        } else {
          const sentences = paragraph.split('. ');
          for (const sentence of sentences) {
            if (currentChunk.length + sentence.length + 2 <= maxChunkSize) {
              currentChunk += (currentChunk ? '. ' : '') + sentence;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = sentence;
            }
          }
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
