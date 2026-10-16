import { describe, expect, test } from '@jest/globals';

const { parseIssueMetadata } = require('../.github/scripts/dispatcher-metadata.cjs') as {
  parseIssueMetadata: (issue: {
    number: number;
    title?: string;
    body?: string | null;
    state?: string;
    labels?: Array<string | { name: string }>;
  }) => {
    isDispatchReady: boolean;
    readinessProblem: string | null;
    primarySpecialist?: string;
    secondarySpecialist?: string;
    dependencies: number[];
  };
};

function issue(body: string, labels: Array<string | { name: string }> = []) {
  return parseIssueMetadata({ number: 128, title: 'metadata parser test', state: 'open', body, labels });
}

describe('dispatcher issue metadata parser', () => {
  test('parses the heading-style metadata in Issue #128', () => {
    const parsed = issue(`
### Dispatch Readiness

READY

Primary Specialist: Verification Specialist
Secondary Specialist: Architecture Specialist
`);

    expect(parsed.isDispatchReady).toBe(true);
    expect(parsed.readinessProblem).toBeNull();
    expect(parsed.primarySpecialist).toBe('Verification Specialist');
    expect(parsed.secondarySpecialist).toBe('Architecture Specialist');
  });

  test.each([
    ['**Dispatch Readiness:** READY', '**Primary Specialist:** Verification Specialist', '**Secondary Specialist:** Architecture Specialist'],
    ['**Dispatch Readiness**: READY', '**Primary Specialist**: Verification Specialist', '**Secondary Specialist**: Architecture Specialist'],
    ['Readiness: READY', 'Primary Specialist: Verification Specialist', 'Secondary Specialist: Architecture Specialist'],
    ['### Dispatch Readiness: READY', '### Primary Specialist\nVerification Specialist', '### Secondary Specialist\nArchitecture Specialist'],
  ])('parses inline readiness and specialist formatting: %s', (readiness, primary, secondary) => {
    const parsed = issue(`${readiness}
${primary}
${secondary}`);

    expect(parsed.isDispatchReady).toBe(true);
    expect(parsed.readinessProblem).toBeNull();
    expect(parsed.primarySpecialist).toBe('Verification Specialist');
    expect(parsed.secondarySpecialist).toBe('Architecture Specialist');
  });

  test('does not infer readiness from ordinary prose', () => {
    const parsed = issue('Issue #127 explicitly declared itself ready, but no readiness field is present.');

    expect(parsed.isDispatchReady).toBe(false);
    expect(parsed.readinessProblem).toMatch(/Missing Dispatch Readiness/);
  });

  test('missing readiness stays blocked even when a specialist is present', () => {
    const parsed = issue('Primary Specialist: Verification Specialist');

    expect(parsed.isDispatchReady).toBe(false);
    expect(parsed.readinessProblem).toMatch(/Missing Dispatch Readiness/);
  });

  test('an explicit NOT READY overrides a ready label', () => {
    const parsed = issue('**Dispatch Readiness:** NOT READY', ['dispatch-ready']);

    expect(parsed.isDispatchReady).toBe(false);
    expect(parsed.readinessProblem).toBeNull();
  });

  test('unsupported readiness values fail closed with a precise error', () => {
    const parsed = issue('Dispatch Readiness: ready after approval', ['dispatch-ready']);

    expect(parsed.isDispatchReady).toBe(false);
    expect(parsed.readinessProblem).toMatch(/Unsupported Dispatch Readiness value/);
  });

  test('empty readiness does not pass preflight', () => {
    const parsed = issue('### Dispatch Readiness\n\nPrimary Specialist: Verification Specialist');

    expect(parsed.isDispatchReady).toBe(false);
    expect(parsed.readinessProblem).toMatch(/no value/i);
  });

  test('deduplicates dependency references and excludes the current issue', () => {
    const parsed = issue(`Dispatch Readiness: READY
Primary Specialist: Verification Specialist

### Dependencies

- #12 — dependency
- #12 — repeated dependency
- #128 — self-reference
`);

    expect(parsed.dependencies).toEqual([12]);
  });
});
