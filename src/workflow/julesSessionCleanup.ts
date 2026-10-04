export interface SessionCleanupOptions {
  repository: string;
  sessionInputs: string | string[];
  confirmationToken?: string;
  dryRun: boolean;
  julesApiKey?: string;
  customFetch?: typeof fetch;
}

export interface SessionInspectionResult {
  sessionId: string;
  normalizedSessionName: string;
  source?: string;
  state?: string;
  isDeletable: boolean;
  deleted: boolean;
  reason: string;
}

export interface CleanupResult {
  success: boolean;
  dryRun: boolean;
  deletionAuthorized: boolean;
  inspectedCount: number;
  deletedCount: number;
  sessions: SessionInspectionResult[];
  errors: string[];
}

export interface RawJulesSession {
  name?: string;
  title?: string;
  state?: string;
  sourceContext?: {
    source?: string;
  };
}

export const APPROVED_STALE_STATES = [
  'PAUSED',
  'STATE_PAUSED',
  'COMPLETED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
];

export const ACTIVE_RUNNING_STATES = [
  'QUEUED',
  'PLANNING',
  'AWAITING_PLAN_APPROVAL',
  'AWAITING_USER_FEEDBACK',
  'IN_PROGRESS',
  'STATE_ACTIVE',
  'RUNNING',
  'STATE_RUNNING',
];

export const REQUIRED_CONFIRMATION_TOKEN = 'DELETE_STALE_SESSIONS';

/**
 * Strictly parses and validates raw input strings into distinct normalized session resource identifiers.
 * Accepts formats: "12345", "sessions/12345", or "projects/proj/locations/global/sessions/12345".
 * Rejects malformed paths, path traversals, or invalid characters.
 */
export function parseSessionInputs(inputs: string | string[]): string[] {
  const rawList: string[] = Array.isArray(inputs) ? inputs : [inputs];
  const items: string[] = [];

  // Regex matching strict session ID or resource path format
  const sessionPattern = /^(?:(?:projects\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+\/)?sessions\/)?([a-zA-Z0-9_-]+)$/;

  for (const rawItem of rawList) {
    if (!rawItem) continue;
    // Split by newlines, commas, or spaces
    const parts = rawItem.split(/[\r\n,\s]+/);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const match = trimmed.match(sessionPattern);
      if (match) {
        const sessionId = match[1];
        const normalized = `sessions/${sessionId}`;
        if (!items.includes(normalized)) {
          items.push(normalized);
        }
      }
    }
  }

  return items;
}

/**
 * Executes manual stale Jules session inspection and cleanup with strict guards.
 */
export async function runJulesSessionCleanup(options: SessionCleanupOptions): Promise<CleanupResult> {
  const fetchFn = options.customFetch || globalThis.fetch;
  const errors: string[] = [];
  const sessionResults: SessionInspectionResult[] = [];

  const repo = (options.repository || '').trim();
  if (!repo || !repo.includes('/')) {
    return {
      success: false,
      dryRun: options.dryRun,
      deletionAuthorized: false,
      inspectedCount: 0,
      deletedCount: 0,
      sessions: [],
      errors: [`Invalid repository specification: "${repo}". Expected format: "owner/repo".`],
    };
  }

  const expectedSource = `sources/github/${repo}`;
  const apiKey = (options.julesApiKey || '').trim();

  if (!apiKey) {
    return {
      success: false,
      dryRun: options.dryRun,
      deletionAuthorized: false,
      inspectedCount: 0,
      deletedCount: 0,
      sessions: [],
      errors: ['Missing required JULES_API_KEY secret (fail closed).'],
    };
  }

  const confirmation = (options.confirmationToken || '').trim();

  // Guard: In live deletion mode (dryRun === false), invalid confirmation token must fail closed immediately
  if (!options.dryRun && confirmation !== REQUIRED_CONFIRMATION_TOKEN) {
    return {
      success: false,
      dryRun: false,
      deletionAuthorized: false,
      inspectedCount: 0,
      deletedCount: 0,
      sessions: [],
      errors: [
        `Invalid confirmation token "${confirmation || '(omitted)'}" for live session deletion. Required confirmation token is "${REQUIRED_CONFIRMATION_TOKEN}". Operation failed closed without inspecting or deleting sessions.`,
      ],
    };
  }

  const normalizedSessionNames = parseSessionInputs(options.sessionInputs);
  if (normalizedSessionNames.length === 0) {
    return {
      success: false,
      dryRun: options.dryRun,
      deletionAuthorized: false,
      inspectedCount: 0,
      deletedCount: 0,
      sessions: [],
      errors: ['No valid Jules session names or IDs were supplied.'],
    };
  }

  const deletionAuthorized = !options.dryRun && confirmation === REQUIRED_CONFIRMATION_TOKEN;

  let overallSuccess = true;
  let deletedCount = 0;

  for (const sessionName of normalizedSessionNames) {
    const rawId = sessionName.replace(/^sessions\//, '');
    const getUrl = `https://jules.googleapis.com/v1alpha/${sessionName}`;

    let sessionData: RawJulesSession | null = null;
    try {
      const res = await fetchFn(getUrl, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'User-Agent': 'VinylDrop-JulesSessionCleanup',
        },
      });

      if (!res.ok) {
        const errorMsg = `API error inspecting session "${sessionName}": HTTP status ${res.status}`;
        errors.push(errorMsg);
        sessionResults.push({
          sessionId: rawId,
          normalizedSessionName: sessionName,
          isDeletable: false,
          deleted: false,
          reason: errorMsg,
        });
        overallSuccess = false;
        continue;
      }

      sessionData = (await res.json()) as RawJulesSession;
    } catch (err) {
      const errorMsg = `Network error inspecting session "${sessionName}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errorMsg);
      sessionResults.push({
        sessionId: rawId,
        normalizedSessionName: sessionName,
        isDeletable: false,
        deleted: false,
        reason: errorMsg,
      });
      overallSuccess = false;
      continue;
    }

    const actualSource = sessionData?.sourceContext?.source || '';
    const actualState = (sessionData?.state || '').toUpperCase();

    // Guard 1: Source Context matching exact repository
    if (actualSource !== expectedSource) {
      const reason = `Source context mismatch: expected "${expectedSource}", got "${actualSource || 'NONE'}". Session belongs to another repository or missing source context.`;
      errors.push(`Session "${sessionName}": ${reason}`);
      sessionResults.push({
        sessionId: rawId,
        normalizedSessionName: sessionName,
        source: actualSource,
        state: actualState,
        isDeletable: false,
        deleted: false,
        reason,
      });
      overallSuccess = false;
      continue;
    }

    // Guard 2: Active/running session protection
    if (ACTIVE_RUNNING_STATES.includes(actualState)) {
      const reason = `Session is currently in active state "${actualState}". Active sessions must never be deleted.`;
      errors.push(`Session "${sessionName}": ${reason}`);
      sessionResults.push({
        sessionId: rawId,
        normalizedSessionName: sessionName,
        source: actualSource,
        state: actualState,
        isDeletable: false,
        deleted: false,
        reason,
      });
      overallSuccess = false;
      continue;
    }

    // Guard 3: Approved stale state requirement
    if (!APPROVED_STALE_STATES.includes(actualState)) {
      const reason = `Session state "${actualState}" is not an approved stale state (${APPROVED_STALE_STATES.join(', ')}).`;
      errors.push(`Session "${sessionName}": ${reason}`);
      sessionResults.push({
        sessionId: rawId,
        normalizedSessionName: sessionName,
        source: actualSource,
        state: actualState,
        isDeletable: false,
        deleted: false,
        reason,
      });
      overallSuccess = false;
      continue;
    }

    // All guards passed: Session is confirmed stale and belongs to this repo
    if (deletionAuthorized) {
      try {
        const deleteUrl = `https://jules.googleapis.com/v1alpha/${sessionName}`;
        const deleteRes = await fetchFn(deleteUrl, {
          method: 'DELETE',
          headers: {
            'X-Goog-Api-Key': apiKey,
            'User-Agent': 'VinylDrop-JulesSessionCleanup',
          },
        });

        if (!deleteRes.ok) {
          const deleteErr = `Failed to delete session "${sessionName}": HTTP status ${deleteRes.status}`;
          errors.push(deleteErr);
          sessionResults.push({
            sessionId: rawId,
            normalizedSessionName: sessionName,
            source: actualSource,
            state: actualState,
            isDeletable: true,
            deleted: false,
            reason: deleteErr,
          });
          overallSuccess = false;
          continue;
        }

        deletedCount++;
        sessionResults.push({
          sessionId: rawId,
          normalizedSessionName: sessionName,
          source: actualSource,
          state: actualState,
          isDeletable: true,
          deleted: true,
          reason: 'Session deleted successfully.',
        });
      } catch (err) {
        const deleteErr = `Network error during deletion of session "${sessionName}": ${err instanceof Error ? err.message : String(err)}`;
        errors.push(deleteErr);
        sessionResults.push({
          sessionId: rawId,
          normalizedSessionName: sessionName,
          source: actualSource,
          state: actualState,
          isDeletable: true,
          deleted: false,
          reason: deleteErr,
        });
        overallSuccess = false;
      }
    } else {
      let notDeletedReason = 'Session is stale and eligible for deletion, but deletion was not authorized.';
      if (options.dryRun) {
        notDeletedReason += ' (Dry run mode active)';
      }

      sessionResults.push({
        sessionId: rawId,
        normalizedSessionName: sessionName,
        source: actualSource,
        state: actualState,
        isDeletable: true,
        deleted: false,
        reason: notDeletedReason,
      });
    }
  }

  return {
    success: overallSuccess,
    dryRun: options.dryRun,
    deletionAuthorized,
    inspectedCount: sessionResults.length,
    deletedCount,
    sessions: sessionResults,
    errors,
  };
}
