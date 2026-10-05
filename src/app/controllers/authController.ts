import { Request, Response } from 'express';
import { signUpSchema, loginSchema, sanitizeRedirectUrl } from '../../validators/auth';
import { formatZodFormErrors, FormViewModel } from '../view-models/formViewModel';
import { signUp, login, getGoogleOAuthUrl, handleOAuthCallback, signOut } from '../services/authService';
import { config } from '../../config/env';
import { renderWithLayout } from '../utils/render';

export async function getSignUpPage(req: Request, res: Response): Promise<void> {
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
  });
}

export async function postSignUp(req: Request, res: Response): Promise<void> {
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
    });
    return;
  }

  const authResult = await signUp(result.data);

  if (authResult.error || !authResult.session) {
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
    });
    return;
  }

  // Set session cookies
  res.cookie('sb-access-token', authResult.session.access_token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: (authResult.session.expires_in || 3600) * 1000,
  });

  if (authResult.session.refresh_token) {
    res.cookie('sb-refresh-token', authResult.session.refresh_token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  res.redirect(nextUrl);
}

export async function getLoginPage(req: Request, res: Response): Promise<void> {
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
  });
}

export async function postLogin(req: Request, res: Response): Promise<void> {
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
    });
    return;
  }

  const authResult = await login(result.data);

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
    });
    return;
  }

  res.cookie('sb-access-token', authResult.session.access_token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: (authResult.session.expires_in || 3600) * 1000,
  });

  if (authResult.session.refresh_token) {
    res.cookie('sb-refresh-token', authResult.session.refresh_token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  res.redirect(nextUrl);
}

export async function getGoogleOAuth(req: Request, res: Response): Promise<void> {
  const nextUrl = sanitizeRedirectUrl(req.query.next as string, '/profile');
  const callbackUrl = `${config.APP_BASE_URL}/auth/callback?next=${encodeURIComponent(nextUrl)}`;

  try {
    const oauthUrl = await getGoogleOAuthUrl(callbackUrl);
    res.redirect(oauthUrl);
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Failed to initiate Google OAuth login.';
    res.status(500);
    renderWithLayout(res, 'errors/500', {
      title: 'OAuth Error',
      message: errMessage,
    });
  }
}

export async function getAuthCallback(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string;
  const nextUrl = sanitizeRedirectUrl(req.query.next as string, '/profile');

  if (!code) {
    res.status(400);
    renderWithLayout(res, 'auth/login', {
      title: 'Sign In — The Vinyl Drop',
      form: {
        values: { email: '', password: '' },
        fieldErrors: {},
        generalErrors: ['Authorization code missing from provider callback.'],
      },
      nextUrl,
    });
    return;
  }

  const authResult = await handleOAuthCallback(code);

  if (authResult.error || !authResult.session) {
    res.status(400);
    renderWithLayout(res, 'auth/login', {
      title: 'Sign In — The Vinyl Drop',
      form: {
        values: { email: '', password: '' },
        fieldErrors: {},
        generalErrors: [authResult.error || 'OAuth verification failed.'],
      },
      nextUrl,
    });
    return;
  }

  res.cookie('sb-access-token', authResult.session.access_token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: (authResult.session.expires_in || 3600) * 1000,
  });

  if (authResult.session.refresh_token) {
    res.cookie('sb-refresh-token', authResult.session.refresh_token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  res.redirect(nextUrl);
}

export async function postLogout(_req: Request, res: Response): Promise<void> {
  await signOut();
  res.clearCookie('sb-access-token');
  res.clearCookie('sb-refresh-token');
  res.redirect('/');
}
