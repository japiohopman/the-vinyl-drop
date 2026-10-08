import { CandidateRelease, IdentificationQuery, MetadataProvider } from './types';

export class MusicBrainzMetadataProvider implements MetadataProvider {
  readonly name = 'musicbrainz';

  private static globalLastRequestTime = 0;

  private readonly baseUrl = 'https://musicbrainz.org/ws/2/release/';
  private readonly userAgent: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options?: { userAgent?: string; minIntervalMs?: number; timeoutMs?: number }) {
    this.userAgent =
      options?.userAgent ??
      process.env.MUSICBRAINZ_USER_AGENT ??
      'TheVinylDrop/1.0.0 ( https://github.com/japiohopman/the-vinyl-drop )';
    this.minIntervalMs = options?.minIntervalMs ?? 1000;
    this.timeoutMs = options?.timeoutMs ?? 5000;
  }

  /**
   * Enforce cross-instance rate limiting to comply with MusicBrainz <= 1 req/sec policy
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - MusicBrainzMetadataProvider.globalLastRequestTime;
    if (elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    MusicBrainzMetadataProvider.globalLastRequestTime = Date.now();
  }

  async searchCandidates(query: IdentificationQuery): Promise<CandidateRelease[]> {
    try {
      const luceneTerms: string[] = [];

      if (query.barcode) {
        luceneTerms.push(`barcode:"${query.barcode.replace(/"/g, '')}"`);
      }
      if (query.catalogueNumber) {
        luceneTerms.push(`catno:"${query.catalogueNumber.replace(/"/g, '')}"`);
      }
      if (query.artist) {
        luceneTerms.push(`artist:"${query.artist.replace(/"/g, '')}"`);
      }
      if (query.title) {
        luceneTerms.push(`release:"${query.title.replace(/"/g, '')}"`);
      }
      if (query.label) {
        luceneTerms.push(`label:"${query.label.replace(/"/g, '')}"`);
      }

      if (luceneTerms.length === 0) {
        const fallback = [query.ocrText, query.matrixRunout, query.country]
          .filter((s): s is string => Boolean(s && s.trim().length > 0))
          .join(' ');
        if (!fallback) {
          return [];
        }
        luceneTerms.push(`"${fallback.replace(/"/g, '')}"`);
      }

      const luceneQuery = luceneTerms.join(' AND ');

      const searchUrl = new URL(this.baseUrl);
      searchUrl.searchParams.set('fmt', 'json');
      searchUrl.searchParams.set('limit', '15');
      searchUrl.searchParams.set('query', luceneQuery);

      await this.enforceRateLimit();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await fetch(searchUrl.toString(), {
          headers: {
            'User-Agent': this.userAgent,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });

        if (!res.ok) {
          console.warn(`MusicBrainz provider search failed with status ${res.status}`);
          return [];
        }

        const data = (await res.json()) as {
          releases?: Array<{
            id: string;
            title: string;
            date?: string;
            country?: string;
            barcode?: string;
            'artist-credit'?: Array<{ name: string }>;
            'label-info'?: Array<{
              'catalog-number'?: string;
              label?: { name: string };
            }>;
            media?: Array<{ format?: string }>;
          }>;
        };

        if (!data.releases || !Array.isArray(data.releases)) {
          return [];
        }

        const nowIso = new Date().toISOString();

        return data.releases.map((item): CandidateRelease => {
          const artistName = item['artist-credit']?.[0]?.name || query.artist || 'Unknown Artist';
          const albumTitle = item.title || query.title || 'Unknown Title';

          const firstLabelInfo = item['label-info']?.[0];
          const labelName = firstLabelInfo?.label?.name || query.label;
          const catalogueNumber = firstLabelInfo?.['catalog-number'] || query.catalogueNumber;

          let releaseYear: number | undefined = undefined;
          if (item.date && item.date.length >= 4) {
            const parsedYear = parseInt(item.date.substring(0, 4), 10);
            if (!isNaN(parsedYear) && parsedYear > 1880) {
              releaseYear = parsedYear;
            }
          }

          const formatName = item.media?.[0]?.format || undefined;
          const externalId = item.id;
          const sourceUrl = `https://musicbrainz.org/release/${externalId}`;

          return {
            id: `musicbrainz:${externalId}`,
            providerName: 'musicbrainz',
            externalId,
            artist: artistName,
            title: albumTitle,
            label: labelName,
            catalogueNumber,
            releaseYear,
            country: item.country || query.country,
            format: formatName,
            barcode: item.barcode || query.barcode,
            genre: undefined,
            coverArtUrl: undefined,
            sourceUrl,
            matchScore: 0,
            matchedEvidence: [],
            provenance: {
              provider: 'musicbrainz',
              externalId,
              fetchedAt: nowIso,
              attribution: 'Data provided by MusicBrainz (https://musicbrainz.org)',
              sourceUrl,
            },
          };
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      console.warn('MusicBrainzMetadataProvider search error:', err);
      return [];
    }
  }
}
