import { getDb } from '../../db';
import { Release } from '../../db/schema/releases';
import { releaseSchema, ReleaseInput } from '../../validators/release';
import { createRelease as createReleaseInRepo, findReleaseById } from '../repositories/releaseRepository';
import { ValidationError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

export async function getReleaseById(id: string, dbOverride?: DbInstance): Promise<Release | null> {
  return findReleaseById(id, dbOverride);
}

export async function createRelease(input: ReleaseInput, dbOverride?: DbInstance): Promise<Release> {
  const parseResult = releaseSchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid release metadata: ${issueMsg}`);
  }

  const data = parseResult.data;

  return createReleaseInRepo(
    {
      artist: data.artist,
      title: data.title,
      label: data.label || null,
      catalogueNumber: data.catalogueNumber || null,
      releaseYear: data.releaseYear || null,
      country: data.country || null,
      format: data.format || null,
      barcode: data.barcode || null,
      genre: data.genre || null,
      coverArtUrl: data.coverArtUrl || null,
      externalSource: data.externalSource || null,
      externalId: data.externalId || null,
    },
    dbOverride
  );
}
