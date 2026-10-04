import { runCliMain } from '../src/workflow/chatgptReviewRelay';

runCliMain().catch((err) => {
  console.error('Relay execution failed:', err);
  process.exit(1);
});
