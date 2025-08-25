import { describe, it, expect, beforeEach } from 'vitest';
import { IngestModule } from '../../modules/ingest.js';

describe('IngestModule', () => {
  let ingestModule: IngestModule;

  beforeEach(() => {
    ingestModule = new IngestModule();
  });

  it('should generate consistent URL hash', () => {
    const url = 'https://example.com/article';
    const hash1 = (ingestModule as any).generateUrlHash(url);
    const hash2 = (ingestModule as any).generateUrlHash(url);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should detect similar titles', () => {
    const title1 = 'AI Music Generation Breakthrough';
    const title2 = 'AI Music Generation Breakthrough in 2024';
    
    const similarity = require('string-similarity').compareTwoStrings(title1, title2);
    expect(similarity).toBeGreaterThan(0.8);
  });
});
