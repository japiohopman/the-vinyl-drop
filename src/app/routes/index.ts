import { Router, Request, Response } from 'express';
import { getHomePage } from '../controllers/homeController';
import { getDesignSystemPage, postDesignSystemDemo } from '../controllers/designSystemController';

const router = Router();

router.get('/', getHomePage);

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
