import { Router, Request, Response } from 'express';
import { getHomePage } from '../controllers/homeController';
import { getBrowsePage, getSearchPage, getDigBrowsePage } from '../controllers/browseController';
import { getActivityPage } from '../controllers/activityController';
import { getContactPage, postContactMessage, getCommunityRulesPage, getPrivacyNoticePage, getTermsOfUsePage } from '../controllers/infoController';
import { getDesignSystemPage, postDesignSystemDemo } from '../controllers/designSystemController';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import { getSelectReleasePage } from '../controllers/listingController';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import listingRoutes from './listingRoutes';
import releaseRoutes from './releaseRoutes';
import messagingRoutes from './messagingRoutes';

const router = Router();

router.get('/', getHomePage);
router.get('/browse/dig', getDigBrowsePage);
router.get('/browse', getBrowsePage);
router.get('/search', getSearchPage);
router.get('/activity', getActivityPage);
router.get('/contact', getContactPage);
router.post('/contact', validateSameOrigin, postContactMessage);
router.get('/community-rules', getCommunityRulesPage);
router.get('/terms', getTermsOfUsePage);
router.get('/privacy', getPrivacyNoticePage);

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/releases', releaseRoutes);
router.use('/messages', messagingRoutes);

// Narrow route compatibility for the + DROP product navigation contract
router.get('/drop/new', requireAuth, getSelectReleasePage);

router.get('/design-system', getDesignSystemPage);
router.post('/design-system/demo', postDesignSystemDemo);

router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.use('/', profileRoutes);

export default router;
