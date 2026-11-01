import request from 'supertest';
import { createApp } from '../src/app';
import * as catalogueSearchService from '../src/app/services/catalogueSearchService';

jest.mock('../src/app/services/catalogueSearchService');

describe('GET /api/catalogue-suggestions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (catalogueSearchService.getCatalogueSearchSuggestions as jest.Mock).mockResolvedValue([
      { type:'artist', label:'Prince', value:'Prince', query:'Prince', context:null }
    ]);
  });
  it('returns same-origin JSON with no-store caching', async () => {
    const response=await request(createApp()).get('/api/catalogue-suggestions?q=Pr');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.suggestions).toHaveLength(1);
    expect(catalogueSearchService.getCatalogueSearchSuggestions).toHaveBeenCalledWith('Pr');
  });
  it('does not query the catalogue for empty or short normalized input', async () => {
    const app=createApp();
    for(const q of ['', '.', 'P']) {
      const response=await request(app).get('/api/catalogue-suggestions').query({q});
      expect(response.status).toBe(200);
      expect(response.body.suggestions).toEqual([]);
    }
    expect(catalogueSearchService.getCatalogueSearchSuggestions).not.toHaveBeenCalled();
  });
  it('rejects missing, repeated and overlong query values', async () => {
    const app=createApp();
    expect((await request(app).get('/api/catalogue-suggestions')).status).toBe(400);
    expect((await request(app).get('/api/catalogue-suggestions?q[]=P&q[]=r')).status).toBe(400);
    expect((await request(app).get('/api/catalogue-suggestions').query({q:'x'.repeat(81)})).status).toBe(400);
    expect(catalogueSearchService.getCatalogueSearchSuggestions).not.toHaveBeenCalled();
  });
});
