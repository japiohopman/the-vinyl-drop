import { Router, Request, Response } from 'express';
import { getHomePage } from '../controllers/homeController';
import { getBrowsePage, getSearchPage, getDigBrowsePage, getResponsiveDigPage } from '../controllers/browseController';
import { getActivityPage } from '../controllers/activityController';
import { getContactPage, postContactMessage, getCommunityRulesPage, getPrivacyNoticePage, getTermsOfUsePage, getInstallPage, getOptionsPage } from '../controllers/infoController';
import { getDesignSystemPage, postDesignSystemDemo } from '../controllers/designSystemController';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import { rateLimits } from '../services/rateLimitService';
import { getCreateCustomReleasePage } from '../controllers/releaseController';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import listingRoutes from './listingRoutes';
import releaseRoutes from './releaseRoutes';
import messagingRoutes from './messagingRoutes';
import { getCatalogueSuggestions } from '../controllers/catalogueSearchController';
import { getPeopleSearchPage, getPeopleSuggestions } from '../controllers/peopleSearchController';

const router = Router();

router.get('/', getHomePage);
router.get('/browse/dig', getDigBrowsePage);
router.get('/dig', getResponsiveDigPage);
router.get('/browse', getBrowsePage);
router.get('/search', getSearchPage);
router.get('/api/catalogue-suggestions', rateLimits.catalogueSuggestion, getCatalogueSuggestions);
router.get('/api/people-suggestions', rateLimits.catalogueSuggestion, getPeopleSuggestions);
router.get('/people', getPeopleSearchPage);
router.get('/activity', getActivityPage);
router.get('/contact', getContactPage);
router.get('/install', getInstallPage);
router.get('/options', getOptionsPage);
router.post('/contact', validateSameOrigin, rateLimits.contact, postContactMessage);
router.get('/community-rules', getCommunityRulesPage);
router.get('/terms', getTermsOfUsePage);
router.get('/privacy', getPrivacyNoticePage);

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/releases', releaseRoutes);
router.use('/messages', messagingRoutes);

// The + DROP destination starts the Discogs-assisted custom release flow.
router.get('/drop/new', requireAuth, getCreateCustomReleasePage);

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
