import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Server listening on ${env.APP_URL} (Port ${env.PORT}) in ${env.NODE_ENV} mode`);
});
