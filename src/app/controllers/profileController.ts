import { Request, Response, NextFunction } from 'express';
import {
  getPublicProfileByUsername,
  getProfileById,
  updateProfile,
  setProfileAvatarStoragePath,
} from '../services/profileService';
import { getSellerPublishedListings, countSellerPublishedListings } from '../services/listingService';
import { profileUpdateSchema } from '../../validators/profile';
import { formatZodFormErrors, FormViewModel } from '../view-models/formViewModel';
import { renderWithLayout } from '../utils/render';
import { setFlashCookie } from '../middleware/flash';
import { config } from '../../config/env';
import { savedPeopleService } from '../services/savedPeopleService';
import { createProfileAvatarStoragePath, deleteProfileAvatarFromStorage, getProfileAvatarPublicUrl, uploadProfileAvatarToStorage } from '../services/profileAvatarStorageService';
import { processProfileAvatar } from '../utils/imageProcessor';

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
        isStatusPage: true,
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

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value.trim())) {
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
    const profile = await getPublicProfileByUsername(username);

    if (!profile) {
      res.status(404);
      renderWithLayout(res, 'errors/404', {
        title: 'Profile Not Found',
        message: `User "@${username}" was not found.`,
        isStatusPage: true,
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
        avatarPublicUrl: profile.avatarPublicUrl,
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

    const crateTotalCount = await countSellerPublishedListings(profile.id);
    const isSavedPerson = Boolean(
      req.user && config.MESSAGING_ENABLED && req.user.id !== profile.id &&
      await savedPeopleService.isSavedPerson(req.user.id, profile.id)
    );
    renderWithLayout(res, 'profiles/show', {
      title,
      profile,
      avatarPublicUrl: profile.avatarPublicUrl,
      user: req.user,
      messagingEnabled: config.MESSAGING_ENABLED,
      isSavedPerson,
      isOwner: Boolean(req.user && req.user.id === profile.id),
      crateTotalCount,
    }, next);
  } catch (error) {
    next(error);
  }
}

/** Public Crate: the existing paginated grid of this user's published listings. */
export async function getPublicProfileCrate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const username = req.params.username;
    const profile = await getPublicProfileByUsername(username);

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

    // Keep an out-of-range but valid page request from looking like an empty Crate.
    if (
      listingsResult.totalCount > 0 &&
      listingsResult.totalPages > 0 &&
      parsedPage.page > listingsResult.totalPages
    ) {
      res.redirect(
        302,
        `/profiles/${encodeURIComponent(profile.username)}/crate?page=${listingsResult.totalPages}`
      );
      return;
    }

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
        isStatusPage: true,
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
        soundcloudUrl: profile.soundcloudUrl || '',
        mixcloudUrl: profile.mixcloudUrl || '',
      },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'profiles/edit', {
      title: 'Edit Profile — The Vinyl Drop',
      form,
      profile,
      avatarPublicUrl: profile.avatarStoragePath ? getProfileAvatarPublicUrl(profile.avatarStoragePath) : null,
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
        soundcloudUrl: req.body.soundcloudUrl || '',
        mixcloudUrl: req.body.mixcloudUrl || '',
      });

      res.status(400);
      renderWithLayout(res, 'profiles/edit', {
        title: 'Edit Profile — The Vinyl Drop',
        form,
        profile,
        avatarPublicUrl: profile.avatarStoragePath ? getProfileAvatarPublicUrl(profile.avatarStoragePath) : null,
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
          soundcloudUrl: req.body.soundcloudUrl || '',
          mixcloudUrl: req.body.mixcloudUrl || '',
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
        avatarPublicUrl: profile.avatarStoragePath ? getProfileAvatarPublicUrl(profile.avatarStoragePath) : null,
      }, next);
    }
  } catch (error) {
    next(error);
  }
}


/** Uploads one validated profile image to the owner's dedicated avatar namespace. */
export async function postUploadProfileAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  let newStoragePath: string | null = null;
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
        isStatusPage: true,
      }, next);
      return;
    }

    const files = req.files || [];
    if (files.length !== 1 || files[0].fieldname !== 'avatar' || !files[0].filename) {
      setFlashCookie(res, 'error', 'Choose one JPEG, PNG, WebP or GIF image to upload.');
      res.redirect('/profile/edit');
      return;
    }

    const uploaded = files[0];
    const processed = await processProfileAvatar(uploaded.buffer, uploaded.mimetype);
    newStoragePath = createProfileAvatarStoragePath(req.user.id, processed.extension);
    await uploadProfileAvatarToStorage(newStoragePath, processed.buffer, processed.contentType, { req });

    const committedStoragePath = newStoragePath;
    let previousStoragePath: string | null;
    try {
      const result = await setProfileAvatarStoragePath(profile.id, req.user.id, committedStoragePath);
      previousStoragePath = result.previousStoragePath;
    } catch (databaseError) {
      // A failed profile-row update must not strand the newly uploaded object.
      try {
        await deleteProfileAvatarFromStorage(committedStoragePath, { req });
      } catch {
        console.error('Profile avatar rollback cleanup failed.');
      }
      newStoragePath = null;
      throw databaseError;
    }

    // The database now references this immutable object: keep it alive after commit.
    newStoragePath = null;
    if (previousStoragePath && previousStoragePath !== committedStoragePath) {
      try {
        await deleteProfileAvatarFromStorage(previousStoragePath, { req });
      } catch {
        let oldPointerRestored = false;
        try {
          await setProfileAvatarStoragePath(profile.id, req.user.id, previousStoragePath);
          oldPointerRestored = true;
        } catch {
          console.error('Profile avatar replacement rollback could not restore the previous database reference.');
        }
        if (oldPointerRestored) {
          try {
            await deleteProfileAvatarFromStorage(committedStoragePath, { req });
          } catch {
            console.error('Profile avatar replacement rollback could not remove the new object.');
          }
          setFlashCookie(res, 'error', 'The previous photo could not be removed. Your original avatar was restored.');
        } else {
          setFlashCookie(res, 'error', 'The new photo is saved, but cleanup of the previous photo needs attention.');
        }
        res.redirect('/profile/edit');
        return;
      }
    }

    setFlashCookie(res, 'success', 'Profile photo saved successfully.');
    res.redirect('/profiles/' + encodeURIComponent(profile.username));
  } catch (error) {
    if (newStoragePath && req.user) {
      try {
        await deleteProfileAvatarFromStorage(newStoragePath, { req });
      } catch {
        console.error('Profile avatar rollback cleanup failed.');
      }
    }
    const message = error instanceof Error ? error.message : 'Profile photo upload failed.';
    setFlashCookie(res, 'error', message);
    res.redirect('/profile/edit');
  }
}

/** Clears the uploaded-avatar pointer before deleting the now-unreferenced object. */
export async function postRemoveProfileAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        isStatusPage: true,
      }, next);
      return;
    }

    const result = await setProfileAvatarStoragePath(profile.id, req.user.id, null);
    if (result.previousStoragePath) {
      try {
        await deleteProfileAvatarFromStorage(result.previousStoragePath, { req });
      } catch {
        try {
          await setProfileAvatarStoragePath(profile.id, req.user.id, result.previousStoragePath);
        } catch {
          console.error('Profile avatar removal rollback could not restore the previous reference.');
        }
        setFlashCookie(res, 'error', 'The uploaded photo could not be removed safely. Your previous avatar was restored where possible.');
        res.redirect('/profile/edit');
        return;
      }
    }

    setFlashCookie(res, 'success', 'Uploaded profile photo removed. Your Avatar URL fallback is unchanged.');
    res.redirect('/profile/edit');
  } catch (error) {
    next(error);
  }
}
