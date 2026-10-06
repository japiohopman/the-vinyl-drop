import { Request, Response, NextFunction } from 'express';
import { getProfileByUsername, getProfileById, updateProfile } from '../services/profileService';
import { getSellerPublishedListings } from '../services/listingService';
import { profileUpdateSchema } from '../../validators/profile';
import { formatZodFormErrors, FormViewModel } from '../view-models/formViewModel';
import { renderWithLayout } from '../utils/render';

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

    const isOwner = Boolean(req.user && req.user.id === profile.id);
    const listings = await getSellerPublishedListings(profile.username);

    renderWithLayout(res, 'profiles/show', {
      title: `${profile.displayName || profile.username} (@${profile.username}) — The Vinyl Drop`,
      profile,
      isOwner,
      listings,
      crateListings: listings,
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
