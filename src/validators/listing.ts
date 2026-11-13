import { z } from 'zod';
import { conditionGradeSchema, listingStatusSchema } from './condition';
import { LISTING_PHOTO_ROLES, NEW_LISTING_PHOTO_ROLES } from '../domain/listingPhotoRole';
import { MAX_PHOTOS_PER_LISTING } from '../domain/listingPhotoLimits';
import { SPECIAL_PRESSING_CHARACTERISTICS } from '../db/schema/enums';

const specialPressingCharacteristicsInput = z.preprocess(
  (value) => Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value] : [],
  z.array(z.enum(SPECIAL_PRESSING_CHARACTERISTICS)).max(SPECIAL_PRESSING_CHARACTERISTICS.length)
    .refine((values) => new Set(values).size === values.length, 'Choose each Special Pressing characteristic only once.')
);

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
    .number({ error: 'Price must be a valid number in minor currency units' })
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
      error: () => 'New listings must be created in draft status',
    })
    .default('draft'),
});

export const updateListingSchema = z.object({
  price: z
    .number({ error: 'Price must be a valid number in minor currency units' })
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
  specialPressing: z.boolean().optional(),
  specialPressingCharacteristics: specialPressingCharacteristicsInput.optional(),
  specialPressingDetails: z.string().trim().max(1000, 'Special Pressing details cannot exceed 1000 characters').nullable().optional(),
  releaseContentType: z.enum(['music', 'non_music']).optional(),
  originalReleaseContentType: z.enum(['music', 'non_music']).optional(),
}).superRefine((data, context) => {
  if (data.releaseContentType !== undefined && data.originalReleaseContentType === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['originalReleaseContentType'],
      message: 'The originally loaded Release content type is required.',
    });
  }
  const includesSpecialPressing = data.specialPressing !== undefined || data.specialPressingCharacteristics !== undefined || data.specialPressingDetails !== undefined;
  if (!includesSpecialPressing) return;
  if (data.specialPressing === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['specialPressing'],
      message: 'Special Pressing changes require the Special Pressing checkbox to be set.',
    });
  }
  const selected = data.specialPressingCharacteristics || [];
  if (data.specialPressing === true && selected.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressingCharacteristics'], message: 'Choose at least one Special Pressing characteristic.' });
  if (data.specialPressing === false && (selected.length > 0 || Boolean(data.specialPressingDetails?.trim()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressing'], message: 'Special Pressing details require Special Pressing to be selected.' });
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
  specialPressing: z.preprocess((value) => value === true || value === 'true' || value === 'on', z.boolean()).default(false),
  specialPressingCharacteristics: specialPressingCharacteristicsInput.default([]),
  specialPressingDetails: z.string().trim().max(1000, 'Special Pressing details cannot exceed 1000 characters').optional().nullable(),
}).superRefine((data, context) => {
  if (data.specialPressing && data.specialPressingCharacteristics.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressingCharacteristics'], message: 'Choose at least one Special Pressing characteristic.' });
  if (!data.specialPressing && (data.specialPressingCharacteristics.length > 0 || Boolean(data.specialPressingDetails?.trim()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['specialPressing'], message: 'Special Pressing details require Special Pressing to be selected.' });
});

export const reorderPhotosSchema = z.object({
  photoIds: z.array(z.string().uuid('Invalid photo ID')).max(MAX_PHOTOS_PER_LISTING, {
    error: `A listing can contain at most ${MAX_PHOTOS_PER_LISTING} photos.`,
  }),
});

export type ListingInput = z.input<typeof listingSchema>;
export type CreateListingInput = z.input<typeof createListingSchema>;
export type UpdateListingInput = z.input<typeof updateListingSchema>;
export type UpdateListingDetailsInput = z.input<typeof updateListingDetailsSchema>;
export type CreateListingFromReleaseInput = z.input<typeof createListingFromReleaseSchema>;

export const listingPhotoRoleSchema = z.enum(LISTING_PHOTO_ROLES);
export const newListingPhotoRoleSchema = z.enum(NEW_LISTING_PHOTO_ROLES);
export const listingPhotoAltTextSchema = z
  .string()
  .trim()
  .min(5, 'Please describe what the photo shows in the alt text (at least 5 characters).')
  .max(250, 'Alt text cannot exceed 250 characters.');
