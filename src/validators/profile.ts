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

function providerUrlSchema(provider: 'SoundCloud' | 'Mixcloud', rootHost: string) {
  return z.string()
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      if (!value) return;
      try {
        const url = new URL(value);
        const host = url.hostname.toLowerCase();
        const validHost = host === rootHost || host.endsWith('.' + rootHost);
        if (url.protocol !== 'https:' || !validHost || (url.port !== '' && url.port !== '443') ||
            url.username !== '' || url.password !== '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: provider + ' links must be HTTPS URLs on ' + rootHost + '.',
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: provider + ' link must be a valid HTTPS URL on ' + rootHost + '.',
        });
      }
    })
    .optional()
    .or(z.literal(''));
}

const soundcloudUrlSchema = providerUrlSchema('SoundCloud', 'soundcloud.com');
const mixcloudUrlSchema = providerUrlSchema('Mixcloud', 'mixcloud.com');

export const profileUpdateSchema = z.object({
  username: usernameSchema,
  displayName: z.string().max(50, { message: 'Display name must not exceed 50 characters' }).optional().or(z.literal('')),
  bio: z.string().max(500, { message: 'Bio must not exceed 500 characters' }).optional().or(z.literal('')),
  location: z.string().max(100, { message: 'Location must not exceed 100 characters' }).optional().or(z.literal('')),
  avatarUrl: z.string().url({ message: 'Avatar URL must be a valid URL' }).optional().or(z.literal('')),
  websiteUrl: httpUrlSchema,
  soundcloudUrl: soundcloudUrlSchema,
  mixcloudUrl: mixcloudUrlSchema,
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
