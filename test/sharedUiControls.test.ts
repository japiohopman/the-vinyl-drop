import ejs from 'ejs';
import path from 'path';
import { readFileSync } from 'fs';
import { getIconSvg } from '../src/app/utils/iconRegistry';

const root = path.resolve(__dirname, '..');

describe('Shared UI controls (#292)', () => {
  it('renders listing seller and location markers through the shared icon partial', async () => {
    const html = await ejs.renderFile(path.join(root, 'views/partials/listing-card.ejs'), {
      getIconSvg,
      mode: 'grid',
      listing: {
        id: 'shared-ui-test',
        title: 'Doggy Style',
        artist: 'Snoop Dogg',
        sellerUsername: 'crate_digger',
        sellerLocation: 'Amsterdam',
        imageUrl: '/assets/vinyl-placeholder.svg',
        priceFormatted: '€25.00',
      },
    });

    expect(html).toContain('class="icon icon-user"');
    expect(html).toContain('class="icon icon-pin"');
    expect(html).not.toContain('<svg width="12" height="12"');
  });

  it('uses the shared search icon wrapper on Browse, Dig and release search', () => {
    const templates = [
      'views/browse/index.ejs',
      'views/browse/responsive-dig.ejs',
      'views/listings/select-release.ejs',
    ];

    for (const template of templates) {
      const source = readFileSync(path.join(root, template), 'utf8');
      expect(source).toContain('class="form-search-control"');
      expect(source).toContain("name: 'search'");
    }
  });

  it('defines shared field dimensions, keyboard focus, invalid state and search-icon spacing', () => {
    const css = readFileSync(path.join(root, 'public/css/style.css'), 'utf8');

    expect(css).toContain('.form-control,\n.form-input {');
    expect(css).toContain('min-height: 44px;');
    expect(css).toContain('.form-control:focus-visible,\n.form-input:focus-visible');
    expect(css).toContain('.form-control[aria-invalid="true"]');
    expect(css).toContain('.form-search-control > .form-control');
    expect(css).toContain('padding-left: 2.75rem;');
  });
});
