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

const router = Router();

router.get('/signup', getSignUpPage);
router.post('/signup', postSignUp);

router.get('/login', getLoginPage);
router.post('/login', postLogin);

router.get('/google', getGoogleOAuth);
router.get('/callback', getAuthCallback);

router.post('/logout', postLogout);
router.get('/logout', postLogout);

export default router;
