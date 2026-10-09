import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().optional(),
    DATABASE_DIRECT_URL: z.string().optional(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    APP_BASE_URL: z.string().optional(),
    ALLOWED_REDIRECT_URLS: z.string().optional().default('http://localhost:3000'),
  })
  .superRefine((data, ctx) => {
    const isRuntime =
      data.NODE_ENV === 'development' ||
      data.NODE_ENV === 'staging' ||
      data.NODE_ENV === 'production';

    if (isRuntime) {
      if (!data.DATABASE_URL || data.DATABASE_URL.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL environment variable is required in development and production modes.',
        });
      }

      if (!data.SUPABASE_URL || data.SUPABASE_URL.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_URL'],
          message: 'SUPABASE_URL environment variable is required in development and production modes.',
        });
      }

      if (!data.SUPABASE_ANON_KEY || data.SUPABASE_ANON_KEY.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_ANON_KEY'],
          message: 'SUPABASE_ANON_KEY environment variable is required in development and production modes.',
        });
      }
    }

    if (data.NODE_ENV === 'staging' || data.NODE_ENV === 'production') {
      if (!data.APP_BASE_URL || data.APP_BASE_URL.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_BASE_URL'],
          message: 'APP_BASE_URL environment variable is required in staging and production modes.',
        });
      } else {
        try {
          const parsed = new URL(data.APP_BASE_URL);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['APP_BASE_URL'],
              message: 'APP_BASE_URL must use http:// or https:// scheme.',
            });
          }
          if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['APP_BASE_URL'],
              message: `APP_BASE_URL cannot be localhost in ${data.NODE_ENV} mode.`,
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['APP_BASE_URL'],
            message: 'APP_BASE_URL must be a valid absolute URL.',
          });
        }
      }
    }
  });

export type Env = Omit<z.infer<typeof envSchema>, 'APP_BASE_URL'> & {
  APP_BASE_URL: string;
};

export function validateEnv(envInput: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(envInput);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }

  const defaultAppBaseUrl =
    result.data.APP_BASE_URL ||
    (result.data.NODE_ENV === 'development' || result.data.NODE_ENV === 'test'
      ? 'http://localhost:3000'
      : '');

  return {
    ...result.data,
    APP_BASE_URL: defaultAppBaseUrl,
    SUPABASE_URL: result.data.SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_ANON_KEY: result.data.SUPABASE_ANON_KEY || 'mock-anon-key',
  };
}

export const config = validateEnv();
