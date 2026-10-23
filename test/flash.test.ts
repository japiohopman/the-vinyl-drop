import path from 'path';
import ejs from 'ejs';
import request from 'supertest';
import { Request, Response } from 'express';
import { flashMiddleware, setFlashCookie, FLASH_COOKIE_NAME } from '../src/app/middleware/flash';
import { createApp } from '../src/app';
import { getIconSvg } from '../src/app/utils/iconRegistry';

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

    it('should extract success message from query params', () => {
      mockReq.query = { success: 'Profile updated successfully.' };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.locals?.flashMessages).toEqual([
        { type: 'success', message: 'Profile updated successfully.' },
      ]);
    });

    it('should extract error message from query params', () => {
      mockReq.query = { error: 'Invalid input provided.' };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.locals?.flashMessages).toEqual([
        { type: 'error', message: 'Invalid input provided.' },
      ]);
    });

    it('should parse and clear tvd-flash cookie', () => {
      mockReq.cookies = {
        [FLASH_COOKIE_NAME]: JSON.stringify({
          type: 'success',
          message: 'Photo uploaded cleanly.',
        }),
      };

      flashMiddleware(mockReq as Request, mockRes as Response, nextFn);

      expect(mockRes.clearCookie).toHaveBeenCalledWith(FLASH_COOKIE_NAME, { path: '/' });
      expect(mockRes.locals?.flashMessages).toEqual([
        { type: 'success', message: 'Photo uploaded cleanly.' },
      ]);
    });

    it('should handle setFlashCookie helper correctly', () => {
      setFlashCookie(mockRes as Response, 'success', 'Saved changes');

      expect(mockRes.cookie).toHaveBeenCalledWith(
        FLASH_COOKIE_NAME,
        JSON.stringify({ type: 'success', message: 'Saved changes' }),
        expect.objectContaining({
          httpOnly: true,
          path: '/',
          sameSite: 'lax',
        })
      );
    });
  });

  describe('flash.ejs View Partial Template Tests', () => {
    const flashTemplatePath = path.resolve(__dirname, '../views/partials/flash.ejs');

    it('should render success toast inside polite live region with confirmed icon and close button', async () => {
      const html = await ejs.renderFile(flashTemplatePath, {
        flashMessages: [{ type: 'success', message: 'Listing published successfully!' }],
        getIconSvg,
      });

      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('toast toast-success');
      expect(html).toContain('Listing published successfully!');
      expect(html).toContain('aria-label="Dismiss notification"');
      expect(html).toContain('data-auto-dismiss="true"');
      expect(html).toContain('icon-confirmed');
      expect(html).toContain('icon-close');
    });

    it('should render persistent error banner inside assertive live region', async () => {
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

  describe('Application Shell Integration Tests', () => {
    const app = createApp();

    it('should render success toast on GET /design-system?success=TestSuccess', async () => {
      const response = await request(app).get('/design-system?success=TestSuccess');

      expect(response.status).toBe(200);
      expect(response.text).toContain('role="status"');
      expect(response.text).toContain('aria-live="polite"');
      expect(response.text).toContain('TestSuccess');
      expect(response.text).toContain('/js/toast.js');
    });

    it('should render persistent error banner on GET /design-system?error=TestError', async () => {
      const response = await request(app).get('/design-system?error=TestError');

      expect(response.status).toBe(200);
      expect(response.text).toContain('role="alert"');
      expect(response.text).toContain('aria-live="assertive"');
      expect(response.text).toContain('TestError');
    });
  });
});
