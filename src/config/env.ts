import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().optional(),
    DATABASE_DIRECT_URL: z.string().optional(),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    APP_BASE_URL: z.string().optional().default('http://localhost:3000'),
    ALLOWED_REDIRECT_URLS: z.string().optional().default('http://localhost:3000'),
  })
  .superRefine((data, ctx) => {
    const isRuntime = data.NODE_ENV === 'development' || data.NODE_ENV === 'production';

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
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(envInput: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(envInput);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return {
    ...result.data,
    SUPABASE_URL: result.data.SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_ANON_KEY: result.data.SUPABASE_ANON_KEY || 'mock-anon-key',
  };
}

export const config = validateEnv();
