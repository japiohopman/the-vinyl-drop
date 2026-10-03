import { runJulesDispatcher } from './julesDispatcher';

async function main(): Promise<void> {
  console.log('--- Jules Issue Dispatcher & Preflight ---');

  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const julesApiKey = process.env.JULES_API_KEY;
  const rawIssueNumber = process.env.ISSUE_NUMBER;
  const dryRunInput = process.env.DRY_RUN;

  if (!repository) {
    console.error('Error: GITHUB_REPOSITORY environment variable is not set.');
    process.exit(1);
  }

  const dryRun = dryRunInput === 'false' ? false : true;
  let issueNumber: number | undefined;

  if (rawIssueNumber && rawIssueNumber.trim() !== '') {
    issueNumber = parseInt(rawIssueNumber.trim(), 10);
    if (isNaN(issueNumber)) {
      console.error(`Error: Invalid ISSUE_NUMBER provided: "${rawIssueNumber}"`);
      process.exit(1);
    }
  }

  console.log(`Repository: ${repository}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE DISPATCH'}`);
  if (issueNumber) {
    console.log(`Target Issue: #${issueNumber}`);
  } else {
    console.log(`Target Issue: (automatic selection from ready open issues)`);
  }

  const result = await runJulesDispatcher({
    repository,
    token,
    julesApiKey,
    issueNumber,
    dryRun,
  });

  if (result.success) {
    console.log(`\n✅ Preflight Succeeded!`);
    console.log(`Selected Issue: #${result.issueNumber} — "${result.issueTitle}"`);
    console.log(`Primary Specialist: ${result.selectedIssue?.primarySpecialist || 'N/A'}`);
    console.log(`Secondary Specialist: ${result.selectedIssue?.secondarySpecialist || 'N/A'}`);
    if (result.dryRun) {
      console.log(`\n[DRY RUN SUMMARY] No live Jules API calls were made.`);
      console.log(`Payload prepared for dispatch:`, JSON.stringify(result.dispatchPayload, null, 2));
    } else {
      console.log(`\n[LIVE DISPATCH] Live Jules API call triggered: ${result.liveDispatchTriggered}`);
    }
    process.exit(0);
  } else {
    console.error(`\n❌ Preflight Failed! Fail-closed enforced.`);
    if (result.errors && result.errors.length > 0) {
      console.error('Reasons:');
      for (const err of result.errors) {
        console.error(`  - ${err}`);
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled exception in Jules dispatcher runner:', err);
  process.exit(1);
});
