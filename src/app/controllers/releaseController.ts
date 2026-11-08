import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { importDiscogsRelease } from '../services/discogsService';
import { createRelease } from '../services/releaseService';
import { FormViewModel } from '../view-models/formViewModel';

import { processAndValidateImage } from '../utils/imageProcessor';
import { DiscogsMetadataProvider } from '../services/metadata/discogsProvider';
import { CandidateRelease } from '../services/metadata/types';
import { COUNTRY_OPTIONS, RELEASE_GENRES, RELEASE_STYLES, resolveCountry } from '../../domain/releaseMetadata';
import { normalizeVinylFormatCharacteristics, VINYL_FORMAT_FILTERS } from '../../domain/releaseFormat';

function normalizeLookupText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasConfidentTextMatch(query: string, candidate: string | undefined, maxExtraWords: number): boolean {
  if (!candidate) return false;
  const normalizedQuery = normalizeLookupText(query);
  const normalizedCandidate = normalizeLookupText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return false;
  if (normalizedQuery === normalizedCandidate) return true;

  const queryWords = normalizedQuery.split(' ');
  const candidateWords = normalizedCandidate.split(' ');
  if (Math.abs(candidateWords.length - queryWords.length) > maxExtraWords) return false;

  // Non-exact matches must share a complete phrase at the beginning or end.
  // Single-word titles must match exactly; otherwise a generic title like "Blue"
  // could be auto-matched to a different release such as "Blue Note".
  if (Math.min(queryWords.length, candidateWords.length) < 2) return false;

  const queryPhrase = ` ${normalizedQuery} `;
  const candidatePhrase = ` ${normalizedCandidate} `;
  return candidatePhrase.startsWith(queryPhrase) ||
    candidatePhrase.endsWith(queryPhrase) ||
    queryPhrase.startsWith(candidatePhrase) ||
    queryPhrase.endsWith(candidatePhrase);
}

/** Return all confident album matches in a stable, relevance-first order. */
function findConfidentDiscogsMatches(candidates: CandidateRelease[], artist: string, title: string): CandidateRelease[] {
  const matched = candidates.filter((candidate) =>
    hasConfidentTextMatch(artist, candidate.artist, 1) &&
    hasConfidentTextMatch(title, candidate.title, 2)
  );
  matched.sort((a, b) => {
    const score = (candidate: CandidateRelease) =>
      (normalizeLookupText(candidate.artist) === normalizeLookupText(artist) ? 2 : 0) +
      (normalizeLookupText(candidate.title) === normalizeLookupText(title) ? 2 : 0);
    const confidenceDifference = score(b) - score(a);
    if (confidenceDifference !== 0) return confidenceDifference;
    return Number(Boolean(b.coverArtUrl)) - Number(Boolean(a.coverArtUrl));
  });
  return matched.slice(0, 8);
}

/**
 * Discogs track-filter results identify releases containing the queried track.
 * CandidateRelease.title is the containing release/album title, not the matched
 * track name, so compare the artist here and use the track-filter query itself as
 * evidence for the track title. Comparing the query to candidate.title incorrectly
 * rejects songs that appear on an album with a different title.
 */
function findConfidentTrackMatches(candidates: CandidateRelease[], artist: string): CandidateRelease[] {
  const matched = candidates.filter((candidate) => hasConfidentTextMatch(artist, candidate.artist, 1));
  matched.sort((a, b) => Number(Boolean(b.coverArtUrl)) - Number(Boolean(a.coverArtUrl)));
  return matched.slice(0, 8);
}

function isUnambiguousVinylFormat(format: string | undefined): boolean {
  if (!format) return false;
  const tokens = format.split(',').map((token) => token.trim().toLowerCase());
  const hasVinyl = tokens.includes('vinyl');
  const hasOtherMedia = tokens.some((token) =>
    ['cd', 'cassette', 'file', 'digital', 'dvd', 'blu-ray', 'sacd', 'minidisc', 'shellac', 'reel-to-reel', 'dat'].includes(token)
  );
  return hasVinyl && !hasOtherMedia;
}

function toDiscogsCandidateMetadata(candidate: CandidateRelease): Record<string, unknown> {
  const formatCharacteristics = candidate.formatCharacteristics || normalizeVinylFormatCharacteristics(candidate.format);
  return {
    label: candidate.label || '',
    catalogueNumber: candidate.catalogueNumber || '',
    releaseYear: candidate.releaseYear ? String(candidate.releaseYear) : '',
    format: candidate.format || '',
    formatCharacteristics,
    barcode: candidate.barcode || '',
    country: candidate.country || '',
    countryCode: resolveCountry(candidate.country)?.code || '',
    genre: candidate.genre || '',
    styles: candidate.styles || [],
    style: candidate.styles && candidate.styles.length > 0 ? candidate.styles.join(', ') : '',
    canonicalStyles: candidate.canonicalStyles || [],
    coverArtUrl: candidate.coverArtUrl || '',
    discogsExternalId: candidate.externalId,
  };
}

export async function getDiscogsMetadataLookup(req: Request, res: Response, _next: NextFunction): Promise<void> {
  const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
  const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
  if (artist.length < 2 || title.length < 2 || artist.length > 120 || title.length > 160) {
    res.status(400).json({ error: 'Enter an artist and title within the supported length.' });
    return;
  }

  try {
    const provider = new DiscogsMetadataProvider({ timeoutMs: 5000, throwOnError: true });
    const releaseCandidates = await provider.searchCandidates({ artist, title });
    let candidates = findConfidentDiscogsMatches(releaseCandidates, artist, title);
    let matchType: 'release' | 'track' = 'release';

    if (candidates.length === 0) {
      const trackCandidates = await provider.searchCandidates({ artist, track: title });
      candidates = findConfidentTrackMatches(trackCandidates, artist);
      matchType = 'track';
    }
    if (candidates.length === 0) {
      const broadCandidates = await provider.searchCandidates({ ocrText: `${artist} ${title}` });
      candidates = findConfidentDiscogsMatches(broadCandidates, artist, title);
      matchType = 'release';
    }
    if (candidates.length === 0) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ found: false });
      return;
    }

    // Only one explicitly identified vinyl edition may be auto-filled. Multiple,
    // non-vinyl or unspecified formats always require an affirmative seller choice.
    const selectionRequired = candidates.length > 1 || !isUnambiguousVinylFormat(candidates[0].format);
    // Artwork enrichment is still tied to the candidate's own Discogs release ID.
    if (candidates.length === 1 && !candidates[0].coverArtUrl) {
      const artwork = await provider.getReleaseArtwork(candidates[0].externalId);
      if (artwork) candidates[0] = { ...candidates[0], coverArtUrl: artwork };
    }

    const candidatePayload = candidates.map((candidate) => ({
      artist: candidate.artist,
      title: candidate.title,
      formatLabel: candidate.format || 'Format not supplied by Discogs',
      hasArtwork: Boolean(candidate.coverArtUrl),
      metadata: toDiscogsCandidateMetadata(candidate),
    }));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      found: true,
      matchType,
      selectionRequired,
      candidates: candidatePayload,
      metadata: toDiscogsCandidateMetadata(candidates[0]),
    });
  } catch {
    res.status(503).json({ error: 'Discogs lookup is temporarily unavailable.' });
  }
}

export async function getCreateCustomReleasePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const formVm: FormViewModel<{
      artist?: string;
      title?: string;
      label?: string;
      catalogueNumber?: string;
      releaseYear?: string;
      format?: string;
      barcode?: string;
      genre?: string;
      styles?: string[];
      style?: string;
      country?: string;
      coverArtUrl?: string;
      discogsExternalId?: string;
      countryCode?: string;
      formatCharacteristics?: string[];
    }> = {
      values: {
        format: 'LP',
      },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'releases/new', {
      title: 'Add Custom Release - The Vinyl Drop',
      form: formVm,
      countryOptions: COUNTRY_OPTIONS,
      genreOptions: RELEASE_GENRES,
      styleOptions: RELEASE_STYLES,
      formatCharacteristicOptions: VINYL_FORMAT_FILTERS,
    });
  } catch (error) {
    next(error);
  }
}

export async function postCreateCustomRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      artist, title, label, catalogueNumber, releaseYear, format, barcode, genre, style, styles, country, countryCode, formatCharacteristics,
      coverArtUrl: submittedCoverArtUrl,
      discogsExternalId: submittedDiscogsExternalId,
    } = req.body;
    const discogsExternalId =
      typeof submittedDiscogsExternalId === 'string' && /^\d{1,15}$/.test(submittedDiscogsExternalId)
        ? submittedDiscogsExternalId
        : undefined;

    const parsedYear = releaseYear ? parseInt(releaseYear, 10) : undefined;
    const submittedFormatCharacteristics = Array.isArray(formatCharacteristics)
      ? formatCharacteristics
      : typeof formatCharacteristics === 'string'
        ? [formatCharacteristics]
        : undefined;

    let coverArtUrl: string | undefined =
      typeof submittedCoverArtUrl === 'string' &&
      (submittedCoverArtUrl.startsWith('https://') || submittedCoverArtUrl.startsWith('http://'))
        ? submittedCoverArtUrl
        : undefined;

    if (req.files && req.files.length > 0) {
      const coverFile = req.files.find((f) => f.fieldname === 'coverArt') || req.files[0];
      if (coverFile && coverFile.buffer && coverFile.buffer.length > 0) {
        const processed = await processAndValidateImage(coverFile.buffer, coverFile.mimetype);
        coverArtUrl = `data:image/webp;base64,${processed.buffer.toString('base64')}`;
      }
    }

    try {
      const release = await createRelease({
        artist,
        title,
        label: label || undefined,
        catalogueNumber: catalogueNumber || undefined,
        releaseYear: parsedYear && !isNaN(parsedYear) ? parsedYear : undefined,
        format: format || 'LP',
        barcode: barcode || undefined,
        genre: genre || undefined,
        country: country || undefined,
        countryCode: countryCode || undefined,
        styles: styles || (typeof style === 'string' && style.trim() ? style.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined),
        formatCharacteristics: submittedFormatCharacteristics,
        coverArtUrl,
        externalSource: discogsExternalId ? 'discogs' : 'custom',
        externalId: discogsExternalId,
      });

      return res.redirect(`/listings/create?releaseId=${release.id}`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create release';
      const formVm: FormViewModel<Record<string, string>> = {
        values: req.body,
        fieldErrors: {},
        generalErrors: [errorMsg],
      };
      return renderWithLayout(res, 'releases/new', {
        title: 'Add Custom Release - The Vinyl Drop',
        form: formVm,
        countryOptions: COUNTRY_OPTIONS,
        genreOptions: RELEASE_GENRES,
        styleOptions: RELEASE_STYLES,
        formatCharacteristicOptions: VINYL_FORMAT_FILTERS,
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function postImportDiscogsRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const discogsId = parseInt(req.body.discogsId, 10);
    if (isNaN(discogsId) || discogsId <= 0) {
      return res.redirect('/drop/new');
    }

    const release = await importDiscogsRelease(discogsId);
    return res.redirect(`/listings/create?releaseId=${release.id}`);
  } catch (error) {
    next(error);
  }
}
