import { describe, it, expect } from 'vitest';
import { validateIssuePreflight, executeDispatch } from '../scripts/jules-selector.js';
import { validatePRContract } from '../scripts/phase-safety-gate.js';
import { parseReviewStatus, formatReviewContinuation } from '../scripts/review-relay.js';
import { cleanupNamedSession } from '../scripts/stale-session-cleanup.js';

describe('Agentic Workflow Scripts (Deterministic Offline Tests)', () => {
  describe('jules-selector / preflight & dispatcher', () => {
    it('validates dispatchable issue correctly', () => {
      const result = validateIssuePreflight({
        id: 4,
        title: 'Phase 1',
        state: 'open',
        labels: ['phase'],
        body: 'Primary Specialist: Architecture Specialist\nAcceptance Criteria: Done.',
        active_session: false,
        open_pr_exists: false,
      });

      expect(result.valid).toBe(true);
      expect(result.specialist).toBe('Architecture Specialist');
    });

    it('rejects issue with open PR or active session', () => {
      const result = validateIssuePreflight({
        id: 4,
        title: 'Phase 1',
        state: 'open',
        labels: [],
        body: 'Primary Specialist: Architecture Specialist',
        active_session: true,
        open_pr_exists: true,
      });

      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('Issue already has a blocking active session.');
      expect(result.reasons).toContain('Issue already has an active open PR on the same boundary.');
    });

    it('handles dry-run mode vs live mode correctly', () => {
      const issue = {
        id: 4,
        title: 'Phase 1',
        state: 'open' as const,
        labels: ['phase'],
        body: 'Primary Specialist: Architecture Specialist\nAcceptance Criteria: Done.',
        active_session: false,
        open_pr_exists: false,
      };

      // Dry run
      const dryResult = executeDispatch(issue, { dryRun: true, confirmLive: false });
      expect(dryResult.success).toBe(true);
      expect(dryResult.action).toContain('[DRY-RUN]');

      // Live without confirmation -> blocked
      const liveNoConfirm = executeDispatch(issue, { dryRun: false, confirmLive: false });
      expect(liveNoConfirm.success).toBe(false);
      expect(liveNoConfirm.error).toContain('missing explicit live confirmation flag');

      // Live with confirmation but no credentials -> blocked
      const liveNoCreds = executeDispatch(issue, { dryRun: false, confirmLive: true });
      expect(liveNoCreds.success).toBe(false);
      expect(liveNoCreds.error).toContain('missing API secret credentials');

      // Live with confirmation & credentials
      const liveSuccess = executeDispatch(issue, { dryRun: false, confirmLive: true, apiKey: 'secret_key' });
      expect(liveSuccess.success).toBe(true);
      expect(liveSuccess.action).toContain('[LIVE-DISPATCH]');
    });
  });

  describe('phase-safety-gate', () => {
    it('passes valid PR contract body on main branch', () => {
      const prBody = `
### Phase
Refs #4

### Goal
Implement Phase 1

### Scope
Delivered foundation

### Verification
Tests pass

### Status
READY FOR HUMAN REVIEW
      `;

      const result = validatePRContract({ prBody, targetBranch: 'main' });
      expect(result.valid).toBe(true);
      expect(result.issueRef).toBe('4');
      expect(result.status).toBe('READY FOR HUMAN REVIEW');
    });

    it('passes when status is NOT READY', () => {
      const prBody = `
### Phase
Governing Issue: #4

### Goal
Implement Phase 1

### Scope
Delivered foundation

### Verification
Tests pass

**Status: NOT READY**
      `;

      const result = validatePRContract({ prBody, targetBranch: 'main' });
      expect(result.valid).toBe(true);
      expect(result.status).toBe('NOT READY');
    });

    it('fails when target branch is not main', () => {
      const prBody = `
### Phase
Refs #4
### Goal
Goal
### Scope
Scope
### Verification
Verification
### Status
READY FOR HUMAN REVIEW
      `;

      const result = validatePRContract({ prBody, targetBranch: 'feature-branch' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Target branch must be "main"'))).toBe(true);
    });

    it('fails when issue reference is missing', () => {
      const prBody = `
### Goal
Implement Phase 1

### Scope
Delivered foundation

### Verification
Tests pass

### Status
READY FOR HUMAN REVIEW
      `;

      const result = validatePRContract({ prBody, targetBranch: 'main' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Issue reference'))).toBe(true);
    });
  });

  describe('review-relay', () => {
    it('parses READY FOR HUMAN REVIEW status', () => {
      expect(parseReviewStatus('### Status\nREADY FOR HUMAN REVIEW')).toBe('READY FOR HUMAN REVIEW');
      expect(parseReviewStatus('### Status\nNOT READY')).toBe('NOT READY');
    });

    it('formats continuation instructions', () => {
      const formatted = formatReviewContinuation(['Fix linting error', 'Add unit test']);
      expect(formatted).toContain('NOT READY');
      expect(formatted).toContain('1. Fix linting error');
      expect(formatted).toContain('2. Add unit test');
    });
  });

  describe('stale-session-cleanup', () => {
    it('cleans up explicitly named session', () => {
      const result = cleanupNamedSession('sess-123');
      expect(result.cleaned).toBe(true);
      expect(result.sessionId).toBe('sess-123');
    });

    it('handles empty session gracefully', () => {
      const result = cleanupNamedSession(undefined);
      expect(result.cleaned).toBe(false);
    });
  });
});
