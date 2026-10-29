/// <reference lib="dom" />

import { readFullStylesheetSource } from './stylesheetTestHelper';
import ejs from 'ejs';
import fs from 'fs';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import type { NextFunction, Request, Response } from 'express';
import { getIconSvg } from '../src/app/utils/iconRegistry';
import { getListingCommentsPage, postCreateComment } from '../src/app/controllers/listingController';
import { addComment, getListingComments } from '../src/app/services/commentService';
import { getListingWithDetailsForView } from '../src/app/services/listingService';
import { renderWithLayout } from '../src/app/utils/render';
import { ValidationError } from '../src/app/services/errors';

jest.mock('../src/app/services/commentService', () => ({
  getListingComments: jest.fn(),
  addComment: jest.fn(),
}));

jest.mock('../src/app/services/listingService', () => ({
  getListingWithDetailsForView: jest.fn(),
}));

jest.mock('../src/app/services/favoriteService', () => ({
  isListingFavorited: jest.fn(),
}));

jest.mock('../src/app/utils/render', () => ({
  renderWithLayout: jest.fn(),
}));

const listingId = 'listing-220';
const seller = {
  id: 'seller-220',
  username: 'seller_one',
  displayName: 'Seller One',
  avatarUrl: null,
  location: 'Amsterdam',
};
const listingDetails = {
  listing: {
    id: listingId,
    sellerId: seller.id,
    status: 'published',
    tradeAvailable: false,
    price: 2400,
    description: 'A clean copy for testing.',
  },
  physicalCopy: {
    mediaCondition: 'VG+',
    sleeveCondition: 'VG',
    notes: null,
  },
  release: {
    id: 'release-220',
    title: 'Blue Spirits',
    artist: 'Blue Note All-Stars',
    format: 'Vinyl, LP',
    releaseYear: 1965,
    label: 'Blue Note',
    catalogueNumber: 'BST-84017',
    genre: 'Jazz',
    coverArtUrl: null,
  },
  seller,
  photos: [],
};
const sampleComment = {
  id: 'comment-1',
  authorId: seller.id,
  content: 'The sleeve is clean.',
  createdAt: new Date('2026-01-10T12:00:00.000Z'),
  author: seller,
};

const viewLocals = {
  listing: listingDetails.listing,
  physicalCopy: listingDetails.physicalCopy,
  release: listingDetails.release,
  seller,
  photos: [],
  comments: [sampleComment],
  priceFormatted: '€24.00',
  currentUser: { id: 'buyer-220' },
  isSeller: false,
  isFavorited: false,
  messagingEnabled: false,
};

describe('Listing comments UX (#220)', () => {
  jest.setTimeout(30000);

  const stylesheet = readFullStylesheetSource();
  const disclosureScript = fs.readFileSync(path.join(__dirname, '../public/js/listing-comments-disclosure.js'), 'utf8');
  const partialPath = path.join(__dirname, '../views/partials/comment-thread.ejs');
  const commentsViewPath = path.join(__dirname, '../views/listings/comments.ejs');
  const listingViewPath = path.join(__dirname, '../views/listings/show.ejs');
  const headerPath = path.join(__dirname, '../views/partials/header.ejs');
  const routesSource = fs.readFileSync(path.join(__dirname, '../src/app/routes/listingRoutes.ts'), 'utf8');

  let browser: Browser;
  let lastRender: { view: string; locals: Record<string, unknown> } | null = null;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    lastRender = null;
    (getListingWithDetailsForView as jest.Mock).mockResolvedValue(listingDetails);
    (getListingComments as jest.Mock).mockResolvedValue([sampleComment]);
    (addComment as jest.Mock).mockResolvedValue(sampleComment);
    (renderWithLayout as jest.Mock).mockImplementation((_res: Response, view: string, locals: Record<string, unknown>) => {
      lastRender = { view, locals };
    });
  });

  async function renderHeader(currentPath: string): Promise<string> {
    return ejs.renderFile(headerPath, {
      getIconSvg,
      currentPath,
      currentUser: null,
      currentProfile: null,
      messagingEnabled: false,
      betaInviteOnly: false,
    }, { filename: headerPath });
  }

  async function renderCommentsView(extra: Record<string, unknown> = {}): Promise<string> {
    return ejs.renderFile(commentsViewPath, {
      ...viewLocals,
      currentUser: null,
      commentsPage: true,
      ...extra,
    }, { filename: commentsViewPath });
  }

  async function renderListingView(extra: Record<string, unknown> = {}): Promise<string> {
    return ejs.renderFile(listingViewPath, {
      ...viewLocals,
      commentsInitiallyOpen: false,
      commentError: null,
      submittedContent: '',
      ...extra,
    }, { filename: listingViewPath });
  }

  function documentHtml(header: string, body: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="http://localhost/">
  <style>${stylesheet}</style>
</head>
<body>
  ${header}
  <main class="main-content container">${body}</main>
  <script>${disclosureScript}</script>
</body>
</html>`;
  }

  async function loadHtml(page: Page, html: string, width = 375, height = 812): Promise<void> {
    await page.setViewportSize({ width, height });
    await page.route('**/*', route => route.abort());
    await page.setContent(html);
  }

  it('uses one comments route and keeps the canonical POST endpoint', () => {
    expect(routesSource).toContain("router.get('/:id/comments', getListingCommentsPage)");
    expect(routesSource).toContain("router.post('/:id/comments', requireAuth, validateSameOrigin, postCreateComment)");
  });

  it('loads the shared thread and listing context for the focused comments route', async () => {
    const req = {
      params: { id: listingId },
      query: {},
      user: null,
    } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis() } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    await getListingCommentsPage(req, res, next);

    expect(getListingWithDetailsForView).toHaveBeenCalledWith(listingId, undefined);
    expect(getListingComments).toHaveBeenCalledWith(listingId, undefined);
    expect(renderWithLayout).toHaveBeenCalledWith(res, 'listings/comments', expect.objectContaining({
      commentsPage: true,
      listing: listingDetails.listing,
      comments: [sampleComment],
      currentUser: null,
    }), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('renders the shared thread with escaped text, seller identity, count, and the existing POST contract', async () => {
    const html = await ejs.renderFile(partialPath, {
      ...viewLocals,
      commentsPage: true,
      commentError: null,
      submittedContent: '',
    }, { filename: partialPath });

    expect(html).toContain('Community Discussion (1)');
    expect(html).toContain('action="/listings/listing-220/comments"');
    expect(html).toContain('name="returnTo" value="comments"');
    expect(html).toContain('class="seller-badge">Seller</span>');
    expect(html).toContain('The sleeve is clean.');
    expect(html).not.toContain('style="');
    expect(html).not.toContain('name="returnTo" value="thread"');

    const untrustedContent = await ejs.renderFile(partialPath, {
      ...viewLocals,
      comments: [{ ...sampleComment, content: '<script>alert(1)</script>' }],
      commentsPage: false,
      currentUser: viewLocals.currentUser,
    }, { filename: partialPath });
    expect(untrustedContent).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(untrustedContent).toContain('name="returnTo" value="thread"');

    const signedOutContent = await ejs.renderFile(partialPath, {
      ...viewLocals,
      commentsPage: false,
      currentUser: null,
    }, { filename: partialPath });
    expect(signedOutContent).toContain('/auth/login?next=%2Flistings%2Flisting-220');
  });

  it('shows the explicit empty state and zero count when a listing has no comments', async () => {
    const html = await ejs.renderFile(partialPath, {
      ...viewLocals,
      comments: [],
      commentsPage: true,
      currentUser: null,
      commentError: null,
      submittedContent: '',
    }, { filename: partialPath });

    expect(html).toContain('Community Discussion (0)');
    expect(html).toContain('No comments yet. Be the first to start the discussion!');
    expect(html).not.toContain('class="comment-card');
    expect(html).toContain('/auth/login?next=%2Flistings%2Flisting-220%2Fcomments');
  });

  it('renders listing context and a return link to the same listing without losing the sign-in next path', async () => {
    const html = await renderCommentsView();
    expect(html).toContain('<h1>Comments / Ask a question</h1>');
    expect(html).toContain('href="/listings/listing-220#comments-entry"');
    expect(html).toContain('Blue Spirits');
    expect(html).toContain('Blue Note All-Stars');
    expect(html).toContain('Listed by');
    expect(html).toContain('€24.00');
    expect(html).toContain('id="comments" class="comment-thread-section" aria-label="Listing comments" tabindex="-1"');
    expect(html).toContain('/auth/login?next=%2Flistings%2Flisting-220%2Fcomments');

    const signedInHtml = await renderCommentsView({ currentUser: { id: 'buyer-220' } });
    expect(signedInHtml).toContain('name="returnTo" value="comments"');
    expect(signedInHtml).toContain('action="/listings/listing-220/comments"');
  });

  it('routes mobile and desktop submissions back to the correct comment presentation', async () => {
    const reqMobile = {
      params: { id: listingId },
      body: { content: 'Can you confirm the pressing?', returnTo: 'comments' },
      user: { id: 'buyer-220' },
    } as unknown as Request;
    const resMobile = { redirect: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    await postCreateComment(reqMobile, resMobile, jest.fn() as unknown as NextFunction);
    expect(addComment).toHaveBeenCalledWith(listingId, 'buyer-220', 'Can you confirm the pressing?');
    expect(resMobile.redirect).toHaveBeenCalledWith('/listings/listing-220/comments#comments');

    jest.clearAllMocks();
    (addComment as jest.Mock).mockResolvedValue(sampleComment);
    const reqDesktop = {
      params: { id: listingId },
      body: { content: 'A desktop question', returnTo: 'thread' },
      user: { id: 'buyer-220' },
    } as unknown as Request;
    const resDesktop = { redirect: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    await postCreateComment(reqDesktop, resDesktop, jest.fn() as unknown as NextFunction);
    expect(resDesktop.redirect).toHaveBeenCalledWith('/listings/listing-220?commentsOpen=1#comments');
  });

  it('preserves submitted text and validation feedback in the correct presentation', async () => {
    (addComment as jest.Mock).mockRejectedValue(new ValidationError('Comment cannot be empty.'));

    const req = {
      params: { id: listingId },
      body: { content: '  ', returnTo: 'comments' },
      user: { id: 'buyer-220' },
    } as unknown as Request;
    const res = { redirect: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
    await postCreateComment(req, res, jest.fn() as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(renderWithLayout).toHaveBeenCalledWith(res, 'listings/comments', expect.objectContaining({
      commentsPage: true,
      commentError: 'Comment cannot be empty.',
      submittedContent: '  ',
    }), expect.any(Function));
    expect(lastRender?.locals.submittedContent).toBe('  ');
  });

  it('opens the desktop disclosure again when a desktop submission has a validation error', async () => {
    (addComment as jest.Mock).mockRejectedValue(new ValidationError('Comment cannot be empty.'));
    const req = {
      params: { id: listingId },
      body: { content: '  ', returnTo: 'thread' },
      user: { id: 'buyer-220' },
    } as unknown as Request;
    const res = { redirect: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;

    await postCreateComment(req, res, jest.fn() as unknown as NextFunction);

    expect(renderWithLayout).toHaveBeenCalledWith(res, 'listings/show', expect.objectContaining({
      commentsInitiallyOpen: true,
      commentError: 'Comment cannot be empty.',
      submittedContent: '  ',
    }), expect.any(Function));
  });

  it('renders a compact mobile comments entry with a contextual header back link and no overflow', async () => {
    const listingHtml = await renderListingView();
    expect(listingHtml).toContain('class="listing-comments-entry" id="comments-entry" tabindex="-1"');
    expect(listingHtml).toContain('aria-controls="comments" aria-expanded="false"');
    expect(listingHtml).toContain('aria-label="Comments / Ask a question, 1 comment"');
    expect(listingHtml).toContain('class="listing-comments-count">1</span>');
    expect(listingHtml).toContain('href="/listings/listing-220/comments"');

    const header = await renderHeader('/listings/listing-220/comments');
    expect(header).toContain('mobile-context-heading">COMMENTS</span>');
    expect(header).toContain('href="/listings/listing-220#comments-entry"');
    expect(header).toContain('aria-label="Back to listing"');

    const page = await browser.newPage();
    await loadHtml(page, documentHtml(await renderHeader('/listings/listing-220'), listingHtml), 375);
    expect(await page.locator('.listing-comments-entry').isVisible()).toBe(true);
    expect(await page.locator('.listing-comments-disclosure').isVisible()).toBe(false);
    const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
    await page.close();
  });

  it('uses a keyboard-accessible collapsed desktop disclosure with synchronized aria-expanded state', async () => {
    const listingHtml = await renderListingView();
    const page = await browser.newPage();
    await loadHtml(page, documentHtml(await renderHeader('/listings/listing-220'), listingHtml), 1280, 900);
    const details = page.locator('.listing-comments-disclosure');
    const summary = details.locator('summary');
    expect(await details.isVisible()).toBe(true);
    expect(await details.evaluate((element: HTMLDetailsElement) => element.open)).toBe(false);
    expect(await summary.getAttribute('aria-expanded')).toBe('false');

    await summary.focus();
    await summary.press('Enter');
    await page.waitForFunction(() => document.querySelector('.listing-comments-disclosure summary')?.getAttribute('aria-expanded') === 'true');
    expect(await details.evaluate((element: HTMLDetailsElement) => element.open)).toBe(true);

    await summary.press('Enter');
    await page.waitForFunction(() => document.querySelector('.listing-comments-disclosure summary')?.getAttribute('aria-expanded') === 'false');
    expect(await details.evaluate((element: HTMLDetailsElement) => element.open)).toBe(false);
    expect(await summary.evaluate(element => element === document.activeElement)).toBe(true);
    expect(await page.locator('.listing-comments-entry').isVisible()).toBe(false);
    await page.close();
  });

  it('keeps the focused comments screen usable at narrow phone and desktop widths', async () => {
    const html = await renderCommentsView({ currentUser: { id: 'buyer-220' } });
    const page = await browser.newPage();
    for (const width of [320, 360, 375, 390, 430, 768, 1280]) {
      await loadHtml(page, documentHtml(await renderHeader('/listings/listing-220/comments'), html), width, 900);
      const sizes = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
      expect(await page.locator('#comment-form').count()).toBe(1);
    }
    await page.close();
  });
});
