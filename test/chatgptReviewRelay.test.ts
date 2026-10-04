import {
  evaluatePrEligibility,
  summarizeCheckState,
  extractGoverningIssue,
  generateRelayCommentBody,
  extractWorkflowScript,
  runChatgptReviewRelay,
  RawPullRequest,
  RawCheckRun,
  CHATGPT_REVIEW_RELAY_MARKER,
  CHATGPT_REVIEW_LABEL,
} from '../src/workflow/chatgptReviewRelay';

describe('ChatGPT Review Relay', () => {
  const repository = 'owner/repo';

  const validPr: RawPullRequest = {
    number: 42,
    title: 'Phase 1B — ChatGPT review relay',
    state: 'open',
    draft: false,
    body: '## Phase / Governing Issue\nRefs #25\n\n## Goal\nImplement relay.',
    head: {
      ref: 'feature/chatgpt-review-relay',
      sha: 'abc123def456',
      repo: { full_name: 'owner/repo' },
    },
    base: {
      ref: 'main',
      repo: { full_name: 'owner/repo' },
    },
    labels: [],
  };

  describe('Workflow Script Extraction', () => {
    it('should extract workflow inline script cleanly from YML file', () => {
      const script = extractWorkflowScript();
      expect(script).toBeDefined();
      expect(script).toContain('chatgpt-review-relay-comment');
      expect(script).toContain('chatgpt-review');
    });
  });

  describe('Governing Issue Extraction', () => {
    it('should extract issue number from Refs #25', () => {
      expect(extractGoverningIssue('Refs #25')).toBe(25);
      expect(extractGoverningIssue('This fixes Refs #100 in phase')).toBe(100);
    });

    it('should return null if no valid Refs reference exists', () => {
      expect(extractGoverningIssue('No refs here')).toBeNull();
      expect(extractGoverningIssue('Closes #25')).toBeNull(); // Refs is required per phase contract
      expect(extractGoverningIssue(null)).toBeNull();
    });
  });

  describe('Comment Body Generation', () => {
    it('should generate active relay comment body with correct marker and details', () => {
      const body = generateRelayCommentBody(validPr, 25, {
        overallState: 'SUCCESS',
        ciState: 'SUCCESS',
        safetyGateState: 'PASSED',
        summaryText: 'CI: SUCCESS, Safety Gate: PASSED, Overall: SUCCESS',
      });
      expect(body).toContain(CHATGPT_REVIEW_RELAY_MARKER);
      expect(body).toContain('#42 — Phase 1B — ChatGPT review relay');
      expect(body).toContain('#25');
      expect(body).toContain('Ready for ChatGPT architecture and code review inspection');
    });

    it('should generate cleared comment body when PR is closed', () => {
      const body = generateRelayCommentBody(validPr, 25, undefined, true);
      expect(body).toContain(CHATGPT_REVIEW_RELAY_MARKER);
      expect(body).toContain('Signal Cleared');
      expect(body).toContain('PR Closed');
    });
  });

  describe('Eligibility Evaluation', () => {
    it('should mark a valid same-repo PR targeting main with Refs #25 as eligible', () => {
      const result = evaluatePrEligibility(validPr);
      expect(result.eligible).toBe(true);
      expect(result.issueNumber).toBe(25);
      expect(result.reasons).toHaveLength(0);
    });

    it('should reject PR not targeting main', () => {
      const pr: RawPullRequest = {
        ...validPr,
        base: { ref: 'develop', repo: { full_name: 'owner/repo' } },
      };
      const result = evaluatePrEligibility(pr);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('Target branch is "develop"'))).toBe(true);
    });

    it('should reject PR whose head branch is main', () => {
      const pr: RawPullRequest = {
        ...validPr,
        head: { ref: 'main', sha: 'abc123', repo: { full_name: 'owner/repo' } },
      };
      const result = evaluatePrEligibility(pr);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('PR head branch is "main"'))).toBe(true);
    });

    it('should reject fork PRs', () => {
      const pr: RawPullRequest = {
        ...validPr,
        head: { ref: 'feature-branch', sha: 'abc123', repo: { full_name: 'forked-owner/repo' } },
      };
      const result = evaluatePrEligibility(pr);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('PR is from a fork'))).toBe(true);
    });

    it('should reject draft PRs', () => {
      const pr: RawPullRequest = {
        ...validPr,
        draft: true,
      };
      const result = evaluatePrEligibility(pr);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('PR is a draft'))).toBe(true);
    });

    it('should reject PRs missing a governing issue reference', () => {
      const pr: RawPullRequest = {
        ...validPr,
        body: 'No issue ref here.',
      };
      const result = evaluatePrEligibility(pr);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('Missing valid governing Issue reference'))).toBe(true);
    });

    it('should reject closed PRs from standard open eligibility', () => {
      const pr: RawPullRequest = {
        ...validPr,
        state: 'closed',
      };
      const result = evaluatePrEligibility(pr);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes('PR state is "closed"'))).toBe(true);
    });
  });

  describe('Check State Summarization', () => {
    it('should handle empty check runs', () => {
      const summary = summarizeCheckState([]);
      expect(summary.overallState).toBe('NO_CHECKS');
      expect(summary.ciState).toBe('NOT_FOUND');
      expect(summary.safetyGateState).toBe('NOT_FOUND');
    });

    it('should summarize successful CI and Safety Gate runs', () => {
      const runs: RawCheckRun[] = [
        { name: 'CI / build-and-test', status: 'completed', conclusion: 'success' },
        { name: 'PR Contract & Safety Gate Validation', status: 'completed', conclusion: 'success' },
      ];
      const summary = summarizeCheckState(runs);
      expect(summary.overallState).toBe('SUCCESS');
      expect(summary.ciState).toBe('SUCCESS');
      expect(summary.safetyGateState).toBe('PASSED');
    });

    it('should report PENDING if any check run is in progress', () => {
      const runs: RawCheckRun[] = [
        { name: 'CI / build-and-test', status: 'in_progress' },
        { name: 'PR Contract & Safety Gate Validation', status: 'completed', conclusion: 'success' },
      ];
      const summary = summarizeCheckState(runs);
      expect(summary.overallState).toBe('PENDING');
      expect(summary.ciState).toBe('PENDING');
      expect(summary.safetyGateState).toBe('PASSED');
    });

    it('should report FAILURE if any check run failed', () => {
      const runs: RawCheckRun[] = [
        { name: 'CI / build-and-test', status: 'completed', conclusion: 'failure' },
        { name: 'PR Contract & Safety Gate Validation', status: 'completed', conclusion: 'success' },
      ];
      const summary = summarizeCheckState(runs);
      expect(summary.overallState).toBe('FAILURE');
      expect(summary.ciState).toBe('FAILURE');
    });
  });

  describe('Relay Execution Handler', () => {
    it('should skip ineligible PRs without making label or comment mutations', async () => {
      const ineligiblePr: RawPullRequest = {
        ...validPr,
        draft: true,
      };

      const mockFetch = jest.fn();

      const result = await runChatgptReviewRelay({
        repository,
        pullRequest: ineligiblePr,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe('SKIPPED_INELIGIBLE');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should add label and create marked comment on eligible PR', async () => {
      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.includes('/labels') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [{ name: CHATGPT_REVIEW_LABEL }] } as Response);
        }
        if (url.includes('/check-runs') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              check_runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }],
            }),
          } as Response);
        }
        if (url.includes('/comments') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
        }
        if (url.includes('/comments') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 999 }) } as Response);
        }

        return Promise.reject(new Error(`Unexpected API endpoint: ${url}`));
      });

      const result = await runChatgptReviewRelay({
        repository,
        pullRequest: validPr,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe('RELAY_MARKED');
      expect(result.labelUpdated).toBe(true);
      expect(result.commentAction).toBe('CREATED');
      expect(result.checkSummary?.ciState).toBe('SUCCESS');
    });

    it('should idempotently update existing comment on synchronize event instead of duplicating', async () => {
      const prWithLabel: RawPullRequest = {
        ...validPr,
        labels: [{ name: CHATGPT_REVIEW_LABEL }],
      };

      const existingComment = {
        id: 777,
        body: `${CHATGPT_REVIEW_RELAY_MARKER}\nPrevious status content`,
      };

      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.includes('/check-runs') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ check_runs: [] }),
          } as Response);
        }
        if (url.endsWith('/comments') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [existingComment] } as Response);
        }
        if (url.includes('/comments/777') && method === 'PATCH') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 777 }) } as Response);
        }

        return Promise.reject(new Error(`Unexpected API call: ${url} (${method})`));
      });

      const result = await runChatgptReviewRelay({
        repository,
        pullRequest: prWithLabel,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe('RELAY_MARKED');
      expect(result.labelUpdated).toBe(false); // Label already present
      expect(result.commentAction).toBe('UPDATED');

      // Verify no POST comment call was made
      const postCalls = mockFetch.mock.calls.filter((c) => (c[1]?.method || 'GET') === 'POST');
      expect(postCalls).toHaveLength(0);
    });

    it('should remove label and update marked comment when PR closes', async () => {
      const closedPr: RawPullRequest = {
        ...validPr,
        state: 'closed',
        labels: [{ name: CHATGPT_REVIEW_LABEL }],
      };

      const existingComment = {
        id: 555,
        body: `${CHATGPT_REVIEW_RELAY_MARKER}\nActive status`,
      };

      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.includes(`/labels/${CHATGPT_REVIEW_LABEL}`) && method === 'DELETE') {
          return Promise.resolve({ ok: true, status: 200 } as Response);
        }
        if (url.endsWith('/comments') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [existingComment] } as Response);
        }
        if (url.includes('/comments/555') && method === 'PATCH') {
          const body = JSON.parse(String(init?.body || '{}'));
          expect(body.body).toContain('Signal Cleared');
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 555 }) } as Response);
        }

        return Promise.reject(new Error(`Unexpected API call in closed test: ${url} (${method})`));
      });

      const result = await runChatgptReviewRelay({
        repository,
        pullRequest: closedPr,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe('CLEARED_CLOSED');
      expect(result.labelUpdated).toBe(true);
      expect(result.commentAction).toBe('UPDATED');
    });

    it('should NEVER make ChatGPT API calls, approve PR, or merge PR', async () => {
      const mockFetch = jest.fn((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || 'GET';

        if (url.includes('api.openai.com') || url.includes('chatgpt') || url.includes('merge') || url.includes('reviews')) {
          throw new Error(`Prohibited API call detected: ${url} (${method})`);
        }

        if (url.includes('/labels') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
        }
        if (url.includes('/check-runs') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ check_runs: [] }) } as Response);
        }
        if (url.endsWith('/comments') && method === 'GET') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
        }
        if (url.endsWith('/comments') && method === 'POST') {
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: 100 }) } as Response);
        }

        return Promise.reject(new Error(`Unexpected endpoint: ${url}`));
      });

      const result = await runChatgptReviewRelay({
        repository,
        pullRequest: validPr,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.handled).toBe(true);
      expect(result.action).toBe('RELAY_MARKED');
    });
  });
});
