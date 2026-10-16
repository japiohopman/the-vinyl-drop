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
    SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: z.string().optional().transform((val) => {
      if (val === undefined || val === '') return undefined;
      return val.toLowerCase() === 'true' || val === '1';
    }),
    APP_BASE_URL: z.string().optional(),
    ALLOWED_REDIRECT_URLS: z.string().optional(),
    RECOVERY_SIGNING_SECRET: z.string().optional(),
    MESSAGING_ENABLED: z
      .string()
      .optional()
      .transform((val) => {
        if (val === undefined || val === '') return undefined;
        return val.toLowerCase() === 'true' || val === '1';
      }),
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
          message: 'DATABASE_URL environment variable is required in development, staging, and production modes.',
        });
      }

      if (!data.SUPABASE_URL || data.SUPABASE_URL.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_URL'],
          message: 'SUPABASE_URL environment variable is required in development, staging, and production modes.',
        });
      }

      if (!data.SUPABASE_ANON_KEY || data.SUPABASE_ANON_KEY.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SUPABASE_ANON_KEY'],
          message: 'SUPABASE_ANON_KEY environment variable is required in development, staging, and production modes.',
        });
      }
    }

    if (data.NODE_ENV === 'staging' || data.NODE_ENV === 'production') {
      if (!data.RECOVERY_SIGNING_SECRET || data.RECOVERY_SIGNING_SECRET.trim().length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RECOVERY_SIGNING_SECRET'],
          message:
            'RECOVERY_SIGNING_SECRET environment variable is required and must be at least 32 characters long in staging and production modes.',
        });
      }

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

      if (!data.ALLOWED_REDIRECT_URLS || data.ALLOWED_REDIRECT_URLS.trim() === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ALLOWED_REDIRECT_URLS'],
          message: 'ALLOWED_REDIRECT_URLS environment variable is required in staging and production modes.',
        });
      } else {
        const urls = data.ALLOWED_REDIRECT_URLS.split(',').map((u) => u.trim());
        for (const u of urls) {
          try {
            const parsed = new URL(u);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['ALLOWED_REDIRECT_URLS'],
                message: 'ALLOWED_REDIRECT_URLS items must use http:// or https:// scheme.',
              });
            }
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['ALLOWED_REDIRECT_URLS'],
              message: `ALLOWED_REDIRECT_URLS item "${u}" must be a valid absolute URL.`,
            });
          }
        }
      }
    }
  });

export type Env = Omit<z.infer<typeof envSchema>, 'APP_BASE_URL' | 'ALLOWED_REDIRECT_URLS' | 'MESSAGING_ENABLED' | 'SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED'> & {
  APP_BASE_URL: string;
  ALLOWED_REDIRECT_URLS: string;
  RECOVERY_SIGNING_SECRET: string;
  MESSAGING_ENABLED: boolean;
  SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: boolean;
};

/**
 * Validates environment values and applies mode-specific defaults.
 * Throws when configuration is invalid; signup approvals default to enabled only in tests.
 */
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

  const defaultAllowedRedirectUrls =
    result.data.ALLOWED_REDIRECT_URLS ||
    (result.data.NODE_ENV === 'development' || result.data.NODE_ENV === 'test'
      ? 'http://localhost:3000'
      : '');

  const defaultRecoverySigningSecret =
    result.data.RECOVERY_SIGNING_SECRET ||
    (result.data.NODE_ENV === 'development' || result.data.NODE_ENV === 'test'
      ? 'development-only-recovery-signing-secret-key-32-bytes'
      : '');

  const defaultMessagingEnabled =
    result.data.MESSAGING_ENABLED !== undefined
      ? result.data.MESSAGING_ENABLED
      : result.data.NODE_ENV === 'development' || result.data.NODE_ENV === 'test';

  // Never switch live signup behavior merely because source was deployed. Staging
  // and production stay off pending password-binding remediation (#118) and
  // separate approval of migration 0011 and the Auth hook.
  const defaultSignupPasswordCheckApprovalEnabled =
    result.data.SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED !== undefined
      ? result.data.SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED
      : result.data.NODE_ENV === 'test';

  return {
    ...result.data,
    APP_BASE_URL: defaultAppBaseUrl,
    ALLOWED_REDIRECT_URLS: defaultAllowedRedirectUrls,
    RECOVERY_SIGNING_SECRET: defaultRecoverySigningSecret,
    SUPABASE_URL: result.data.SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_ANON_KEY: result.data.SUPABASE_ANON_KEY || 'mock-anon-key',
    MESSAGING_ENABLED: defaultMessagingEnabled,
    SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: defaultSignupPasswordCheckApprovalEnabled,
  };
}

export const config = validateEnv();
