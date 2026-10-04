import * as fs from 'fs';

export const CHATGPT_REVIEW_RELAY_MARKER = '<!-- chatgpt-review-relay-comment -->';
export const CHATGPT_REVIEW_LABEL = 'chatgpt-review';

export interface RawPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | string;
  draft?: boolean;
  body?: string | null;
  html_url?: string;
  head: {
    ref: string;
    sha: string;
    repo?: {
      full_name: string;
    } | null;
  };
  base: {
    ref: string;
    repo?: {
      full_name: string;
    } | null;
  };
  labels?: Array<{ name: string } | string>;
}

export interface RawCheckRun {
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  issueNumber?: number;
  reasons: string[];
}

export interface CheckStateSummary {
  overallState: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NO_CHECKS';
  ciState: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NOT_FOUND';
  safetyGateState: 'PASSED' | 'FAILED' | 'PENDING' | 'NOT_FOUND';
  summaryText: string;
}

export interface RelayOptions {
  repository: string;
  pullRequest: RawPullRequest;
  token?: string;
  customFetch?: typeof fetch;
}

export interface RelayResult {
  handled: boolean;
  action: 'CLEARED_CLOSED' | 'SKIPPED_INELIGIBLE' | 'RELAY_MARKED';
  eligibility: EligibilityResult;
  labelUpdated?: boolean;
  commentAction?: 'CREATED' | 'UPDATED' | 'NONE';
  checkSummary?: CheckStateSummary;
  errors?: string[];
}

export interface CommentItem {
  id: number;
  body: string;
}

/**
 * Extracts governing issue number from PR body (expected format: "Refs #<number>").
 */
export function extractGoverningIssue(prBody: string | null | undefined): number | null {
  if (!prBody) return null;
  const match = prBody.match(/Refs\s+#(\d+)/i);
  if (!match) return null;
  const parsed = parseInt(match[1], 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Evaluates whether a PR meets all eligibility criteria for the ChatGPT Review Relay.
 */
export function evaluatePrEligibility(pr: RawPullRequest): EligibilityResult {
  const reasons: string[] = [];

  if (pr.state !== 'open') {
    reasons.push(`PR state is "${pr.state}", expected "open".`);
  }

  if (pr.base.ref !== 'main') {
    reasons.push(`Target branch is "${pr.base.ref}", expected "main".`);
  }

  if (pr.head.ref === 'main') {
    reasons.push('PR head branch is "main", implementation must be on a feature branch.');
  }

  const baseRepoName = pr.base.repo?.full_name;
  const headRepoName = pr.head.repo?.full_name;

  if (!headRepoName || !baseRepoName || headRepoName !== baseRepoName) {
    reasons.push(`PR is from a fork ("${headRepoName || 'unknown'}" vs "${baseRepoName || 'unknown'}"). Relay processes same-repository PRs only.`);
  }

  if (pr.draft === true) {
    reasons.push('PR is a draft.');
  }

  const issueNumber = extractGoverningIssue(pr.body);
  if (!issueNumber) {
    reasons.push('Missing valid governing Issue reference (expected "Refs #<number>" in body).');
  }

  return {
    eligible: reasons.length === 0,
    issueNumber: issueNumber ?? undefined,
    reasons,
  };
}

/**
 * Summarizes the state of check runs for a commit ref.
 */
export function summarizeCheckState(checkRuns: RawCheckRun[]): CheckStateSummary {
  if (!checkRuns || checkRuns.length === 0) {
    return {
      overallState: 'NO_CHECKS',
      ciState: 'NOT_FOUND',
      safetyGateState: 'NOT_FOUND',
      summaryText: 'No check runs reported.',
    };
  }

  let ciRun: RawCheckRun | undefined;
  let safetyGateRun: RawCheckRun | undefined;

  for (const run of checkRuns) {
    const nameLower = run.name.toLowerCase();
    if (nameLower.includes('ci') || nameLower.includes('build-and-test') || nameLower.includes('build')) {
      ciRun = run;
    }
    if (nameLower.includes('safety gate') || nameLower.includes('validate-safety-gate') || nameLower.includes('pr contract')) {
      safetyGateRun = run;
    }
  }

  const parseRunState = (run?: RawCheckRun): 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NOT_FOUND' => {
    if (!run) return 'NOT_FOUND';
    if (run.status !== 'completed') return 'PENDING';
    if (run.conclusion === 'success' || run.conclusion === 'neutral') return 'SUCCESS';
    return 'FAILURE';
  };

  const ciState = parseRunState(ciRun);
  const safetyGateState = ciStateToGateState(parseRunState(safetyGateRun));

  let overallState: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NO_CHECKS' = 'SUCCESS';

  const hasFailure = checkRuns.some(
    (r) => r.status === 'completed' && ['failure', 'timed_out', 'action_required', 'cancelled'].includes(r.conclusion || '')
  );
  const hasPending = checkRuns.some((r) => r.status !== 'completed');

  if (hasFailure) {
    overallState = 'FAILURE';
  } else if (hasPending) {
    overallState = 'PENDING';
  }

  const summaryText = `CI: ${ciState}, Safety Gate: ${safetyGateState}, Overall: ${overallState}`;

  return {
    overallState,
    ciState,
    safetyGateState,
    summaryText,
  };
}

function ciStateToGateState(state: 'SUCCESS' | 'FAILURE' | 'PENDING' | 'NOT_FOUND'): 'PASSED' | 'FAILED' | 'PENDING' | 'NOT_FOUND' {
  if (state === 'SUCCESS') return 'PASSED';
  if (state === 'FAILURE') return 'FAILED';
  return state;
}

/**
 * Generates markdown comment body for ChatGPT Review Relay.
 */
export function generateRelayCommentBody(
  pr: RawPullRequest,
  issueNumber?: number,
  checkSummary?: CheckStateSummary,
  isClosed = false
): string {
  if (isClosed) {
    return `${CHATGPT_REVIEW_RELAY_MARKER}
### 🤖 ChatGPT Review Relay Status: Signal Cleared

**Status**: Active review signal cleared (PR Closed).
- **PR**: #${pr.number} — ${pr.title}
- **Branch**: \`${pr.head.ref}\`
- **HEAD Commit**: \`${pr.head.sha}\`
- **Governing Issue**: ${issueNumber ? `#${issueNumber}` : 'N/A'}
`;
  }

  const summary = checkSummary || {
    overallState: 'NO_CHECKS',
    ciState: 'NOT_FOUND',
    safetyGateState: 'NOT_FOUND',
    summaryText: 'No check runs reported.',
  };

  return `${CHATGPT_REVIEW_RELAY_MARKER}
### 🤖 ChatGPT Review Relay Status

| Property | Value |
| --- | --- |
| **PR** | #${pr.number} — ${pr.title} |
| **Branch** | \`${pr.head.ref}\` |
| **HEAD Commit** | \`${pr.head.sha}\` |
| **Governing Issue** | ${issueNumber ? `#${issueNumber}` : 'N/A'} |
| **CI / Check State** | ${summary.ciState} (Overall: ${summary.overallState}) |
| **Phase Safety Gate** | ${summary.safetyGateState} |
| **Next Review Step** | Ready for ChatGPT architecture and code review inspection |

---
*Note: This relay is an automated metadata/signal mechanism only. It does not perform auto-approval, auto-merge, or API calls to ChatGPT.*
`;
}

export function hasChatGptReviewLabel(pr: RawPullRequest): boolean {
  if (!pr.labels) return false;
  return pr.labels.some((l) => (typeof l === 'string' ? l : l.name) === CHATGPT_REVIEW_LABEL);
}

/**
 * Fetches all PR comments across all pages (paginated, per_page=100).
 * Throws an Error if any page fetch fails to guarantee fail-closed behavior.
 */
export async function fetchAllCommentsPaginated(
  owner: string,
  repo: string,
  prNumber: number,
  headers: Record<string, string>,
  fetchFn: typeof fetch
): Promise<CommentItem[]> {
  const allComments: CommentItem[] = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const commentsUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100&page=${page}`;
    const res = await fetchFn(commentsUrl, { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch comments for PR #${prNumber} on page ${page}: status ${res.status}`);
    }
    const pageComments = (await res.json()) as CommentItem[];
    if (!Array.isArray(pageComments) || pageComments.length === 0) {
      break;
    }
    allComments.push(...pageComments);
    if (pageComments.length < 100) {
      hasMorePages = false;
    } else {
      page++;
    }
  }

  return allComments;
}

/**
 * Ensures repository has the `chatgpt-review` label created.
 */
export async function ensureLabelProvisioned(
  owner: string,
  repo: string,
  headers: Record<string, string>,
  fetchFn: typeof fetch
): Promise<boolean> {
  const labelUrl = `https://api.github.com/repos/${owner}/${repo}/labels/${CHATGPT_REVIEW_LABEL}`;
  try {
    const getRes = await fetchFn(labelUrl, { headers });
    if (getRes.ok) {
      return true;
    }
    if (getRes.status === 404) {
      const createUrl = `https://api.github.com/repos/${owner}/${repo}/labels`;
      const createRes = await fetchFn(createUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: CHATGPT_REVIEW_LABEL,
          color: '0e8a16',
          description: 'ChatGPT Architecture & Review Signal',
        }),
      });
      return createRes.ok || createRes.status === 422; // 422 if already created concurrently
    }
  } catch {
    // Return false on unexpected network failure
  }
  return false;
}

export async function runChatgptReviewRelay(options: RelayOptions): Promise<RelayResult> {
  const { repository, pullRequest, token, customFetch } = options;
  const fetchFn = customFetch || globalThis.fetch;
  const [owner, repo] = repository.split('/');
  const errors: string[] = [];

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'VinylDrop-ChatGPTReviewRelay',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Handle closed PR cleanup
  if (pullRequest.state === 'closed') {
    let labelUpdated = false;
    let commentAction: 'UPDATED' | 'NONE' = 'NONE';

    // 1. Remove label if present
    if (hasChatGptReviewLabel(pullRequest)) {
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pullRequest.number}/labels/${CHATGPT_REVIEW_LABEL}`;
        const res = await fetchFn(url, { method: 'DELETE', headers });
        if (res.ok || res.status === 404) {
          labelUpdated = true;
        } else {
          errors.push(`Failed to remove label on closed PR: status ${res.status}`);
        }
      } catch (err) {
        errors.push(`Network error removing label on closed PR: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Update marked comment if present (using pagination)
    const issueNum = extractGoverningIssue(pullRequest.body);
    try {
      const comments = await fetchAllCommentsPaginated(owner, repo, pullRequest.number, headers, fetchFn);
      const markedComment = comments.find((c) => c.body && c.body.includes(CHATGPT_REVIEW_RELAY_MARKER));

      if (markedComment) {
        const updatedBody = generateRelayCommentBody(pullRequest, issueNum ?? undefined, undefined, true);
        const patchUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${markedComment.id}`;
        const patchRes = await fetchFn(patchUrl, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: updatedBody }),
        });
        if (patchRes.ok) {
          commentAction = 'UPDATED';
        } else {
          errors.push(`Failed to update cleared comment on closed PR: status ${patchRes.status}`);
        }
      }
    } catch (err) {
      errors.push(`Error checking/updating comments on closed PR: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      handled: true,
      action: 'CLEARED_CLOSED',
      eligibility: { eligible: false, issueNumber: issueNum ?? undefined, reasons: ['PR is closed.'] },
      labelUpdated,
      commentAction,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Handle open PR
  const eligibility = evaluatePrEligibility(pullRequest);
  if (!eligibility.eligible) {
    return {
      handled: true,
      action: 'SKIPPED_INELIGIBLE',
      eligibility,
    };
  }

  let labelUpdated = false;
  let commentAction: 'CREATED' | 'UPDATED' | 'NONE' = 'NONE';
  let checkSummary: CheckStateSummary | undefined;

  // 1. Provision label deterministically, then add to PR if not present
  await ensureLabelProvisioned(owner, repo, headers, fetchFn);

  if (!hasChatGptReviewLabel(pullRequest)) {
    try {
      const labelUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${pullRequest.number}/labels`;
      const res = await fetchFn(labelUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels: [CHATGPT_REVIEW_LABEL] }),
      });
      if (res.ok) {
        labelUpdated = true;
      } else {
        errors.push(`Failed to add label: API status ${res.status}`);
      }
    } catch (err) {
      errors.push(`Network error adding label: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Fetch check runs for HEAD commit
  try {
    const checksUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${pullRequest.head.sha}/check-runs`;
    const checksRes = await fetchFn(checksUrl, { headers });
    if (checksRes.ok) {
      const data = (await checksRes.json()) as { check_runs: RawCheckRun[] };
      checkSummary = summarizeCheckState(data.check_runs || []);
    } else {
      checkSummary = summarizeCheckState([]);
    }
  } catch (err) {
    checkSummary = summarizeCheckState([]);
    errors.push(`Error fetching check runs: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Create or Update Relay Comment (using pagination, fail-closed on error)
  try {
    const comments = await fetchAllCommentsPaginated(owner, repo, pullRequest.number, headers, fetchFn);
    const existingComment = comments.find((c) => c.body && c.body.includes(CHATGPT_REVIEW_RELAY_MARKER));

    const newBody = generateRelayCommentBody(pullRequest, eligibility.issueNumber, checkSummary, false);

    if (existingComment) {
      const patchUrl = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existingComment.id}`;
      const patchRes = await fetchFn(patchUrl, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newBody }),
      });
      if (patchRes.ok) {
        commentAction = 'UPDATED';
      } else {
        errors.push(`Failed to update relay comment: status ${patchRes.status}`);
      }
    } else {
      const postUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${pullRequest.number}/comments`;
      const postRes = await fetchFn(postUrl, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newBody }),
      });
      if (postRes.ok) {
        commentAction = 'CREATED';
      } else {
        errors.push(`Failed to create relay comment: status ${postRes.status}`);
      }
    }
  } catch (err) {
    errors.push(`Error fetching/updating relay comment: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    handled: true,
    action: 'RELAY_MARKED',
    eligibility,
    labelUpdated,
    commentAction,
    checkSummary,
    errors: errors.length > 0 ? errors : undefined,
  };
}

export async function runCliMain(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!repo || !eventPath) {
    console.error('Missing required environment variables (GITHUB_REPOSITORY or GITHUB_EVENT_PATH).');
    process.exit(1);
  }

  const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  const pullRequest = eventData.pull_request as RawPullRequest;

  if (!pullRequest) {
    console.error('No pull_request found in GITHUB_EVENT_PATH payload.');
    process.exit(1);
  }

  const result = await runChatgptReviewRelay({
    repository: repo,
    pullRequest,
    token,
  });

  console.log('ChatGPT Review Relay result:', JSON.stringify(result, null, 2));
  if (result.errors && result.errors.length > 0) {
    console.error('Relay encountered errors:', result.errors);
    process.exit(1);
  }
}
