export interface DispatcherOptions {
  repository: string;
  token?: string;
  julesApiKey?: string;
  issueNumber?: number;
  dryRun: boolean;
  customFetch?: typeof fetch;
}

export interface IssueMetadata {
  issueNumber: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  primarySpecialist?: string;
  secondarySpecialist?: string;
  priority?: number; // 1 (highest) to 5 (lowest), default 3
  dependencies: number[];
  isDispatchReady: boolean;
}

export interface JulesSessionPayload {
  title: string;
  prompt: string;
  sourceContext: {
    githubRepoContext: {
      startingBranch: string;
    };
  };
  automationMode: string;
}

export interface PreflightResult {
  success: boolean;
  issueNumber?: number;
  issueTitle?: string;
  dryRun: boolean;
  selectedIssue?: IssueMetadata;
  errors: string[];
  warnings?: string[];
  dispatchPayload?: JulesSessionPayload;
  liveDispatchTriggered?: boolean;
}

export interface RawGitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels?: Array<{ name: string } | string>;
  pull_request?: unknown;
}

export interface RawGitHubPullRequest {
  number: number;
  title: string;
  body?: string | null;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

export interface RawJulesSession {
  name?: string;
  state?: string;
  title?: string;
  sourceContext?: {
    githubRepoContext?: {
      startingBranch?: string;
    };
    source?: string;
  };
}

/**
 * Parses raw issue data into structured IssueMetadata.
 */
export function parseIssueMetadata(issue: RawGitHubIssue): IssueMetadata {
  const body = issue.body || '';
  const rawLabels = issue.labels || [];
  const labels = rawLabels.map((l) => (typeof l === 'string' ? l : l.name));

  // Check readiness via label or explicit body metadata
  const hasReadyLabel = labels.some((l) =>
    ['dispatch-ready', 'ready-for-dispatch', 'ready'].includes(l.toLowerCase())
  );

  const bodyReadyMatch = body.match(/###\s*(?:Dispatch\s*)?Readiness[\s\S]*?(ready|dispatch-ready)/i) ||
    body.match(/\*\*Readiness\*\*:\s*(ready|dispatch-ready)/i) ||
    body.match(/Readiness:\s*(ready|dispatch-ready)/i);

  const isDispatchReady = hasReadyLabel || Boolean(bodyReadyMatch);

  // Parse primary and secondary specialists
  let primarySpecialist: string | undefined;
  let secondarySpecialist: string | undefined;

  const primaryMatch = body.match(/\*\*Primary\s*(?:Specialist)?\*\*:\s*([^\r\n]+)/i) ||
    body.match(/Primary\s*(?:Specialist)?:\s*([^\r\n]+)/i);
  if (primaryMatch) {
    primarySpecialist = primaryMatch[1].trim();
  }

  const secondaryMatch = body.match(/\*\*Secondary\s*(?:Specialist)?\*\*:\s*([^\r\n]+)/i) ||
    body.match(/Secondary\s*(?:Specialist)?:\s*([^\r\n]+)/i);
  if (secondaryMatch) {
    secondarySpecialist = secondaryMatch[1].trim();
  }

  // Parse priority (e.g. Priority: 1 or **Priority**: P1)
  let priority = 3;
  const priorityMatch = body.match(/\*\*(?:Priority|P)\*\*:\s*(?:P)?(\d+)/i) ||
    body.match(/Priority:\s*(?:P)?(\d+)/i);
  if (priorityMatch) {
    const parsedP = parseInt(priorityMatch[1], 10);
    if (!isNaN(parsedP) && parsedP >= 1) {
      priority = parsedP;
    }
  }

  // Parse dependencies (e.g. Depends on #20 or Dependencies: #20, #21)
  const dependencies: number[] = [];
  const depSectionMatch = body.match(/###\s*Dependencies[\s\S]*?(?=\n##|$)/i) ||
    body.match(/(?:Depends\s+on|Dependencies):\s*([^\r\n]+)/i);

  if (depSectionMatch) {
    const depText = depSectionMatch[0];
    const depMatches = depText.matchAll(/#(\d+)/g);
    for (const match of depMatches) {
      const depNum = parseInt(match[1], 10);
      if (!isNaN(depNum) && depNum !== issue.number && !dependencies.includes(depNum)) {
        dependencies.push(depNum);
      }
    }
  }

  return {
    issueNumber: issue.number,
    title: issue.title,
    body,
    state: issue.state,
    labels,
    primarySpecialist,
    secondarySpecialist,
    priority,
    dependencies,
    isDispatchReady,
  };
}

/**
 * Deterministic sorting function for ready candidate issues.
 * Rule: Sort by Priority ascending (lower number = higher priority), then Issue Number ascending (older issue first).
 */
export function sortCandidateIssues(issues: IssueMetadata[]): IssueMetadata[] {
  return [...issues].sort((a, b) => {
    const prioA = a.priority ?? 3;
    const prioB = b.priority ?? 3;
    if (prioA !== prioB) {
      return prioA - prioB;
    }
    return a.issueNumber - b.issueNumber;
  });
}

/**
 * Validates branch "main" existence in repository.
 */
export async function verifyMainBranch(
  repository: string,
  token?: string,
  customFetch?: typeof fetch
): Promise<{ available: boolean; error?: string }> {
  const fetchFn = customFetch || globalThis.fetch;
  const url = `https://api.github.com/repos/${repository}/branches/main`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'VinylDrop-JulesDispatcher',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetchFn(url, { headers });
    if (res.ok) {
      return { available: true };
    }
    return {
      available: false,
      error: `Branch "main" is not available or inaccessible (HTTP status ${res.status}).`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, error: `Failed to verify "main" branch: ${msg}` };
  }
}

/**
 * Checks if any open pull requests conflict with the given issue number.
 */
export async function checkConflictingPullRequests(
  repository: string,
  issueNumber: number,
  token?: string,
  customFetch?: typeof fetch
): Promise<{ hasConflict: boolean; error?: string }> {
  const fetchFn = customFetch || globalThis.fetch;
  const url = `https://api.github.com/repos/${repository}/pulls?state=open&per_page=100`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'VinylDrop-JulesDispatcher',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetchFn(url, { headers });
    if (!res.ok) {
      return {
        hasConflict: true,
        error: `Failed to fetch open pull requests (HTTP status ${res.status}).`,
      };
    }

    const prs = (await res.json()) as RawGitHubPullRequest[];
    const issueRefRegex = new RegExp(`(?:Refs|Closes|Fixes|Resolves)\\s+#${issueNumber}\\b`, 'i');
    const branchNameRegex = new RegExp(`(?:issue|feature)[/-]?${issueNumber}\\b`, 'i');

    for (const pr of prs) {
      const prBody = pr.body || '';
      const headRef = pr.head?.ref || '';

      if (issueRefRegex.test(prBody) || branchNameRegex.test(headRef)) {
        return {
          hasConflict: true,
          error: `Conflicting open implementation PR #${pr.number} ("${pr.title}") already references issue #${issueNumber}.`,
        };
      }
    }

    return { hasConflict: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      hasConflict: true,
      error: `Failed to check open pull requests: ${msg}`,
    };
  }
}

/**
 * Checks active sessions via official Jules API (https://jules.googleapis.com/v1alpha/sessions).
 */
export async function checkActiveJulesSession(
  repository: string,
  issueNumber: number,
  julesApiKey?: string,
  customFetch?: typeof fetch
): Promise<{ hasActiveSession: boolean; error?: string }> {
  if (!julesApiKey) {
    return { hasActiveSession: false };
  }

  const fetchFn = customFetch || globalThis.fetch;
  const url = `https://jules.googleapis.com/v1alpha/sessions`;

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': julesApiKey,
        'User-Agent': 'VinylDrop-JulesDispatcher',
      },
    });

    if (res.ok) {
      const data = (await res.json()) as { sessions?: RawJulesSession[] };
      const sessions = data.sessions || [];
      const activeStates = ['STATE_ACTIVE', 'ACTIVE', 'RUNNING', 'STATE_RUNNING', 'IN_PROGRESS', 'STATE_UNSPECIFIED'];

      for (const sess of sessions) {
        const sessState = (sess.state || '').toUpperCase();
        const title = sess.title || '';
        const source = sess.sourceContext?.source || '';

        const referencesRepo = source ? source.includes(repository) : true;
        const referencesIssue = title.includes(`#${issueNumber}`) || title.includes(`issue-${issueNumber}`);
        const isActive = activeStates.includes(sessState) || sessState === '';

        if (referencesRepo && referencesIssue && isActive) {
          return {
            hasActiveSession: true,
            error: `Active Jules session "${sess.name || title}" is already running for issue #${issueNumber}.`,
          };
        }
      }
    }
  } catch {
    // API session check fallback
  }

  return { hasActiveSession: false };
}

/**
 * Locks the GitHub issue by applying the 'in-progress' label upon successful live dispatch.
 */
export async function lockDispatchedIssue(
  repository: string,
  issueNumber: number,
  token?: string,
  customFetch?: typeof fetch
): Promise<void> {
  if (!token) return;
  const fetchFn = customFetch || globalThis.fetch;
  const url = `https://api.github.com/repos/${repository}/issues/${issueNumber}/labels`;

  try {
    await fetchFn(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'VinylDrop-JulesDispatcher',
      },
      body: JSON.stringify({ labels: ['in-progress'] }),
    });
  } catch {
    // Ignore label application failure
  }
}

/**
 * Checks if all listed dependency issues are closed.
 */
export async function verifyDependencies(
  repository: string,
  dependencies: number[],
  token?: string,
  customFetch?: typeof fetch
): Promise<{ satisfied: boolean; errors: string[] }> {
  const fetchFn = customFetch || globalThis.fetch;
  const errors: string[] = [];

  for (const depId of dependencies) {
    const url = `https://api.github.com/repos/${repository}/issues/${depId}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VinylDrop-JulesDispatcher',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const res = await fetchFn(url, { headers });
      if (!res.ok) {
        errors.push(`Dependency issue #${depId} could not be retrieved (HTTP status ${res.status}).`);
        continue;
      }

      const depData = (await res.json()) as RawGitHubIssue;
      if (depData.state !== 'closed') {
        errors.push(`Blocked by dependency issue #${depId}, which is still "${depData.state}" (must be closed).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to verify dependency issue #${depId}: ${msg}`);
    }
  }

  return {
    satisfied: errors.length === 0,
    errors,
  };
}

/**
 * Primary selector & preflight function.
 */
export async function runJulesDispatcher(
  options: DispatcherOptions
): Promise<PreflightResult> {
  const errors: string[] = [];
  const fetchFn = options.customFetch || globalThis.fetch;

  if (!options.repository || !options.repository.includes('/')) {
    return {
      success: false,
      dryRun: options.dryRun,
      errors: ['Invalid repository format. Expected "owner/repo".'],
    };
  }

  // 1. Verify branch "main" is available
  const mainBranchCheck = await verifyMainBranch(options.repository, options.token, fetchFn);
  if (!mainBranchCheck.available) {
    errors.push(mainBranchCheck.error || 'Main branch unavailable.');
    return {
      success: false,
      dryRun: options.dryRun,
      errors,
    };
  }

  // 2. Retrieve candidate issue(s)
  let rawCandidates: RawGitHubIssue[] = [];

  if (options.issueNumber) {
    // Specific issue requested
    const url = `https://api.github.com/repos/${options.repository}/issues/${options.issueNumber}`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VinylDrop-JulesDispatcher',
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    try {
      const res = await fetchFn(url, { headers });
      if (res.status === 404) {
        errors.push(`Target issue #${options.issueNumber} was not found on GitHub.`);
        return { success: false, dryRun: options.dryRun, errors };
      }
      if (!res.ok) {
        errors.push(`Failed to fetch issue #${options.issueNumber} (HTTP status ${res.status}).`);
        return { success: false, dryRun: options.dryRun, errors };
      }

      const rawIssue = (await res.json()) as RawGitHubIssue;
      if (rawIssue.pull_request) {
        errors.push(`Target #${options.issueNumber} is a pull request, not an issue.`);
        return { success: false, dryRun: options.dryRun, errors };
      }
      rawCandidates.push(rawIssue);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to communicate with GitHub API for issue #${options.issueNumber}: ${msg}`);
      return { success: false, dryRun: options.dryRun, errors };
    }
  } else {
    // Query open issues in repository
    const url = `https://api.github.com/repos/${options.repository}/issues?state=open&per_page=100`;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VinylDrop-JulesDispatcher',
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    try {
      const res = await fetchFn(url, { headers });
      if (!res.ok) {
        errors.push(`Failed to list open issues from GitHub (HTTP status ${res.status}).`);
        return { success: false, dryRun: options.dryRun, errors };
      }

      const rawIssues = (await res.json()) as RawGitHubIssue[];
      // Filter out pull requests
      rawCandidates = rawIssues.filter((i) => !i.pull_request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to query open issues: ${msg}`);
      return { success: false, dryRun: options.dryRun, errors };
    }
  }

  if (rawCandidates.length === 0) {
    errors.push('No open candidate issues found for dispatch.');
    return { success: false, dryRun: options.dryRun, errors };
  }

  // Parse all issues and sort deterministically
  const parsedCandidates = rawCandidates.map(parseIssueMetadata);
  const sortedCandidates = sortCandidateIssues(parsedCandidates);

  // Filter & validate candidates
  let selectedCandidate: IssueMetadata | undefined;

  for (const meta of sortedCandidates) {
    // Preflight Check 1: Issue must be open
    if (meta.state !== 'open') {
      if (options.issueNumber) {
        errors.push(`Issue #${meta.issueNumber} is not open (state: "${meta.state}").`);
      }
      continue;
    }

    // Preflight Check 2: Explicit readiness
    if (!meta.isDispatchReady) {
      if (options.issueNumber) {
        errors.push(`Issue #${meta.issueNumber} is not marked as dispatch-ready.`);
      }
      continue;
    }

    // Preflight Check 3: Active session / lock / duplicate in-progress check
    const activeLockLabels = ['in-progress', 'jules-active', 'in-execution', 'active-session'];
    const hasActiveLock = meta.labels.some((l) => activeLockLabels.includes(l.toLowerCase()));

    if (hasActiveLock) {
      errors.push(`Issue #${meta.issueNumber} already has an active dispatch or session in progress.`);
      if (options.issueNumber) {
        return {
          success: false,
          issueNumber: meta.issueNumber,
          issueTitle: meta.title,
          dryRun: options.dryRun,
          errors,
        };
      }
      continue;
    }

    // Check active session via Jules API endpoint
    const sessionCheck = await checkActiveJulesSession(options.repository, meta.issueNumber, options.julesApiKey, fetchFn);
    if (sessionCheck.hasActiveSession) {
      errors.push(sessionCheck.error || `Active Jules session already running for issue #${meta.issueNumber}.`);
      if (options.issueNumber) {
        return {
          success: false,
          issueNumber: meta.issueNumber,
          issueTitle: meta.title,
          dryRun: options.dryRun,
          errors,
        };
      }
      continue;
    }

    // Preflight Check 4: Mandatory metadata
    if (!meta.primarySpecialist) {
      errors.push(`Issue #${meta.issueNumber} is missing required "Primary Specialist" metadata.`);
      if (options.issueNumber) {
        return {
          success: false,
          issueNumber: meta.issueNumber,
          issueTitle: meta.title,
          dryRun: options.dryRun,
          errors,
        };
      }
      continue;
    }

    if (!meta.body || meta.body.trim().length === 0) {
      errors.push(`Issue #${meta.issueNumber} has an empty body.`);
      if (options.issueNumber) {
        return {
          success: false,
          issueNumber: meta.issueNumber,
          issueTitle: meta.title,
          dryRun: options.dryRun,
          errors,
        };
      }
      continue;
    }

    // Preflight Check 5: Dependencies satisfied
    if (meta.dependencies.length > 0) {
      const depCheck = await verifyDependencies(options.repository, meta.dependencies, options.token, fetchFn);
      if (!depCheck.satisfied) {
        errors.push(...depCheck.errors);
        if (options.issueNumber) {
          return {
            success: false,
            issueNumber: meta.issueNumber,
            issueTitle: meta.title,
            dryRun: options.dryRun,
            errors,
          };
        }
        continue;
      }
    }

    // Preflight Check 6: PR collision check
    const prCheck = await checkConflictingPullRequests(options.repository, meta.issueNumber, options.token, fetchFn);
    if (prCheck.hasConflict) {
      errors.push(prCheck.error || `Conflicting PR exists for issue #${meta.issueNumber}.`);
      if (options.issueNumber) {
        return {
          success: false,
          issueNumber: meta.issueNumber,
          issueTitle: meta.title,
          dryRun: options.dryRun,
          errors,
        };
      }
      continue;
    }

    // Candidate passed all checks!
    selectedCandidate = meta;
    break;
  }

  if (!selectedCandidate) {
    if (errors.length === 0) {
      errors.push('No dispatch-ready issues met preflight requirements.');
    }
    return {
      success: false,
      dryRun: options.dryRun,
      errors,
    };
  }

  const dispatchPayload: JulesSessionPayload = {
    title: `[Issue #${selectedCandidate.issueNumber}] ${selectedCandidate.title}`,
    prompt: `Start Issue #${selectedCandidate.issueNumber} — ${selectedCandidate.title}\n\nPrimary Specialist: ${selectedCandidate.primarySpecialist || 'Architecture Specialist'}\nSecondary Specialist: ${selectedCandidate.secondarySpecialist || 'Verification Specialist'}\n\nGoal:\n${selectedCandidate.body}`,
    sourceContext: {
      githubRepoContext: {
        startingBranch: 'main',
      },
    },
    automationMode: 'AUTO_CREATE_PR',
  };

  // If dry run, do NOT execute live Jules API call
  if (options.dryRun) {
    return {
      success: true,
      issueNumber: selectedCandidate.issueNumber,
      issueTitle: selectedCandidate.title,
      selectedIssue: selectedCandidate,
      dryRun: true,
      dispatchPayload,
      liveDispatchTriggered: false,
      errors: [],
    };
  }

  // Live Dispatch Mode
  if (!options.julesApiKey || options.julesApiKey.trim() === '') {
    return {
      success: false,
      issueNumber: selectedCandidate.issueNumber,
      issueTitle: selectedCandidate.title,
      selectedIssue: selectedCandidate,
      dryRun: false,
      errors: ['Live dispatch failed: missing or empty JULES_API_KEY secret.'],
    };
  }

  // Execute live dispatch call to official Jules API session endpoint
  try {
    const liveEndpoint = `https://jules.googleapis.com/v1alpha/sessions`;
    const liveRes = await fetchFn(liveEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': options.julesApiKey,
        'User-Agent': 'VinylDrop-JulesDispatcher',
      },
      body: JSON.stringify(dispatchPayload),
    });

    if (!liveRes.ok) {
      return {
        success: false,
        issueNumber: selectedCandidate.issueNumber,
        issueTitle: selectedCandidate.title,
        selectedIssue: selectedCandidate,
        dryRun: false,
        errors: [`Live Jules API dispatch returned HTTP status ${liveRes.status}.`],
      };
    }

    // Apply lock label to GitHub issue after successful live dispatch
    await lockDispatchedIssue(options.repository, selectedCandidate.issueNumber, options.token, fetchFn);

    return {
      success: true,
      issueNumber: selectedCandidate.issueNumber,
      issueTitle: selectedCandidate.title,
      selectedIssue: selectedCandidate,
      dryRun: false,
      dispatchPayload,
      liveDispatchTriggered: true,
      errors: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      issueNumber: selectedCandidate.issueNumber,
      issueTitle: selectedCandidate.title,
      selectedIssue: selectedCandidate,
      dryRun: false,
      errors: [`Live dispatch exception: ${msg}`],
    };
  }
}
