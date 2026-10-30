import fs from 'fs';
import path from 'path';

/**
 * Reconstruct the original main stylesheet source order for isolated browser
 * and source-level tests. Production HTML loads route-specific segments only
 * for their owner routes; concatenation here restores the original cascade.
 */
const orderedMainStylesheetSegments = [
  'style.css',
  'dig-experience.css',
  'listing-detail.css',
  'my-listings.css',
  'style-after-features.css',
  'activity-release-selection.css',
  'browse-dig-controls.css',
  'style-after-activity.css',
  'release-selection-overrides.css',
  'style-after-release-selection.css',
  'dig-mobile-session.css',
  'listing-forms.css',
  'style-after-listing-forms.css',
  'profile-pages.css',
  'style-after-profile-pages.css',
  'profile-editor.css',
  'style-after-profile-editor.css',
  'listing-interactions.css',
];

function readCssFile(name: string): string {
  return fs
    .readFileSync(path.join(process.cwd(), 'public/css', name), 'utf8')
    .replace(/\r\n|\r/g, '\n');
}

export function readReconstructedMainStylesheet(): string {
  return orderedMainStylesheetSegments
    .map((name) => readCssFile(name))
    .join('');
}

export function readFullStylesheetSource(): string {
  return readReconstructedMainStylesheet() + readCssFile('dig-mobile-crate.css');
}
