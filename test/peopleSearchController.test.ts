import request from 'supertest';
import { createApp } from '../src/app';
import * as peopleSearchService from '../src/app/services/peopleSearchService';

jest.mock('../src/app/services/peopleSearchService', () => ({
  ...jest.requireActual('../src/app/services/peopleSearchService'),
  getPeopleSearchSuggestions: jest.fn(),
  searchPeople: jest.fn(),
}));

const publicPerson = {
  username: 'crate_queen',
  displayName: 'Crate Queen',
  avatarUrl: 'https://images.example/crate-queen.webp',
};

describe('People search page and public suggestions API — Issue #297', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (peopleSearchService.getPeopleSearchSuggestions as jest.Mock).mockResolvedValue([publicPerson]);
    (peopleSearchService.searchPeople as jest.Mock).mockResolvedValue({
      items: [publicPerson],
      totalCount: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      hasMore: false,
    });
  });

  describe('GET /api/people-suggestions', () => {
    it('returns only public profile identity fields with no-store caching', async () => {
      const response = await request(createApp())
        .get('/api/people-suggestions?q=crate');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.suggestions).toEqual([publicPerson]);
      expect(Object.keys(response.body.suggestions[0]).sort()).toEqual([
        'avatarUrl',
        'displayName',
        'username',
      ]);
      expect(peopleSearchService.getPeopleSearchSuggestions).toHaveBeenCalledWith('crate');
    });

    it('returns an empty set without searching for short input', async () => {
      const response = await request(createApp())
        .get('/api/people-suggestions?q=C');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ suggestions: [] });
      expect(peopleSearchService.getPeopleSearchSuggestions).not.toHaveBeenCalled();
    });

    it('rejects missing, repeated, overlong and control-character query values', async () => {
      const app = createApp();

      expect((await request(app).get('/api/people-suggestions')).status).toBe(400);
      expect((await request(app).get('/api/people-suggestions?q[]=cr&q[]=ate')).status).toBe(400);
      expect((await request(app).get('/api/people-suggestions').query({ q: 'x'.repeat(51) })).status).toBe(400);
      expect((await request(app).get('/api/people-suggestions').query({ q: 'cr\nate' })).status).toBe(400);
      expect(peopleSearchService.getPeopleSearchSuggestions).not.toHaveBeenCalled();
    });
  });

  describe('GET /people', () => {
    it('renders the Records/People mode switch and links a public result to its profile', async () => {
      const response = await request(createApp()).get('/people?q=crate');

      expect(response.status).toBe(200);
      expect(response.text).toContain('aria-label="Search mode"');
      expect(response.text).toContain('href="/browse">Records</a>');
      expect(response.text).toContain('href="/people" aria-current="page">People</a>');
      expect(response.text).toContain('href="/profiles/crate_queen"');
      expect(response.text).toContain('Crate Queen');
      expect(response.text).toContain('@crate_queen');
      expect(peopleSearchService.searchPeople).toHaveBeenCalledWith('crate', 1);
    });

    it('shows a clear prompt for an empty query without calling the search service', async () => {
      const response = await request(createApp()).get('/people');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Enter at least two characters');
      expect(peopleSearchService.searchPeople).not.toHaveBeenCalled();
    });

    it('uses NFKC-normalized length to decide whether a query is searchable', async () => {
      const response = await request(createApp()).get('/people?q=%EF%AC%80');

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('Enter at least two characters');
      expect(response.text).toContain('Crate Queen');
      expect(peopleSearchService.searchPeople).toHaveBeenCalledWith('ﬀ', 1);
    });

    it('rejects malformed page queries and does not search', async () => {
      const response = await request(createApp()).get('/people?q=crate&page=21');

      expect(response.status).toBe(400);
      expect(response.text).toContain('Enter a valid search');
      expect(peopleSearchService.searchPeople).not.toHaveBeenCalled();
    });

    it('escapes a public display name and does not render unselected profile fields', async () => {
      (peopleSearchService.searchPeople as jest.Mock).mockResolvedValue({
        items: [{
          username: 'safe_member',
          displayName: '<img src=x onerror=alert(1)>',
          avatarUrl: null,
        }],
        totalCount: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
        hasMore: false,
      });

      const response = await request(createApp()).get('/people?q=safe');

      expect(response.status).toBe(200);
      expect(response.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(response.text).not.toContain('<img src=x onerror=alert(1)>');
      const resultsMarkup = response.text.match(/<section class="people-search-results"[\s\S]*?<\/section>/)?.[0] || '';
      expect(resultsMarkup).not.toContain('bio');
      expect(resultsMarkup).not.toContain('location');
      expect(resultsMarkup).not.toContain('email');
    });
  });
});

describe('GET /api/people-search (Issue #393)', () => {
  const app = createApp();

  it('returns empty array when query is too short', async () => {
    const res = await request(app).get('/api/people-search?q=a');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ people: [], pagination: { totalCount: 0 } });
  });

  it('returns 400 when query is malformed or too long', async () => {
    const res = await request(app).get(`/api/people-search?q=${'a'.repeat(60)}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it('returns public fields only from matching users', async () => {
    const personWithPrivateEmail = {
      username: 'johndoe',
      displayName: 'John Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
      email: 'private@example.com',
    };
    jest.spyOn(peopleSearchService, 'searchPeople').mockResolvedValueOnce({
      items: [personWithPrivateEmail],
      totalCount: 1,
      page: 1,
      pageSize: 12,
      totalPages: 1,
      hasMore: false,
    });

    const res = await request(app).get('/api/people-search?q=john');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      people: [
        {
          username: 'johndoe',
          displayName: 'John Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      ],
      pagination: { totalCount: 1 },
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
