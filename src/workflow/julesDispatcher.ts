import * as fs from 'fs';
import * as path from 'path';

export interface DispatcherOptions {
  repository: string;
  token?: string;
  julesApiKey?: string;
  issueNumber?: number;
  dryRun: boolean;
  customFetch?: typeof fetch;
}

export interface PreflightResult {
  success: boolean;
  issueNumber?: number;
  issueTitle?: string;
  dryRun: boolean;
  errors: string[];
  warnings?: string[];
  dispatchPayload?: {
    title: string;
    prompt: string;
    sourceContext: {
      source: string;
      githubRepoContext: {
        startingBranch: string;
      };
    };
    automationMode: string;
  };
  liveDispatchTriggered?: boolean;
}

export interface RawGitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  labels?: Array<{ name: string } | string>;
  pull_request?: unknown;
}

export interface RawGitHubPullRequest {
  number: number;
  title: string;
  body?: string | null;
  head: {
    ref: string;
  };
  base: {
    ref: string;
  };
}

/**
 * Extracts the exact inline script from `.github/workflows/jules-issue-dispatcher.yml`.
 */
export function extractWorkflowScript(): string {
  const ymlPath = path.resolve(process.cwd(), '.github/workflows/jules-issue-dispatcher.yml');
  const ymlContent = fs.readFileSync(ymlPath, 'utf-8');
  const scriptMatch = ymlContent.match(/script:\s*\|([\s\S]*)$/);
  if (!scriptMatch) {
    throw new Error('Could not extract script block from .github/workflows/jules-issue-dispatcher.yml');
  }
  return scriptMatch[1];
}

/**
 * Executes the exact production workflow script from `.github/workflows/jules-issue-dispatcher.yml` against test mocks.
 */
export async function runJulesDispatcher(options: DispatcherOptions): Promise<PreflightResult> {
  const scriptCode = extractWorkflowScript();
  const [repoOwner, repoName] = options.repository.split('/');
  const fetchFn = options.customFetch || globalThis.fetch;

  const infoLogs: string[] = [];
  const failedErrors: string[] = [];
  let isFailed = false;

  const mockCore = {
    info: (msg: string) => infoLogs.push(msg),
    warning: (msg: string) => infoLogs.push(`[WARNING] ${msg}`),
    setFailed: (msg: string) => {
      isFailed = true;
      failedErrors.push(msg);
    },
  };

  const mockContext = {
    repo: { owner: repoOwner, repo: repoName },
  };

  // Construct mock GitHub client wrapping customFetch or global.fetch
  const mockGithub = {
    rest: {
      repos: {
        getBranch: async ({ branch }: { branch: string }) => {
          const res = await fetchFn(`https://api.github.com/repos/${options.repository}/branches/${branch}`, {
            headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { data: await res.json() };
        },
      },
      issues: {
        get: async ({ issue_number }: { issue_number: number }) => {
          const res = await fetchFn(`https://api.github.com/repos/${options.repository}/issues/${issue_number}`, {
            headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { data: await res.json() };
        },
        listForRepo: async () => {
          const res = await fetchFn(`https://api.github.com/repos/${options.repository}/issues?state=open&per_page=100`, {
            headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { data: await res.json() };
        },
        addLabels: async ({ issue_number, labels }: { issue_number: number; labels: string[] }) => {
          const res = await fetchFn(`https://api.github.com/repos/${options.repository}/issues/${issue_number}/labels`, {
            method: 'POST',
            headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
            body: JSON.stringify({ labels }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { data: await res.json() };
        },
      },
      pulls: {
        list: async () => {
          const res = await fetchFn(`https://api.github.com/repos/${options.repository}/pulls?state=open&per_page=100`, {
            headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return { data: await res.json() };
        },
      },
    },
  };

  const processMock = {
    env: {
      JULES_API_KEY: options.julesApiKey || '',
      GITHUB_TOKEN: options.token || '',
    },
  };

  // Replace ${{ inputs.issue_number }} and ${{ inputs.dry_run }} expressions in script template for test evaluation
  const adaptedScript = scriptCode
    .replace(/'\${{\s*inputs\.issue_number\s*}}'/g, JSON.stringify(options.issueNumber ? String(options.issueNumber) : ''))
    .replace(/'\${{\s*inputs\.dry_run\s*}}'/g, JSON.stringify(String(options.dryRun)));

  // Evaluate production workflow script
  const scriptRunner = new Function(
    'github',
    'context',
    'core',
    'process',
    'fetch',
    `
    return (async () => {
      ${adaptedScript}
    })();
    `
  );

  try {
    await scriptRunner(
      mockGithub,
      mockContext,
      mockCore,
      processMock,
      fetchFn
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    mockCore.setFailed(`Unhandled script exception: ${msg}`);
  }

  // Parse result logs
  let selectedNumber: number | undefined;
  let selectedTitle: string | undefined;

  for (const log of infoLogs) {
    const match = log.match(/✅ Selected Issue #(\d+):\s*"([^"]+)"/);
    if (match) {
      selectedNumber = parseInt(match[1], 10);
      selectedTitle = match[2];
    }
  }

  let payload: PreflightResult['dispatchPayload'];
  const payloadLog = infoLogs.find((l) => l.includes('Official Jules Session Payload:\n'));
  if (payloadLog) {
    const jsonStr = payloadLog.replace('Official Jules Session Payload:\n', '');
    try {
      payload = JSON.parse(jsonStr);
    } catch {
      // ignore JSON parse
    }
  }

  return {
    success: !isFailed,
    issueNumber: selectedNumber,
    issueTitle: selectedTitle,
    dryRun: options.dryRun,
    dispatchPayload: payload,
    liveDispatchTriggered: !options.dryRun && !isFailed,
    errors: failedErrors,
  };
}
