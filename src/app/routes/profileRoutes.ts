import { Router } from 'express';
import {
  getCurrentProfile,
  getPublicProfile,
  getPublicProfileCrate,
  getEditProfilePage,
  postEditProfile,
  postUploadProfileAvatar,
  postRemoveProfileAvatar,
} from '../controllers/profileController';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import { multipartUploadHandler } from '../middleware/upload';
import { profileAvatarUploadRateLimit } from '../services/rateLimitService';

const router = Router();

router.get('/profile', requireAuth, getCurrentProfile);
router.get('/profile/edit', requireAuth, getEditProfilePage);
router.post('/profile/edit', requireAuth, validateSameOrigin, postEditProfile);
router.post('/profile/avatar', requireAuth, validateSameOrigin, profileAvatarUploadRateLimit, multipartUploadHandler, postUploadProfileAvatar);
router.post('/profile/avatar/remove', requireAuth, validateSameOrigin, rateLimits.profileAvatarUpload, postRemoveProfileAvatar);
router.get('/profiles/:username/crate', getPublicProfileCrate);
router.get('/profile/:username/crate', getPublicProfileCrate);
router.get('/profiles/:username', getPublicProfile);
router.get('/profile/:username', getPublicProfile);

export default router;
