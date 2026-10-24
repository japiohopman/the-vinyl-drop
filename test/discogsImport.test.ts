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
    expect(response.text).toContain('Artist Name');
    expect(response.text).toContain('Release / Track Title');
  });
});
