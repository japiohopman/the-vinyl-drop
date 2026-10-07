import { Router, Request, Response } from 'express';
import { getHomePage } from '../controllers/homeController';
import { getBrowsePage, getSearchPage } from '../controllers/browseController';
import { getDesignSystemPage, postDesignSystemDemo } from '../controllers/designSystemController';
import { requireAuth } from '../middleware/auth';
import { getSelectReleasePage } from '../controllers/listingController';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import listingRoutes from './listingRoutes';
import releaseRoutes from './releaseRoutes';

const router = Router();

router.get('/', getHomePage);
router.get('/browse', getBrowsePage);
router.get('/search', getSearchPage);

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/releases', releaseRoutes);

// Narrow route compatibility for the + DROP product navigation contract
router.get('/drop/new', requireAuth, getSelectReleasePage);

router.use('/', profileRoutes);

router.get('/design-system', getDesignSystemPage);
router.post('/design-system/demo', postDesignSystemDemo);

router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
