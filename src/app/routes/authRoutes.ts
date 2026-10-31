import { Router } from 'express';
import {
  getSignUpPage,
  postSignUp,
  getLoginPage,
  postLogin,
  getGoogleOAuth,
  postGoogleSignupStart,
  getAuthCallback,
  getForgotPasswordPage,
  postForgotPassword,
  getResetPasswordPage,
  postResetPassword,
  postLogout,
} from '../controllers/authController';
import { validateSameOrigin } from '../middleware/csrf';
import { rateLimits } from '../services/rateLimitService';

const router = Router();

router.get('/signup', getSignUpPage);
router.post('/signup', validateSameOrigin, rateLimits.signUp, postSignUp);

router.get('/login', getLoginPage);
router.post('/login', validateSameOrigin, rateLimits.login, postLogin);

router.post('/google/start', validateSameOrigin, rateLimits.googleOAuthStart, postGoogleSignupStart);
router.get('/google', rateLimits.googleOAuthStart, getGoogleOAuth);
router.get('/callback', getAuthCallback);

router.get('/forgot-password', getForgotPasswordPage);
router.post('/forgot-password', validateSameOrigin, rateLimits.forgotPassword, postForgotPassword);

router.get('/reset-password', getResetPasswordPage);
router.post('/reset-password', validateSameOrigin, rateLimits.resetPassword, postResetPassword);

// Logout must strictly be POST-only
router.post('/logout', validateSameOrigin, postLogout);

export default router;
