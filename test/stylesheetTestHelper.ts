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
  'style-after-activity.css',
  'release-selection-overrides.css',
  'style-after-release-selection.css',
  'listing-forms.css',
  'style-after-listing-forms.css',
  'profile-pages.css',
  'style-after-profile-pages.css',
  'profile-editor.css',
  'style-after-profile-editor.css',
  'listing-interactions.css',
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
