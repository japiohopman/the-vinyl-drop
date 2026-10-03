export interface PRValidationResult {
  valid: boolean;
  errors: string[];
  issueRef?: string;
}

export function validatePRContract(prBody: string): PRValidationResult {
  const errors: string[] = [];

  // Check issue reference (e.g. Refs #4 or Governing Issue: #4)
  const issueRefMatch = prBody.match(/Refs\s+#(\d+)/i) || prBody.match(/Governing Issue:\s*#?(\d+)/i);
  if (!issueRefMatch) {
    errors.push('PR body missing explicit Issue reference (expected "Refs #<id>" or "Governing Issue: #<id>").');
  }

  // Check required sections
  const requiredSections = ['Goal', 'Scope', 'Verification', 'Status'];
  for (const section of requiredSections) {
    if (!new RegExp(`###\\s*${section}`, 'i').test(prBody) && !new RegExp(`\\*\\*${section}\\*\\*`, 'i').test(prBody)) {
      errors.push(`PR body missing required section: ${section}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    issueRef: issueRefMatch ? issueRefMatch[1] : undefined,
  };
}

if (require.main === module) {
  const prBodySample = process.env.PR_BODY || '';
  console.log('--- Phase Safety Gate Validator ---');
  const result = validatePRContract(prBodySample);
  if (!result.valid) {
    console.error('Phase Safety Gate failed with errors:', result.errors);
    process.exit(1);
  } else {
    console.log('Phase Safety Gate passed successfully for Issue #', result.issueRef);
  }
}
