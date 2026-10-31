import { createApp } from './app';
import { config } from './config/env';
import { startRateLimitCleanup } from './app/services/rateLimitService';

const app = createApp();
startRateLimitCleanup();

app.listen(config.PORT, () => {
  console.log(`The Vinyl Drop listening on port ${config.PORT} [${config.NODE_ENV}]`);
});
