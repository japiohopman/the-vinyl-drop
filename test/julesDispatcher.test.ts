import * as fs from 'fs';
import * as path from 'path';
import {
  runJulesDispatcher,
  extractWorkflowScript,
  RawGitHubIssue,
  RawGitHubPullRequest,
} from '../src/workflow/julesDispatcher';

describe('Jules Issue Dispatcher and Preflight (Authoritative Workflow Test)', () => {
  const repo = 'japiohopman/the-vinyl-drop';

  const validIssue21Raw: RawGitHubIssue = {
    number: 21,
    title: 'Phase 1B — Jules Issue dispatcher and preflight',
    state: 'open',
    labels: [{ name: 'dispatch-ready' }],
    body: `
### Goal
Build deterministic issue dispatcher.

**Primary Specialist**: Architecture Specialist
**Secondary Specialist**: Verification Specialist

### Dependencies
None.
`,
  };

  const validMainBranchRes = { ok: true, status: 200, json: async () => ({ name: 'main' }) };
  const noOpenPrsRes = { ok: true, status: 200, json: async () => [] };

  it('should extract production script from workflow YML file without error', () => {
    const script = extractWorkflowScript();
    expect(script).toBeDefined();
    expect(script).toContain('const repoOwner = context.repo.owner;');

    const ymlPath = path.resolve(process.cwd(), '.github/workflows/jules-issue-dispatcher.yml');
    const ymlContent = fs.readFileSync(ymlPath, 'utf-8');
    expect(ymlContent).toContain('concurrency:');
    expect(ymlContent).toContain('group: jules-dispatcher-${{ github.repository }}');
    expect(ymlContent).toContain('ISSUE_NUMBER: ${{ inputs.issue_number }}');
  });

  describe('Verification Requirement 1: Valid ready Issue is selected & exact payload format', () => {
    it('should select valid ready issue and format payload with source in sourceContext', async () => {
      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/issues?state=open')) return Promise.resolve({ ok: true, status: 200, json: async () => [validIssue21Raw] } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(21);
      expect(result.dryRun).toBe(true);
      expect(result.dispatchPayload?.sourceContext.source).toBe(`sources/github/${repo}`);
      expect(result.dispatchPayload?.sourceContext.githubRepoContext.startingBranch).toBe('main');
      expect(result.dispatchPayload?.automationMode).toBe('AUTO_CREATE_PR');
      expect(result.dispatchPayload?.prompt).toContain('Primary Specialist: Architecture Specialist');
    });
  });

  describe('Verification Requirement 2: Non-ready Issue is rejected', () => {
    it('should reject issue without dispatch-ready label or body readiness', async () => {
      const nonReadyIssue: RawGitHubIssue = {
        ...validIssue21Raw,
        labels: [],
        body: '**Primary Specialist**: Architecture Specialist',
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => nonReadyIssue } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('No candidate issue met preflight requirements'))).toBe(true);
    });

    it('should explicitly reject issue with body "### Dispatch Readiness\\nnot ready"', async () => {
      const explicitNotReadyIssue: RawGitHubIssue = {
        ...validIssue21Raw,
        labels: [],
        body: '### Dispatch Readiness\nnot ready\n\n**Primary Specialist**: Architecture Specialist',
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => explicitNotReadyIssue } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('No candidate issue met preflight requirements'))).toBe(true);
    });
  });

  describe('Verification Requirement 3: Missing/malformed metadata is rejected', () => {
    it('should reject issue when Primary Specialist metadata is missing', async () => {
      const missingMetaIssue: RawGitHubIssue = {
        ...validIssue21Raw,
        body: 'No primary specialist mentioned here.',
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => missingMetaIssue } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('missing required "Primary Specialist"'))).toBe(true);
    });
  });

  describe('Verification Requirement 4: Blocked dependency is rejected', () => {
    it('should reject issue when a dependency issue is still open', async () => {
      const depIssueRaw: RawGitHubIssue = {
        ...validIssue21Raw,
        body: `
**Primary Specialist**: Architecture Specialist
### Dependencies
Depends on #19
`,
      };

      const openDep19: RawGitHubIssue = {
        number: 19,
        title: 'Phase 1A',
        state: 'open',
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => depIssueRaw } as Response);
        if (url.includes('/issues/19')) return Promise.resolve({ ok: true, status: 200, json: async () => openDep19 } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Blocked by dependency #19'))).toBe(true);
    });
  });

  describe('Verification Requirement 5: Existing implementation PR blocks dispatch', () => {
    it('should reject dispatch when an open PR body references the issue', async () => {
      const conflictingPr: RawGitHubPullRequest = {
        number: 101,
        title: 'Work on issue 21',
        body: 'Refs #21',
        head: { ref: 'random-branch-name' },
        base: { ref: 'main' },
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve({ ok: true, status: 200, json: async () => [conflictingPr] } as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Conflicting open PR #101'))).toBe(true);
    });

    it('should reject dispatch when an open PR head branch is feature/issue-21 even without body reference', async () => {
      const conflictingBranchPr: RawGitHubPullRequest = {
        number: 102,
        title: 'Feature Work',
        body: 'No explicit refs in body',
        head: { ref: 'feature/issue-21' },
        base: { ref: 'main' },
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve({ ok: true, status: 200, json: async () => [conflictingBranchPr] } as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Conflicting open PR #102'))).toBe(true);
    });
  });

  describe('Verification Requirement 6: Duplicate active dispatch & Fail Closed Protection', () => {
    it('should reject dispatch when issue has in-progress label lock', async () => {
      const lockedIssue: RawGitHubIssue = {
        ...validIssue21Raw,
        labels: [{ name: 'dispatch-ready' }, { name: 'in-progress' }],
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => lockedIssue } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('already has an active label lock'))).toBe(true);
    });

    it('should reject dispatch when an active Jules session exists in live mode', async () => {
      const activeJulesSessionsRes = {
        ok: true,
        status: 200,
        json: async () => ({
          sessions: [
            {
              name: 'projects/-/locations/global/sessions/12345',
              title: '[Issue #21] Phase 1B',
              state: 'IN_PROGRESS',
              sourceContext: { source: `sources/github/${repo}` },
            },
          ],
        }),
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com')) return Promise.resolve(activeJulesSessionsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: false,
        token: 'gh_token',
        julesApiKey: 'test_key',
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('has an active Jules session running'))).toBe(true);
    });

    it('should NOT treat an active Jules session without matching repository source as a match', async () => {
      const unmatchingSourceSessionRes = {
        ok: true,
        status: 200,
        json: async () => ({
          sessions: [
            {
              name: 'projects/-/locations/global/sessions/99999',
              title: '[Issue #21] Other Repo Phase 1B',
              state: 'IN_PROGRESS',
              sourceContext: { source: 'sources/github/other-owner/other-repo' },
            },
          ],
        }),
      };

      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com') && method === 'GET') return Promise.resolve(unmatchingSourceSessionRes as Response);
        if (url.includes('jules.googleapis.com') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => ({ name: 'sess' }) } as Response);
        if (url.includes('/labels') && method === 'POST') return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: false,
        token: 'gh_token',
        julesApiKey: 'test_key',
        customFetch: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(21);
    });

    it('should FAIL CLOSED when session API endpoint errors in live mode', async () => {
      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com')) return Promise.resolve({ ok: false, status: 500 } as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: false,
        token: 'gh_token',
        julesApiKey: 'test_key',
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Failed to retrieve active Jules sessions'))).toBe(true);
    });

    it('should FAIL CLOSED when label lock acquisition fails in live mode', async () => {
      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com') && method === 'GET') return Promise.resolve({ ok: true, status: 200, json: async () => ({ sessions: [] }) } as Response);
        if (url.includes('/labels') && method === 'POST') return Promise.resolve({ ok: false, status: 403 } as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: false,
        token: 'gh_token',
        julesApiKey: 'test_key',
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes("Failed to acquire 'in-progress' lock label"))).toBe(true);
    });
  });

  describe('Verification Requirement 7: Dry-run explicitly makes ZERO Jules API calls', () => {
    it('should verify dry-run mode returns payload with ZERO calls to jules.googleapis.com', async () => {
      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com')) {
          throw new Error('Dry run MUST NOT call jules.googleapis.com endpoint!');
        }
        return Promise.reject(new Error(`Unexpected URL reached in dry run: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        julesApiKey: 'secret_key',
        customFetch: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.liveDispatchTriggered).toBe(false);

      // Absolutely zero calls to jules endpoint
      const callUrls = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(callUrls.some((u) => u.includes('jules.googleapis.com'))).toBe(false);
    });
  });

  describe('Deterministic Candidate Selection', () => {
    it('should deterministically select highest priority ready issue', async () => {
      const issueA: RawGitHubIssue = {
        number: 30,
        title: 'Low Priority Issue',
        state: 'open',
        labels: [{ name: 'dispatch-ready' }],
        body: '**Primary Specialist**: UI Specialist\nPriority: 3',
      };

      const issueB: RawGitHubIssue = {
        number: 25,
        title: 'High Priority Issue',
        state: 'open',
        labels: [{ name: 'dispatch-ready' }],
        body: '**Primary Specialist**: Architecture Specialist\nPriority: 1',
      };

      const issueC: RawGitHubIssue = {
        number: 22,
        title: 'Medium Priority Issue',
        state: 'open',
        labels: [{ name: 'dispatch-ready' }],
        body: '**Primary Specialist**: Data Specialist\nPriority: 2',
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues?state=open')) return Promise.resolve({ ok: true, status: 200, json: async () => [issueA, issueB, issueC] } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(25); // Priority 1 issue wins
    });
  });
});
