import { createHmac } from 'crypto';
import { isIP } from 'net';
import { Request, RequestHandler } from 'express';
import { config } from '../../config/env';
import { queryClient } from '../../db';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const CLEANUP_INTERVAL = MINUTE;
const CLEANUP_BATCH_SIZE = 1000;

export interface RateLimitRule {
  name: string;
  windowMs: number;
  maxHits: number;
  identify: (req: Request) => string | null;
  required?: boolean;
  releaseOnSuccess?: boolean;
}

export interface RateLimitBucket {
  bucketKey: string;
  windowStartMs: number;
  expiresAtMs: number;
}

export interface RateLimitStore {
  increment(bucket: RateLimitBucket): Promise<number>;
  decrement(bucket: RateLimitBucket): Promise<void>;
  prune(nowMs: number): Promise<void>;
}

let testStore: RateLimitStore | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Tests may inject an isolated deterministic store. No in-memory store is ever
 * used as a fallback in development, staging, or production.
 */
export function setRateLimitStoreForTests(store: RateLimitStore | null): void {
  if (config.NODE_ENV !== 'test') {
    throw new Error('The rate-limit test store can only be changed in test mode.');
  }
  testStore = store;
}

/** Return a fresh in-memory store for unit tests only. */
export function createInMemoryRateLimitStoreForTests(): RateLimitStore {
  const counters = new Map<string, { count: number; expiresAtMs: number }>();
  const keyFor = (bucket: RateLimitBucket): string => bucket.bucketKey + ':' + bucket.windowStartMs;

  return {
    async increment(bucket) {
      const key = keyFor(bucket);
      const current = counters.get(key);
      const count = (current?.count ?? 0) + 1;
      counters.set(key, { count, expiresAtMs: bucket.expiresAtMs });
      return count;
    },
    async decrement(bucket) {
      const key = keyFor(bucket);
      const current = counters.get(key);
      if (!current) return;
      if (current.count <= 1) counters.delete(key);
      else counters.set(key, { ...current, count: current.count - 1 });
    },
    async prune(nowMs) {
      for (const [key, value] of counters) {
        if (value.expiresAtMs <= nowMs) counters.delete(key);
      }
    },
  };
}

/**
 * Render's public web services are routed through Cloudflare. Cloudflare
 * supplies a single CF-Connecting-IP value to the origin. Never parse
 * X-Forwarded-For and never enable Express trust proxy for this purpose.
 *
 * Local development/tests use the socket address only when the Cloudflare
 * header is absent or unusable; hosted staging/production fail closed instead.
 */
export function getRateLimitClientIp(
  req: Request,
  environment: 'development' | 'staging' | 'production' | 'test' = config.NODE_ENV
): string | null {
  const header = req.headers['cf-connecting-ip'];
  if (typeof header === 'string') {
    const value = header.trim();
    if (value === header && !value.includes(',') && isIP(value)) return value.toLowerCase();
    if (environment === 'staging' || environment === 'production') return null;
  }

  if (environment === 'development' || environment === 'test') {
    const socketAddress = req.socket.remoteAddress;
    if (socketAddress && isIP(socketAddress)) return socketAddress.toLowerCase();
  }

  return null;
}

function normalizeEmailFromRequest(req: Request): string | null {
  const value = typeof req.body?.email === 'string'
    ? req.body.email
    : typeof req.query.email === 'string'
      ? req.query.email
      : null;
  if (value === null || value.length > 254) return null;
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  return normalized || null;
}

function clientIp(req: Request): string | null {
  return getRateLimitClientIp(req);
}

function clientIpAndEmail(req: Request): string | null {
  const ip = clientIp(req);
  const email = normalizeEmailFromRequest(req);
  return ip && email ? ip + '|' + email : null;
}

function clientIpAndAccount(req: Request): string | null {
  const ip = clientIp(req);
  const userId = req.user?.id;
  return ip && userId ? ip + '|' + userId : null;
}

function account(req: Request): string | null {
  return req.user?.id ?? null;
}

function makeBucketKey(scope: string, identity: string): string {
  // Use a dedicated secret that remains stable across overlapping deployments.
  // Neither raw identifiers nor credentials are persisted in the counter table.
  const derivedSecret = createHmac('sha256', config.SHARED_RATE_LIMITS_SECRET)
    .update('the-vinyl-drop:shared-rate-limit:v1')
    .digest();
  return createHmac('sha256', derivedSecret)
    .update(scope + '\u0000' + identity)
    .digest('hex');
}

/**
 * Drizzle 0.45.x replaces Postgres.js date serializers with transparent pass-throughs.
 * Raw unsafe() calls must therefore receive ISO text, not JavaScript Date objects.
 */
function toTimestampParameter(valueMs: number): string {
  return new Date(valueMs).toISOString();
}

export async function incrementRateLimitBucketWithClient(
  client: NonNullable<typeof queryClient>,
  bucket: RateLimitBucket
): Promise<number> {
  const rows = await client.unsafe(
    'INSERT INTO private.rate_limit_buckets ' +
    '(bucket_key, window_start, hit_count, expires_at, updated_at) ' +
    'VALUES ($1, $2::timestamptz, 1, $3::timestamptz, clock_timestamp()) ' +
    'ON CONFLICT (bucket_key, window_start) DO UPDATE SET ' +
    'hit_count = private.rate_limit_buckets.hit_count + 1, ' +
    'updated_at = clock_timestamp() RETURNING hit_count',
    [
      bucket.bucketKey,
      toTimestampParameter(bucket.windowStartMs),
      toTimestampParameter(bucket.expiresAtMs),
    ]
  );

  if (!rows[0]) throw new Error('Rate-limit counter did not return a count.');
  return Number(rows[0].hit_count);
}

async function incrementBucket(bucket: RateLimitBucket): Promise<number> {
  if (testStore) return testStore.increment(bucket);
  if (!queryClient) throw new Error('Rate-limit database connection is unavailable.');
  return incrementRateLimitBucketWithClient(queryClient, bucket);
}

export async function decrementRateLimitBucketWithClient(
  client: NonNullable<typeof queryClient>,
  bucket: RateLimitBucket
): Promise<void> {
  // Serialize releases for this bucket. Without the row lock, two successful
  // responses can both decrement a count that includes a failed login and then
  // race to delete the remaining row.
  await client.begin(async (transaction) => {
    const rows = await transaction.unsafe(
      'SELECT hit_count FROM private.rate_limit_buckets ' +
      'WHERE bucket_key = $1 AND window_start = $2::timestamptz FOR UPDATE',
      [bucket.bucketKey, toTimestampParameter(bucket.windowStartMs)]
    );

    if (!rows[0]) return;

    if (Number(rows[0].hit_count) <= 1) {
      await transaction.unsafe(
        'DELETE FROM private.rate_limit_buckets WHERE bucket_key = $1 AND window_start = $2::timestamptz',
        [bucket.bucketKey, toTimestampParameter(bucket.windowStartMs)]
      );
      return;
    }

    await transaction.unsafe(
      'UPDATE private.rate_limit_buckets SET hit_count = hit_count - 1, updated_at = clock_timestamp() ' +
      'WHERE bucket_key = $1 AND window_start = $2::timestamptz',
      [bucket.bucketKey, toTimestampParameter(bucket.windowStartMs)]
    );
  });
}

async function decrementBucket(bucket: RateLimitBucket): Promise<void> {
  if (testStore) return testStore.decrement(bucket);
  if (!queryClient) throw new Error('Rate-limit database connection is unavailable.');
  await decrementRateLimitBucketWithClient(queryClient, bucket);
}

/**
 * Expose only allowlisted PostgreSQL, Postgres.js, and Node network error
 * categories in operational logs. Never forward driver messages, query text,
 * connection details, or request data.
 */
const SAFE_POSTGRES_JS_ERROR_CODES = new Set([
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'CONNECT_TIMEOUT',
  'COPY_IN_PROGRESS',
  'UNSAFE_TRANSACTION',
  'UNDEFINED_VALUE',
  'MESSAGE_NOT_SUPPORTED',
  'MAX_PARAMETERS_EXCEEDED',
  'SASL_SIGNATURE_MISMATCH',
  'NOT_TAGGED_CALL',
  'AUTH_TYPE_NOT_IMPLEMENTED',
]);

const SAFE_NODE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ETIMEDOUT',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
]);

type SafeRateLimitCleanupFailureType =
  | 'error'
  | 'type_error'
  | 'range_error'
  | 'reference_error'
  | 'syntax_error'
  | 'uri_error'
  | 'eval_error'
  | 'other_object'
  | 'non_error'
  | 'unreadable';

type SafeRateLimitCleanupCodeSource = 'direct' | 'cause_1' | 'cause_2' | 'none' | 'unreadable';
type SafeRateLimitCleanupCodeState = 'recognized' | 'unknown_string' | 'missing' | 'non_string' | 'unreadable';

export interface SafeRateLimitCleanupFailureDiagnostics {
  failureCategory: string;
  failureType: SafeRateLimitCleanupFailureType;
  codeSource: SafeRateLimitCleanupCodeSource;
  codeState: SafeRateLimitCleanupCodeState;
}

/** Map built-in error classes to a fixed label; never log a supplied name string. */
function getSafeRateLimitCleanupFailureType(error: unknown): SafeRateLimitCleanupFailureType {
  try {
    if (error instanceof TypeError) return 'type_error';
    if (error instanceof RangeError) return 'range_error';
    if (error instanceof ReferenceError) return 'reference_error';
    if (error instanceof SyntaxError) return 'syntax_error';
    if (error instanceof URIError) return 'uri_error';
    if (error instanceof EvalError) return 'eval_error';
    if (error instanceof Error) return 'error';
    return error !== null && typeof error === 'object' ? 'other_object' : 'non_error';
  } catch {
    return 'unreadable';
  }
}

/** Return a safe category only for a fixed driver/network code or SQLSTATE format. */
function classifySafeRateLimitCleanupCode(code: string): string | null {
  // Check network codes first: EPIPE is five uppercase characters but is
  // a Node socket error, not a PostgreSQL SQLSTATE.
  if (SAFE_NODE_NETWORK_ERROR_CODES.has(code)) return 'node_network:' + code;
  if (/^[0-9A-Z]{5}$/.test(code)) return 'postgres_sqlstate:' + code;
  if (SAFE_POSTGRES_JS_ERROR_CODES.has(code)) return 'postgres_js:' + code;
  return null;
}

/**
 * Inspect the thrown value and at most two nested causes. Only fixed type
 * labels and allowlisted codes are returned; messages, stacks, SQL, hosts,
 * parameters, and arbitrary error properties are never copied into logs.
 */
export function getSafeRateLimitCleanupFailureDiagnostics(
  error: unknown
): SafeRateLimitCleanupFailureDiagnostics {
  const failureType = getSafeRateLimitCleanupFailureType(error);
  let codeSource: SafeRateLimitCleanupCodeSource = 'none';
  let codeState: SafeRateLimitCleanupCodeState = 'missing';
  let current: unknown = error;

  for (let depth = 0; depth <= 2; depth += 1) {
    if (typeof current !== 'object' || current === null) break;
    const source: SafeRateLimitCleanupCodeSource =
      depth === 0 ? 'direct' : depth === 1 ? 'cause_1' : 'cause_2';

    try {
      if ('code' in current) {
        const code = (current as { code?: unknown }).code;
        if (typeof code !== 'string') {
          if (codeSource === 'none') {
            codeSource = source;
            codeState = 'non_string';
          }
        } else {
          const category = classifySafeRateLimitCleanupCode(code);
          if (category !== null) {
            return {
              failureCategory: category,
              failureType,
              codeSource: source,
              codeState: 'recognized',
            };
          }
          if (codeSource === 'none') {
            codeSource = source;
            codeState = 'unknown_string';
          }
        }
      }
    } catch {
      if (codeSource === 'none') {
        codeSource = 'unreadable';
        codeState = 'unreadable';
      }
    }

    if (depth === 2) break;

    try {
      if (!('cause' in current)) break;
      const cause = (current as { cause?: unknown }).cause;
      if (cause === null || typeof cause !== 'object') break;
      current = cause;
    } catch {
      if (codeSource === 'none') {
        codeSource = 'unreadable';
        codeState = 'unreadable';
      }
      break;
    }
  }

  return {
    failureCategory: 'unclassified',
    failureType,
    codeSource,
    codeState,
  };
}

/** Preserve the category-only helper for callers that do not need diagnostics. */
export function getSafeRateLimitCleanupFailureCategory(error: unknown): string {
  return getSafeRateLimitCleanupFailureDiagnostics(error).failureCategory;
}

/** Delete rows expiring at or before nowMs, in expiry order, up to the per-pass batch limit. */
export async function pruneExpiredRateLimitBucketsWithClient(
  client: NonNullable<typeof queryClient>,
  nowMs: number
): Promise<void> {
  await client.unsafe(
    'WITH expired AS (' +
    'SELECT bucket_key, window_start FROM private.rate_limit_buckets ' +
    'WHERE expires_at <= $1::timestamptz ORDER BY expires_at LIMIT ' + CLEANUP_BATCH_SIZE +
    ') DELETE FROM private.rate_limit_buckets AS bucket USING expired ' +
    'WHERE bucket.bucket_key = expired.bucket_key AND bucket.window_start = expired.window_start',
    [toTimestampParameter(nowMs)]
  );
}

/**
 * Runs one expiry pass against the injected test store or the shared PostgreSQL
 * connection, without changing the bounded cleanup behavior.
 */
async function pruneExpiredBuckets(nowMs: number): Promise<void> {
  if (testStore) return testStore.prune(nowMs);
  if (!queryClient) throw new Error('Rate-limit database connection is unavailable.');
  await pruneExpiredRateLimitBucketsWithClient(queryClient, nowMs);
}

/**
 * Run bounded expiry cleanup independently of request traffic. Each tick deletes
 * at most CLEANUP_BATCH_SIZE rows, allowing a backlog to drain over time.
 */
export function startRateLimitCleanup(): void {
  if (!config.SHARED_RATE_LIMITS_ENABLED || !queryClient || cleanupTimer) return;

  const runCleanup = (): void => {
    void pruneExpiredBuckets(Date.now()).catch((error: unknown) => {
      // Keep maintenance failures isolated and log only an allowlisted safe category.
      console.error(
        'Shared rate-limit expiry cleanup failed.',
        getSafeRateLimitCleanupFailureDiagnostics(error)
      );
    });
  };

  runCleanup();
  cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL);
  cleanupTimer.unref?.();
}

function sendRateLimitResponse(
  req: Request,
  res: Parameters<RequestHandler>[1],
  status: 429 | 503,
  retryAfterSeconds: number
): void {
  const message = status === 429
    ? 'Too many requests. Please try again later.'
    : 'This action is temporarily unavailable. Please try again later.';
  res.set('Cache-Control', 'no-store');
  res.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
  res.status(status);
  if (req.accepts('json') && !req.accepts('html')) {
    res.json({ error: message });
    return;
  }
  res.type('text/plain').send(message);
}

/**
 * Shared fixed-window limiter backed by private Postgres counters. Each
 * bucket increment is atomic and shared across application instances.
 */
export function createRateLimitMiddleware(rules: RateLimitRule[]): RequestHandler {
  return (req, res, next) => {
    // Keep hosted deployments and local developer environments unchanged until
    // the target database has migration 0019 and the owner enables this feature.
    if (!config.SHARED_RATE_LIMITS_ENABLED) {
      next();
      return;
    }

    // Existing route integration tests run without a database. Dedicated tests
    // inject a store and exercise the exact same middleware.
    if (config.NODE_ENV === 'test' && !testStore) {
      next();
      return;
    }

    void (async () => {
      const nowMs = Date.now();
      const buckets: Array<{ rule: RateLimitRule; bucket: RateLimitBucket }> = [];

      for (const rule of rules) {
        const identity = rule.identify(req);
        if (identity === null) {
          if (rule.required) {
            sendRateLimitResponse(req, res, 503, 60);
            return;
          }
          continue;
        }

        const windowStartMs = Math.floor(nowMs / rule.windowMs) * rule.windowMs;
        buckets.push({
          rule,
          bucket: {
            bucketKey: makeBucketKey(rule.name, identity),
            windowStartMs,
            expiresAtMs: windowStartMs + rule.windowMs,
          },
        });
      }

      if (!buckets.length) {
        sendRateLimitResponse(req, res, 503, 60);
        return;
      }

      let retryAfterSeconds = 0;
      const releaseOnSuccess: RateLimitBucket[] = [];

      for (const { rule, bucket } of buckets) {
        const count = await incrementBucket(bucket);
        if (count > rule.maxHits) {
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            Math.ceil((bucket.expiresAtMs - nowMs) / 1000)
          );
        }
        if (rule.releaseOnSuccess) releaseOnSuccess.push(bucket);
      }

      if (retryAfterSeconds > 0) {
        sendRateLimitResponse(req, res, 429, retryAfterSeconds);
        return;
      }

      if (releaseOnSuccess.length) {
        res.once('finish', () => {
          if (res.statusCode < 200 || res.statusCode >= 400) return;
          for (const bucket of releaseOnSuccess) {
            void decrementBucket(bucket).catch(() => {
              // A missed release can only make the limit stricter until expiry.
            });
          }
        });
      }

      next();
    })().catch(() => {
      // Do not expose database details, request identifiers, or submitted data.
      sendRateLimitResponse(req, res, 503, 60);
    });
  };
}

const ip = (req: Request): string | null => clientIp(req);
const emailAndIp = (req: Request): string | null => clientIpAndEmail(req);
const accountId = (req: Request): string | null => account(req);
const accountAndIp = (req: Request): string | null => clientIpAndAccount(req);

export const rateLimits = {
  signUp: createRateLimitMiddleware([
    { name: 'auth-signup-ip', windowMs: HOUR, maxHits: 5, identify: ip, required: true },
  ]),
  login: createRateLimitMiddleware([
    { name: 'auth-login-ip', windowMs: 15 * MINUTE, maxHits: 30, identify: ip, required: true },
    { name: 'auth-login-failed-identity', windowMs: 15 * MINUTE, maxHits: 5, identify: emailAndIp, releaseOnSuccess: true },
  ]),
  forgotPassword: createRateLimitMiddleware([
    { name: 'auth-forgot-ip', windowMs: HOUR, maxHits: 10, identify: ip, required: true },
    { name: 'auth-forgot-identity', windowMs: HOUR, maxHits: 5, identify: emailAndIp },
  ]),
  resetPassword: createRateLimitMiddleware([
    { name: 'auth-reset-ip', windowMs: HOUR, maxHits: 10, identify: ip, required: true },
    { name: 'auth-reset-identity', windowMs: HOUR, maxHits: 5, identify: accountAndIp },
  ]),
  googleOAuthStart: createRateLimitMiddleware([
    { name: 'auth-google-start-ip', windowMs: 15 * MINUTE, maxHits: 10, identify: ip, required: true },
  ]),
  contact: createRateLimitMiddleware([
    { name: 'contact-ip', windowMs: HOUR, maxHits: 5, identify: ip, required: true },
  ]),
  listingCreate: createRateLimitMiddleware([
    { name: 'listing-create-account', windowMs: DAY, maxHits: 5, identify: accountId, required: true },
  ]),
  listingComment: createRateLimitMiddleware([
    { name: 'listing-comment-account-short', windowMs: 10 * MINUTE, maxHits: 5, identify: accountId, required: true },
    { name: 'listing-comment-account-daily', windowMs: DAY, maxHits: 30, identify: accountId, required: true },
  ]),
  listingPhotoUpload: createRateLimitMiddleware([
    { name: 'listing-photo-account-hourly', windowMs: HOUR, maxHits: 5, identify: accountId, required: true },
    { name: 'listing-photo-account-daily', windowMs: DAY, maxHits: 10, identify: accountId, required: true },
  ]),
  catalogueSuggestion: createRateLimitMiddleware([
    { name: 'catalogue-suggestion-ip', windowMs: MINUTE, maxHits: 30, identify: ip, required: true },
  ]),
  peopleSuggestion: createRateLimitMiddleware([
    { name: 'people-suggestion-ip', windowMs: MINUTE, maxHits: 30, identify: ip, required: true },
  ]),
  peoplePage: createRateLimitMiddleware([
    { name: 'people-page-ip', windowMs: MINUTE, maxHits: 30, identify: ip, required: true },
  ]),
  discogsSearch: createRateLimitMiddleware([
    { name: 'discogs-search-account', windowMs: 10 * MINUTE, maxHits: 30, identify: accountId, required: true },
  ]),
  discogsMetadataLookup: createRateLimitMiddleware([
    { name: 'discogs-metadata-account', windowMs: 10 * MINUTE, maxHits: 30, identify: accountId, required: true },
  ]),
  discogsImport: createRateLimitMiddleware([
    { name: 'discogs-import-account', windowMs: HOUR, maxHits: 5, identify: accountId, required: true },
  ]),
  messageStart: createRateLimitMiddleware([
    { name: 'messaging-conversation-start-account', windowMs: DAY, maxHits: 5, identify: accountId, required: true },
  ]),
  messageSend: createRateLimitMiddleware([
    { name: 'messaging-send-account-short', windowMs: 10 * MINUTE, maxHits: 30, identify: accountId, required: true },
    { name: 'messaging-send-account-daily', windowMs: DAY, maxHits: 100, identify: accountId, required: true },
  ]),
};

export const conditionalDiscogsSearchRateLimit: RequestHandler = (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    next();
    return;
  }
  rateLimits.discogsSearch(req, res, next);
};
