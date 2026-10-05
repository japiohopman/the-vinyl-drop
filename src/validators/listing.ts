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

export const createListingSchema = listingSchema.refine(
  (data) => {
    // If status is published, listing must have either a price > 0 or tradeAvailable === true
    if (data.status === 'published') {
      const hasPrice = data.price !== null && data.price !== undefined && data.price > 0;
      return hasPrice || data.tradeAvailable === true;
    }
    return true;
  },
  {
    message: 'Published listing must specify a price greater than 0 or enable trade availability.',
    path: ['price'],
  }
);

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
