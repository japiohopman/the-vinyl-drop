import { releaseSchema } from '../src/validators/release';
import {
  COUNTRY_OPTIONS,
  RELEASE_GENRES,
  isKnownGenreInput,
  normalizeCanonicalGenres,
  resolveCountry,
} from '../src/domain/releaseMetadata';
import { normalizeVinylFormatCharacteristics } from '../src/domain/releaseFormat';

describe('controlled Release metadata', () => {
  it('offers the ISO alpha-2 country set and resolves common provider aliases', () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(240);
    expect(resolveCountry('UK')).toMatchObject({ code: 'GB', label: 'United Kingdom' });
    expect(resolveCountry('USA')).toMatchObject({ code: 'US', label: 'United States' });
    expect(resolveCountry('Netherlands')).toMatchObject({ code: 'NL', label: 'Netherlands' });
    expect(resolveCountry('Atlantis')).toBeNull();
  });

  it('uses one genre vocabulary and maps known provider variants', () => {
    expect(RELEASE_GENRES).toContain('Folk, World & Country');
    expect(RELEASE_GENRES).toContain('Ambient');
    expect(isKnownGenreInput(RELEASE_GENRES.join(', '))).toBe(true);
    expect(normalizeCanonicalGenres([...RELEASE_GENRES])).toEqual([...RELEASE_GENRES]);
    expect(normalizeCanonicalGenres(['Funk', 'Soul', 'Electronic', 'Rare Groove'])).toEqual([
      'Electronic',
      'Funk / Soul',
    ]);
    expect(isKnownGenreInput('Funk, Soul, Electronic')).toBe(true);
    expect(isKnownGenreInput('Rare Groove')).toBe(false);
  });

  it('normalizes only explicit vinyl format characteristics', () => {
    expect(normalizeVinylFormatCharacteristics('Vinyl, LP, 12", Album')).toEqual(['lp', '12-inch']);
    expect(normalizeVinylFormatCharacteristics('Vinyl, Single, 45 RPM')).toEqual([]);
    expect(normalizeVinylFormatCharacteristics('Vinyl, 7 inch, Single')).toEqual(['7-inch']);
  });

  it('rejects invalid manual country and genre values and mismatched country pairs', () => {
    const base = { artist: 'James Brown', title: 'Sex Machine', country: 'UK', genre: 'Funk, Soul' };
    expect(releaseSchema.safeParse(base).success).toBe(true);
    expect(releaseSchema.safeParse({ ...base, country: 'Atlantis' }).success).toBe(false);
    expect(releaseSchema.safeParse({ ...base, genre: 'Rare Groove' }).success).toBe(false);
    expect(releaseSchema.safeParse({ ...base, countryCode: 'NL' }).success).toBe(false);

    const providerImport = {
      ...base,
      country: 'Yugoslavia',
      genre: 'Rare Groove',
      externalSource: 'discogs',
      externalId: '123456',
    };
    expect(releaseSchema.safeParse(providerImport)).toMatchObject({
      success: true,
      data: { country: 'Yugoslavia', genre: 'Rare Groove' },
    });
    expect(releaseSchema.safeParse({ ...providerImport, externalId: 'invalid' }).success).toBe(false);
    expect(releaseSchema.safeParse({ ...base, countryCode: 'GB' }).success).toBe(true);
    expect(releaseSchema.safeParse({ ...base, formatCharacteristics: ['7-inch'] }).success).toBe(true);
    expect(releaseSchema.safeParse({ ...base, formatCharacteristics: ['10-inch'] }).success).toBe(false);
  });
});
