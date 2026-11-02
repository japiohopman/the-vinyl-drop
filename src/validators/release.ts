import { z } from 'zod';
import { isKnownGenreInput, resolveCountry } from '../domain/releaseMetadata';

export const releaseSchema = z.object({
  artist: z.string().trim().min(1, 'Artist is required'),
  title: z.string().trim().min(1, 'Title is required'),
  label: z.string().trim().optional(),
  catalogueNumber: z.string().trim().optional(),
  releaseYear: z.coerce
    .number()
    .int('Release year must be an integer')
    .min(1880, 'Release year is too old')
    .max(new Date().getFullYear() + 1, 'Release year cannot be in the far future')
    .optional(),
  country: z.string().trim().optional(),
  format: z.string().trim().optional(),
  formatCharacteristics: z.array(z.enum(['lp', '12-inch', '7-inch'])).optional(),
  barcode: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  coverArtUrl: z.string().trim().optional(),
  externalSource: z.string().trim().optional(),
  countryCode: z.string().trim().optional(),
  externalId: z.string().trim().optional(),
}).superRefine((data, context) => {
  const countryFromCode = data.countryCode ? resolveCountry(data.countryCode) : null;
  const countryFromLabel = data.country ? resolveCountry(data.country) : null;
  const hasDiscogsSource = data.externalSource === 'discogs' && /^\d{1,15}$/.test(data.externalId || '');

  if (data.countryCode && !countryFromCode) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['countryCode'],
      message: 'Choose a valid ISO 3166-1 country code.',
    });
  }
  if (data.country && !countryFromLabel && !hasDiscogsSource) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['country'],
      message: 'Choose a country from the supported country list.',
    });
  }
  if (countryFromCode && countryFromLabel && countryFromCode.code !== countryFromLabel.code) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['country'],
      message: 'Country label and country code must refer to the same country.',
    });
  }
  if (data.genre && !isKnownGenreInput(data.genre)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['genre'],
      message: 'Choose genres from the supported genre vocabulary.',
    });
  }
});

export type ReleaseInput = z.infer<typeof releaseSchema>;
