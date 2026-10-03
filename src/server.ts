import { createApp } from './app';
import { config } from './config/env';

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`The Vinyl Drop listening on port ${config.PORT} [${config.NODE_ENV}]`);
});
