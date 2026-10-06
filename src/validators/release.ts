import { z } from 'zod';

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
  barcode: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  coverArtUrl: z.string().trim().optional(),
  externalSource: z.string().trim().optional(),
  externalId: z.string().trim().optional(),
});

export type ReleaseInput = z.infer<typeof releaseSchema>;
