import { MAX_PHOTOS_PER_LISTING } from '../src/domain/listingPhotoLimits';
import { registrationConsentSchema, resetPasswordSchema } from '../src/validators/auth';
import { conditionGradeSchema } from '../src/validators/condition';
import { createCommentSchema } from '../src/validators/comment';
import { reorderPhotosSchema, createListingSchema } from '../src/validators/listing';
import { releaseSchema } from '../src/validators/release';
import { candidateReleaseSchema } from '../src/app/services/metadata/types';

function makePhotoIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
  );
}

const candidateBase = {
  id: 'discogs:123',
  providerName: 'discogs',
  externalId: '123',
  artist: 'The Vinyl Drop Test',
  title: 'Validation Boundaries',
  provenance: {
    provider: 'discogs',
    externalId: '123',
    fetchedAt: '2026-11-06T00:00:00.000Z',
  },
};

describe('Zod v4 security and compatibility boundaries', () => {
  describe('bounded arrays at validation boundaries', () => {
    it('accepts at most the shared listing photo limit and rejects oversized reorder payloads', () => {
      expect(MAX_PHOTOS_PER_LISTING).toBe(5);
      expect(reorderPhotosSchema.safeParse({ photoIds: makePhotoIds(MAX_PHOTOS_PER_LISTING) }).success).toBe(true);

      const oversized = reorderPhotosSchema.safeParse({
        photoIds: makePhotoIds(MAX_PHOTOS_PER_LISTING + 1),
      });
      expect(oversized.success).toBe(false);
      if (!oversized.success) {
        expect(oversized.error.issues[0].path).toEqual(['photoIds']);
        expect(oversized.error.issues[0].message).toBe('A listing can contain at most 5 photos.');
      }
    });

    it('caps manual release format characteristics to the supported vinyl formats', () => {
      const result = releaseSchema.safeParse({
        artist: 'The Vinyl Drop Test',
        title: 'Validation Boundaries',
        formatCharacteristics: ['lp', '12-inch', '7-inch', 'lp'],
      });
      expect(result.success).toBe(false);
    });

    it('caps arrays returned by metadata providers to domain-sized values', () => {
      expect(candidateReleaseSchema.safeParse({
        ...candidateBase,
        formatCharacteristics: ['lp', '12-inch', '7-inch', 'lp'],
      }).success).toBe(false);

      expect(candidateReleaseSchema.safeParse({
        ...candidateBase,
        canonicalGenres: Array.from({ length: 17 }, (_, index) => `Genre ${index}`),
      }).success).toBe(false);

      expect(candidateReleaseSchema.safeParse({
        ...candidateBase,
        matchedEvidence: Array.from({ length: 9 }, (_, index) => `evidence-${index}`),
      }).success).toBe(false);
    });
  });

  describe('Zod v4 custom validation messages', () => {
    it('preserves the Terms and age-confirmation messages used by signup', () => {
      const result = registrationConsentSchema.safeParse({
        termsAccepted: 'false',
        ageConfirmed: 'false',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.map((issue) => issue.message)).toEqual([
          'You must accept the Terms of Use to create an account.',
          'You must confirm that you are at least 18 years old.',
        ]);
      }
    });

    it('preserves missing required-field messages', () => {
      const comment = createCommentSchema.safeParse({});
      expect(comment.success).toBe(false);
      if (!comment.success) {
        expect(comment.error.issues[0].message).toBe('Comment text is required');
      }

      const reset = resetPasswordSchema.safeParse({ password: 'a-secure-test-password' });
      expect(reset.success).toBe(false);
      if (!reset.success) {
        expect(reset.error.issues.some((issue) =>
          issue.path.join('.') === 'confirmPassword' &&
          issue.message === 'Please confirm your new password'
        )).toBe(true);
      }
    });

    it('preserves custom enum and literal errors used by listing validation', () => {
      const condition = conditionGradeSchema.safeParse('INVALID');
      expect(condition.success).toBe(false);
      if (!condition.success) {
        expect(condition.error.issues[0].message).toBe(
          'Invalid condition grade. Must be one of: M, NM, VG+, VG, VG-, G+, G, F, P'
        );
      }

      const listing = createListingSchema.safeParse({
        physicalCopyId: '00000000-0000-4000-8000-000000000001',
        sellerId: '00000000-0000-4000-8000-000000000002',
        status: 'published',
      });
      expect(listing.success).toBe(false);
      if (!listing.success) {
        expect(listing.error.issues.some((issue) =>
          issue.message === 'New listings must be created in draft status'
        )).toBe(true);
      }
    });
  });
});
