import fs from 'fs';
import path from 'path';

/**
 * Reconstruct the original style.css source order for source-level and isolated
 * browser tests. Production HTML loads only the shared segments and the bundle
 * that belongs to its current route.
 */
const orderedMainStylesheetSegments = [
  'style.css',
  'dig-experience.css',
  'listing-detail.css',
  'my-listings.css',
  'style-after-features.css',
];

export function readReconstructedMainStylesheet(): string {
  return orderedMainStylesheetSegments
    .map((name) => fs.readFileSync(path.join(process.cwd(), 'public/css', name), 'utf8'))
    .join('');
}

export function readFullStylesheetSource(): string {
  return readReconstructedMainStylesheet() +
    fs.readFileSync(path.join(process.cwd(), 'public/css/dig-mobile-crate.css'), 'utf8');
}
