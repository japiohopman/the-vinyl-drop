export interface PrContractValidationResult {
  valid: boolean;
  issueNumber?: number;
  status?: 'NOT READY' | 'READY FOR HUMAN REVIEW';
  errors: string[];
}

export interface IssueValidationResult {
  valid: boolean;
  isOpen?: boolean;
  errors: string[];
}

export interface SafetyGateResult {
  success: boolean;
  issueNumber?: number;
  status?: string;
  errors: string[];
}

export const REQUIRED_PR_SECTIONS = [
  'Phase / Governing Issue',
  'Goal',
  'Scope completed',
  'Architecture',
  'Data integrity',
  'Verification',
  'Security',
  'Documentation',
  'Definition of Done',
] as const;

export const REQUIRED_DOD_ITEMS = [
  'All Issue acceptance criteria satisfied',
  'Verification commands pass cleanly',
  'Scope remains strictly within governing Issue',
] as const;

export const ALLOWED_STATUSES = ['NOT READY', 'READY FOR HUMAN REVIEW'] as const;

/**
 * Validates the markdown PR body against contract requirements.
 */
export function validatePrContract(prBody: string | null | undefined): PrContractValidationResult {
  const errors: string[] = [];

  if (!prBody || prBody.trim() === '') {
    return { valid: false, errors: ['PR body is empty or missing.'] };
  }

  // Strip HTML comments (e.g. <!-- comment -->)
  const cleanedBody = prBody.replace(/<!--[\s\S]*?-->/g, '');

  // 1. Validate required section headings
  for (const section of REQUIRED_PR_SECTIONS) {
    const headingPattern = new RegExp(`^##\\s+${escapeRegExp(section)}`, 'm');
    if (!headingPattern.test(cleanedBody)) {
      errors.push(`Missing required section: "## ${section}"`);
    }
  }

  // 2. Extract and validate Status section
  let status: 'NOT READY' | 'READY FOR HUMAN REVIEW' | undefined;
  const statusHeaderIndex = cleanedBody.search(/###\s+Status/i);

  if (statusHeaderIndex === -1) {
    errors.push('Missing status section ("### Status").');
  } else {
    const afterStatus = cleanedBody.slice(statusHeaderIndex);
    const lines = afterStatus.split('\n').slice(1);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('#')) break; // Reached next heading
      if (trimmed === 'READY FOR HUMAN REVIEW' || trimmed === 'NOT READY') {
        status = trimmed;
        break;
      }
    }

    if (!status) {
      errors.push(
        'Missing or invalid status under "### Status". Must be "NOT READY" or "READY FOR HUMAN REVIEW".'
      );
    }
  }

  // 3. Validate Definition of Done checklist items
  // Only enforce checked DoD items when status is 'READY FOR HUMAN REVIEW'
  if (status === 'READY FOR HUMAN REVIEW') {
    const dodHeaderIndex = cleanedBody.search(/^##\s+Definition of Done/m);
    if (dodHeaderIndex !== -1) {
      const afterDod = cleanedBody.slice(dodHeaderIndex);
      // Get text up to next level-2 heading or horizontal rule or end
      const nextSectionIndex = afterDod.slice(1).search(/^(##\s+|---)/m);
      const dodSectionText = nextSectionIndex !== -1 ? afterDod.slice(0, nextSectionIndex + 1) : afterDod;

      for (const item of REQUIRED_DOD_ITEMS) {
        // Check for checked box "- [x] ... <item>" or "- [X] ... <item>"
        const itemPattern = new RegExp(`-\\s*\\[[xX]\\]\\s*${escapeRegExp(item)}`, 'm');
        if (!itemPattern.test(dodSectionText)) {
          errors.push(`Definition of Done missing required checked item: "${item}"`);
        }
      }
    }
  }

  // 4. Extract and validate governing issue reference
  // Pattern looking for: Refs #<digits>
  const refsMatch = cleanedBody.match(/Refs\s+#(\d+)/i);
  let issueNumber: number | undefined;

  if (!refsMatch) {
    errors.push('Missing or malformed governing issue reference (expected format: "Refs #<number>").');
  } else {
    const parsed = parseInt(refsMatch[1], 10);
    if (isNaN(parsed) || parsed <= 0) {
      errors.push(`Invalid governing issue number: "${refsMatch[1]}"`);
    } else {
      issueNumber = parsed;
    }
  }

  return {
    valid: errors.length === 0,
    issueNumber,
    status,
    errors,
  };
}

/**
 * Validates that the governing issue exists in GitHub and is currently open.
 */
export async function validateGoverningIssue(
  repository: string,
  issueNumber: number,
  token?: string,
  customFetch?: typeof fetch
): Promise<IssueValidationResult> {
  const errors: string[] = [];
  const fetchFn = customFetch || globalThis.fetch;

  if (!repository || !repository.includes('/')) {
    return { valid: false, errors: ['Invalid repository format. Expected "owner/repo".'] };
  }

  if (!issueNumber || issueNumber <= 0) {
    return { valid: false, errors: ['Invalid issue number.'] };
  }

  const url = `https://api.github.com/repos/${repository}/issues/${issueNumber}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'VinylDrop-SafetyGate',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetchFn(url, { headers });

    if (response.status === 404) {
      errors.push(`Governing issue #${issueNumber} was not found on GitHub.`);
      return { valid: false, isOpen: false, errors };
    }

    if (!response.ok) {
      errors.push(`GitHub API returned status ${response.status} when checking issue #${issueNumber}.`);
      return { valid: false, errors };
    }

    const data = (await response.json()) as { state?: string; pull_request?: unknown };

    if (data.pull_request) {
      errors.push(`Issue #${issueNumber} is a pull request, not an issue.`);
      return { valid: false, errors };
    }

    const isOpen = data.state === 'open';
    if (!isOpen) {
      errors.push(`Governing issue #${issueNumber} is not open (state: "${data.state}").`);
    }

    return {
      valid: isOpen,
      isOpen,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`Failed to communicate with GitHub API: ${message}`);
    return { valid: false, errors };
  }
}

/**
 * Runs the full safety gate validation pipeline.
 */
export async function runSafetyGate(
  prBody: string | null | undefined,
  repository: string,
  token?: string,
  customFetch?: typeof fetch
): Promise<SafetyGateResult> {
  const contractResult = validatePrContract(prBody);

  if (!contractResult.valid || !contractResult.issueNumber) {
    return {
      success: false,
      issueNumber: contractResult.issueNumber,
      status: contractResult.status,
      errors: contractResult.errors,
    };
  }

  const issueResult = await validateGoverningIssue(
    repository,
    contractResult.issueNumber,
    token,
    customFetch
  );

  const allErrors = [...contractResult.errors, ...issueResult.errors];

  return {
    success: issueResult.valid,
    issueNumber: contractResult.issueNumber,
    status: contractResult.status,
    errors: allErrors,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
