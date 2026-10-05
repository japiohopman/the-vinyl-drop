import { Router } from 'express';
import {
  getSignUpPage,
  postSignUp,
  getLoginPage,
  postLogin,
  getGoogleOAuth,
  getAuthCallback,
  postLogout,
} from '../controllers/authController';
import { validateSameOrigin } from '../middleware/csrf';

const router = Router();

router.get('/signup', getSignUpPage);
router.post('/signup', validateSameOrigin, postSignUp);

router.get('/login', getLoginPage);
router.post('/login', validateSameOrigin, postLogin);

router.get('/google', getGoogleOAuth);
router.get('/callback', getAuthCallback);

// Logout must strictly be POST-only
router.post('/logout', validateSameOrigin, postLogout);

export default router;
