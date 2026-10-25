import { Request, Response, NextFunction } from 'express';
import { getProfileByUsername, getProfileById, updateProfile } from '../services/profileService';
import { getSellerPublishedListings } from '../services/listingService';
import { profileUpdateSchema } from '../../validators/profile';
import { formatZodFormErrors, FormViewModel } from '../view-models/formViewModel';
import { renderWithLayout } from '../utils/render';
import { setFlashCookie } from '../middleware/flash';

export async function getCurrentProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.redirect('/auth/login');
      return;
    }

    const profile = await getProfileById(req.user.id);
    if (!profile) {
      res.status(404);
      renderWithLayout(res, 'errors/404', {
        title: 'Profile Not Found',
        message: 'Profile record does not exist for this user.',
      }, next);
      return;
    }

    res.redirect(`/profiles/${encodeURIComponent(profile.username)}`);
  } catch (error) {
    next(error);
  }
}

interface ParsedProfilePage {
  present: boolean;
  valid: boolean;
  page: number;
}

function parseProfilePageParameter(value: unknown): ParsedProfilePage {
  if (value === undefined || value === null) {
    return { present: false, valid: true, page: 1 };
  }

  if (typeof value !== 'string' || !/^[1-9]\\d*$/.test(value.trim())) {
    return { present: true, valid: false, page: 1 };
  }

  const page = Number(value.trim());
  if (!Number.isSafeInteger(page)) {
    return { present: true, valid: false, page: 1 };
  }

  return { present: true, valid: true, page };
}

/** Compact public profile landing; published listings live on the dedicated Crate route. */
export async function getPublicProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const username = req.params.username;
    const profile = await getProfileByUsername(username);

    if (!profile) {
      res.status(404);
      renderWithLayout(res, 'errors/404', {
        title: 'Profile Not Found',
        message: `User "@${username}" was not found.`,
      }, next);
      return;
    }

    const parsedPage = parseProfilePageParameter(req.query.page);
    const title = `${profile.displayName || profile.username} (@${profile.username}) — The Vinyl Drop`;

    if (!parsedPage.valid) {
      res.status(400);
      renderWithLayout(res, 'profiles/show', {
        title,
        profile,
        isOwner: Boolean(req.user && req.user.id === profile.id),
        crateTotalCount: 0,
        errorMessage: 'Invalid page parameter provided.',
      }, next);
      return;
    }

    // Keep historical paginated profile URLs working, but make the Crate the canonical listing route.
    if (parsedPage.present) {
      res.redirect(302, `/profiles/${encodeURIComponent(profile.username)}/crate?page=${parsedPage.page}`);
      return;
    }

    const listingsResult = await getSellerPublishedListings(profile.username, { page: 1 });
    renderWithLayout(res, 'profiles/show', {
      title,
      profile,
      isOwner: Boolean(req.user && req.user.id === profile.id),
      crateTotalCount: listingsResult.totalCount,
    }, next);
  } catch (error) {
    next(error);
  }
}

/** Public Crate: the existing paginated grid of this user's published listings. */
export async function getPublicProfileCrate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const username = req.params.username;
    const profile = await getProfileByUsername(username);

    if (!profile) {
      res.status(404);
      renderWithLayout(res, 'errors/404', {
        title: 'Crate Not Found',
        message: `User "@${username}" was not found.`,
      }, next);
      return;
    }

    const title = `${profile.displayName || profile.username}'s Crate — The Vinyl Drop`;
    const parsedPage = parseProfilePageParameter(req.query.page);
    const isOwner = Boolean(req.user && req.user.id === profile.id);

    if (!parsedPage.valid) {
      res.status(400);
      renderWithLayout(res, 'profiles/crate', {
        title,
        profile,
        isOwner,
        listings: [],
        pagination: { totalCount: 0, page: 1, limit: 12, totalPages: 1 },
        errorMessage: 'Invalid page parameter provided.',
      }, next);
      return;
    }

    const listingsResult = await getSellerPublishedListings(profile.username, { page: parsedPage.page });
    renderWithLayout(res, 'profiles/crate', {
      title,
      profile,
      isOwner,
      listings: listingsResult.items,
      pagination: {
        totalCount: listingsResult.totalCount,
        page: listingsResult.page,
        limit: listingsResult.limit,
        totalPages: listingsResult.totalPages,
      },
    }, next);
  } catch (error) {
    next(error);
  }
}

export async function getEditProfilePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.redirect('/auth/login');
      return;
    }

    const profile = await getProfileById(req.user.id);
    if (!profile) {
      res.status(404);
      renderWithLayout(res, 'errors/404', {
        title: 'Profile Not Found',
        message: 'Profile record does not exist.',
      }, next);
      return;
    }

    const form: FormViewModel = {
      values: {
        username: profile.username || '',
        displayName: profile.displayName || '',
        bio: profile.bio || '',
        location: profile.location || '',
        avatarUrl: profile.avatarUrl || '',
        websiteUrl: profile.websiteUrl || '',
      },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'profiles/edit', {
      title: 'Edit Profile — The Vinyl Drop',
      form,
      profile,
    }, next);
  } catch (error) {
    next(error);
  }
}

/** Saves validated profile changes and issues a one-time confirmation after success. */
export async function postEditProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.redirect('/auth/login');
      return;
    }

    const profile = await getProfileById(req.user.id);
    if (!profile) {
      res.status(404);
      renderWithLayout(res, 'errors/404', {
        title: 'Profile Not Found',
        message: 'Profile record does not exist.',
      }, next);
      return;
    }

    const result = profileUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const form = formatZodFormErrors(result.error, {
        username: req.body.username || '',
        displayName: req.body.displayName || '',
        bio: req.body.bio || '',
        location: req.body.location || '',
        avatarUrl: req.body.avatarUrl || '',
        websiteUrl: req.body.websiteUrl || '',
      });

      res.status(400);
      renderWithLayout(res, 'profiles/edit', {
        title: 'Edit Profile — The Vinyl Drop',
        form,
        profile,
      }, next);
      return;
    }

    try {
      const updatedProfile = await updateProfile(profile.id, req.user.id, result.data);
      setFlashCookie(res, 'success', 'Profile saved successfully.');
      res.redirect(`/profiles/${encodeURIComponent(updatedProfile.username)}`);
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'Failed to update profile.';
      const form: FormViewModel = {
        values: {
          username: req.body.username || '',
          displayName: req.body.displayName || '',
          bio: req.body.bio || '',
          location: req.body.location || '',
          avatarUrl: req.body.avatarUrl || '',
          websiteUrl: req.body.websiteUrl || '',
        },
        fieldErrors: {},
        generalErrors: [errMessage],
        isSubmitted: true,
        isSuccess: false,
      };

      res.status(400);
      renderWithLayout(res, 'profiles/edit', {
        title: 'Edit Profile — The Vinyl Drop',
        form,
        profile,
      }, next);
    }
  } catch (error) {
    next(error);
  }
}
