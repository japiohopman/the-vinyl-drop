import { Request, Response, NextFunction } from 'express';
import {
  signUpSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sanitizeRedirectUrl,
} from '../../validators/auth';
import { formatZodFormErrors, FormViewModel } from '../view-models/formViewModel';
import {
  signUp,
  login,
  getGoogleOAuthUrl,
  handleAuthCallback,
  sendPasswordResetEmail,
  updatePassword,
  signOut,
} from '../services/authService';
import {
  setAuthCookies,
  clearAuthCookies,
  setRecoveryCookie,
  clearRecoveryCookie,
  isRecoverySessionVerified,
} from '../middleware/auth';
import { renderWithLayout } from '../utils/render';
import { config } from '../../config/env';

export async function getSignUpPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      res.redirect('/profile');
      return;
    }

    const nextUrl = sanitizeRedirectUrl(req.query.next as string, '/profile');
    const form: FormViewModel = {
      values: { email: '', password: '', username: '', displayName: '' },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'auth/signup', {
      title: 'Sign Up — The Vinyl Drop',
      form,
      nextUrl,
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function postSignUp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nextUrl = sanitizeRedirectUrl((req.query.next as string) || req.body.next, '/profile');

    const result = signUpSchema.safeParse(req.body);
    if (!result.success) {
      const form = formatZodFormErrors(result.error, {
        email: req.body.email || '',
        password: '',
        username: req.body.username || '',
        displayName: req.body.displayName || '',
      });
      res.status(400);
      renderWithLayout(res, 'auth/signup', {
        title: 'Sign Up — The Vinyl Drop',
        form,
        nextUrl,
      }, next);
      return;
    }

    const authResult = await signUp(result.data, { req, res });

    if (authResult.error || !authResult.user) {
      const form: FormViewModel = {
        values: {
          email: req.body.email || '',
          password: '',
          username: req.body.username || '',
          displayName: req.body.displayName || '',
        },
        fieldErrors: {},
        generalErrors: [authResult.error || 'Sign up failed. Please try again.'],
        isSubmitted: true,
        isSuccess: false,
      };
      res.status(400);
      renderWithLayout(res, 'auth/signup', {
        title: 'Sign Up — The Vinyl Drop',
        form,
        nextUrl,
      }, next);
      return;
    }

    // If email confirmation is required (session is null), inform the user cleanly
    if (authResult.requiresEmailConfirmation || !authResult.session) {
      const form: FormViewModel = {
        values: { email: req.body.email || '', password: '' },
        fieldErrors: {},
        generalErrors: [],
        isSubmitted: true,
        isSuccess: true,
        successMessage: 'Account created! Please check your email to confirm your account before signing in.',
      };
      res.status(200);
      renderWithLayout(res, 'auth/login', {
        title: 'Check Your Email — The Vinyl Drop',
        form,
        nextUrl,
      }, next);
      return;
    }

    // Set session cookies on immediate session
    setAuthCookies(res, authResult.session);
    res.redirect(nextUrl);
  } catch (error) {
    next(error);
  }
}

export async function getLoginPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      res.redirect('/profile');
      return;
    }

    const nextUrl = sanitizeRedirectUrl(req.query.next as string, '/profile');
    const form: FormViewModel = {
      values: { email: '', password: '' },
      fieldErrors: {},
      generalErrors: req.query.error ? [String(req.query.error)] : [],
    };

    renderWithLayout(res, 'auth/login', {
      title: 'Sign In — The Vinyl Drop',
      form,
      nextUrl,
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function postLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nextUrl = sanitizeRedirectUrl((req.query.next as string) || req.body.next, '/profile');

    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      const form = formatZodFormErrors(result.error, {
        email: req.body.email || '',
        password: '',
      });
      res.status(400);
      renderWithLayout(res, 'auth/login', {
        title: 'Sign In — The Vinyl Drop',
        form,
        nextUrl,
      }, next);
      return;
    }

    const authResult = await login(result.data, { req, res });

    if (authResult.error || !authResult.session) {
      const form: FormViewModel = {
        values: {
          email: req.body.email || '',
          password: '',
        },
        fieldErrors: {},
        generalErrors: [authResult.error || 'Invalid email or password.'],
        isSubmitted: true,
        isSuccess: false,
      };
      res.status(400);
      renderWithLayout(res, 'auth/login', {
        title: 'Sign In — The Vinyl Drop',
        form,
        nextUrl,
      }, next);
      return;
    }

    setAuthCookies(res, authResult.session);
    res.redirect(nextUrl);
  } catch (error) {
    next(error);
  }
}

export async function getGoogleOAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const nextUrl = sanitizeRedirectUrl(req.query.next as string, '/profile');
    const callbackUrl = `${config.APP_BASE_URL}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

    const oauthUrl = await getGoogleOAuthUrl(callbackUrl, { req, res });
    res.redirect(oauthUrl);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Failed to initiate Google OAuth login.';
    res.status(500);
    renderWithLayout(res, 'errors/500', {
      title: 'OAuth Error',
      message: errMessage,
    }, next);
  }
}

export async function getAuthCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const code = req.query.code as string;
    const token_hash = req.query.token_hash as string;
    const type = req.query.type as string;
    const nextUrl = sanitizeRedirectUrl(req.query.next as string, '/profile');

    if (!code && !(token_hash && type)) {
      res.status(400);
      renderWithLayout(res, 'auth/login', {
        title: 'Sign In — The Vinyl Drop',
        form: {
          values: { email: '', password: '' },
          fieldErrors: {},
          generalErrors: ['Authorization code or verification token missing from provider callback.'],
        },
        nextUrl,
      }, next);
      return;
    }

    const authResult = await handleAuthCallback({ code, token_hash, type }, { req, res });

    if (authResult.error || !authResult.session) {
      res.status(400);
      renderWithLayout(res, 'auth/login', {
        title: 'Sign In — The Vinyl Drop',
        form: {
          values: { email: '', password: '' },
          fieldErrors: {},
          generalErrors: [authResult.error || 'Authentication verification failed.'],
        },
        nextUrl,
      }, next);
      return;
    }

    setAuthCookies(res, authResult.session);
    if (authResult.isRecoverySession && authResult.user) {
      setRecoveryCookie(res, authResult.user.id);
    }
    res.redirect(nextUrl);
  } catch (error) {
    next(error);
  }
}

export async function getForgotPasswordPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user) {
      res.redirect('/profile');
      return;
    }

    const form: FormViewModel = {
      values: { email: '' },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'auth/forgot-password', {
      title: 'Reset Your Password — The Vinyl Drop',
      form,
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function postForgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      const form = formatZodFormErrors(result.error, {
        email: req.body.email || '',
      });
      res.status(400);
      renderWithLayout(res, 'auth/forgot-password', {
        title: 'Reset Your Password — The Vinyl Drop',
        form,
      }, next);
      return;
    }

    const redirectTo = `${config.APP_BASE_URL}/auth/callback?next=/auth/reset-password`;
    await sendPasswordResetEmail(result.data.email, redirectTo, { req, res });

    // ALWAYS show a neutral success message regardless of whether the email exists or if provider returns an error
    const form: FormViewModel = {
      values: { email: req.body.email || '' },
      fieldErrors: {},
      generalErrors: [],
      isSubmitted: true,
      isSuccess: true,
      successMessage:
        'If an account with that email exists, we have sent instructions to reset your password. Please check your inbox.',
    };

    res.status(200);
    renderWithLayout(res, 'auth/forgot-password', {
      title: 'Reset Your Password — The Vinyl Drop',
      form,
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function getResetPasswordPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Setting a new password strictly requires a cryptographically verified recovery session marker bound to req.user
    const isRecoverySession = isRecoverySessionVerified(req);
    if (!isRecoverySession) {
      res.status(400);
      renderWithLayout(res, 'auth/forgot-password', {
        title: 'Reset Your Password — The Vinyl Drop',
        form: {
          values: { email: '' },
          fieldErrors: {},
          generalErrors: [
            'Password reset link is invalid or has expired. Please request a new password reset email.',
          ],
        },
      }, next);
      return;
    }

    const form: FormViewModel = {
      values: { password: '', confirmPassword: '' },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'auth/reset-password', {
      title: 'Choose New Password — The Vinyl Drop',
      form,
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function postResetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Setting a new password strictly requires a cryptographically verified recovery session marker bound to req.user
    const isRecoverySession = isRecoverySessionVerified(req);
    if (!isRecoverySession) {
      res.status(400);
      renderWithLayout(res, 'auth/forgot-password', {
        title: 'Reset Your Password — The Vinyl Drop',
        form: {
          values: { email: '' },
          fieldErrors: {},
          generalErrors: [
            'Password reset link is invalid or has expired. Please request a new password reset email.',
          ],
        },
      }, next);
      return;
    }

    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      const form = formatZodFormErrors(result.error, {
        password: '',
        confirmPassword: '',
      });
      res.status(400);
      renderWithLayout(res, 'auth/reset-password', {
        title: 'Choose New Password — The Vinyl Drop',
        form,
      }, next);
      return;
    }

    const authResult = await updatePassword(result.data.password, { req, res });

    if (authResult.error) {
      const form: FormViewModel = {
        values: { password: '', confirmPassword: '' },
        fieldErrors: {},
        generalErrors: [authResult.error],
        isSubmitted: true,
        isSuccess: false,
      };
      res.status(400);
      renderWithLayout(res, 'auth/reset-password', {
        title: 'Choose New Password — The Vinyl Drop',
        form,
      }, next);
      return;
    }

    // updatePassword() already revokes the active recovery session on the same Supabase client.
    // Always clear browser cookies after the password has changed, even if server-side revocation failed.
    clearAuthCookies(res);
    clearRecoveryCookie(res);

    const form: FormViewModel = {
      values: { email: req.user?.email || '', password: '' },
      fieldErrors: {},
      generalErrors: [],
      isSubmitted: true,
      isSuccess: true,
      successMessage: 'Your password has been successfully updated. Please sign in with your new password.',
    };

    res.status(200);
    renderWithLayout(res, 'auth/login', {
      title: 'Sign In — The Vinyl Drop',
      form,
      nextUrl: '/profile',
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function postLogout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await signOut({ req, res });
    clearAuthCookies(res);
    res.redirect('/');
  } catch (error) {
    next(error);
  }
}
