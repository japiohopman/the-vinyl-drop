import { getDb } from '../../db';
import { releases, Release } from '../../db/schema/releases';
import { eq, or, ilike } from 'drizzle-orm';

export interface DiscogsSearchResult {
  id: number;
  title: string; // Artist - Title format from Discogs
  artist?: string;
  albumTitle?: string;
  year?: number;
  format?: string[];
  label?: string[];
  catno?: string;
  barcode?: string[];
  coverImage?: string;
  thumb?: string;
  country?: string;
  genre?: string[];
}

/**
 * Search local database first, then query Discogs API
 */
export async function searchDiscogs(query: string): Promise<DiscogsSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 1. Check local releases first
  const db = getDb();
  const localMatches = await db
    .select()
    .from(releases)
    .where(
      or(
        ilike(releases.artist, `%${trimmed}%`),
        ilike(releases.title, `%${trimmed}%`),
        ilike(releases.catalogueNumber, `%${trimmed}%`),
        ilike(releases.barcode, `%${trimmed}%`)
      )
    )
    .limit(10);

  const localResults: DiscogsSearchResult[] = localMatches.map((r) => ({
    id: -1, // Internal database flag
    title: `${r.artist} - ${r.title}`,
    artist: r.artist,
    albumTitle: r.title,
    year: r.releaseYear || undefined,
    format: r.format ? [r.format] : undefined,
    label: r.label ? [r.label] : undefined,
    catno: r.catalogueNumber || undefined,
    barcode: r.barcode ? [r.barcode] : undefined,
    coverImage: r.coverArtUrl || undefined,
    thumb: r.coverArtUrl || undefined,
    country: r.country || undefined,
    genre: r.genre ? [r.genre] : undefined,
  }));

  // 2. Fetch external releases from Discogs API
  try {
    const discogsToken = process.env.DISCOGS_API_TOKEN;
    const headers: Record<string, string> = {
      'User-Agent': 'TheVinylDrop/0.1.0 (+https://the-vinyl-drop.com)',
    };
    if (discogsToken) {
      headers['Authorization'] = `Discogs token=${discogsToken}`;
    }

    const searchUrl = new URL('https://api.discogs.com/database/search');
    searchUrl.searchParams.set('q', trimmed);
    searchUrl.searchParams.set('type', 'release');
    searchUrl.searchParams.set('per_page', '15');

    const res = await fetch(searchUrl.toString(), { headers });

    if (!res.ok) {
      console.warn(`Discogs API search failed with status ${res.status}`);
      return localResults;
    }

    const data = (await res.json()) as { results?: Array<{
      id: number;
      title: string;
      year?: string | number;
      format?: string[];
      label?: string[];
      catno?: string;
      barcode?: string[];
      cover_image?: string;
      thumb?: string;
      country?: string;
      genre?: string[];
    }> };

    const externalResults: DiscogsSearchResult[] = (data.results || []).map((item) => {
      // Split Discogs "Artist - Title" format if present
      let artist = item.title;
      let albumTitle = item.title;
      if (item.title.includes(' - ')) {
        const parts = item.title.split(' - ');
        artist = parts[0].trim();
        albumTitle = parts.slice(1).join(' - ').trim();
      }

      return {
        id: item.id,
        title: item.title,
        artist,
        albumTitle,
        year: item.year ? Number(item.year) : undefined,
        format: item.format,
        label: item.label,
        catno: item.catno,
        barcode: item.barcode,
        coverImage: item.cover_image,
        thumb: item.thumb,
        country: item.country,
        genre: item.genre,
      };
    });

    return [...localResults, ...externalResults];
  } catch (err) {
    console.error('Discogs API fetch error:', err);
    return localResults;
  }
}

/**
 * Import a Discogs release by ID into canonical PostgreSQL releases table
 */
export async function importDiscogsRelease(discogsId: number): Promise<Release> {
  const db = getDb();

  // Check if already imported
  const existing = await db
    .select()
    .from(releases)
    .where(or(eq(releases.externalId, String(discogsId))))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Fetch full details from Discogs API
  const discogsToken = process.env.DISCOGS_API_TOKEN;
  const headers: Record<string, string> = {
    'User-Agent': 'TheVinylDrop/0.1.0 (+https://the-vinyl-drop.com)',
  };
  if (discogsToken) {
    headers['Authorization'] = `Discogs token=${discogsToken}`;
  }

  const res = await fetch(`https://api.discogs.com/releases/${discogsId}`, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch release ${discogsId} from Discogs API`);
  }

  const data = (await res.json()) as {
    id: number;
    title: string;
    artists?: Array<{ name: string }>;
    labels?: Array<{ name: string; catno?: string }>;
    year?: number;
    country?: string;
    formats?: Array<{ name: string; descriptions?: string[] }>;
    genres?: string[];
    identifiers?: Array<{ type: string; value: string }>;
    images?: Array<{ resource_url?: string; uri?: string }>;
    thumb?: string;
  };

  const artistName = data.artists?.[0]?.name.replace(/\s*\(\d+\)$/, '') || 'Unknown Artist';
  const labelName = data.labels?.[0]?.name || null;
  const catalogueNumber = data.labels?.[0]?.catno || null;
  const formatName = data.formats?.[0]?.name || 'LP';
  const barcode = data.identifiers?.find((i) => i.type === 'Barcode')?.value || null;
  const genreStr = data.genres?.join(', ') || null;
  const coverArtUrl = data.images?.[0]?.resource_url || data.images?.[0]?.uri || data.thumb || null;

  const [inserted] = await db
    .insert(releases)
    .values({
      artist: artistName,
      title: data.title,
      label: labelName,
      catalogueNumber,
      releaseYear: data.year || null,
      country: data.country || null,
      format: formatName,
      barcode,
      genre: genreStr,
      coverArtUrl,
      externalSource: 'discogs',
      externalId: String(discogsId),
      lastImportedAt: new Date(),
    })
    .returning();

  return inserted;
}
