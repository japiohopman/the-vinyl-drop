import { z } from 'zod';

export const IssueMetadataSchema = z.object({
  id: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  labels: z.array(z.string()),
  body: z.string(),
  active_session: z.boolean().default(false),
  open_pr_exists: z.boolean().default(false),
});

export type IssueMetadata = z.infer<typeof IssueMetadataSchema>;

export interface PreflightResult {
  valid: boolean;
  issueId?: number;
  specialist?: string;
  reasons: string[];
}

export function validateIssuePreflight(issue: IssueMetadata): PreflightResult {
  const reasons: string[] = [];

  if (issue.state !== 'open') {
    reasons.push('Issue is not open.');
  }

  if (issue.active_session) {
    reasons.push('Issue already has a blocking active session.');
  }

  if (issue.open_pr_exists) {
    reasons.push('Issue already has an active open PR on the same boundary.');
  }

  const hasSpecialist = issue.body.includes('Specialist') || issue.labels.some(l => l.includes('specialist'));
  if (!hasSpecialist) {
    reasons.push('Issue body or labels do not specify a specialist.');
  }

  const hasAcceptanceCriteria = issue.body.toLowerCase().includes('acceptance criteria') || issue.body.toLowerCase().includes('acceptance');
  if (!hasAcceptanceCriteria) {
    reasons.push('Issue body missing acceptance criteria.');
  }

  const valid = reasons.length === 0;

  let specialist = 'Architecture Specialist';
  if (issue.body.includes('UI Specialist')) specialist = 'UI Specialist';
  else if (issue.body.includes('Data / Catalog Specialist')) specialist = 'Data / Catalog Specialist';
  else if (issue.body.includes('Marketplace Specialist')) specialist = 'Marketplace Specialist';
  else if (issue.body.includes('Verification Specialist')) specialist = 'Verification Specialist';

  return {
    valid,
    issueId: issue.id,
    specialist,
    reasons,
  };
}

export function selectNextDispatchableIssue(issues: IssueMetadata[]): PreflightResult | null {
  for (const issue of issues) {
    const result = validateIssuePreflight(issue);
    if (result.valid) {
      return result;
    }
  }
  return null;
}

export interface DispatchOptions {
  dryRun: boolean;
  confirmLive: boolean;
  apiKey?: string;
}

export function executeDispatch(issue: IssueMetadata, options: DispatchOptions): { success: boolean; action: string; error?: string } {
  const preflight = validateIssuePreflight(issue);
  if (!preflight.valid) {
    return { success: false, action: 'blocked', error: `Preflight failed: ${preflight.reasons.join(' ')}` };
  }

  if (options.dryRun) {
    return { success: true, action: `[DRY-RUN] Selected Issue #${issue.id} for ${preflight.specialist}` };
  }

  if (!options.confirmLive) {
    return { success: false, action: 'blocked', error: 'Live dispatch rejected: missing explicit live confirmation flag.' };
  }

  if (!options.apiKey) {
    return { success: false, action: 'blocked', error: 'Live dispatch rejected: missing API secret credentials.' };
  }

  return { success: true, action: `[LIVE-DISPATCH] Dispatched Issue #${issue.id} to ${preflight.specialist}` };
}

if (require.main === module) {
  console.log('--- Jules Issue Selector & Preflight Dispatcher ---');
  const isDryRun = process.env.DRY_RUN !== 'false';
  const isConfirmLive = process.env.CONFIRM_LIVE_DISPATCH === 'true';
  const apiKey = process.env.JULES_API_KEY;

  const rawIssuesPayload = process.env.ISSUES_JSON;
  let issuesToProcess: IssueMetadata[] = [];

  if (rawIssuesPayload) {
    try {
      issuesToProcess = JSON.parse(rawIssuesPayload);
    } catch {
      console.error('Failed to parse ISSUES_JSON environment variable');
      process.exit(1);
    }
  } else {
    issuesToProcess = [{
      id: 4,
      title: 'Phase 1 — Repository and Agentic Workflow Foundation',
      state: 'open',
      labels: ['phase'],
      body: 'Primary Specialist: Architecture Specialist\nAcceptance Criteria: All items done.',
      active_session: false,
      open_pr_exists: false,
    }];
  }

  const selected = selectNextDispatchableIssue(issuesToProcess);
  if (!selected) {
    console.log('No dispatchable issue found passing preflight checks.');
    process.exit(0);
  }

  const issue = issuesToProcess.find(i => i.id === selected.issueId)!;
  const dispatchResult = executeDispatch(issue, {
    dryRun: isDryRun,
    confirmLive: isConfirmLive,
    apiKey,
  });

  console.log('Dispatch Execution Result:', dispatchResult);
  if (!dispatchResult.success) {
    process.exit(1);
  }
}
