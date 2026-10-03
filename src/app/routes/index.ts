import { Router, Request, Response } from 'express';
import { getHomePage } from '../controllers/homeController';

const router = Router();

router.get('/', getHomePage);

router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
