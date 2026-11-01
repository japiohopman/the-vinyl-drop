import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(process.cwd(), 'public/css/themes.css'), 'utf8');
const themes = ['record-shop', 'blue-note', 'soul-45', 'mint-press', 'midnight-groove', 'purple-haze'];

function getThemeTokens(theme: string): Record<string, string> {
  const selector = new RegExp(
    'html\\[data-theme="' + theme + '"\\],\\s*\\.theme-swatch\\[data-theme="' + theme + '"\\]\\s*\\{([\\s\\S]*?)\\}'
  );
  const block = source.match(selector)?.[1];
  if (!block) throw new Error('Missing theme token block: ' + theme);

  const tokens: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const token = line.match(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/);
    if (token) tokens['--' + token[1]] = token[2];
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('shared theme token contrast', () => {
  it.each(themes)('%s preserves text, actions, focus and status contrast', (theme) => {
    const tokens = getThemeTokens(theme);
    const atLeast = (foreground: string, background: string, minimum: number) => {
      expect(contrast(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(minimum);
    };

    atLeast('--color-ink', '--color-paper', 4.5);
    atLeast('--color-ink', '--color-white', 4.5);
    atLeast('--color-ink-muted', '--color-paper', 4.5);
    atLeast('--color-ink-muted', '--color-white', 4.5);
    atLeast('--color-ink-muted', '--color-surface-hover', 4.5);
    atLeast('--color-rust-accessible', '--color-paper', 4.5);
    atLeast('--color-rust-accessible', '--color-white', 4.5);
    atLeast('--color-white', '--color-rust', 4.5);
    atLeast('--color-white', '--color-deep-green', 4.5);
    atLeast('--color-focus', '--color-paper', 3);
    atLeast('--color-focus', '--color-white', 3);
    atLeast('--color-border', '--color-paper', 3);
    atLeast('--color-border', '--color-white', 3);
    atLeast('--color-error-border', '--color-error-bg', 3);
    atLeast('--color-success-border', '--color-success-bg', 3);
  });

  it('retains the original infrared highlight alongside its contrast-safe interactive tone', () => {
    expect(themes).toHaveLength(6);
    expect(getThemeTokens('record-shop')['--color-rust-highlight']).toBe('#F60F4B');
    expect(getThemeTokens('record-shop')['--color-rust-accessible']).toBe('#D6003B');
  });
});
