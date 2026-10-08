import { CandidateRelease, IdentificationQuery, MetadataProvider } from './types';

export class DiscogsMetadataProvider implements MetadataProvider {
  readonly name = 'discogs';

  private readonly baseUrl = 'https://api.discogs.com/database/search';
  private readonly timeoutMs: number;

  constructor(options?: { timeoutMs?: number }) {
    this.timeoutMs = options?.timeoutMs ?? 5000;
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

      if (!hasSpecificParam) {
        const qParts = [query.ocrText, query.matrixRunout, query.label, query.country]
          .filter((s): s is string => Boolean(s && s.trim().length > 0));
        if (qParts.length === 0) {
          return [];
        }
        searchUrl.searchParams.set('q', qParts.join(' '));
      }

      const discogsToken = process.env.DISCOGS_API_TOKEN;
      const headers: Record<string, string> = {
        'User-Agent': 'TheVinylDrop/1.0.0 (+https://the-vinyl-drop.local)',
      };
      if (discogsToken) {
        headers['Authorization'] = `Discogs token=${discogsToken}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(searchUrl.toString(), {
          headers,
          signal: controller.signal,
        });

        if (!res.ok) {
          console.warn(`Discogs provider search failed with status ${res.status}`);
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
            format: formatStr,
            barcode: barcodeStr || query.barcode,
            genre: genreStr,
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
      return [];
    }
  }
}
