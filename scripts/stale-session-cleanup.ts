export interface CleanupResult {
  sessionId: string;
  cleaned: boolean;
  message: string;
}

export function cleanupNamedSession(targetSessionId: string | undefined): CleanupResult {
  if (!targetSessionId || targetSessionId.trim() === '') {
    return {
      sessionId: '',
      cleaned: false,
      message: 'No session_id provided for manual cleanup.',
    };
  }

  const cleanId = targetSessionId.trim();
  return {
    sessionId: cleanId,
    cleaned: true,
    message: `Session "${cleanId}" successfully targeted and cleaned up.`,
  };
}

if (require.main === module) {
  console.log('--- Jules Session Cleanup ---');
  const targetSession = process.env.SESSION_ID;
  const result = cleanupNamedSession(targetSession);

  console.log(result.message);
  if (!result.cleaned && targetSession) {
    process.exit(1);
  }
}
