import { z } from 'zod';
import { conditionGradeSchema, listingStatusSchema } from './condition';

export function parsePriceEurToCents(val?: string | number | null): number | null {
  if (val === undefined || val === null || val === '') {
    return null;
  }
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) {
    throw new Error('Price must be a valid number');
  }
  if (num < 0) {
    throw new Error('Price cannot be negative');
  }
  return Math.round(num * 100);
}

export const listingSchema = z.object({
  physicalCopyId: z.string().uuid('Invalid physical copy ID'),
  sellerId: z.string().uuid('Invalid seller ID'),
  price: z
    .number({ invalid_type_error: 'Price must be a valid number in minor currency units' })
    .int('Price must be an integer (minor currency units)')
    .min(0, 'Price must be non-negative')
    .nullable()
    .optional(),
  currency: z.string().trim().min(3).max(3).default('EUR'),
  tradeAvailable: z.boolean().default(false),
  description: z.string().trim().max(2000, 'Description cannot exceed 2000 characters').nullable().optional(),
  status: listingStatusSchema.default('draft'),
});

export const createListingSchema = listingSchema.extend({
  status: z
    .literal('draft', {
      errorMap: () => ({ message: 'New listings must be created in draft status' }),
    })
    .default('draft'),
});

export const updateListingSchema = z.object({
  price: z
    .number({ invalid_type_error: 'Price must be a valid number in minor currency units' })
    .int('Price must be an integer (minor currency units)')
    .min(0, 'Price must be non-negative')
    .nullable()
    .optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  tradeAvailable: z.boolean().optional(),
  description: z.string().trim().max(2000, 'Description cannot exceed 2000 characters').nullable().optional(),
  status: listingStatusSchema.optional(),
});

export const updateListingDetailsSchema = updateListingSchema.extend({
  mediaCondition: conditionGradeSchema.optional(),
  sleeveCondition: conditionGradeSchema.optional(),
  notes: z.string().trim().max(1000, 'Notes cannot exceed 1000 characters').optional().nullable(),
});

export const createListingFromReleaseSchema = z.object({
  releaseId: z.string().uuid('Invalid release ID'),
  mediaCondition: conditionGradeSchema,
  sleeveCondition: conditionGradeSchema,
  priceEur: z.union([z.string(), z.number()]).nullable().optional(),
  tradeAvailable: z
    .union([z.boolean(), z.string()])
    .optional()
    .default(false)
    .transform((val) => val === true || val === 'true' || val === 'on'),
  description: z.string().trim().max(2000, 'Description cannot exceed 2000 characters').optional().nullable(),
  notes: z.string().trim().max(1000, 'Physical copy notes cannot exceed 1000 characters').optional().nullable(),
});

export const reorderPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid('Invalid photo ID')),
});

export type ListingInput = z.input<typeof listingSchema>;
export type CreateListingInput = z.input<typeof createListingSchema>;
export type UpdateListingInput = z.input<typeof updateListingSchema>;
export type UpdateListingDetailsInput = z.input<typeof updateListingDetailsSchema>;
export type CreateListingFromReleaseInput = z.input<typeof createListingFromReleaseSchema>;
