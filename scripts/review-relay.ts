export interface ReviewInstruction {
  status: 'READY FOR HUMAN REVIEW' | 'NOT READY';
  requiredChanges: string[];
}

export function parseReviewStatus(prBody: string): 'READY FOR HUMAN REVIEW' | 'NOT READY' {
  if (prBody.includes('READY FOR HUMAN REVIEW')) {
    return 'READY FOR HUMAN REVIEW';
  }
  return 'NOT READY';
}

export function formatReviewContinuation(instructions: string[]): string {
  return `### Latest Reviewer Instruction\n\n### Status\nNOT READY\n\n### Required changes\n` +
    instructions.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

if (require.main === module) {
  console.log('--- Review Relay Script ---');
  const sample = '### Status\nREADY FOR HUMAN REVIEW';
  console.log('Extracted Status:', parseReviewStatus(sample));
}
