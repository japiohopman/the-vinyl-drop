import fs from 'fs';
import path from 'path';

export const ALLOWLISTED_ICON_NAMES = new Set<string>([
  'boombox',
  'calendar',
  'cardboard-box-closed',
  'click',
  'close',
  'cog',
  'confirmed',
  'conversation',
  'edit',
  'envelope',
  'funnel',
  'home',
  'logout',
  'next-button',
  'pause-button',
  'photo-camera',
  'pin',
  'plain-arrow',
  'position-marker',
  'previous-button',
  'price-tag',
  'round-star',
  'save',
  'search',
  'sound-off',
  'sound-on',
  'talk',
  'thought-bubble',
  'trash-can',
  'user',
]);

export interface IconOptions {
  size?: string | number;
  class?: string;
  className?: string;
  ariaHidden?: boolean;
  title?: string;
  ariaLabel?: string;
  style?: string;
}

const svgCache = new Map<string, { viewBox: string; innerXml: string }>();

const FALLBACK_ICON = {
  viewBox: '0 0 24 24',
  innerXml: '<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 17v-1m0-3c0-2 2-2 2-4a2 2 0 1 0-4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};

function parseSvgContent(rawSvg: string): { viewBox: string; innerXml: string } {
  const viewBoxMatch = rawSvg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 512 512';

  // Extract content between <svg ...> and </svg>
  const innerXml = rawSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

  return { viewBox, innerXml };
}

function loadIconData(name: string): { viewBox: string; innerXml: string } {
  if (!ALLOWLISTED_ICON_NAMES.has(name)) {
    return FALLBACK_ICON;
  }

  if (svgCache.has(name)) {
    return svgCache.get(name)!;
  }

  const svgPath = path.join(__dirname, '../../../public/assets/svg', `${name}.svg`);
  try {
    const rawContent = fs.readFileSync(svgPath, 'utf-8');
    const parsed = parseSvgContent(rawContent);
    svgCache.set(name, parsed);
    return parsed;
  } catch {
    return FALLBACK_ICON;
  }
}

export function getIconSvg(name: string, options: IconOptions = {}): string {
  const safeName = ALLOWLISTED_ICON_NAMES.has(name) ? name : 'unknown';
  const iconData = loadIconData(safeName);

  const classes = ['icon', `icon-${safeName}`];
  const customClass = options.class || options.className;
  if (customClass) {
    classes.push(customClass);
  }

  const attrs: string[] = [
    'xmlns="http://www.w3.org/2000/svg"',
    `viewBox="${iconData.viewBox}"`,
    `class="${classes.join(' ')}"`,
  ];

  if (options.size !== undefined && options.size !== null && options.size !== '') {
    const sizeVal = typeof options.size === 'number' ? `${options.size}px` : options.size;
    attrs.push(`width="${sizeVal}"`, `height="${sizeVal}"`);
  }

  if (options.style) {
    attrs.push(`style="${options.style}"`);
  }

  const titleText = options.title || options.ariaLabel;
  const isExplicitAriaHidden = options.ariaHidden !== undefined ? Boolean(options.ariaHidden) : undefined;

  if (isExplicitAriaHidden === true) {
    attrs.push('aria-hidden="true"');
  } else if (isExplicitAriaHidden === false) {
    attrs.push('aria-hidden="false"');
    if (titleText) {
      attrs.push(`aria-label="${titleText}"`, 'role="img"');
    }
  } else {
    // Default behavior
    if (titleText) {
      attrs.push(`aria-label="${titleText}"`, 'role="img"');
    } else {
      attrs.push('aria-hidden="true"');
    }
  }

  let titleElement = '';
  if (options.title) {
    titleElement = `<title>${options.title}</title>`;
  }

  return `<svg ${attrs.join(' ')}>${titleElement}${iconData.innerXml}</svg>`;
}
