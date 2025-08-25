import axios from 'axios';
import type { GeneratedContent, WordPressPost } from '@ai-pop-culture-news/shared';
import type { ThumbnailResult } from './thumbnail.js';

export interface PublishResult {
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
}

export class PublishModule {
  private wpUrl: string;
  private username: string;
  private appPassword: string;

  constructor(wpUrl: string, username: string, appPassword: string) {
    this.wpUrl = wpUrl.replace(/\/$/, '');
    this.username = username;
    this.appPassword = appPassword;
  }

  async publishToWordPress(
    generatedContent: GeneratedContent,
    thumbnail: ThumbnailResult,
    publishMode: 'auto' | 'draft',
    shouldPublish: boolean
  ): Promise<PublishResult> {
    try {
      console.log(`Publishing to WordPress: ${generatedContent.title_ja}`);

      const mediaId = await this.uploadThumbnail(thumbnail);
      
      const categories = await this.ensureCategories(generatedContent.seo.tags);
      const tags = await this.ensureTags(generatedContent.seo.tags);

      const postContent = this.buildPostContent(generatedContent);
      
      const status = (publishMode === 'auto' && shouldPublish) ? 'publish' : 'draft';

      const postData: WordPressPost = {
        title: generatedContent.seo.title,
        content: postContent,
        status,
        categories,
        tags,
        featured_media: mediaId,
        meta: {
          source_url: generatedContent.source.url,
          source_name: generatedContent.source.name,
          source_date: generatedContent.source.published_at,
          category_ai: this.detectAICategory(generatedContent.seo.tags),
          model_version: 'gpt-4-turbo-preview',
          generated_at: new Date().toISOString(),
          score: 0
        }
      };

      const response = await axios.post(
        `${this.wpUrl}/wp-json/wp/v2/posts`,
        postData,
        {
          auth: {
            username: this.username,
            password: this.appPassword
          },
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const postId = response.data.id;
      const postUrl = response.data.link;

      console.log(`✅ Successfully published to WordPress: ${postUrl} (${status})`);

      return {
        success: true,
        postId,
        postUrl
      };

    } catch (error) {
      console.error('Failed to publish to WordPress:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async uploadThumbnail(thumbnail: ThumbnailResult): Promise<number> {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(thumbnail.buffer)], { type: thumbnail.mimeType });
      formData.append('file', blob, thumbnail.filename);

      const response = await axios.post(
        `${this.wpUrl}/wp-json/wp/v2/media`,
        formData,
        {
          auth: {
            username: this.username,
            password: this.appPassword
          },
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      return response.data.id;
    } catch (error) {
      console.error('Failed to upload thumbnail:', error);
      throw error;
    }
  }

  private async ensureCategories(tags: string[]): Promise<number[]> {
    const categoryIds: number[] = [];

    for (const tag of tags.slice(0, 3)) {
      try {
        let category = await this.findCategory(tag);
        
        if (!category) {
          category = await this.createCategory(tag);
        }
        
        if (category) {
          categoryIds.push(category.id);
        }
      } catch (error) {
        console.error(`Failed to ensure category ${tag}:`, error);
      }
    }

    return categoryIds;
  }

  private async ensureTags(tags: string[]): Promise<number[]> {
    const tagIds: number[] = [];

    for (const tag of tags) {
      try {
        let wpTag = await this.findTag(tag);
        
        if (!wpTag) {
          wpTag = await this.createTag(tag);
        }
        
        if (wpTag) {
          tagIds.push(wpTag.id);
        }
      } catch (error) {
        console.error(`Failed to ensure tag ${tag}:`, error);
      }
    }

    return tagIds;
  }

  private async findCategory(name: string): Promise<{ id: number; name: string } | null> {
    try {
      const response = await axios.get(
        `${this.wpUrl}/wp-json/wp/v2/categories`,
        {
          params: { search: name },
          auth: {
            username: this.username,
            password: this.appPassword
          }
        }
      );

      return response.data.find((cat: any) => cat.name.toLowerCase() === name.toLowerCase()) || null;
    } catch (error) {
      console.error('Failed to find category:', error);
      return null;
    }
  }

  private async createCategory(name: string): Promise<{ id: number; name: string } | null> {
    try {
      const response = await axios.post(
        `${this.wpUrl}/wp-json/wp/v2/categories`,
        { name },
        {
          auth: {
            username: this.username,
            password: this.appPassword
          }
        }
      );

      return { id: response.data.id, name: response.data.name };
    } catch (error) {
      console.error('Failed to create category:', error);
      return null;
    }
  }

  private async findTag(name: string): Promise<{ id: number; name: string } | null> {
    try {
      const response = await axios.get(
        `${this.wpUrl}/wp-json/wp/v2/tags`,
        {
          params: { search: name },
          auth: {
            username: this.username,
            password: this.appPassword
          }
        }
      );

      return response.data.find((tag: any) => tag.name.toLowerCase() === name.toLowerCase()) || null;
    } catch (error) {
      console.error('Failed to find tag:', error);
      return null;
    }
  }

  private async createTag(name: string): Promise<{ id: number; name: string } | null> {
    try {
      const response = await axios.post(
        `${this.wpUrl}/wp-json/wp/v2/tags`,
        { name },
        {
          auth: {
            username: this.username,
            password: this.appPassword
          }
        }
      );

      return { id: response.data.id, name: response.data.name };
    } catch (error) {
      console.error('Failed to create tag:', error);
      return null;
    }
  }

  private buildPostContent(generatedContent: GeneratedContent): string {
    const backgroundSections = generatedContent.background
      .map(bg => `<h2>${bg.heading}</h2>\n<p>${bg.body}</p>`)
      .join('\n\n');

    const factsList = generatedContent.facts
      .map(fact => `<li>${fact}</li>`)
      .join('\n');

    return `
<p class="lead">${generatedContent.lead_ja}</p>

<ul class="facts">
${factsList}
</ul>

${backgroundSections}

<p class="editor-note">編集部メモ: ${generatedContent.editor_note}</p>

<hr/>

<p class="source">出典: ${generatedContent.source.name}（${new Date(generatedContent.source.published_at).toLocaleDateString('ja-JP')}） <a href="${generatedContent.source.url}" target="_blank" rel="noopener">原文</a></p>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "NewsArticle",
  "headline": "${generatedContent.title_ja}",
  "description": "${generatedContent.seo.meta_description}",
  "isBasedOn": {
    "@type": "NewsArticle",
    "url": "${generatedContent.source.url}",
    "publisher": "${generatedContent.source.name}"
  },
  "author": {
    "@type": "Organization",
    "name": "AI Culture News"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Next Pop Lab"
  },
  "datePublished": "${new Date().toISOString()}",
  "dateModified": "${new Date().toISOString()}"
}
</script>
`.trim();
  }

  private detectAICategory(tags: string[]): string {
    const categoryMap: Record<string, string> = {
      '音楽': 'AI_MUSIC',
      'music': 'AI_MUSIC',
      'アート': 'AI_ART',
      'art': 'AI_ART',
      '動画': 'AI_VIDEO',
      'video': 'AI_VIDEO',
      '映画': 'AI_VIDEO',
      'film': 'AI_VIDEO',
      'ゲーム': 'AI_GAMES',
      'game': 'AI_GAMES',
      'gaming': 'AI_GAMES',
      'アニメ': 'AI_MANGA',
      'anime': 'AI_MANGA',
      'マンガ': 'AI_MANGA',
      'manga': 'AI_MANGA'
    };

    for (const tag of tags) {
      const category = categoryMap[tag.toLowerCase()];
      if (category) return category;
    }

    return 'BUZZ';
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.wpUrl}/wp-json/wp/v2/posts`,
        {
          params: { per_page: 1 },
          auth: {
            username: this.username,
            password: this.appPassword
          }
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('WordPress connection test failed:', error);
      return false;
    }
  }
}
