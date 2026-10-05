import { z } from 'zod';
import { listingStatusSchema } from './condition';

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

export type ListingInput = z.input<typeof listingSchema>;
export type CreateListingInput = z.input<typeof createListingSchema>;
export type UpdateListingInput = z.input<typeof updateListingSchema>;
