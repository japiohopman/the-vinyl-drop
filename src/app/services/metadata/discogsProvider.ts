import { CandidateRelease, IdentificationQuery, MetadataProvider } from './types';
import { normalizeCanonicalGenres, normalizeCanonicalStyles, resolveCountry } from '../../../domain/releaseMetadata';
import { normalizeVinylFormatCharacteristics } from '../../../domain/releaseFormat';


const DISCOGS_USER_AGENT = 'TheVinylDrop/1.0.0 (+https://thevinyldrop.nl)';

interface DiscogsArtworkResponse {
  images?: Array<{
    type?: string;
    resource_url?: string;
    uri?: string;
  }>;
  thumb?: string;
  master_id?: number;
}

function createDiscogsHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': DISCOGS_USER_AGENT,
  };
  const discogsToken = process.env.DISCOGS_API_TOKEN;
  if (discogsToken) {
    headers.Authorization = `Discogs token=${discogsToken}`;
  }
  return headers;
}

function getValidDiscogsArtworkUrl(data: DiscogsArtworkResponse): string | undefined {
  const primaryImage = data.images?.find((image) => image.type?.toLowerCase() === 'primary');
  const candidates = [
    primaryImage?.resource_url,
    primaryImage?.uri,
    ...(data.images || []).flatMap((image) => [image.resource_url, image.uri]),
    data.thumb,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const hostname = url.hostname.toLowerCase();
      if (url.protocol === 'https:' && (hostname === 'discogs.com' || hostname.endsWith('.discogs.com'))) {
        return url.toString();
      }
    } catch {
      // Ignore malformed image candidates and continue to the next source.
    }
  }

  return undefined;
}

export class DiscogsMetadataProvider implements MetadataProvider {
  readonly name = 'discogs';

  private readonly baseUrl = 'https://api.discogs.com/database/search';
  private readonly timeoutMs: number;
  private readonly throwOnError: boolean;

  constructor(options?: { timeoutMs?: number; throwOnError?: boolean }) {
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.throwOnError = options?.throwOnError ?? false;
  }

  /**
   * Resolve artwork omitted by Discogs database-search results from the selected
   * release details, then from its master when the individual release has none.
   */
  async getReleaseArtwork(externalId: string): Promise<string | undefined> {
    if (!/^\d{1,15}$/.test(externalId)) return undefined;

    const release = await this.fetchArtworkDetails(`https://api.discogs.com/releases/${externalId}`);
    if (!release) return undefined;

    const releaseArtwork = getValidDiscogsArtworkUrl(release);
    if (releaseArtwork) return releaseArtwork;

    if (typeof release.master_id !== 'number' || !Number.isSafeInteger(release.master_id) || release.master_id <= 0) {
      return undefined;
    }

    const master = await this.fetchArtworkDetails(`https://api.discogs.com/masters/${release.master_id}`);
    return master ? getValidDiscogsArtworkUrl(master) : undefined;
  }

  private async fetchArtworkDetails(url: string): Promise<DiscogsArtworkResponse | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        headers: createDiscogsHeaders(),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return await response.json() as DiscogsArtworkResponse;
    } catch (error) {
      // Artwork is optional: a detail lookup failure must not discard a confident metadata match.
      console.warn('Discogs artwork detail lookup unavailable:', error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async searchCandidates(query: IdentificationQuery): Promise<CandidateRelease[]> {
    try {
      const searchUrl = new URL(this.baseUrl);
      searchUrl.searchParams.set('type', 'release');
      searchUrl.searchParams.set('per_page', '15');

      let hasSpecificParam = false;

      if (query.barcode) {
        searchUrl.searchParams.set('barcode', query.barcode);
        hasSpecificParam = true;
      }
      if (query.catalogueNumber) {
        searchUrl.searchParams.set('catno', query.catalogueNumber);
        hasSpecificParam = true;
      }
      if (query.artist) {
        searchUrl.searchParams.set('artist', query.artist);
        hasSpecificParam = true;
      }
      if (query.title) {
        searchUrl.searchParams.set('release_title', query.title);
        hasSpecificParam = true;
      }
      if (query.track) {
        searchUrl.searchParams.set('track', query.track);
        hasSpecificParam = true;
      }

      if (!hasSpecificParam) {
        const qParts = [query.ocrText, query.matrixRunout, query.label, query.country]
          .filter((s): s is string => Boolean(s && s.trim().length > 0));
        if (qParts.length === 0) {
          return [];
        }
        searchUrl.searchParams.set('q', qParts.join(' '));
      }

      const headers = createDiscogsHeaders();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(searchUrl.toString(), {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          console.warn(`Discogs provider search failed with status ${res.status}`);
          if (this.throwOnError) throw new Error(`Discogs provider returned HTTP ${res.status}`);
          return [];
        }

        const data = (await res.json()) as {
          results?: Array<{
            id: number;
            title: string;
            year?: string | number;
            country?: string;
            format?: string[];
            label?: string[];
            catno?: string;
            barcode?: string[];
            cover_image?: string;
            thumb?: string;
            genre?: string[];
            style?: string[];
            uri?: string;
          }>;
        };

        if (!data.results || !Array.isArray(data.results)) {
          return [];
        }

        const now = new Date().toISOString();

        return data.results.map((item): CandidateRelease => {
          let artistName = item.title;
          let albumTitle = item.title;

          if (item.title.includes(' - ')) {
            const parts = item.title.split(' - ');
            artistName = parts[0].trim();
            albumTitle = parts.slice(1).join(' - ').trim();
          } else if (query.artist) {
            artistName = query.artist;
          }

          const parsedYear = item.year ? Number(item.year) : undefined;
          const validYear = parsedYear && !isNaN(parsedYear) ? parsedYear : undefined;

          const labelStr = item.label && item.label.length > 0 ? item.label[0] : undefined;
          const barcodeStr = item.barcode && item.barcode.length > 0 ? item.barcode[0] : undefined;
          const formatStr = item.format && item.format.length > 0 ? item.format.join(', ') : undefined;
          const genreStr = item.genre && item.genre.length > 0 ? item.genre.join(', ') : undefined;
          const rawStyles = item.style && item.style.length > 0 ? item.style : undefined;

          const externalId = String(item.id);
          const sourceUrl = item.uri
            ? item.uri.startsWith('http')
              ? item.uri
              : `https://www.discogs.com${item.uri}`
            : `https://www.discogs.com/release/${externalId}`;

          return {
            id: `discogs:${externalId}`,
            providerName: 'discogs',
            externalId,
            artist: artistName || 'Unknown Artist',
            title: albumTitle || 'Unknown Title',
            label: labelStr,
            catalogueNumber: item.catno || query.catalogueNumber,
            releaseYear: validYear,
            country: item.country,
            countryCode: resolveCountry(item.country)?.code,
            format: formatStr,
            formatCharacteristics: normalizeVinylFormatCharacteristics(formatStr),
            barcode: barcodeStr || query.barcode,
            genre: genreStr,
            canonicalGenres: normalizeCanonicalGenres(item.genre || []),
            styles: rawStyles,
            canonicalStyles: normalizeCanonicalStyles(rawStyles || []),
            coverArtUrl: item.cover_image || item.thumb,
            sourceUrl,
            matchScore: 0,
            matchedEvidence: [],
            provenance: {
              provider: 'discogs',
              externalId,
              fetchedAt: now,
              attribution: 'Data provided by Discogs API (https://www.discogs.com)',
              sourceUrl,
            },
          };
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.warn('DiscogsMetadataProvider search error:', err);
      if (this.throwOnError) throw err;
      return [];
    }
  }
}
