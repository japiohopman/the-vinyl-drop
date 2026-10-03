import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

export const envSchema = z.object({
  PORT: z.string().default('3000').transform((val, ctx) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'PORT must be a valid integer',
      });
      return z.NEVER;
    }
    return parsed;
  }),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export function getEnv(overrideEnv?: Record<string, string | undefined>): Env {
  const envToParse = overrideEnv || process.env;
  const result = envSchema.safeParse(envToParse);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    throw new Error('Environment validation failed');
  }

  return result.data;
}

export const env = getEnv();
