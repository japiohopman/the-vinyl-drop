import { Router, Request, Response } from 'express';
import { getHomePage } from '../controllers/homeController';
import { getDesignSystemPage, postDesignSystemDemo } from '../controllers/designSystemController';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import listingRoutes from './listingRoutes';

const router = Router();

router.get('/', getHomePage);

router.use('/auth', authRoutes);
router.use('/listings', listingRoutes);
router.use('/drop', listingRoutes);
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
