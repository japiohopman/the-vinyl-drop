export interface PRValidationInput {
  prBody: string;
  targetBranch?: string;
}

export interface PRValidationResult {
  valid: boolean;
  errors: string[];
  issueRef?: string;
  status?: string;
}

export function validatePRContract(input: PRValidationInput): PRValidationResult {
  const errors: string[] = [];
  const { prBody, targetBranch } = input;

  // 1. Target Branch Protection
  if (targetBranch && targetBranch !== 'main') {
    errors.push(`Target branch must be "main", got "${targetBranch}".`);
  }

  // 2. Issue reference check (e.g. Refs #4 or Governing Issue: #4)
  const issueRefMatch = prBody.match(/Refs\s+#(\d+)/i) || prBody.match(/Governing Issue:\s*#?(\d+)/i);
  if (!issueRefMatch) {
    errors.push('PR body missing explicit Issue reference (expected "Refs #<id>" or "Governing Issue: #<id>").');
  }

  // 3. Status Section Parsing
  let statusFound: string | undefined;
  if (/READY FOR HUMAN REVIEW/i.test(prBody)) {
    statusFound = 'READY FOR HUMAN REVIEW';
  } else if (/NOT READY/i.test(prBody)) {
    statusFound = 'NOT READY';
  }

  const hasStatusSection =
    /###\s*Status/i.test(prBody) ||
    /\*\*Status:\*\*/i.test(prBody) ||
    /Status:/i.test(prBody);

  if (!hasStatusSection && !statusFound) {
    errors.push('PR body missing required section: Status');
  }

  // 4. Required contract sections
  const requiredSections = ['Goal', 'Scope', 'Verification'];
  for (const section of requiredSections) {
    if (!new RegExp(`###\\s*${section}`, 'i').test(prBody) && !new RegExp(`\\*\\*${section}:?\\*\\*`, 'i').test(prBody)) {
      errors.push(`PR body missing required section: ${section}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    issueRef: issueRefMatch ? issueRefMatch[1] : undefined,
    status: statusFound,
  };
}

if (require.main === module) {
  const prBodySample = process.env.PR_BODY || '';
  const targetBranchSample = process.env.GITHUB_BASE_REF || 'main';

  console.log('--- Phase Safety Gate Validator ---');
  const result = validatePRContract({ prBody: prBodySample, targetBranch: targetBranchSample });

  if (!result.valid) {
    console.error('Phase Safety Gate failed with errors:', result.errors);
    process.exit(1);
  } else {
    console.log(`Phase Safety Gate passed successfully for Issue #${result.issueRef} (Status: ${result.status})`);
  }
}
