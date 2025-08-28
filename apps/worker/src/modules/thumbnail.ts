import { createCanvas } from 'canvas';
import sharp from 'sharp';
import type { GeneratedContent } from '@ai-pop-culture-news/shared';

export interface ThumbnailResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export class ThumbnailModule {
  private readonly WIDTH = 1200;
  private readonly HEIGHT = 630;
  private readonly SITE_NAME = 'AI Culture News';

  async generateThumbnail(generatedContent: GeneratedContent): Promise<ThumbnailResult> {
    try {
      console.log(`Generating thumbnail for: ${generatedContent.title_ja}`);

      const canvas = createCanvas(this.WIDTH, this.HEIGHT);
      const ctx = canvas.getContext('2d');

      this.drawBackground(ctx);
      this.drawTitle(ctx, generatedContent.title_ja);
      this.drawSiteName(ctx);
      this.drawCategory(ctx, generatedContent.seo.tags[0] || 'AI');

      const canvasBuffer = canvas.toBuffer('image/png');
      
      const optimizedBuffer = await sharp(canvasBuffer)
        .png({ quality: 90, compressionLevel: 6 })
        .toBuffer();

      const filename = `thumbnail-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.png`;

      console.log(`✅ Generated thumbnail: ${filename} (${optimizedBuffer.length} bytes)`);

      return {
        buffer: optimizedBuffer,
        filename,
        mimeType: 'image/png'
      };
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      throw error;
    }
  }

  private drawBackground(ctx: any): void {
    const gradient = ctx.createLinearGradient(0, 0, this.WIDTH, this.HEIGHT);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(0.5, '#764ba2');
    gradient.addColorStop(1, '#f093fb');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * this.WIDTH;
      const y = Math.random() * this.HEIGHT;
      const radius = Math.random() * 50 + 10;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
  }

  private drawTitle(ctx: any, title: string): void {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = this.WIDTH - 120;
    let fontSize = 48;
    
    do {
      ctx.font = `bold ${fontSize}px "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif`;
      fontSize -= 2;
    } while (ctx.measureText(title).width > maxWidth && fontSize > 24);

    const lines = this.wrapText(ctx, title, maxWidth);
    const lineHeight = fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const startY = (this.HEIGHT / 2) - (totalHeight / 2) + (lineHeight / 2);

    lines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.strokeText(line, this.WIDTH / 2, y);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, this.WIDTH / 2, y);
    });
  }

  private drawSiteName(ctx: any): void {
    ctx.font = 'bold 24px "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeText(this.SITE_NAME, 40, this.HEIGHT - 40);
    
    ctx.fillText(this.SITE_NAME, 40, this.HEIGHT - 40);
  }

  private drawCategory(ctx: any, category: string): void {
    const categoryText = `#${category}`;
    
    ctx.font = '20px "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    
    ctx.fillText(categoryText, this.WIDTH - 40, this.HEIGHT - 40);
  }

  private wrapText(ctx: any, text: string, maxWidth: number): string[] {
    const words = text.split('');
    const lines: string[] = [];
    let currentLine = '';

    for (const char of words) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine !== '') {
        lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.slice(0, 3);
  }

  async generateSVGThumbnail(generatedContent: GeneratedContent): Promise<string> {
    const title = generatedContent.title_ja;
    const category = generatedContent.seo.tags[0] || 'AI';
    
    const svg = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#764ba2;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#f093fb;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow">
      <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="rgba(0,0,0,0.3)"/>
  
  <text x="600" y="315" font-family="Arial, sans-serif" font-size="48" font-weight="bold" 
        text-anchor="middle" fill="white" filter="url(#shadow)">
    ${this.escapeXml(title.length > 50 ? title.substring(0, 47) + '...' : title)}
  </text>
  
  <text x="40" y="590" font-family="Arial, sans-serif" font-size="24" font-weight="bold" 
        fill="white" filter="url(#shadow)">
    ${this.SITE_NAME}
  </text>
  
  <text x="1160" y="590" font-family="Arial, sans-serif" font-size="20" 
        text-anchor="end" fill="rgba(255,255,255,0.8)">
    #${this.escapeXml(category)}
  </text>
</svg>`;

    return svg;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
