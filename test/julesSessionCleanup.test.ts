import * as fs from 'fs';
import * as path from 'path';
import {
  runJulesSessionCleanup,
  parseSessionInputs,
  REQUIRED_CONFIRMATION_TOKEN,
  ACTIVE_RUNNING_STATES,
  RawJulesSession,
} from '../src/workflow/julesSessionCleanup';

describe('Jules Manual Stale-Session Cleanup Engine', () => {
  const repository = 'japiohopman/the-vinyl-drop';
  const expectedSource = `sources/github/${repository}`;
  const apiKey = 'test-jules-api-key';

  const validStaleSession: RawJulesSession = {
    name: 'projects/-/locations/global/sessions/10001',
    title: '[Issue #26] Stale Session',
    state: 'PAUSED',
    sourceContext: {
      source: expectedSource,
    },
  };

  const validActiveSession: RawJulesSession = {
    name: 'projects/-/locations/global/sessions/10002',
    title: '[Issue #26] Active Session',
    state: 'IN_PROGRESS',
    sourceContext: {
      source: expectedSource,
    },
  };

  const foreignSession: RawJulesSession = {
    name: 'projects/-/locations/global/sessions/10003',
    title: '[Issue #99] Other Repo Session',
    state: 'PAUSED',
    sourceContext: {
      source: 'sources/github/other-owner/other-repo',
    },
  };

  describe('Workflow Contract Safeguard', () => {
    it('should verify .github/workflows/jules-session-cleanup.yml explicitly binds checkout to trusted main branch', () => {
      const ymlPath = path.resolve(process.cwd(), '.github/workflows/jules-session-cleanup.yml');
      const ymlContent = fs.readFileSync(ymlPath, 'utf-8');

      expect(ymlContent).toContain('uses: actions/checkout@v4');
      expect(ymlContent).toContain('ref: main');
    });
  });

  describe('Input Parsing and Strict Normalization', () => {
    it('should parse comma, newline, and space separated valid session IDs into normalized resource names', () => {
      const input = '12345, sessions/67890\nprojects/proj/locations/global/sessions/99999 12345';
      const parsed = parseSessionInputs(input);
      expect(parsed).toEqual(['sessions/12345', 'sessions/67890', 'sessions/99999']);
    });

    it('should handle array inputs cleanly', () => {
      const parsed = parseSessionInputs(['11111', 'sessions/22222']);
      expect(parsed).toEqual(['sessions/11111', 'sessions/22222']);
    });

    it('should reject malformed session resource paths or arbitrary file paths', () => {
      const malformedInput = '../../etc/passwd, sessions/123/extra, invalid@id, 12345';
      const parsed = parseSessionInputs(malformedInput);
      expect(parsed).toEqual(['sessions/12345']);
    });
  });

  describe('Verification Requirement 1: Dry-run Inspection of Valid Stale Session', () => {
    it('should inspect valid stale session and mark as deletable without making DELETE API calls', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request) => {
          const url = String(input);
          if (url.includes('/sessions/10001')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => validStaleSession,
            } as Response);
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        }
      );

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        dryRun: true,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.deletionAuthorized).toBe(false);
      expect(result.inspectedCount).toBe(1);
      expect(result.deletedCount).toBe(0);
      expect(result.sessions[0].isDeletable).toBe(true);
      expect(result.sessions[0].deleted).toBe(false);
      expect(result.sessions[0].source).toBe(expectedSource);
      expect(result.sessions[0].state).toBe('PAUSED');

      // Verify no DELETE HTTP calls were made
      const deleteCalls = mockFetch.mock.calls.filter((c) => {
        const init = c[1];
        return init?.method === 'DELETE';
      });
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe('Verification Requirement 2: Confirmed Deletion of Valid Stale Session', () => {
    it('should delete stale session when confirmed with DELETE_STALE_SESSIONS and dryRun false', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method || 'GET';

          if (url.includes('/sessions/10001') && method === 'GET') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => validStaleSession,
            } as Response);
          }

          if (url.includes('/sessions/10001') && method === 'DELETE') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({}),
            } as Response);
          }

          return Promise.reject(new Error(`Unexpected URL or method: ${method} ${url}`));
        }
      );

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        confirmationToken: REQUIRED_CONFIRMATION_TOKEN,
        dryRun: false,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.deletionAuthorized).toBe(true);
      expect(result.inspectedCount).toBe(1);
      expect(result.deletedCount).toBe(1);
      expect(result.sessions[0].deleted).toBe(true);

      const deleteCalls = mockFetch.mock.calls.filter((c) => {
        const i = c[1];
        return i?.method === 'DELETE';
      });
      expect(deleteCalls.length).toBe(1);
    });
  });

  describe('Verification Requirement 3: Protection of Foreign Repository Sessions', () => {
    it('should reject session belonging to another repository source and fail closed', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request) => {
          const url = String(input);
          if (url.includes('/sessions/10003')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => foreignSession,
            } as Response);
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        }
      );

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10003',
        confirmationToken: REQUIRED_CONFIRMATION_TOKEN,
        dryRun: false,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.sessions[0].isDeletable).toBe(false);
      expect(result.sessions[0].reason).toContain('Source context mismatch');
      expect(result.errors.some((e) => e.includes('Source context mismatch'))).toBe(true);

      const deleteCalls = mockFetch.mock.calls.filter((c) => {
        const i = c[1];
        return i?.method === 'DELETE';
      });
      expect(deleteCalls.length).toBe(0);
    });
  });

  describe('Verification Requirement 4: Protection of Active/Running Sessions', () => {
    it.each(ACTIVE_RUNNING_STATES)(
      'should reject session in active state "%s" and prevent deletion',
      async (activeState) => {
        const session: RawJulesSession = {
          ...validActiveSession,
          state: activeState,
        };

        const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
          (input: string | URL | Request) => {
            const url = String(input);
            if (url.includes('/sessions/10002')) {
              return Promise.resolve({
                ok: true,
                status: 200,
                json: async () => session,
              } as Response);
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
          }
        );

        const result = await runJulesSessionCleanup({
          repository,
          sessionInputs: '10002',
          confirmationToken: REQUIRED_CONFIRMATION_TOKEN,
          dryRun: false,
          julesApiKey: apiKey,
          customFetch: mockFetch as unknown as typeof fetch,
        });

        expect(result.success).toBe(false);
        expect(result.deletedCount).toBe(0);
        expect(result.sessions[0].isDeletable).toBe(false);
        expect(result.sessions[0].reason).toContain('Active sessions must never be deleted');

        const deleteCalls = mockFetch.mock.calls.filter((c) => {
          const i = c[1];
          return i?.method === 'DELETE';
        });
        expect(deleteCalls.length).toBe(0);
      }
    );
  });

  describe('Verification Requirement 5: Unapproved or Unknown State Protection', () => {
    it('should reject session in an unexpected or unapproved state (e.g. UNKNOWN_STATE)', async () => {
      const unknownStateSession: RawJulesSession = {
        ...validStaleSession,
        state: 'UNKNOWN_CUSTOM_STATE',
      };

      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request) => {
          const url = String(input);
          if (url.includes('/sessions/10001')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => unknownStateSession,
            } as Response);
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        }
      );

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        confirmationToken: REQUIRED_CONFIRMATION_TOKEN,
        dryRun: false,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.sessions[0].isDeletable).toBe(false);
      expect(result.sessions[0].reason).toContain('is not an approved stale state');
    });
  });

  describe('Verification Requirement 6: Immediate Fail Closed on Invalid Confirmation Token in Live Mode', () => {
    it('should FAIL CLOSED immediately with success false and ZERO API calls when confirmation token is invalid in dryRun false mode', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(() => {
        throw new Error('API calls must NOT be made when confirmation token is invalid!');
      });

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        confirmationToken: 'INVALID_TOKEN_VALUE',
        dryRun: false,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.deletionAuthorized).toBe(false);
      expect(result.inspectedCount).toBe(0);
      expect(result.deletedCount).toBe(0);
      expect(result.errors.some((e) => e.includes('Invalid confirmation token'))).toBe(true);

      // Verify zero fetch calls were attempted
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Verification Requirement 7: Fail Closed on API Error', () => {
    it('should fail closed when API returns status 500 on session fetch', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request) => {
          const url = String(input);
          if (url.includes('/sessions/10001')) {
            return Promise.resolve({
              ok: false,
              status: 500,
            } as Response);
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        }
      );

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        dryRun: true,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('API error inspecting session'))).toBe(true);
    });

    it('should fail closed when API returns status 500 on DELETE call', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);
          const method = init?.method || 'GET';

          if (url.includes('/sessions/10001') && method === 'GET') {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => validStaleSession,
            } as Response);
          }

          if (url.includes('/sessions/10001') && method === 'DELETE') {
            return Promise.resolve({
              ok: false,
              status: 500,
            } as Response);
          }

          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        }
      );

      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        confirmationToken: REQUIRED_CONFIRMATION_TOKEN,
        dryRun: false,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      expect(result.success).toBe(false);
      expect(result.deletedCount).toBe(0);
      expect(result.errors.some((e) => e.includes('Failed to delete session'))).toBe(true);
    });
  });

  describe('Verification Requirement 8: Missing Input & API Key Validation', () => {
    it('should fail closed when JULES_API_KEY is missing or empty', async () => {
      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        dryRun: true,
        julesApiKey: '',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Missing required JULES_API_KEY'))).toBe(true);
    });

    it('should fail closed when session input is empty', async () => {
      const result = await runJulesSessionCleanup({
        repository,
        sessionInputs: '   ,  \n  ',
        dryRun: true,
        julesApiKey: apiKey,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('No valid Jules session names or IDs'))).toBe(true);
    });

    it('should fail closed when repository format is invalid', async () => {
      const result = await runJulesSessionCleanup({
        repository: 'invalid-repo-without-slash',
        sessionInputs: '10001',
        dryRun: true,
        julesApiKey: apiKey,
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid repository specification'))).toBe(true);
    });
  });

  describe('Verification Requirement 9: No Session Sweep Guarantee', () => {
    it('should NEVER call session list endpoint (GET /v1alpha/sessions without session ID)', async () => {
      const mockFetch = jest.fn<Promise<Response>, [string | URL | Request, RequestInit?]>(
        (input: string | URL | Request) => {
          const url = String(input);
          if (url.includes('/sessions/10001')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => validStaleSession,
            } as Response);
          }
          return Promise.reject(new Error(`Unexpected URL: ${url}`));
        }
      );

      await runJulesSessionCleanup({
        repository,
        sessionInputs: '10001',
        dryRun: true,
        julesApiKey: apiKey,
        customFetch: mockFetch as unknown as typeof fetch,
      });

      // Verify that no call was made to list all sessions endpoint
      const listCalls = mockFetch.mock.calls.filter((c) => {
        const url = String(c[0]);
        return url.endsWith('/v1alpha/sessions') || url.endsWith('/v1alpha/sessions/');
      });
      expect(listCalls.length).toBe(0);
    });
  });
});
