import { getDb } from '../../../db';
import { Release } from '../../../db/schema/releases';
import { createRelease } from '../releaseService';
import { DiscogsMetadataProvider } from './discogsProvider';
import { MusicBrainzMetadataProvider } from './musicbrainzProvider';
import {
  CandidateRelease,
  IdentificationQuery,
  identificationQuerySchema,
  MetadataProvider,
} from './types';

type DbInstance = ReturnType<typeof getDb>;

function normalizeCode(code?: string): string {
  if (!code) return '';
  return code.replace(/[\s\-_]/g, '').toLowerCase();
}

function stringMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const normA = a.trim().toLowerCase();
  const normB = b.trim().toLowerCase();
  return normA.includes(normB) || normB.includes(normA);
}

/**
 * Evaluates candidate release attributes against identification query evidence
 * and computes a match confidence score (0 - 100) and matched evidence list.
 */
export function scoreCandidateMatch(
  query: IdentificationQuery,
  candidate: CandidateRelease
): { matchScore: number; matchedEvidence: string[] } {
  let score = 0;
  const matchedEvidence: string[] = [];

  // 1. Barcode match
  if (query.barcode && candidate.barcode) {
    const qCode = normalizeCode(query.barcode);
    const cCode = normalizeCode(candidate.barcode);
    if (qCode.length > 0 && (qCode === cCode || cCode.includes(qCode))) {
      score += 40;
      matchedEvidence.push('barcode');
    }
  }

  // 2. Catalogue Number match
  if (query.catalogueNumber && candidate.catalogueNumber) {
    const qCat = normalizeCode(query.catalogueNumber);
    const cCat = normalizeCode(candidate.catalogueNumber);
    if (qCat.length > 0 && (qCat === cCat || cCat.includes(qCat) || qCat.includes(cCat))) {
      score += 25;
      matchedEvidence.push('catalogueNumber');
    }
  }

  // 3. Artist match
  if (query.artist && stringMatch(candidate.artist, query.artist)) {
    score += 15;
    matchedEvidence.push('artist');
  }

  // 4. Title match
  if (query.title && stringMatch(candidate.title, query.title)) {
    score += 15;
    matchedEvidence.push('title');
  }

  // 5. Matrix / Runout match
  if (query.matrixRunout) {
    const normRunout = normalizeCode(query.matrixRunout);
    const catMatch = candidate.catalogueNumber && normRunout.includes(normalizeCode(candidate.catalogueNumber));
    const barMatch = candidate.barcode && normRunout.includes(normalizeCode(candidate.barcode));
    if (catMatch || barMatch) {
      score += 10;
      matchedEvidence.push('matrixRunout');
    }
  }

  // 6. OCR Text match
  if (query.ocrText) {
    const normOcr = query.ocrText.toLowerCase();
    const artistInOcr = candidate.artist && normOcr.includes(candidate.artist.toLowerCase());
    const titleInOcr = candidate.title && normOcr.includes(candidate.title.toLowerCase());
    const catInOcr = candidate.catalogueNumber && normOcr.includes(candidate.catalogueNumber.toLowerCase());
    if (artistInOcr || titleInOcr || catInOcr) {
      score += 10;
      matchedEvidence.push('ocrText');
    }
  }

  // 7. Release Year match
  if (query.releaseYear && candidate.releaseYear && query.releaseYear === candidate.releaseYear) {
    score += 5;
    matchedEvidence.push('releaseYear');
  }

  // 8. Label match
  if (query.label && candidate.label && stringMatch(candidate.label, query.label)) {
    score += 5;
    matchedEvidence.push('label');
  }

  const matchScore = Math.min(100, Math.max(0, score));
  return { matchScore, matchedEvidence };
}

export class MetadataIdentificationService {
  private readonly providers: MetadataProvider[];

  constructor(providers?: MetadataProvider[]) {
    this.providers =
      providers && providers.length > 0
        ? providers
        : [new DiscogsMetadataProvider(), new MusicBrainzMetadataProvider()];
  }

  /**
   * Search across all configured metadata providers, normalize candidates,
   * score against input evidence, and rank results by confidence score.
   */
  async identifyCandidates(queryInput: IdentificationQuery): Promise<CandidateRelease[]> {
    const parseResult = identificationQuerySchema.safeParse(queryInput);
    const query = parseResult.success ? parseResult.data : queryInput;

    const results = await Promise.allSettled(
      this.providers.map((provider) => provider.searchCandidates(query))
    );

    const allCandidates: CandidateRelease[] = [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'fulfilled') {
        allCandidates.push(...res.value);
      } else {
        console.warn(
          `Provider '${this.providers[i].name}' search failed:`,
          res.reason
        );
      }
    }

    const scoredCandidates = allCandidates.map((candidate) => {
      const { matchScore, matchedEvidence } = scoreCandidateMatch(query, candidate);
      return {
        ...candidate,
        matchScore,
        matchedEvidence,
      };
    });

    // Deduplicate by providerName + externalId
    const seen = new Set<string>();
    const deduplicated: CandidateRelease[] = [];

    for (const item of scoredCandidates) {
      const key = `${item.providerName}:${item.externalId}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    // Sort descending by matchScore
    return deduplicated.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Confirm an external candidate release and persist it as a canonical Release record.
   * User confirmation is required before an external candidate becomes canonical Release data.
   */
  async confirmCandidateAsRelease(
    candidate: CandidateRelease,
    dbOverride?: DbInstance
  ): Promise<Release> {
    return createRelease(
      {
        artist: candidate.artist,
        title: candidate.title,
        label: candidate.label || undefined,
        catalogueNumber: candidate.catalogueNumber || undefined,
        releaseYear: candidate.releaseYear,
        country: candidate.country || undefined,
        format: candidate.format || 'LP',
        barcode: candidate.barcode || undefined,
        genre: candidate.genre || undefined,
        coverArtUrl: candidate.coverArtUrl || undefined,
        externalSource: candidate.providerName,
        externalId: candidate.externalId,
      },
      dbOverride
    );
  }
}
