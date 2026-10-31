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
    SHARED_RATE_LIMITS_ENABLED: z.string().optional().transform((val, ctx) => {
      if (val === undefined || val.trim() === '') return undefined;
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return true;
      if (normalized === 'false' || normalized === '0') return false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SHARED_RATE_LIMITS_ENABLED'],
        message: 'SHARED_RATE_LIMITS_ENABLED must be true, false, 1, or 0.',
      });
      return z.NEVER;
    }),
    SHARED_RATE_LIMITS_SECRET: z.string().optional(),
    SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: z.string().optional().transform((val) => {
      if (val === undefined || val === '') return undefined;
      return val.toLowerCase() === 'true' || val === '1';
    }),
    BETA_INVITE_ONLY_ENABLED: z.preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      return value;
    }, z.boolean().optional()),
    BETA_ALLOWED_EMAILS: z.string().optional(),
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
    const betaAllowedEmails = [
      ...new Set(
        (data.BETA_ALLOWED_EMAILS || '')
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];

    if (betaAllowedEmails.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BETA_ALLOWED_EMAILS'],
        message: 'The invite-only pilot is limited to five email addresses at most.',
      });
    }

    for (const email of betaAllowedEmails) {
      if (!z.string().email().safeParse(email).success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BETA_ALLOWED_EMAILS'],
          message: 'BETA_ALLOWED_EMAILS must contain valid comma-separated email addresses.',
        });
      }
    }

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

    if (
      data.SHARED_RATE_LIMITS_ENABLED === true &&
      (!data.SHARED_RATE_LIMITS_SECRET || data.SHARED_RATE_LIMITS_SECRET.trim().length < 32)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SHARED_RATE_LIMITS_SECRET'],
        message: 'SHARED_RATE_LIMITS_SECRET must be at least 32 characters when shared rate limits are enabled.',
      });
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

export type Env = Omit<
  z.infer<typeof envSchema>,
  | 'APP_BASE_URL'
  | 'ALLOWED_REDIRECT_URLS'
  | 'MESSAGING_ENABLED'
  | 'SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED'
  | 'SHARED_RATE_LIMITS_ENABLED'
  | 'SHARED_RATE_LIMITS_SECRET'
  | 'BETA_INVITE_ONLY_ENABLED'
  | 'BETA_ALLOWED_EMAILS'
> & {
  APP_BASE_URL: string;
  ALLOWED_REDIRECT_URLS: string;
  RECOVERY_SIGNING_SECRET: string;
  MESSAGING_ENABLED: boolean;
  SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: boolean;
  SHARED_RATE_LIMITS_ENABLED: boolean;
  SHARED_RATE_LIMITS_SECRET: string;
  BETA_INVITE_ONLY_ENABLED: boolean;
  BETA_ALLOWED_EMAILS: string;
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
  // and production stay off until migration 0011 and the Auth hook are separately approved.
  const defaultSignupPasswordCheckApprovalEnabled =
    result.data.SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED !== undefined
      ? result.data.SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED
      : result.data.NODE_ENV === 'test';

  // Shared rate limits stay off in every runtime environment until the target
  // database has migration 0019 and the owner separately enables the feature.
  const defaultSharedRateLimitsEnabled =
    result.data.SHARED_RATE_LIMITS_ENABLED ?? result.data.NODE_ENV === 'test';
  const defaultSharedRateLimitsSecret =
    result.data.SHARED_RATE_LIMITS_SECRET ||
    (result.data.NODE_ENV === 'test' ? 'test-only-shared-rate-limit-signing-secret-32-bytes' : '');

  if (defaultSharedRateLimitsEnabled && defaultSharedRateLimitsSecret.trim().length < 32) {
    throw new Error('SHARED_RATE_LIMITS_SECRET must be at least 32 characters when shared rate limits are enabled');
  }

  // Invite-only access is opt-in; deploying source alone must not silently change existing sign-up behavior.
  // When enabled with an empty BETA_ALLOWED_EMAILS value, the allowlist helper intentionally denies everyone.
  const defaultBetaInviteOnlyEnabled = result.data.BETA_INVITE_ONLY_ENABLED ?? false;
  const defaultBetaAllowedEmails = result.data.BETA_ALLOWED_EMAILS || '';

  return {
    ...result.data,
    APP_BASE_URL: defaultAppBaseUrl,
    ALLOWED_REDIRECT_URLS: defaultAllowedRedirectUrls,
    RECOVERY_SIGNING_SECRET: defaultRecoverySigningSecret,
    SUPABASE_URL: result.data.SUPABASE_URL || 'https://example.supabase.co',
    SUPABASE_ANON_KEY: result.data.SUPABASE_ANON_KEY || 'mock-anon-key',
    MESSAGING_ENABLED: defaultMessagingEnabled,
    SIGNUP_PASSWORD_CHECK_APPROVAL_ENABLED: defaultSignupPasswordCheckApprovalEnabled,
    SHARED_RATE_LIMITS_ENABLED: defaultSharedRateLimitsEnabled,
    SHARED_RATE_LIMITS_SECRET: defaultSharedRateLimitsSecret,
    BETA_INVITE_ONLY_ENABLED: defaultBetaInviteOnlyEnabled,
    BETA_ALLOWED_EMAILS: defaultBetaAllowedEmails,
  };
}

export const config = validateEnv();
