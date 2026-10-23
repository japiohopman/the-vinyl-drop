import path from 'path';
import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import request from 'supertest';
import { flashMiddleware, setFlashCookie, FLASH_COOKIE_NAME } from '../src/app/middleware/flash';
import { createApp } from '../src/app';
import { getIconSvg } from '../src/app/utils/iconRegistry';

describe('Flash Messages and Toast System', () => {
  describe('flashMiddleware Unit Tests', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let nextFn: jest.Mock;

    beforeEach(() => {
      mockReq = { query: {}, cookies: {} };
      mockRes = {
        locals: {},
        cookie: jest.fn(),
        clearCookie: jest.fn(),
      };
      nextFn = jest.fn();
    });

    it('does not allow URL parameters to manufacture success, error, or info messages', () => {
      mockReq.query = {
        success: 'Forged success',
        error: 'Forged error',
        flash: 'Forged info',
      };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.locals?.flashMessages).toEqual([]);
      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('sets a short-lived signed HTTP-only cookie for server-issued feedback', () => {
      setFlashCookie(mockRes as Response, 'success', 'Saved changes');

      expect(mockRes.cookie).toHaveBeenCalledWith(
        FLASH_COOKIE_NAME,
        expect.stringMatching(/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/i),
        expect.objectContaining({
          httpOnly: true,
          maxAge: 10000,
          path: '/',
          sameSite: 'lax',
        })
      );
    });

    it('accepts a valid signed cookie once and clears it', () => {
      setFlashCookie(mockRes as Response, 'success', 'Photo uploaded cleanly.');
      const token = (mockRes.cookie as jest.Mock).mock.calls[0][1] as string;

      mockReq.cookies = { [FLASH_COOKIE_NAME]: token };
      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.locals?.flashMessages).toEqual([
        { type: 'success', message: 'Photo uploaded cleanly.' },
      ]);
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        FLASH_COOKIE_NAME,
        expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
      );
    });

    it('rejects a tampered flash cookie instead of treating it as success', () => {
      setFlashCookie(mockRes as Response, 'success', 'Photo uploaded cleanly.');
      const token = (mockRes.cookie as jest.Mock).mock.calls[0][1] as string;
      const lastChar = token.slice(-1);
      const tamperedToken = token.slice(0, -1) + (lastChar === '0' ? '1' : '0');
      mockReq.cookies = { [FLASH_COOKIE_NAME]: tamperedToken };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.locals?.flashMessages).toEqual([]);
      expect(mockRes.clearCookie).toHaveBeenCalledWith(
        FLASH_COOKIE_NAME,
        expect.objectContaining({ path: '/' })
      );
    });

    it('rejects an expired signed flash cookie', () => {
      const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
      try {
        setFlashCookie(mockRes as Response, 'success', 'Expired success');
        const token = (mockRes.cookie as jest.Mock).mock.calls[0][1] as string;
        now.mockReturnValue(11001);
        mockReq.cookies = { [FLASH_COOKIE_NAME]: token };

        flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

        expect(mockRes.locals?.flashMessages).toEqual([]);
        expect(mockRes.clearCookie).toHaveBeenCalled();
      } finally {
        now.mockRestore();
      }
    });

    it('does not set an empty flash cookie', () => {
      setFlashCookie(mockRes as Response, 'success', '   ');
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

    it('escapes message text rather than interpreting it as HTML', async () => {
      const html = await ejs.renderFile(flashTemplatePath, {
        flashMessages: [{ type: 'success', message: '<script>alert(1)</script>' }],
        getIconSvg,
      });

      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
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
    it('shows a server-issued message after redirect once, then consumes the cookie', async () => {
      const app = express();
      app.use(cookieParser());
      app.use(flashMiddleware);
      app.get('/server-confirmed-action', (_req, res) => {
        setFlashCookie(res, 'success', 'Action completed.');
        res.redirect('/target');
      });
      app.get('/target', (_req, res) => res.json({ messages: res.locals.flashMessages }));

      const agent = request.agent(app);
      const redirectResponse = await agent.get('/server-confirmed-action');
      expect(redirectResponse.status).toBe(302);
      expect(redirectResponse.headers.location).toBe('/target');

      const firstRender = await agent.get('/target');
      expect(firstRender.body.messages).toEqual([
        { type: 'success', message: 'Action completed.' },
      ]);

      const secondRender = await agent.get('/target');
      expect(secondRender.body.messages).toEqual([]);
    });
  });

  describe('Application Shell Integration Tests', () => {
    const app = createApp();

    it('does not render a fabricated success toast from a URL parameter', async () => {
      const response = await request(app).get('/design-system?success=TestSuccess');

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('TestSuccess');
    });

    it('does not render a fabricated error banner from a URL parameter', async () => {
      const response = await request(app).get('/design-system?error=TestError');

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('TestError');
    });
  });
});
