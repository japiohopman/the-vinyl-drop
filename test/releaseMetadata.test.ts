import { releaseSchema } from '../src/validators/release';
import {
  COUNTRY_OPTIONS,
  RELEASE_GENRES,
  RELEASE_STYLES,
  STYLE_PARENT_GENRES,
  getStylesForGenre,
  isKnownGenreInput,
  isKnownStyleInput,
  normalizeCanonicalGenres,
  normalizeCanonicalStyles,
  resolveCanonicalStyle,
  resolveCountry,
  resolveReleaseCountryMetadata,
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

  it('preserves original country source text while storing a canonical ISO code', () => {
    expect(resolveReleaseCountryMetadata('UK', 'GB')).toEqual({
      country: 'UK',
      countryCode: 'GB',
    });
    expect(resolveReleaseCountryMetadata('Yugoslavia', undefined)).toEqual({
      country: 'Yugoslavia',
      countryCode: null,
    });
    expect(resolveReleaseCountryMetadata(undefined, 'GB')).toEqual({
      country: 'United Kingdom',
      countryCode: 'GB',
    });
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
    expect(normalizeVinylFormatCharacteristics('CD, Album, Reissue')).toEqual([]);
    expect(normalizeVinylFormatCharacteristics('Cassette, Album')).toEqual([]);
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

  describe('controlled Release styles taxonomy (Issue #391)', () => {
    it('supports the full 10-style taxonomy as canonical styles', () => {
      expect(RELEASE_STYLES).toEqual([
        'Dancehall',
        'Ska',
        'Punk',
        'House',
        'Techno',
        'Disco',
        'Funk',
        'Soul',
        'Classic Rock',
        'R&B / Rhythm & Blues',
      ]);
      expect(RELEASE_STYLES).toHaveLength(10);
    });

    it('maps styles to parent genres correctly, including cross-genre Disco', () => {
      expect(STYLE_PARENT_GENRES.Dancehall).toEqual(['Reggae']);
      expect(STYLE_PARENT_GENRES.Ska).toEqual(['Reggae']);
      expect(STYLE_PARENT_GENRES.Punk).toEqual(['Rock']);
      expect(STYLE_PARENT_GENRES.House).toEqual(['Electronic']);
      expect(STYLE_PARENT_GENRES.Techno).toEqual(['Electronic']);
      expect(STYLE_PARENT_GENRES.Disco).toEqual(['Funk / Soul', 'Electronic']);
      expect(STYLE_PARENT_GENRES.Funk).toEqual(['Funk / Soul']);
      expect(STYLE_PARENT_GENRES.Soul).toEqual(['Funk / Soul']);
      expect(STYLE_PARENT_GENRES['Classic Rock']).toEqual(['Rock']);
      expect(STYLE_PARENT_GENRES['R&B / Rhythm & Blues']).toEqual(['Funk / Soul']);

      expect(getStylesForGenre('Reggae')).toEqual(['Dancehall', 'Ska']);
      expect(getStylesForGenre('Rock')).toEqual(['Punk', 'Classic Rock']);
      expect(getStylesForGenre('Electronic')).toEqual(['House', 'Techno', 'Disco']);
      expect(getStylesForGenre('Funk / Soul')).toEqual(['Disco', 'Funk', 'Soul', 'R&B / Rhythm & Blues']);
    });

    it('normalizes styles conservatively and resolves common aliases', () => {
      expect(normalizeCanonicalStyles(['House', 'Techno', 'Gabber'])).toEqual(['House', 'Techno']);
      expect(normalizeCanonicalStyles('disco, punk')).toEqual(['Punk', 'Disco']);
      expect(normalizeCanonicalStyles(['Rhythm & Blues', 'rnb'])).toEqual(['R&B / Rhythm & Blues']);
      expect(normalizeCanonicalStyles(null)).toEqual([]);
      expect(normalizeCanonicalStyles('')).toEqual([]);

      expect(resolveCanonicalStyle('disco')).toBe('Disco');
      expect(resolveCanonicalStyle('rhythm and blues')).toBe('R&B / Rhythm & Blues');
      expect(resolveCanonicalStyle('rnb')).toBe('R&B / Rhythm & Blues');
      expect(resolveCanonicalStyle('classic rock')).toBe('Classic Rock');
      expect(resolveCanonicalStyle('unknown style')).toBeNull();
    });

    it('validates manual style input against controlled vocabulary and allows unknown values on provider import', () => {
      expect(isKnownStyleInput('House, Techno')).toBe(true);
      expect(isKnownStyleInput(['House', 'Disco'])).toBe(true);
      expect(isKnownStyleInput('Unknown Freeform Tag')).toBe(false);

      const validManual = {
        artist: 'Daft Punk',
        title: 'Homework',
        genre: 'Electronic',
        styles: ['House', 'Techno'],
      };
      expect(releaseSchema.safeParse(validManual).success).toBe(true);

      const invalidManual = {
        artist: 'Daft Punk',
        title: 'Homework',
        genre: 'Electronic',
        styles: 'Speedcore',
      };
      expect(releaseSchema.safeParse(invalidManual).success).toBe(false);

      const providerWithUnknownStyle = {
        artist: 'Daft Punk',
        title: 'Homework',
        genre: 'Electronic',
        styles: ['French Touch', 'House'],
        externalSource: 'discogs',
        externalId: '123456',
      };
      expect(releaseSchema.safeParse(providerWithUnknownStyle).success).toBe(true);
    });
  });
});
