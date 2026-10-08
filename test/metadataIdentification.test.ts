import {
  scoreCandidateMatch,
  MetadataIdentificationService,
} from '../src/app/services/metadata/identificationService';
import { DiscogsMetadataProvider } from '../src/app/services/metadata/discogsProvider';
import { MusicBrainzMetadataProvider } from '../src/app/services/metadata/musicbrainzProvider';
import {
  CandidateRelease,
  IdentificationQuery,
  MetadataProvider,
} from '../src/app/services/metadata/types';
import * as releaseRepo from '../src/app/repositories/releaseRepository';
import { ValidationError } from '../src/app/services/errors';

jest.mock('../src/app/repositories/releaseRepository');

describe('Phase 5 Metadata Identification & Enrichment (Issue #14)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Evidence Match Scoring Engine', () => {
    it('should calculate barcode match (+40) and catalogue number match (+25)', () => {
      const query: IdentificationQuery = {
        barcode: '0724388437728',
        catalogueNumber: '7243 8 84377 2 8',
      };
      const candidate: CandidateRelease = {
        id: 'discogs:1001',
        providerName: 'discogs',
        externalId: '1001',
        artist: 'Radiohead',
        title: 'OK Computer',
        barcode: '0724388437728',
        catalogueNumber: '724388437728',
        matchScore: 0,
        matchedEvidence: [],
        provenance: {
          provider: 'discogs',
          externalId: '1001',
          fetchedAt: new Date().toISOString(),
        },
      };

      const result = scoreCandidateMatch(query, candidate);
      expect(result.matchScore).toBe(65);
      expect(result.matchedEvidence).toContain('barcode');
      expect(result.matchedEvidence).toContain('catalogueNumber');
    });

    it('should calculate artist, title, label, release year, OCR, and matrix matches', () => {
      const query: IdentificationQuery = {
        artist: 'Pink Floyd',
        title: 'The Dark Side of the Moon',
        label: 'Harvest',
        releaseYear: 1973,
        matrixRunout: 'SHVL 804 A-1',
        ocrText: 'Harvest SHVL 804 Pink Floyd Dark Side of the Moon',
      };

      const candidate: CandidateRelease = {
        id: 'discogs:2002',
        providerName: 'discogs',
        externalId: '2002',
        artist: 'Pink Floyd',
        title: 'The Dark Side of the Moon',
        label: 'Harvest Records',
        releaseYear: 1973,
        catalogueNumber: 'SHVL 804',
        matchScore: 0,
        matchedEvidence: [],
        provenance: {
          provider: 'discogs',
          externalId: '2002',
          fetchedAt: new Date().toISOString(),
        },
      };

      const result = scoreCandidateMatch(query, candidate);
      expect(result.matchScore).toBe(60);
      expect(result.matchedEvidence).toEqual(
        expect.arrayContaining(['artist', 'title', 'matrixRunout', 'ocrText', 'releaseYear', 'label'])
      );
    });

    it('should cap match score at 100 max', () => {
      const query: IdentificationQuery = {
        barcode: '123456789',
        catalogueNumber: 'CAT123',
        artist: 'Artist',
        title: 'Title',
        matrixRunout: 'CAT123',
        ocrText: 'Artist Title CAT123',
        releaseYear: 2020,
        label: 'Label',
      };

      const candidate: CandidateRelease = {
        id: 'discogs:3003',
        providerName: 'discogs',
        externalId: '3003',
        artist: 'Artist',
        title: 'Title',
        barcode: '123456789',
        catalogueNumber: 'CAT123',
        releaseYear: 2020,
        label: 'Label',
        matchScore: 0,
        matchedEvidence: [],
        provenance: {
          provider: 'discogs',
          externalId: '3003',
          fetchedAt: new Date().toISOString(),
        },
      };

      const result = scoreCandidateMatch(query, candidate);
      expect(result.matchScore).toBe(100);
    });
  });

  describe('Discogs Metadata Provider Adapter', () => {
    it('should map Discogs API response to CandidateRelease with provenance and sourceUrl', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 123456,
              title: 'Daft Punk - Discovery',
              year: '2001',
              country: 'France',
              format: ['Vinyl', 'LP', 'Album'],
              label: ['Virgin'],
              catno: 'V2940',
              barcode: ['724384960612'],
              cover_image: 'https://img.discogs.com/cover.jpg',
              genre: ['Electronic'],
              uri: '/release/123456-Daft-Punk-Discovery',
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      const provider = new DiscogsMetadataProvider();
      const candidates = await provider.searchCandidates({
        artist: 'Daft Punk',
        title: 'Discovery',
      });

      expect(candidates).toHaveLength(1);
      const c = candidates[0];
      expect(c.id).toBe('discogs:123456');
      expect(c.providerName).toBe('discogs');
      expect(c.externalId).toBe('123456');
      expect(c.artist).toBe('Daft Punk');
      expect(c.title).toBe('Discovery');
      expect(c.label).toBe('Virgin');
      expect(c.catalogueNumber).toBe('V2940');
      expect(c.releaseYear).toBe(2001);
      expect(c.country).toBe('France');
      expect(c.barcode).toBe('724384960612');
      expect(c.coverArtUrl).toBe('https://img.discogs.com/cover.jpg');
      expect(c.sourceUrl).toBe('https://www.discogs.com/release/123456-Daft-Punk-Discovery');
      expect(c.provenance.provider).toBe('discogs');
      expect(c.provenance.attribution).toContain('Discogs');
    });

    it('should handle Discogs API error and rate limits safely without crashing', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
      });
      global.fetch = mockFetch;

      const provider = new DiscogsMetadataProvider();
      const candidates = await provider.searchCandidates({ barcode: '99999999' });

      expect(candidates).toEqual([]);
    });
  });

  describe('MusicBrainz Metadata Provider Adapter', () => {
    it('should send production contact User-Agent header and map all response fields correctly', async () => {
      let capturedHeaders: Record<string, string> = {};

      const mockFetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return Promise.resolve({
          ok: true,
          json: async () => ({
            releases: [
              {
                id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                title: 'Kid A',
                date: '2000-10-02',
                country: 'GB',
                barcode: '0724352775313',
                'artist-credit': [{ name: 'Radiohead' }],
                'label-info': [
                  {
                    'catalog-number': 'LPNDKIDA1',
                    label: { name: 'Parlophone' },
                  },
                ],
                media: [{ format: '10" Vinyl' }],
              },
            ],
          }),
        });
      });
      global.fetch = mockFetch;

      const provider = new MusicBrainzMetadataProvider({ minIntervalMs: 10 });
      const candidates = await provider.searchCandidates({
        artist: 'Radiohead',
        title: 'Kid A',
      });

      expect(capturedHeaders['User-Agent']).toBe('TheVinylDrop/1.0.0 ( https://github.com/japiohopman/the-vinyl-drop )');
      expect(candidates).toHaveLength(1);
      const c = candidates[0];
      expect(c.id).toBe('musicbrainz:a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(c.providerName).toBe('musicbrainz');
      expect(c.externalId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(c.artist).toBe('Radiohead');
      expect(c.title).toBe('Kid A');
      expect(c.label).toBe('Parlophone');
      expect(c.catalogueNumber).toBe('LPNDKIDA1');
      expect(c.releaseYear).toBe(2000);
      expect(c.country).toBe('GB');
      expect(c.format).toBe('10" Vinyl');
      expect(c.barcode).toBe('0724352775313');
      expect(c.sourceUrl).toBe('https://musicbrainz.org/release/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(c.provenance.provider).toBe('musicbrainz');
      expect(c.provenance.attribution).toContain('MusicBrainz');
    });

    it('should enforce concurrency-safe cross-instance throttling across concurrent MusicBrainzMetadataProvider instances', async () => {
      const fetchTimestamps: number[] = [];

      const mockFetch = jest.fn().mockImplementation(() => {
        fetchTimestamps.push(Date.now());
        return Promise.resolve({
          ok: true,
          json: async () => ({ releases: [] }),
        });
      });
      global.fetch = mockFetch;

      const provider1 = new MusicBrainzMetadataProvider({ minIntervalMs: 50 });
      const provider2 = new MusicBrainzMetadataProvider({ minIntervalMs: 50 });

      // Start both concurrent searches simultaneously before awaiting either
      const searchPromise1 = provider1.searchCandidates({ title: 'Query Concurrent 1' });
      const searchPromise2 = provider2.searchCandidates({ title: 'Query Concurrent 2' });

      await Promise.all([searchPromise1, searchPromise2]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(fetchTimestamps).toHaveLength(2);
      const timeDiff = fetchTimestamps[1] - fetchTimestamps[0];
      expect(timeDiff).toBeGreaterThanOrEqual(40);
    });

    it('should handle MusicBrainz error response safely', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      });
      global.fetch = mockFetch;

      const provider = new MusicBrainzMetadataProvider({ minIntervalMs: 10 });
      const candidates = await provider.searchCandidates({ artist: 'Unknown' });

      expect(candidates).toEqual([]);
    });
  });

  describe('Composite Metadata Identification Service', () => {
    it('should reject invalid IdentificationQuery with ValidationError', async () => {
      const service = new MetadataIdentificationService([]);
      /* eslint-disable @typescript-eslint/no-explicit-any */
      await expect(
        service.identifyCandidates({ releaseYear: 'not-a-number' as any })
      ).rejects.toThrow(ValidationError);
    });

    it('should aggregate candidates from multiple providers and rank by score descending', async () => {
      const provider1: MetadataProvider = {
        name: 'provider1',
        searchCandidates: jest.fn().mockResolvedValue([
          {
            id: 'provider1:p1',
            providerName: 'provider1',
            externalId: 'p1',
            artist: 'Fleetwood Mac',
            title: 'Rumours',
            catalogueNumber: 'BSK 3010',
            matchScore: 0,
            matchedEvidence: [],
            provenance: { provider: 'provider1', externalId: 'p1', fetchedAt: '' },
          },
        ]),
      };

      const provider2: MetadataProvider = {
        name: 'provider2',
        searchCandidates: jest.fn().mockResolvedValue([
          {
            id: 'provider2:p2',
            providerName: 'provider2',
            externalId: 'p2',
            artist: 'Fleetwood Mac',
            title: 'Rumours',
            barcode: '075992731321',
            matchScore: 0,
            matchedEvidence: [],
            provenance: { provider: 'provider2', externalId: 'p2', fetchedAt: '' },
          },
        ]),
      };

      const service = new MetadataIdentificationService([provider1, provider2]);
      const results = await service.identifyCandidates({
        artist: 'Fleetwood Mac',
        title: 'Rumours',
        barcode: '075992731321',
      });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('provider2:p2');
      expect(results[0].matchScore).toBe(70);
      expect(results[1].id).toBe('provider1:p1');
      expect(results[1].matchScore).toBe(30);
    });

    it('should remain resilient if one provider throws an error', async () => {
      const failingProvider: MetadataProvider = {
        name: 'failing',
        searchCandidates: jest.fn().mockRejectedValue(new Error('Provider network error')),
      };

      const workingProvider: MetadataProvider = {
        name: 'working',
        searchCandidates: jest.fn().mockResolvedValue([
          {
            id: 'working:w1',
            providerName: 'working',
            externalId: 'w1',
            artist: 'Miles Davis',
            title: 'Kind of Blue',
            matchScore: 0,
            matchedEvidence: [],
            provenance: { provider: 'working', externalId: 'w1', fetchedAt: '' },
          },
        ]),
      };

      const service = new MetadataIdentificationService([failingProvider, workingProvider]);
      const results = await service.identifyCandidates({ artist: 'Miles Davis' });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('working:w1');
    });

    it('should preserve nullable format without inventing defaults when confirming candidate', async () => {
      const mockCandidateOmittedFormat: CandidateRelease = {
        id: 'discogs:999',
        providerName: 'discogs',
        externalId: '999',
        artist: 'The Beatles',
        title: 'Abbey Road',
        label: 'Apple Records',
        catalogueNumber: 'PCS 7088',
        releaseYear: 1969,
        // format is undefined
        matchScore: 90,
        matchedEvidence: ['artist', 'title'],
        provenance: {
          provider: 'discogs',
          externalId: '999',
          fetchedAt: new Date().toISOString(),
        },
      };

      (releaseRepo.createRelease as jest.Mock).mockResolvedValue({
        id: '22222222-2222-4222-8222-222222222222',
        artist: 'The Beatles',
        title: 'Abbey Road',
        label: 'Apple Records',
        catalogueNumber: 'PCS 7088',
        releaseYear: 1969,
        country: null,
        format: null,
        barcode: null,
        genre: null,
        coverArtUrl: null,
        externalSource: 'discogs',
        externalId: '999',
      });

      const service = new MetadataIdentificationService([]);
      await service.confirmCandidateAsRelease(mockCandidateOmittedFormat);

      expect(releaseRepo.createRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          artist: 'The Beatles',
          title: 'Abbey Road',
          format: null, // format is preserved as null rather than defaulted to 'LP'
        }),
        undefined
      );
    });
  });
});
