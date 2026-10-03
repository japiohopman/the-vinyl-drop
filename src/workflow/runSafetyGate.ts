import * as fs from 'fs';
import { runSafetyGate } from './prSafetyGate';

async function main(): Promise<void> {
  console.log('--- Phase Safety Gate ---');

  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const envPrNumber = process.env.PR_NUMBER;

  if (!repository) {
    console.error('Error: GITHUB_REPOSITORY environment variable is not set.');
    process.exit(1);
  }

  let prBody: string | undefined;
  let prNumber: number | undefined;

  if (envPrNumber) {
    prNumber = parseInt(envPrNumber, 10);
  }

  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
      if (eventData.pull_request) {
        prBody = eventData.pull_request.body || undefined;
        if (!prNumber && eventData.pull_request.number) {
          prNumber = eventData.pull_request.number;
        }
      } else if (!prNumber && eventData.number) {
        prNumber = eventData.number;
      }
    } catch (err) {
      console.error(`Error reading event file at ${eventPath}:`, err);
      process.exit(1);
    }
  }

  if (!prBody) {
    prBody = process.env.PR_BODY;
  }

  // If PR body is missing or empty, fetch live PR body via GitHub REST API
  if ((!prBody || prBody.trim() === '') && prNumber && token) {
    try {
      console.log(`Fetching live PR #${prNumber} from GitHub API...`);
      const url = `https://api.github.com/repos/${repository}/pulls/${prNumber}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'VinylDrop-SafetyGate',
        },
      });
      if (response.ok) {
        const prData = (await response.json()) as { body?: string };
        prBody = prData.body || '';
      } else {
        console.warn(`GitHub API returned status ${response.status} when fetching PR #${prNumber}.`);
      }
    } catch (err) {
      console.warn('Warning: Failed to fetch PR body from GitHub API:', err);
    }
  }

  console.log(`Repository: ${repository}`);
  if (prNumber) {
    console.log(`Pull Request: #${prNumber}`);
  }
  console.log(`Validating PR body contract and governing issue status...`);

  const result = await runSafetyGate(prBody, repository, token);

  if (result.success) {
    console.log(`✅ Safety Gate passed!`);
    console.log(`Governing Issue: #${result.issueNumber}`);
    console.log(`PR Status: ${result.status}`);
    process.exit(0);
  } else {
    console.error(`❌ Safety Gate failed!`);
    if (result.errors.length > 0) {
      console.error('Errors found:');
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled safety gate exception:', err);
  process.exit(1);
});
