import { Router } from 'express';
import {
  getCurrentProfile,
  getPublicProfile,
  getEditProfilePage,
  postEditProfile,
} from '../controllers/profileController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/profile', requireAuth, getCurrentProfile);
router.get('/profile/edit', requireAuth, getEditProfilePage);
router.post('/profile/edit', requireAuth, postEditProfile);
router.get('/profiles/:username', getPublicProfile);

export default router;
