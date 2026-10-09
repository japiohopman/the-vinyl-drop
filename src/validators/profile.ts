import { z } from 'zod';
import { usernameSchema } from './auth';

const httpUrlSchema = z
  .string()
  .transform((val) => val.trim())
  .superRefine((val, ctx) => {
    if (!val) return;
    try {
      const url = new URL(val);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External URL must begin with http:// or https://',
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'External URL must be a valid HTTP or HTTPS web address',
      });
    }
  })
  .optional()
  .or(z.literal(''));

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  displayName: z.string().max(50, { message: 'Display name must not exceed 50 characters' }).optional().or(z.literal('')),
  bio: z.string().max(500, { message: 'Bio must not exceed 500 characters' }).optional().or(z.literal('')),
  location: z.string().max(100, { message: 'Location must not exceed 100 characters' }).optional().or(z.literal('')),
  avatarUrl: z.string().url({ message: 'Avatar URL must be a valid URL' }).optional().or(z.literal('')),
  websiteUrl: httpUrlSchema,
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
