import { conditionDescriptions, conditionGradeSchema, listingStatusSchema } from '../src/validators/condition';
import { releaseSchema } from '../src/validators/release';

describe('Condition and Release Validators', () => {
  describe('conditionGradeSchema', () => {
    it('should pass for valid condition grades', () => {
      const validGrades = ['M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'F', 'P'];
      validGrades.forEach((grade) => {
        expect(conditionGradeSchema.parse(grade)).toBe(grade);
      });
    });

    it('should reject invalid condition grades', () => {
      const invalidGrades = ['Mint', 'EX', 'VG++', 'POOR', '10/10'];
      invalidGrades.forEach((grade) => {
        const result = conditionGradeSchema.safeParse(grade);
        expect(result.success).toBe(false);
      });
    });

    it('should provide human-readable descriptions for all condition grades', () => {
      const validGrades = ['M', 'NM', 'VG+', 'VG', 'VG-', 'G+', 'G', 'F', 'P'] as const;
      validGrades.forEach((grade) => {
        expect(conditionDescriptions[grade]).toBeDefined();
        expect(typeof conditionDescriptions[grade]).toBe('string');
      });
    });
  });

  describe('listingStatusSchema', () => {
    it('should pass for valid listing statuses', () => {
      const validStatuses = ['draft', 'published', 'reserved', 'sold', 'traded', 'archived'];
      validStatuses.forEach((status) => {
        expect(listingStatusSchema.parse(status)).toBe(status);
      });
    });

    it('should reject invalid listing statuses', () => {
      const invalidStatuses = ['active', 'deleted', 'available', 'pending'];
      invalidStatuses.forEach((status) => {
        const result = listingStatusSchema.safeParse(status);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('releaseSchema', () => {
    it('should parse valid release input', () => {
      const input = {
        artist: 'Pink Floyd',
        title: 'The Dark Side of the Moon',
        label: 'Harvest',
        catalogueNumber: 'SHVL 804',
        releaseYear: '1973',
        country: 'UK',
        format: 'LP, Album',
        genre: 'Rock',
      };
      const parsed = releaseSchema.parse(input);
      expect(parsed.artist).toBe('Pink Floyd');
      expect(parsed.title).toBe('The Dark Side of the Moon');
      expect(parsed.releaseYear).toBe(1973);
    });

    it('should fail when required fields are missing', () => {
      const input = {
        artist: '',
        title: '  ',
      };
      const result = releaseSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});
