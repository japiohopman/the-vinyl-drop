import { getDb } from '../../db';
import { PhysicalCopy } from '../../db/schema/physicalCopies';
import {
  CreatePhysicalCopyInput,
  createPhysicalCopySchema,
  UpdatePhysicalCopyInput,
  updatePhysicalCopySchema,
} from '../../validators/physicalCopy';
import {
  createPhysicalCopy as createCopyInRepo,
  findPhysicalCopyById,
  findPhysicalCopiesByOwnerId,
  updatePhysicalCopy as updateCopyInRepo,
} from '../repositories/physicalCopyRepository';
import { findReleaseById } from '../repositories/releaseRepository';
import { AuthorizationError, NotFoundError, ValidationError } from './errors';

type DbInstance = ReturnType<typeof getDb>;

export async function getPhysicalCopyById(id: string, dbOverride?: DbInstance): Promise<PhysicalCopy | null> {
  return findPhysicalCopyById(id, dbOverride);
}

export async function getUserPhysicalCopies(ownerId: string, dbOverride?: DbInstance): Promise<PhysicalCopy[]> {
  return findPhysicalCopiesByOwnerId(ownerId, dbOverride);
}

export async function createPhysicalCopy(
  requestingUserId: string,
  input: CreatePhysicalCopyInput,
  dbOverride?: DbInstance
): Promise<PhysicalCopy> {
  if (input.ownerId !== requestingUserId) {
    throw new AuthorizationError('Cannot create physical copy for another user');
  }

  const parseResult = createPhysicalCopySchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid physical copy input: ${issueMsg}`);
  }

  const data = parseResult.data;

  // Verify release exists
  const release = await findReleaseById(data.releaseId, dbOverride);
  if (!release) {
    throw new NotFoundError('Referenced Release does not exist');
  }

  return createCopyInRepo(
    {
      releaseId: data.releaseId,
      ownerId: data.ownerId,
      mediaCondition: data.mediaCondition,
      sleeveCondition: data.sleeveCondition,
      notes: data.notes || null,
    },
    dbOverride
  );
}

export async function updatePhysicalCopy(
  copyId: string,
  requestingUserId: string,
  input: UpdatePhysicalCopyInput,
  dbOverride?: DbInstance
): Promise<PhysicalCopy> {
  const existingCopy = await findPhysicalCopyById(copyId, dbOverride);
  if (!existingCopy) {
    throw new NotFoundError('Physical copy not found');
  }

  if (existingCopy.ownerId !== requestingUserId) {
    throw new AuthorizationError('You are not authorized to update this physical copy');
  }

  const parseResult = updatePhysicalCopySchema.safeParse(input);
  if (!parseResult.success) {
    const issueMsg = parseResult.error.issues.map((i) => i.message).join('; ');
    throw new ValidationError(`Invalid physical copy update input: ${issueMsg}`);
  }

  const data = parseResult.data;

  const updated = await updateCopyInRepo(
    copyId,
    {
      ...(data.mediaCondition && { mediaCondition: data.mediaCondition }),
      ...(data.sleeveCondition && { sleeveCondition: data.sleeveCondition }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
    },
    dbOverride
  );

  if (!updated) {
    throw new Error('Failed to update physical copy');
  }

  return updated;
}
