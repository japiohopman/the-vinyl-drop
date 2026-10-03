import {
  runJulesDispatcher,
  parseIssueMetadata,
  sortCandidateIssues,
  RawGitHubIssue,
  RawGitHubPullRequest,
} from '../src/workflow/julesDispatcher';

describe('Jules Issue Dispatcher and Preflight', () => {
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
  const noJulesSessionsRes = { ok: true, status: 200, json: async () => ({ sessions: [] }) };

  describe('parseIssueMetadata', () => {
    it('should correctly parse metadata, readiness label, and specialists', () => {
      const meta = parseIssueMetadata(validIssue21Raw);
      expect(meta.issueNumber).toBe(21);
      expect(meta.isDispatchReady).toBe(true);
      expect(meta.primarySpecialist).toBe('Architecture Specialist');
      expect(meta.secondarySpecialist).toBe('Verification Specialist');
      expect(meta.dependencies).toEqual([]);
    });

    it('should parse readiness from body text if label is absent', () => {
      const issue: RawGitHubIssue = {
        number: 22,
        title: 'Test Issue',
        state: 'open',
        labels: [],
        body: '### Dispatch Readiness\nready\n\n**Primary Specialist**: UI Specialist',
      };
      const meta = parseIssueMetadata(issue);
      expect(meta.isDispatchReady).toBe(true);
      expect(meta.primarySpecialist).toBe('UI Specialist');
    });

    it('should parse dependency issue numbers', () => {
      const issue: RawGitHubIssue = {
        number: 23,
        title: 'Dependent Issue',
        state: 'open',
        labels: ['dispatch-ready'],
        body: '### Dependencies\nDepends on #20 and #21\n\n**Primary Specialist**: Architecture Specialist',
      };
      const meta = parseIssueMetadata(issue);
      expect(meta.dependencies).toEqual([20, 21]);
    });
  });

  describe('Verification Requirement 1: Valid ready Issue is selected', () => {
    it('should select valid ready issue in dry run mode', async () => {
      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/issues?state=open')) return Promise.resolve({ ok: true, status: 200, json: async () => [validIssue21Raw] } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com')) return Promise.resolve(noJulesSessionsRes as Response);
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
      expect(result.dispatchPayload?.session?.prompt).toContain('Primary Specialist: Architecture Specialist');
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
        if (url.includes('jules.googleapis.com')) return Promise.resolve(noJulesSessionsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Issue #21 is not marked as dispatch-ready.');
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
        if (url.includes('jules.googleapis.com')) return Promise.resolve(noJulesSessionsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Issue #21 is missing required "Primary Specialist" metadata.');
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
        if (url.includes('jules.googleapis.com')) return Promise.resolve(noJulesSessionsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Blocked by dependency issue #19, which is still "open" (must be closed).');
    });
  });

  describe('Verification Requirement 5: Existing implementation PR blocks dispatch', () => {
    it('should reject dispatch when an open PR already references the issue', async () => {
      const conflictingPr: RawGitHubPullRequest = {
        number: 101,
        title: 'Work on issue 21',
        body: 'Refs #21',
        head: { ref: 'feature/issue-21' },
        base: { ref: 'main' },
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve({ ok: true, status: 200, json: async () => [conflictingPr] } as Response);
        if (url.includes('jules.googleapis.com')) return Promise.resolve(noJulesSessionsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Conflicting open implementation PR #101 ("Work on issue 21") already references issue #21.');
    });
  });

  describe('Verification Requirement 6: Duplicate active dispatch / session is blocked', () => {
    it('should reject dispatch when issue has in-progress label', async () => {
      const lockedIssue: RawGitHubIssue = {
        ...validIssue21Raw,
        labels: [{ name: 'dispatch-ready' }, { name: 'in-progress' }],
      };

      const mockFetch = jest.fn((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => lockedIssue } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com')) return Promise.resolve(noJulesSessionsRes as Response);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const result = await runJulesDispatcher({
        repository: repo,
        issueNumber: 21,
        dryRun: true,
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Issue #21 already has an active dispatch or session in progress.');
    });

    it('should reject dispatch when an active Jules session exists for issue via Jules API', async () => {
      const activeJulesSessionsRes = {
        ok: true,
        status: 200,
        json: async () => ({
          sessions: [
            {
              name: 'projects/-/locations/global/sessions/12345',
              title: '[Issue #21] Phase 1B',
              state: 'STATE_ACTIVE',
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
        dryRun: true,
        julesApiKey: 'test_key',
        customFetch: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Active Jules session');
    });
  });

  describe('Verification Requirement 7: Dry-run explicitly makes NO live Jules API call', () => {
    it('should verify dry-run mode returns payload without calling POST session API endpoint', async () => {
      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';
        if (url.includes('/branches/main')) return Promise.resolve(validMainBranchRes as Response);
        if (url.includes('/issues/21')) return Promise.resolve({ ok: true, status: 200, json: async () => validIssue21Raw } as Response);
        if (url.includes('/pulls')) return Promise.resolve(noOpenPrsRes as Response);
        if (url.includes('jules.googleapis.com') && method === 'GET') {
          return Promise.resolve(noJulesSessionsRes as Response);
        }
        return Promise.reject(new Error(`Unexpected URL/Method reached in dry run: ${method} ${url}`));
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

      // Verify no POST call to create session was made
      const calls = mockFetch.mock.calls;
      const postCalls = calls.filter((c) => (c[1]?.method || 'GET') === 'POST');
      expect(postCalls.length).toBe(0);
    });
  });

  describe('Deterministic Issue Selection', () => {
    it('should deterministically select highest priority ready issue', () => {
      const issueA = parseIssueMetadata({
        number: 30,
        title: 'Low Priority Issue',
        state: 'open',
        labels: ['dispatch-ready'],
        body: '**Primary Specialist**: UI Specialist\nPriority: 3',
      });

      const issueB = parseIssueMetadata({
        number: 25,
        title: 'High Priority Issue',
        state: 'open',
        labels: ['dispatch-ready'],
        body: '**Primary Specialist**: Architecture Specialist\nPriority: 1',
      });

      const issueC = parseIssueMetadata({
        number: 22,
        title: 'Medium Priority Issue',
        state: 'open',
        labels: ['dispatch-ready'],
        body: '**Primary Specialist**: Data Specialist\nPriority: 2',
      });

      const sorted = sortCandidateIssues([issueA, issueB, issueC]);
      expect(sorted[0].issueNumber).toBe(25); // Priority 1 wins
      expect(sorted[1].issueNumber).toBe(22); // Priority 2
      expect(sorted[2].issueNumber).toBe(30); // Priority 3
    });

    it('should sort by issue number ascending when priority is tied', () => {
      const issueA = parseIssueMetadata({
        number: 40,
        title: 'Later Issue',
        state: 'open',
        labels: ['dispatch-ready'],
        body: '**Primary Specialist**: UI Specialist\nPriority: 2',
      });

      const issueB = parseIssueMetadata({
        number: 15,
        title: 'Earlier Issue',
        state: 'open',
        labels: ['dispatch-ready'],
        body: '**Primary Specialist**: Architecture Specialist\nPriority: 2',
      });

      const sorted = sortCandidateIssues([issueA, issueB]);
      expect(sorted[0].issueNumber).toBe(15);
      expect(sorted[1].issueNumber).toBe(40);
    });
  });
});
