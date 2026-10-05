import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().optional(),
  DATABASE_DIRECT_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(envInput: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(envInput);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

export const config = validateEnv();
