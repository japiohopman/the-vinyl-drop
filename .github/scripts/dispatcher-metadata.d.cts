export interface DispatcherIssue {
  number: number;
  title?: string;
  body?: string | null;
  state?: string;
  labels?: Array<string | { name: string }>;
}

export interface ParsedIssueMetadata {
  issueNumber: number;
  title?: string;
  body: string;
  state?: string;
  labels: Array<string | { name: string }>;
  primarySpecialist?: string;
  secondarySpecialist?: string;
  priority: number;
  dependencies: number[];
  isDispatchReady: boolean;
  readinessProblem: string | null;
}

export function findField(body: string | null | undefined, labelPattern: string): { found: boolean; value: string };
export function parseIssueMetadata(issue: DispatcherIssue): ParsedIssueMetadata;
