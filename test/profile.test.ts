/* eslint-disable @typescript-eslint/no-explicit-any */
import request from 'supertest';
import { createApp } from '../src/app';
import { setSupabaseClient } from '../src/lib/supabase';
import * as profileRepository from '../src/app/repositories/profileRepository';
import { updateProfile, AuthorizationError } from '../src/app/services/profileService';
import { Profile } from '../src/db/schema/profiles';

describe('Profile Foundation & Server-Side Ownership', () => {
  let mockSupabase: any;

  const mockUserAlice = {
    id: 'aaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    email: 'alice@example.com',
  };

  const mockProfileAlice: Profile = {
    id: mockUserAlice.id,
    username: 'alice_records',
    displayName: 'Alice Cooper',
    avatarUrl: 'https://example.com/alice.jpg',
    bio: 'Jazz & Funk vinyl collector.',
    location: 'Berlin, DE',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockUserBob = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    email: 'bob@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: jest.fn(),
        signOut: jest.fn().mockResolvedValue({ error: null }),
      },
    };

    setSupabaseClient(mockSupabase);
  });

  describe('Public Profile Display', () => {
    it('GET /profiles/:username should render public profile details for existing username', async () => {
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(mockProfileAlice);

      const app = createApp();
      const res = await request(app).get('/profiles/alice_records');

      expect(res.status).toBe(200);
      expect(res.text).toContain('Alice Cooper');
      expect(res.text).toContain('@alice_records');
      expect(res.text).toContain('Jazz &amp; Funk vinyl collector.');
      expect(res.text).toContain('Berlin, DE');
      expect(res.text).not.toContain('Edit Profile'); // Not owner
    });

    it('GET /profiles/:username should render Edit Profile button when authenticated owner views own profile', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserAlice },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(mockProfileAlice);
      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(mockProfileAlice);

      const app = createApp();
      const res = await request(app)
        .get('/profiles/alice_records')
        .set('Cookie', ['sb-access-token=alice-valid-token']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Edit Profile');
    });

    it('GET /profiles/:username should return 404 when profile does not exist', async () => {
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get('/profiles/nonexistent_user_profile_123');

      expect(res.status).toBe(404);
      expect(res.text).toContain('404 - Page Not Found');
    });
  });

  describe('Authenticated Profile Access & Ownership Enforcement', () => {
    it('GET /profile should redirect unauthenticated user to /auth/login', async () => {
      const app = createApp();
      const res = await request(app).get('/profile');

      expect(res.status).toBe(302);
      expect(res.header.location).toContain('/auth/login');
    });

    it('GET /profile should redirect authenticated user to their public profile URL', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserAlice },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(mockProfileAlice);

      const app = createApp();
      const res = await request(app)
        .get('/profile')
        .set('Cookie', ['sb-access-token=alice-token']);

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profiles/alice_records');
    });

    it('GET /profile/edit should render profile edit form for authenticated user', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserAlice },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(mockProfileAlice);

      const app = createApp();
      const res = await request(app)
        .get('/profile/edit')
        .set('Cookie', ['sb-access-token=alice-token']);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Edit Your Profile');
      expect(res.text).toContain('value="alice_records"');
      expect(res.text).toContain('value="Alice Cooper"');
    });

    it('POST /profile/edit should update profile and redirect on valid submission', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUserAlice },
        error: null,
      });

      jest.spyOn(profileRepository, 'findProfileById').mockResolvedValue(mockProfileAlice);
      jest.spyOn(profileRepository, 'findProfileByUsername').mockResolvedValue(null);
      const updateSpy = jest.spyOn(profileRepository, 'updateProfile').mockImplementation(async (id: string, data: any) => ({
        ...mockProfileAlice,
        ...data,
      }));

      const app = createApp();
      const res = await request(app)
        .post('/profile/edit')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', ['sb-access-token=alice-token'])
        .send({
          username: 'alice_new_handle',
          displayName: 'Alice C.',
          bio: 'Updated bio details.',
          location: 'Amsterdam, NL',
          avatarUrl: '',
        });

      expect(res.status).toBe(302);
      expect(res.header.location).toBe('/profiles/alice_new_handle');
      expect(updateSpy).toHaveBeenCalledWith(
        mockUserAlice.id,
        expect.objectContaining({
          username: 'alice_new_handle',
          displayName: 'Alice C.',
          bio: 'Updated bio details.',
          location: 'Amsterdam, NL',
        }),
        undefined
      );
    });

    it('updateProfile service should throw AuthorizationError when requestingUserId does not match targetUserId', async () => {
      await expect(
        updateProfile(mockUserAlice.id, mockUserBob.id, {
          username: 'hacked_username',
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
