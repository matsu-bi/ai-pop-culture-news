import { describe, it, expect, beforeEach } from 'vitest';
import { ValidateModule } from '../../modules/validate.js';
import type { GeneratedContent } from '@ai-pop-culture-news/shared';

describe('ValidateModule', () => {
  let validateModule: ValidateModule;

  beforeEach(() => {
    validateModule = new ValidateModule('test-api-key');
  });

  it('should calculate citation ratio correctly', () => {
    const content: GeneratedContent = {
      title_ja: 'テストタイトル',
      lead_ja: 'これは「引用部分」を含むリード文です。',
      facts: ['事実1', '「引用された事実」', '事実3'],
      background: [
        { heading: '背景1', body: '通常の文章です。' },
        { heading: '背景2', body: '「引用を含む」背景説明です。' },
        { heading: '背景3', body: '通常の背景説明です。' }
      ],
      editor_note: '編集部コメント',
      seo: {
        title: 'SEOタイトル',
        meta_description: 'メタディスクリプション',
        tags: ['AI', 'テスト']
      },
      source: {
        url: 'https://example.com',
        name: 'Example',
        published_at: '2024-01-01T00:00:00Z'
      }
    };

    const ratio = (validateModule as any).calculateCitationRatio(content);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
});
