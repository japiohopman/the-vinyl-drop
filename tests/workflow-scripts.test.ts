import { describe, it, expect } from 'vitest';
import { validateIssuePreflight } from '../scripts/jules-selector.js';
import { validatePRContract } from '../scripts/phase-safety-gate.js';
import { parseReviewStatus, formatReviewContinuation } from '../scripts/review-relay.js';
import { isSessionStale, cleanupStaleSessions } from '../scripts/stale-session-cleanup.js';

describe('Agentic Workflow Scripts (Deterministic Offline Tests)', () => {
  describe('jules-selector / preflight', () => {
    it('validates dispatchable issue correctly', () => {
      const result = validateIssuePreflight({
        id: 4,
        title: 'Phase 1',
        state: 'open',
        labels: ['phase'],
        body: 'Primary Specialist: Architecture Specialist\nAcceptance Criteria: Done.',
        active_session: false,
      });

      expect(result.valid).toBe(true);
      expect(result.specialist).toBe('Architecture Specialist');
    });

    it('rejects closed issue or issue with active session', () => {
      const result = validateIssuePreflight({
        id: 4,
        title: 'Phase 1',
        state: 'closed',
        labels: [],
        body: 'Primary Specialist: Architecture Specialist',
        active_session: true,
      });

      expect(result.valid).toBe(false);
      expect(result.reasons).toContain('Issue is not open.');
      expect(result.reasons).toContain('Issue already has a blocking active session.');
    });
  });

  describe('phase-safety-gate', () => {
    it('passes valid PR contract body', () => {
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

      const result = validatePRContract(prBody);
      expect(result.valid).toBe(true);
      expect(result.issueRef).toBe('4');
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

      const result = validatePRContract(prBody);
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
    it('detects stale session', () => {
      const now = Date.now();
      const session = {
        sessionId: 'sess-123',
        issueId: 4,
        lastActiveTimestamp: now - 5000000,
        staleThresholdMs: 3600000,
      };

      expect(isSessionStale(session, now)).toBe(true);
      expect(cleanupStaleSessions([session], now)).toEqual(['sess-123']);
    });
  });
});
