import {
  validatePrContract,
  validateGoverningIssue,
  runSafetyGate,
} from '../src/workflow/prSafetyGate';

const VALID_PR_BODY = `
## Phase / Governing Issue

Refs #20

## Goal

Implement PR safety gate.

## Scope completed

- [x] Add pull request safety gate workflow

## Architecture

Standard workflow rules.

## Data integrity

N/A

## Verification

- [x] \`npm run lint\`
- [x] \`npm run typecheck\`
- [x] \`npm test\`
- [x] \`npm run build\`

## Security

Least privilege permissions.

## Documentation

Updated workflow docs.

## Definition of Done

- [x] All Issue acceptance criteria satisfied

---

## Latest reviewer instruction

### Status

READY FOR HUMAN REVIEW

### Required changes

None.
`;

describe('PR Contract Parsing and Safety Gate Validation', () => {
  describe('validatePrContract', () => {
    it('should pass for a valid PR contract body', () => {
      const result = validatePrContract(VALID_PR_BODY);
      expect(result.valid).toBe(true);
      expect(result.issueNumber).toBe(20);
      expect(result.status).toBe('READY FOR HUMAN REVIEW');
      expect(result.errors).toEqual([]);
    });

    it('should accept NOT READY status', () => {
      const body = VALID_PR_BODY.replace('READY FOR HUMAN REVIEW', 'NOT READY');
      const result = validatePrContract(body);
      expect(result.valid).toBe(true);
      expect(result.status).toBe('NOT READY');
    });

    it('should fail when PR body is empty or null', () => {
      expect(validatePrContract(null).valid).toBe(false);
      expect(validatePrContract('').valid).toBe(false);
      expect(validatePrContract('   ').valid).toBe(false);
    });

    it('should fail when required sections are missing', () => {
      const bodyMissingGoal = VALID_PR_BODY.replace('## Goal', '## Purpose');
      const result = validatePrContract(bodyMissingGoal);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required section: "## Goal"');
    });

    it('should fail when governing issue reference is missing or malformed', () => {
      const bodyNoRefs = VALID_PR_BODY.replace('Refs #20', 'Closes #20');
      const result = validatePrContract(bodyNoRefs);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Missing or malformed governing issue reference (expected format: "Refs #<number>").'
      );
    });

    it('should fail when status section is missing or invalid', () => {
      const bodyInvalidStatus = VALID_PR_BODY.replace(
        'READY FOR HUMAN REVIEW',
        'IN PROGRESS'
      );
      const result = validatePrContract(bodyInvalidStatus);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Missing or invalid status under "### Status". Must be "NOT READY" or "READY FOR HUMAN REVIEW".'
      );
    });
  });

  describe('validateGoverningIssue', () => {
    it('should pass when GitHub API returns an open issue', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ state: 'open' }),
      } as Response);

      const result = await validateGoverningIssue(
        'owner/repo',
        20,
        'mock-token',
        mockFetch
      );

      expect(result.valid).toBe(true);
      expect(result.isOpen).toBe(true);
      expect(result.errors).toEqual([]);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues/20',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        })
      );
    });

    it('should fail when issue is closed', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ state: 'closed' }),
      } as Response);

      const result = await validateGoverningIssue(
        'owner/repo',
        20,
        undefined,
        mockFetch
      );

      expect(result.valid).toBe(false);
      expect(result.isOpen).toBe(false);
      expect(result.errors).toContain(
        'Governing issue #20 is not open (state: "closed").'
      );
    });

    it('should fail when issue does not exist (404)', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Not Found' }),
      } as Response);

      const result = await validateGoverningIssue(
        'owner/repo',
        999,
        undefined,
        mockFetch
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Governing issue #999 was not found on GitHub.'
      );
    });

    it('should fail when the number refers to a pull request', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ state: 'open', pull_request: {} }),
      } as Response);

      const result = await validateGoverningIssue(
        'owner/repo',
        20,
        undefined,
        mockFetch
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Issue #20 is a pull request, not an issue.'
      );
    });

    it('should fail closed on API network error', async () => {
      const mockFetch = jest
        .fn()
        .mockRejectedValue(new Error('Network failure'));

      const result = await validateGoverningIssue(
        'owner/repo',
        20,
        undefined,
        mockFetch
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Failed to communicate with GitHub API: Network failure'
      );
    });
  });

  describe('runSafetyGate', () => {
    it('should return success true when both contract and issue are valid', async () => {
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ state: 'open' }),
      } as Response);

      const result = await runSafetyGate(
        VALID_PR_BODY,
        'owner/repo',
        'token',
        mockFetch
      );

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(20);
      expect(result.errors).toEqual([]);
    });

    it('should fail closed without checking API if contract is invalid', async () => {
      const mockFetch = jest.fn();

      const result = await runSafetyGate(
        'Invalid Body',
        'owner/repo',
        'token',
        mockFetch
      );

      expect(result.success).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
