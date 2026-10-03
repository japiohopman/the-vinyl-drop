import { z } from 'zod';

export const IssueMetadataSchema = z.object({
  id: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  labels: z.array(z.string()),
  body: z.string(),
  active_session: z.boolean().default(false),
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

if (require.main === module) {
  console.log('--- Jules Issue Selector & Preflight (Dry-Run Mode) ---');
  // Example dry run execution
  const sampleIssue: IssueMetadata = {
    id: 4,
    title: 'Phase 1 — Repository and Agentic Workflow Foundation',
    state: 'open',
    labels: ['phase'],
    body: 'Primary Specialist: Architecture Specialist\nAcceptance Criteria: All items done.',
    active_session: false,
  };

  const result = validateIssuePreflight(sampleIssue);
  console.log('Sample Issue Validation Result:', JSON.stringify(result, null, 2));
}
