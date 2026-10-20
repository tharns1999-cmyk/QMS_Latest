import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Enterprise Typography System & Font Overhaul Tests', () => {
  it('1. index.html contains Google Fonts links for IBM Plex Sans Thai, Inter & JetBrains Mono', () => {
    const indexPath = path.resolve(__dirname, '../../../index.html');
    const htmlContent = fs.readFileSync(indexPath, 'utf-8');

    expect(htmlContent).toContain('fonts.googleapis.com');
    expect(htmlContent).toContain('IBM+Plex+Sans+Thai');
    expect(htmlContent).toContain('Inter');
    expect(htmlContent).toContain('JetBrains+Mono');
  });

  it('2. src/index.css configures @theme with IBM Plex Sans Thai and Inter in font-sans and font-mono', () => {
    const cssPath = path.resolve(__dirname, '../../index.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toContain('--font-sans');
    expect(cssContent).toContain('IBM Plex Sans Thai');
    expect(cssContent).toContain('Inter');
    expect(cssContent).toContain('--font-mono');
    expect(cssContent).toContain('JetBrains Mono');
    expect(cssContent).toContain('-webkit-font-smoothing: antialiased');
  });
});
