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
  return (
    `### Latest Reviewer Instruction\n\n` +
    `**Status: NOT READY**\n\n` +
    `### Required changes\n` +
    instructions.map((item, index) => `${index + 1}. ${item}`).join('\n') +
    `\n\n### Do not change\n- Unrelated scope or established domain boundaries.`
  );
}

export function processReviewCommentPayload(payload: { body: string; isPR: boolean }): { processed: boolean; instructions?: string[] } {
  if (!payload.isPR) {
    return { processed: false };
  }

  const lines = payload.body.split('\n').map(l => l.trim()).filter(Boolean);
  return {
    processed: true,
    instructions: lines,
  };
}

if (require.main === module) {
  console.log('--- ChatGPT Review Relay ---');
  const sample = '### Status\nREADY FOR HUMAN REVIEW';
  console.log('Extracted Status:', parseReviewStatus(sample));
}
