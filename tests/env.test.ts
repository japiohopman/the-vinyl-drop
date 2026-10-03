import { describe, it, expect } from 'vitest';
import { getEnv } from '../src/config/env.js';

describe('Environment Configuration Validation', () => {
  it('parses valid environment variables with defaults', () => {
    const env = getEnv({
      PORT: '4000',
      NODE_ENV: 'test',
      APP_URL: 'http://localhost:4000',
    });

    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('test');
    expect(env.APP_URL).toBe('http://localhost:4000');
  });

  it('throws error when required variable format is invalid', () => {
    expect(() => {
      getEnv({
        PORT: 'invalid_port',
        NODE_ENV: 'test',
        APP_URL: 'http://localhost:3000',
      });
    }).toThrow('Environment validation failed');
  });
});
