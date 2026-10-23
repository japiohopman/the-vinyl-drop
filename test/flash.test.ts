import crypto from 'crypto';
import path from 'path';
import ejs from 'ejs';
import request from 'supertest';
import express, { Request, Response } from 'express';
import {
  flashMiddleware,
  setFlashCookie,
  verifyAndParseFlashCookie,
  FLASH_COOKIE_NAME,
} from '../src/app/middleware/flash';
import { createApp } from '../src/app';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { config } from '../src/config/env';
import { shouldUseSecureCookies } from '../src/config/cookiePolicy';

/** Sign test payloads with the same key used by the flash-cookie verifier. */
function signFlashTestPayload(payload: Record<string, unknown>): string {
  const payloadText = JSON.stringify(payload);
  const secret = config.RECOVERY_SIGNING_SECRET || 'fallback-secret-for-flash-messages';
  const signature = crypto
    .createHmac('sha256', secret)
    .update('the-vinyl-drop:tvd-flash:v1:')
    .update(payloadText)
    .digest('hex');
  return `${payloadText}.${signature}`;
}

describe('Flash Messages and Toast System', () => {
  describe('flashMiddleware Unit Tests', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let nextFn: jest.Mock;

    beforeEach(() => {
      mockReq = {
        query: {},
        cookies: {},
      };
      mockRes = {
        locals: {},
        cookie: jest.fn(),
        clearCookie: jest.fn(),
      };
      nextFn = jest.fn();
    });

    it('does not allow URL parameters to manufacture success, error, or info messages', () => {
      mockReq.query = {
        success: 'ForgedSuccess',
        error: 'ForgedError',
        flash: 'ForgedFlash',
      };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.locals?.flashMessages).toEqual([]);
    });

    it('sets a short-lived signed HTTP-only cookie for server-issued feedback', () => {
      setFlashCookie(mockRes as Response, 'success', 'Saved changes');

      expect(mockRes.cookie).toHaveBeenCalledWith(
        FLASH_COOKIE_NAME,
        expect.stringMatching(/^\{.*\}\.[a-f0-9]{64}$/),
        expect.objectContaining({
          httpOnly: true,
          secure: shouldUseSecureCookies(config.NODE_ENV),
          maxAge: 15000,
          path: '/',
          sameSite: 'lax',
        })
      );
    });

    it('accepts a valid signed cookie once and clears it', () => {
      let setCookieValue = '';
      const captureRes: Partial<Response> = {
        cookie: jest.fn((name, val) => {
          if (name === FLASH_COOKIE_NAME) setCookieValue = val;
          return captureRes as Response;
        }),
        clearCookie: jest.fn(() => captureRes as Response),
        locals: {},
      };

      setFlashCookie(captureRes as Response, 'success', 'Verified action completed');

      mockReq.cookies = {
        [FLASH_COOKIE_NAME]: setCookieValue,
      };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(FLASH_COOKIE_NAME, { path: '/' });
      expect(mockRes.locals?.flashMessages).toEqual([
        { type: 'success', message: 'Verified action completed' },
      ]);
    });

    it('rejects raw HMAC signatures that are not scoped to flash messages', () => {
      const payloadText = JSON.stringify({
        type: 'success',
        message: 'Signed for a different purpose',
        expiresAt: Date.now() + 10000,
      });
      const secret = config.RECOVERY_SIGNING_SECRET || 'fallback-secret-for-flash-messages';
      const unscopedSignature = crypto.createHmac('sha256', secret).update(payloadText).digest('hex');

      expect(verifyAndParseFlashCookie(`${payloadText}.${unscopedSignature}`)).toBeNull();
    });

    it('rejects a tampered flash cookie instead of treating it as success', () => {
      let setCookieValue = '';
      const captureRes: Partial<Response> = {
        cookie: jest.fn((name, val) => {
          if (name === FLASH_COOKIE_NAME) setCookieValue = val;
          return captureRes as Response;
        }),
        clearCookie: jest.fn(() => captureRes as Response),
        locals: {},
      };

      setFlashCookie(captureRes as Response, 'success', 'Legitimate message');

      // Tamper payload portion of signed cookie
      const tamperedCookie = setCookieValue.replace('Legitimate', 'Tampered');
      mockReq.cookies = {
        [FLASH_COOKIE_NAME]: tamperedCookie,
      };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(FLASH_COOKIE_NAME, { path: '/' });
      expect(mockRes.locals?.flashMessages).toEqual([]);
    });

    it('rejects missing, invalid, or expired expiresAt timestamps even with a valid signature', () => {
      const expiredCookie = signFlashTestPayload({
        type: 'success',
        message: 'Old message',
        expiresAt: Date.now() - 1000,
      });
      expect(verifyAndParseFlashCookie(expiredCookie)).toBeNull();

      const missingExpiryCookie = signFlashTestPayload({
        type: 'success',
        message: 'No expiry',
      });
      expect(verifyAndParseFlashCookie(missingExpiryCookie)).toBeNull();

      const invalidExpiryCookie = signFlashTestPayload({
        type: 'success',
        message: 'Invalid expiry',
        expiresAt: 'tomorrow',
      });
      expect(verifyAndParseFlashCookie(invalidExpiryCookie)).toBeNull();

      const nonFiniteExpiryCookie = signFlashTestPayload({
        type: 'success',
        message: 'Non-finite expiry',
        expiresAt: null,
      });
      expect(verifyAndParseFlashCookie(nonFiniteExpiryCookie)).toBeNull();
    });

    it('rejects signed cookies with unallowed types or oversized messages and cookies', () => {
      const invalidTypeCookie = signFlashTestPayload({
        type: 'unallowed_type',
        message: 'Test message',
        expiresAt: Date.now() + 10000,
      });
      expect(verifyAndParseFlashCookie(invalidTypeCookie)).toBeNull();

      const oversizedMessageCookie = signFlashTestPayload({
        type: 'success',
        message: 'A'.repeat(2001),
        expiresAt: Date.now() + 10000,
      });
      expect(verifyAndParseFlashCookie(oversizedMessageCookie)).toBeNull();

      expect(verifyAndParseFlashCookie('x'.repeat(4097))).toBeNull();
    });

    it('does not set an empty or oversized flash cookie', () => {
      setFlashCookie(mockRes as Response, 'success', '   ');
      expect(mockRes.cookie).not.toHaveBeenCalled();

      setFlashCookie(mockRes as Response, 'success', 'B'.repeat(2001));
      expect(mockRes.cookie).not.toHaveBeenCalled();
    });
  });

  describe('flash.ejs View Partial Template Tests', () => {
    const flashTemplatePath = path.resolve(__dirname, '../views/partials/flash.ejs');

    it('renders success toast inside a polite live region with a keyboard-operable close button', async () => {
      const html = await ejs.renderFile(flashTemplatePath, {
        flashMessages: [{ type: 'success', message: 'Listing published successfully!' }],
        getIconSvg,
      });

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('toast toast-success');
      expect(html).toContain('Listing published successfully!');
      expect(html).toContain('aria-label="Dismiss notification"');
      expect(html).toContain('data-dismiss-toast');
      expect(html).toContain('data-auto-dismiss="true"');
      expect(html).toContain('icon-confirmed');
      expect(html).toContain('icon-close');
    });

    it('renders info toast with auto-dismiss attributes', async () => {
      const html = await ejs.renderFile(flashTemplatePath, {
        flashMessages: [{ type: 'info', message: 'System maintenance scheduled' }],
        getIconSvg,
      });

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('toast toast-info');
      expect(html).toContain('System maintenance scheduled');
      expect(html).toContain('data-auto-dismiss="true"');
    });

    it('escapes message text rather than interpreting it as HTML', async () => {
      const html = await ejs.renderFile(flashTemplatePath, {
        flashMessages: [{ type: 'success', message: '<script>alert("xss")</script>' }],
        getIconSvg,
      });

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('renders an actionable error banner without auto-dismiss behavior', async () => {
      const html = await ejs.renderFile(flashTemplatePath, {
        flashMessages: [{ type: 'error', message: 'File size exceeds maximum limit.' }],
        getIconSvg,
      });

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('flash-error-banner');
      expect(html).toContain('Attention required');
      expect(html).toContain('File size exceeds maximum limit.');
      expect(html).not.toContain('data-auto-dismiss="true"');
    });
  });

  describe('Signed flash redirect integration', () => {
    let testApp: express.Express;

    beforeAll(() => {
      testApp = express();
      testApp.get('/test/emit-flash', (_req, res) => {
        setFlashCookie(res, 'success', 'Profile saved successfully.');
        res.redirect('/design-system');
      });
      testApp.use(createApp());
    });

    it('shows a server-issued message after redirect once, then consumes the cookie', async () => {
      const agent = request.agent(testApp);

      const resRedirect = await agent.get('/test/emit-flash');
      expect(resRedirect.status).toBe(302);

      const resFollow = await agent.get(resRedirect.header.location);
      expect(resFollow.status).toBe(200);
      expect(resFollow.text).toContain('role="status"');
      expect(resFollow.text).toContain('Profile saved successfully.');

      // Second request using same agent shows cookie was consumed and cleared
      const resSecond = await agent.get('/design-system');
      expect(resSecond.status).toBe(200);
      expect(resSecond.text).not.toContain('Profile saved successfully.');
    });
  });

  describe('Application Shell Integration Tests', () => {
    const app = createApp();

    it('does not render a fabricated success toast from a URL parameter', async () => {
      const response = await request(app).get('/design-system?success=FabricatedSuccess');

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('FabricatedSuccess');
    });

    it('does not render a fabricated error banner from a URL parameter', async () => {
      const response = await request(app).get('/design-system?error=FabricatedError');

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('FabricatedError');
    });
  });
});
