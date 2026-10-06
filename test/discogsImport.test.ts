import { searchDiscogs } from '../src/app/services/discogsService';
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
    expect(response.text).toContain('Add Custom Release');
    expect(response.text).toContain('Artist Name');
    expect(response.text).toContain('Release / Track Title');
  });
});
