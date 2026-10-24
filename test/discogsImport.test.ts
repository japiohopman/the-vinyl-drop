import { searchDiscogs } from '../src/app/services/discogsService';
import { DiscogsMetadataProvider } from '../src/app/services/metadata/discogsProvider';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { setSupabaseClient } from '../src/lib/supabase';
import * as profileRepo from '../src/app/repositories/profileRepository';

jest.mock('../src/app/repositories/profileRepository');

const app = createApp();

describe('Discogs API & Catalog Import (Issue #39)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty results for empty query', async () => {
    const results = await searchDiscogs('   ');
    expect(results).toEqual([]);
  });

  describe('Authenticated Discogs metadata lookup', () => {
    const sellerId = '10000000-0000-4000-8000-000000000001';

    beforeEach(() => {
      const mockSupabase = {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: sellerId, email: 'seller@example.com' } },
            error: null,
          }),
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSupabaseClient(mockSupabase as any);
      (profileRepo.findProfileById as jest.Mock).mockResolvedValue({
        id: sellerId,
        username: 'seller_user',
        displayName: 'Seller User',
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
      setSupabaseClient({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      } as any);
    });

    it('redirects unauthenticated users before running a Discogs metadata lookup', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSupabaseClient({
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      } as any);

      const response = await supertest(app).get('/releases/lookup-metadata');
      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('/auth/login?next=%2Freleases%2Flookup-metadata');
    });

    it('returns the confident Discogs match and available metadata', async () => {
      jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates').mockResolvedValue([{
        id: 'discogs:123',
        providerName: 'discogs',
        externalId: '123',
        artist: 'James Brown',
        title: 'Sex Machine',
        label: 'Polydor',
        catalogueNumber: 'PD 123',
        releaseYear: 1970,
        country: 'UK',
        format: 'Vinyl, LP, Album',
        barcode: '0123456789012',
        genre: 'Funk, Soul',
        coverArtUrl: 'https://i.discogs.com/example-cover.jpg',
        sourceUrl: 'https://www.discogs.com/release/123',
        matchScore: 0,
        matchedEvidence: [],
        provenance: { provider: 'discogs', externalId: '123', fetchedAt: '2026-01-01T00:00:00.000Z' },
      }]);

      const response = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'James Brown', title: 'Sex Machine' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        found: true,
        metadata: {
          label: 'Polydor',
          catalogueNumber: 'PD 123',
          releaseYear: '1970',
          country: 'UK',
          format: 'Vinyl, LP, Album',
          genre: 'Funk, Soul',
        },
      });
      expect(DiscogsMetadataProvider.prototype.searchCandidates).toHaveBeenCalledWith({
        artist: 'James Brown',
        title: 'Sex Machine',
      });
    });

    it('returns no match unless both artist and title match confidently', async () => {
      jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates').mockResolvedValue([{
        id: 'discogs:456',
        providerName: 'discogs',
        externalId: '456',
        artist: 'Different Artist',
        title: 'Another Album',
        matchScore: 0,
        matchedEvidence: [],
        provenance: { provider: 'discogs', externalId: '456', fetchedAt: '2026-01-01T00:00:00.000Z' },
      }]);

      const response = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'James Brown', title: 'Sex Machine' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ found: false });
    });

    it('rejects artist matches embedded inside a different word', async () => {
      jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates').mockResolvedValue([{
        id: 'discogs:777',
        providerName: 'discogs',
        externalId: '777',
        artist: 'Blacksmith',
        title: 'Sex Machine',
        matchScore: 0,
        matchedEvidence: [],
        provenance: { provider: 'discogs', externalId: '777', fetchedAt: '2026-01-01T00:00:00.000Z' },
      }]);

      const response = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'Smith', title: 'Sex Machine' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ found: false });
    });

    it('falls back to a track-title search when no confident album-title match exists', async () => {
      const calls: Array<{ artist?: string; title?: string; track?: string }> = [];
      jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates').mockImplementation(async (query) => {
        calls.push(query);
        if (query.track) {
          return [{
            id: 'discogs:990',
            providerName: 'discogs',
            externalId: '990',
            artist: 'James Brown',
            // The result title is the containing release, not the searched track.
            title: 'Different Release Album',
            label: 'Polydor',
            releaseYear: 1971,
            country: 'US',
            format: 'Vinyl, LP, Album',
            matchScore: 0,
            matchedEvidence: [],
            provenance: { provider: 'discogs', externalId: '990', fetchedAt: '2026-01-01T00:00:00.000Z' },
          }];
        }
        return [{
          id: 'discogs:991',
          providerName: 'discogs',
          externalId: '991',
          artist: 'Different Artist',
          title: 'Sex Machine',
          matchScore: 0,
          matchedEvidence: [],
          provenance: { provider: 'discogs', externalId: '991', fetchedAt: '2026-01-01T00:00:00.000Z' },
        }];
      });

      const response = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'James Brown', title: 'Sex Machine' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        found: true,
        matchType: 'track',
        metadata: {
          label: 'Polydor',
          releaseYear: '1971',
          country: 'US',
        },
      });
      expect(calls).toEqual([
        { artist: 'James Brown', title: 'Sex Machine' },
        { artist: 'James Brown', track: 'Sex Machine' },
      ]);
    });

    it('normalizes accents and punctuation before auto-filling', async () => {
      jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates').mockResolvedValue([{
        id: 'discogs:789',
        providerName: 'discogs',
        externalId: '789',
        artist: 'Beyonce',
        title: 'Deja Vu',
        label: 'Columbia',
        matchScore: 0,
        matchedEvidence: [],
        provenance: { provider: 'discogs', externalId: '789', fetchedAt: '2026-01-01T00:00:00.000Z' },
      }]);

      const response = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'Beyoncé', title: 'Déjà Vu' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        found: true,
        metadata: { label: 'Columbia' },
      });
    });

    it('rejects empty and oversized lookup queries without calling Discogs', async () => {
      const providerSpy = jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates');
      const empty = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'J', title: '' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);
      const oversized = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'A'.repeat(121), title: 'Album' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(empty.status).toBe(400);
      expect(oversized.status).toBe(400);
      expect(providerSpy).not.toHaveBeenCalled();
    });

    it('returns a safe 503 when Discogs is unavailable', async () => {
      jest.spyOn(DiscogsMetadataProvider.prototype, 'searchCandidates').mockRejectedValue(new Error('private provider detail'));
      const response = await supertest(app)
        .get('/releases/lookup-metadata')
        .query({ artist: 'James Brown', title: 'Sex Machine' })
        .set('Cookie', ['sb-access-token=mock-valid-token']);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({ error: 'Discogs lookup is temporarily unavailable.' });
      expect(response.body.error).not.toContain('private provider detail');
    });
  });

  it('GET /releases/new should redirect unauthenticated users to login', async () => {
    const response = await supertest(app).get('/releases/new');
    expect(response.status).toBe(302);
    expect(response.headers.location).toContain('/auth/login?next=%2Freleases%2Fnew');
  });

  it('GET /releases/new should render custom release form for authenticated users', async () => {
    const mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: {
            user: {
              id: '10000000-0000-4000-8000-000000000001',
              email: 'seller@example.com',
            },
          },
          error: null,
        }),
      },
    };
    /* eslint-disable @typescript-eslint/no-explicit-any */
    setSupabaseClient(mockSupabase as any);

    (profileRepo.findProfileById as jest.Mock).mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000001',
      username: 'seller_user',
      displayName: 'Seller User',
    });

    const response = await supertest(app)
      .get('/releases/new')
      .set('Cookie', ['sb-access-token=mock-valid-token']);

    expect(response.status).toBe(200);
    expect(response.text).toContain('Add a record');
    expect(response.text).toContain('data-discogs-lookup-form');
    expect(response.text).toContain('Use this device');
    expect(response.text).toContain('Artist *');
    expect(response.text).toContain('Track or album title *');
  });
});
