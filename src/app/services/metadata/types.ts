import { z } from 'zod';

/**
 * Input evidence for identifying vinyl release candidates
 */
export const identificationQuerySchema = z.object({
  barcode: z.string().trim().optional(),
  artist: z.string().trim().optional(),
  title: z.string().trim().optional(),
  catalogueNumber: z.string().trim().optional(),
  label: z.string().trim().optional(),
  country: z.string().trim().optional(),
  releaseYear: z.coerce.number().int().optional(),
  ocrText: z.string().trim().optional(),
  matrixRunout: z.string().trim().optional(),
});

export type IdentificationQuery = z.infer<typeof identificationQuerySchema>;

/**
 * Provenance tracking details for external candidate release metadata
 */
export const candidateProvenanceSchema = z.object({
  provider: z.string(),
  externalId: z.string(),
  fetchedAt: z.string(),
  attribution: z.string().optional(),
  sourceUrl: z.string().optional(),
});

export type CandidateProvenance = z.infer<typeof candidateProvenanceSchema>;

/**
 * Provider-agnostic candidate release model returned by metadata identification
 */
export const candidateReleaseSchema = z.object({
  id: z.string(),
  providerName: z.string(),
  externalId: z.string(),
  artist: z.string().trim().min(1, 'Artist is required'),
  title: z.string().trim().min(1, 'Title is required'),
  label: z.string().trim().optional(),
  catalogueNumber: z.string().trim().optional(),
  releaseYear: z.number().int().optional(),
  country: z.string().trim().optional(),
  format: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  coverArtUrl: z.string().trim().optional(),
  sourceUrl: z.string().trim().optional(),
  matchScore: z.number().min(0).max(100).default(0),
  matchedEvidence: z.array(z.string()).default([]),
  provenance: candidateProvenanceSchema,
});

export type CandidateRelease = z.infer<typeof candidateReleaseSchema>;

/**
 * Adapter interface for external metadata providers
 */
export interface MetadataProvider {
  readonly name: string;
  searchCandidates(query: IdentificationQuery): Promise<CandidateRelease[]>;
}
