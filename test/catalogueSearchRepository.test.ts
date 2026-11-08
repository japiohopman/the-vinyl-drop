import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { drizzle } from 'drizzle-orm/pglite';
import type { getDb } from '../src/db';
import { searchCatalogueSuggestionRows } from '../src/app/repositories/catalogueSearchRepository';
import { getCatalogueSearchSuggestions } from '../src/app/services/catalogueSearchService';

describe('public catalogue suggestions', () => {
  let pg: PGlite;
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    pg = new PGlite({ extensions: { pg_trgm: pg_trgm as never } });
    await pg.exec(`
      CREATE SCHEMA extensions;
      CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
      CREATE TABLE public.releases(id uuid PRIMARY KEY, artist text NOT NULL, title text NOT NULL, label text, catalogue_number text);
      CREATE TABLE public.physical_copies(id uuid PRIMARY KEY, release_id uuid NOT NULL REFERENCES public.releases(id));
      CREATE TABLE public.listings(id uuid PRIMARY KEY, physical_copy_id uuid NOT NULL REFERENCES public.physical_copies(id), status text NOT NULL);
      CREATE INDEX releases_artist_trgm_idx ON public.releases USING GIN(artist extensions.gin_trgm_ops);
      CREATE INDEX releases_title_trgm_idx ON public.releases USING GIN(title extensions.gin_trgm_ops);
      CREATE INDEX releases_label_trgm_idx ON public.releases USING GIN(label extensions.gin_trgm_ops);
    `);
    const records = [
      ['10000000-0000-4000-8000-000000000001','Prince','Purple Rain','Warner Bros.','W  nos. 1'],
      ['10000000-0000-4000-8000-000000000002','Prince','Sign o the Times','Paisley Park','W  nos. 2'],
      ['10000000-0000-4000-8000-000000000003','P!nk',"Can't Take Me Home",'LaFace','LF 001'],
      ['10000000-0000-4000-8000-000000000004','AC/DC','Back in Black','Atlantic','ATL 001'],
      ['10000000-0000-4000-8000-000000000005','Björk','Debut','One Little Indian','TOPY 001'],
      ['10000000-0000-4000-8000-000000000006','Hidden Prince','Draft Only','Private Label','TEST 001'],
      ['10000000-0000-4000-8000-000000000007','Other Artist','Prince of Darkness','Dark Records','DR 001'],
    ];
    for (let i = 0; i < records.length; i += 1) {
      const [id,artist,title,label,cat] = records[i];
      const copyId = '20000000-0000-4000-8000-' + String(i + 1).padStart(12,'0');
      const listingId = '30000000-0000-4000-8000-' + String(i + 1).padStart(12,'0');
      await pg.query('INSERT INTO public.releases(id,artist,title,label,catalogue_number) VALUES($1,$2,$3,$4,$5)',[id,artist,title,label,cat]);
      await pg.query('INSERT INTO public.physical_copies(id,release_id) VALUES($1,$2)',[copyId,id]);
      await pg.query('INSERT INTO public.listings(id,physical_copy_id,status) VALUES($1,$2,$3)',[listingId,copyId,i===5?'draft':'published']);
    }
    db = drizzle(pg) as unknown as ReturnType<typeof getDb>;
  }, 15000);

  afterAll(async () => { await pg.close(); });

  it('ranks exact and prefix artist matches and deduplicates multi-release artists',async()=>{
    const rows=await getCatalogueSearchSuggestions('Prince',db);
    expect(rows.filter(row=>row.type==='artist'&&row.value==='Prince')).toHaveLength(1);
    expect(rows[0]?.type).toBe('artist');
    expect(rows[0]?.value).toBe('Prince');
  });
  it('finds an artist typo through PostgreSQL trigram matching',async()=>{
    const rows=await getCatalogueSearchSuggestions('Prnce',db);
    expect(rows.some(row=>row.type==='artist'&&row.value==='Prince')).toBe(true);
  });
  it('normalizes punctuation and accents without rewriting canonical display strings',async()=>{
    const pnk=await getCatalogueSearchSuggestions('Pnk',db);
    const acdc=await getCatalogueSearchSuggestions('AC DC',db);
    const bjork=await getCatalogueSearchSuggestions('Bjork',db);
    expect(pnk.some(row=>row.value==='P!nk')).toBe(true);
    expect(acdc.some(row=>row.value==='AC/DC')).toBe(true);
    expect(bjork.some(row=>row.value==='Björk')).toBe(true);
  });
  it('returns release titles with artist context and excludes draft-only catalogue rows',async()=>{
    const titles=await searchCatalogueSuggestionRows('Purple Rain','purplerain',db);
    expect(titles.some(row=>row.kind==='release'&&row.value==='Purple Rain'&&row.context==='Prince')).toBe(true);
    const labels=await getCatalogueSearchSuggestions('Atlantic',db);
    expect(labels.some(row=>row.type==='label'&&row.value==='Atlantic')).toBe(true);
    const hidden=await getCatalogueSearchSuggestions('Hidden Prince',db);
    expect(hidden.some(row=>row.value==='Hidden Prince')).toBe(false);
  });
  it('caps the merged set at eight suggestions',async()=>{
    const rows=await getCatalogueSearchSuggestions('Prince',db);
    expect(rows.length).toBeLessThanOrEqual(8);
  });
});
