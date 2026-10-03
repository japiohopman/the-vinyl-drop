export interface SessionInfo {
  sessionId: string;
  issueId: number;
  lastActiveTimestamp: number;
  staleThresholdMs: number;
}

export function isSessionStale(session: SessionInfo, currentTimestamp: number): boolean {
  return (currentTimestamp - session.lastActiveTimestamp) > session.staleThresholdMs;
}

export function cleanupStaleSessions(sessions: SessionInfo[], currentTimestamp: number): string[] {
  const cleanedSessionIds: string[] = [];
  for (const session of sessions) {
    if (isSessionStale(session, currentTimestamp)) {
      cleanedSessionIds.push(session.sessionId);
    }
  }
  return cleanedSessionIds;
}

if (require.main === module) {
  console.log('--- Stale Session Cleanup Script ---');
  const now = Date.now();
  const sampleSessions: SessionInfo[] = [
    { sessionId: 'sess-1', issueId: 4, lastActiveTimestamp: now - 100000, staleThresholdMs: 3600000 },
    { sessionId: 'sess-2', issueId: 2, lastActiveTimestamp: now - 7200000, staleThresholdMs: 3600000 },
  ];
  const stale = cleanupStaleSessions(sampleSessions, now);
  console.log('Identified stale sessions for manual cleanup:', stale);
}
