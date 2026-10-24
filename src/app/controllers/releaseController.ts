import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { importDiscogsRelease } from '../services/discogsService';
import { createRelease } from '../services/releaseService';
import { FormViewModel } from '../view-models/formViewModel';

import { processAndValidateImage } from '../utils/imageProcessor';
import { DiscogsMetadataProvider } from '../services/metadata/discogsProvider';
import { CandidateRelease } from '../services/metadata/types';

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

/** Only auto-fill album results when both artist and release title match closely. */
function chooseConfidentDiscogsMatch(
  candidates: CandidateRelease[],
  artist: string,
  title: string
): CandidateRelease | null {
  const matched = candidates.filter((candidate) =>
    hasConfidentTextMatch(artist, candidate.artist, 1) &&
    hasConfidentTextMatch(title, candidate.title, 2)
  );

  matched.sort((a, b) => {
    const score = (candidate: CandidateRelease) =>
      (normalizeLookupText(candidate.artist) === normalizeLookupText(artist) ? 2 : 0) +
      (normalizeLookupText(candidate.title) === normalizeLookupText(title) ? 2 : 0);
    return score(b) - score(a);
  });
  return matched[0] || null;
}

/**
 * Discogs track-filter results identify releases containing the queried track.
 * CandidateRelease.title is the containing release/album title, not the matched
 * track name, so compare the artist here and use the track-filter query itself as
 * evidence for the track title. Comparing the query to candidate.title incorrectly
 * rejects songs that appear on an album with a different title.
 */
function chooseConfidentTrackMatch(
  candidates: CandidateRelease[],
  artist: string
): CandidateRelease | null {
  return candidates.find((candidate) =>
    hasConfidentTextMatch(artist, candidate.artist, 1)
  ) || null;
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
    let match = chooseConfidentDiscogsMatch(releaseCandidates, artist, title);
    let matchType: 'release' | 'track' = 'release';

    if (!match) {
      // The input title may be a song on a release rather than the release/album title.
      const trackCandidates = await provider.searchCandidates({ artist, track: title });
      match = chooseConfidentTrackMatch(trackCandidates, artist);
      matchType = 'track';
    }

    if (!match) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ found: false });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      found: true,
      matchType,
      metadata: {
        label: match.label || '',
        catalogueNumber: match.catalogueNumber || '',
        releaseYear: match.releaseYear ? String(match.releaseYear) : '',
        format: match.format || '',
        barcode: match.barcode || '',
        country: match.country || '',
        genre: match.genre || '',
        coverArtUrl: match.coverArtUrl || '',
      },
    });
  } catch {
    // Fail closed for this lookup but keep manual release entry available.
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
      country?: string;
      coverArtUrl?: string;
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
    });
  } catch (error) {
    next(error);
  }
}

export async function postCreateCustomRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { artist, title, label, catalogueNumber, releaseYear, format, barcode, genre, country, coverArtUrl: submittedCoverArtUrl } = req.body;

    const parsedYear = releaseYear ? parseInt(releaseYear, 10) : undefined;

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
        coverArtUrl,
        externalSource: 'custom',
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
