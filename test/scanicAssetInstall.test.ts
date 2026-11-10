import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('self-hosted Scanic asset', () => {
  it('installs the pinned browser module and its MIT licence', () => {
    const vendorDirectory = path.join(__dirname, '../public/js/vendor/scanic');
    const browserModule = readFileSync(path.join(vendorDirectory, 'scanic.js'), 'utf8');
    const license = readFileSync(path.join(vendorDirectory, 'LICENSE'), 'utf8');

    expect(browserModule).toContain('scanDocument');
    expect(license).toContain('MIT License');
    expect(license).toContain('Copyright (c) 2025 marquaye');
  });
});
