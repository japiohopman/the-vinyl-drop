import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { setFlashCookie } from '../middleware/flash';
import { listReleases, findReleaseById } from '../repositories/releaseRepository';
import {
  getMyListings,
  getListingEditDetails,
  getListingPreviewDetails,
  getListingWithDetailsForView,
  getPublicListingDetailsForView,
  createListingFromRelease,
  updateListing,
  addPhotoToListing,
  getListingPhotoEditorSource as loadListingPhotoEditorSource,
  saveListingPhotoEditor,
  deletePhotoFromListing,
  reorderListingPhotos,
  updateListingPhotoRole,
  publishListing,
  archiveListing,
  dismissCompletedListing,
  restoreCompletedListing,
  permanentlyDeleteArchivedListing,
  transitionListingStatus,
} from '../services/listingService';
import { getListingComments, getListingCommentsForResolvedListing, addComment } from '../services/commentService';
import { isListingFavorited } from '../services/favoriteService';
import {
  updateReleaseYouTubePreviewForListing,
  updateReleaseArtworkForListing,
  restoreDiscogsArtworkForListing,
} from '../services/releaseService';
import { processAndValidateImage } from '../utils/imageProcessor';
import { formatPrice } from '../view-models/listingCardViewModel';
import { FormViewModel } from '../view-models/formViewModel';
import { parsePriceEurToCents } from '../../validators/listing';
import { ValidationError, NotFoundError, AuthorizationError } from '../services/errors';
import { LISTING_PHOTO_ROLE_GUIDANCE, LISTING_PHOTO_ROLE_LABELS, LISTING_PHOTO_ROLES, NEW_LISTING_PHOTO_ROLES } from '../../domain/listingPhotoRole';

/** Renders the authenticated seller's visible or hidden listings from the batched My Listings read model. */
export async function getSellerListings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const viewHidden = req.query.view === 'hidden';
    const detailedListings = await getMyListings(req.user.id, viewHidden);

    renderWithLayout(res, 'listings/index', {
      title: 'My Listings - The Vinyl Drop',
      listings: detailedListings,
      viewHidden,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSelectReleasePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = (req.query.q as string || '').trim();
    let searchResults: Array<import('../services/discogsService').DiscogsSearchResult> = [];

    if (query) {
      const { searchDiscogs } = await import('../services/discogsService');
      searchResults = await searchDiscogs(query);
    }

    const releases = await listReleases(50);
    renderWithLayout(res, 'listings/select-release', {
      title: 'Select a Release - The Vinyl Drop',
      releases,
      query,
      searchResults,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCreateListingPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const releaseId = req.query.releaseId as string;
    if (!releaseId) {
      return res.redirect('/listings/new');
    }

    const release = await findReleaseById(releaseId);
    if (!release) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: '404 - Page Not Found',
        message: 'The selected release was not found.',
        isStatusPage: true,
      });
    }

    const form: FormViewModel = {
      values: {
        releaseId,
        mediaCondition: 'NM',
        sleeveCondition: 'NM',
        tradeAvailable: 'false',
      },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'listings/create', {
      title: `Sell ${release.title} - The Vinyl Drop`,
      release,
      form,
    });
  } catch (error) {
    next(error);
  }
}

export async function postCreateListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listing = await createListingFromRelease(req.user.id, req.body);
    return res.redirect(`/listings/${listing.id}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      const releaseId = req.body.releaseId;
      const release = releaseId ? await findReleaseById(releaseId) : null;
      if (release) {
        const form: FormViewModel = {
          values: req.body,
          fieldErrors: {},
          generalErrors: [error.message],
        };
        res.status(400);
        return renderWithLayout(res, 'listings/create', {
          title: `Sell ${release.title} - The Vinyl Drop`,
          release,
          form,
        });
      }
    }
    next(error);
  }
}

export async function getEditListingPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    const details = await getListingEditDetails(listingId);

    if (!details) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: '404 - Page Not Found',
        message: 'The requested listing could not be found.',
        isStatusPage: true,
      });
    }

    if (details.listing.sellerId !== req.user.id) {
      res.status(403);
      return renderWithLayout(res, 'errors/500', {
        title: '403 Forbidden',
        message: 'You are not authorized to edit this listing.',
      });
    }

    const form: FormViewModel = {
      values: {
        priceEur: details.listing.price !== null ? (details.listing.price / 100).toString() : '',
        tradeAvailable: details.listing.tradeAvailable ? 'true' : 'false',
        description: details.listing.description || '',
        mediaCondition: details.physicalCopy.mediaCondition,
        sleeveCondition: details.physicalCopy.sleeveCondition,
        notes: details.physicalCopy.notes || '',
      },
      fieldErrors: {},
      generalErrors: [],
    };

    renderWithLayout(res, 'listings/edit', {
      title: `Edit ${details.release.title} - The Vinyl Drop`,
      listing: details.listing,
      physicalCopy: details.physicalCopy,
      release: details.release,
      photos: details.photos,
      form,
      photoRoles: LISTING_PHOTO_ROLES,
      newPhotoRoles: NEW_LISTING_PHOTO_ROLES,
      photoRoleLabels: LISTING_PHOTO_ROLE_LABELS,
      photoRoleGuidance: LISTING_PHOTO_ROLE_GUIDANCE,
      photoError: typeof req.query.photoError === 'string' ? req.query.photoError : '',
      youtubePreviewError: req.query.youtubePreviewError === 'invalid',
      releaseArtworkError: req.query.releaseArtworkError === 'invalid',
      releaseArtworkRestoreError: req.query.releaseArtworkRestoreError === 'unavailable',
    });
  } catch (error) {
    next(error);
  }
}

export async function postEditListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    let priceInCents: number | null | undefined = undefined;

    if (req.body.priceEur !== undefined) {
      try {
        priceInCents = parsePriceEurToCents(req.body.priceEur);
      } catch (err) {
        throw new ValidationError((err as Error).message);
      }
    }

    const tradeAvailable = req.body.tradeAvailable === 'true' || req.body.tradeAvailable === 'on' || req.body.tradeAvailable === true;

    await updateListing(listingId, req.user.id, {
      price: priceInCents,
      tradeAvailable,
      description: req.body.description,
      mediaCondition: req.body.mediaCondition,
      sleeveCondition: req.body.sleeveCondition,
      notes: req.body.notes,
    });

    res.redirect(`/listings/${listingId}/preview`);
  } catch (error) {
    if (error instanceof ValidationError) {
      const listingId = req.params.id;
      const details = await getListingEditDetails(listingId);
      if (details) {
        const form: FormViewModel = {
          values: req.body,
          fieldErrors: {},
          generalErrors: [error.message],
        };
        res.status(400);
        return renderWithLayout(res, 'listings/edit', {
          title: `Edit ${details.release.title} - The Vinyl Drop`,
          listing: details.listing,
          physicalCopy: details.physicalCopy,
          release: details.release,
          photos: details.photos,
          form,
          photoRoles: LISTING_PHOTO_ROLES,
          newPhotoRoles: NEW_LISTING_PHOTO_ROLES,
          photoRoleLabels: LISTING_PHOTO_ROLE_LABELS,
          photoRoleGuidance: LISTING_PHOTO_ROLE_GUIDANCE,
        });
      }
    }
    next(error);
  }
}

export async function postUpdateReleaseYouTubePreview(req: Request, res: Response, next: NextFunction): Promise<void> {
  const listingId = req.params.id;
  if (!req.user) return res.redirect('/auth/login');

  try {
    await updateReleaseYouTubePreviewForListing(listingId, req.user.id, req.body.youtubePreviewUrl);
    setFlashCookie(res, 'success', 'YouTube preview updated for this release.');
    return res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.redirect(`/listings/${listingId}/edit?youtubePreviewError=invalid`);
    }
    if (error instanceof NotFoundError) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: 'Listing Not Found',
        message: 'The listing or its associated release was not found.',
        isStatusPage: true,
      }, next);
    }
    if (error instanceof AuthorizationError) {
      res.status(403);
      return renderWithLayout(res, 'errors/500', {
        title: '403 Forbidden',
        message: 'You are not authorized to edit this listing.',
      }, next);
    }
    return next(error);
  }
}

/** Updates shared release-level catalogue artwork; it never creates a seller photo row. */
export async function postUpdateReleaseArtwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  const listingId = req.params.id;
  if (!req.user) return res.redirect('/auth/login');

  try {
    const files = req.files || [];
    if (files.length !== 1 || files[0].fieldname !== 'coverArt') {
      throw new ValidationError('Choose one catalogue artwork image to upload.');
    }

    let processedArtwork: Awaited<ReturnType<typeof processAndValidateImage>>;
    try {
      processedArtwork = await processAndValidateImage(files[0].buffer, files[0].mimetype);
    } catch {
      throw new ValidationError('Choose a valid JPEG, PNG or WebP catalogue artwork image.');
    }
    await updateReleaseArtworkForListing(listingId, req.user.id, processedArtwork, { req });
    setFlashCookie(res, 'success', 'Release artwork updated. It is shared by listings of this release.');
    return res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.redirect(`/listings/${listingId}/edit?releaseArtworkError=invalid`);
    }
    if (error instanceof NotFoundError) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: 'Listing Not Found',
        message: 'The listing or its associated release was not found.',
        isStatusPage: true,
      }, next);
    }
    if (error instanceof AuthorizationError) {
      res.status(403);
      return renderWithLayout(res, 'errors/500', {
        title: '403 Forbidden',
        message: 'You are not authorized to edit this listing.',
      }, next);
    }
    return next(error);
  }
}

/** Restores the original Discogs catalogue image without creating a seller photo. */
export async function postRestoreDiscogsArtwork(req: Request, res: Response, next: NextFunction): Promise<void> {
  const listingId = req.params.id;
  if (!req.user) return res.redirect('/auth/login');

  try {
    await restoreDiscogsArtworkForListing(listingId, req.user.id, { req });
    setFlashCookie(res, 'success', 'Original Discogs release artwork restored.');
    return res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.redirect(`/listings/${listingId}/edit?releaseArtworkRestoreError=unavailable`);
    }
    if (error instanceof NotFoundError) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: 'Listing Not Found',
        message: 'The listing or its associated release was not found.',
        isStatusPage: true,
      }, next);
    }
    if (error instanceof AuthorizationError) {
      res.status(403);
      return renderWithLayout(res, 'errors/500', {
        title: '403 Forbidden',
        message: 'You are not authorized to edit this listing.',
      }, next);
    }
    return next(error);
  }
}

/** Uploads a seller photo and issues success feedback only after the upload succeeds. */
export async function postUploadPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return res.redirect('/auth/login');

    const listingId = req.params.id;
    const files = req.files || [];
    const photoFiles = files.filter((file) => file.fieldname === 'photo');
    const originalFiles = files.filter((file) => file.fieldname === 'originalPhoto');
    if (
      photoFiles.length !== 1 ||
      originalFiles.length > 1 ||
      files.some((file) => file.fieldname !== 'photo' && file.fieldname !== 'originalPhoto')
    ) {
      throw new ValidationError('Choose one photo to upload. The original editing source is attached automatically.');
    }

    const displayFile = photoFiles[0];
    const originalFile = originalFiles[0];
    await addPhotoToListing(
      listingId,
      req.user.id,
      {
        buffer: displayFile.buffer,
        mimetype: displayFile.mimetype,
        originalname: displayFile.filename,
      },
      req.body.altText,
      undefined,
      { req },
      req.body.role,
      originalFile ? {
        buffer: originalFile.buffer,
        mimetype: originalFile.mimetype,
        originalname: originalFile.filename,
      } : undefined,
      req.body.editorState
    );

    setFlashCookie(res, 'success', 'Photo uploaded successfully.');
    res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      const listingId = req.params.id;
      const details = await getListingEditDetails(listingId);
      if (details && req.user?.id === details.listing.sellerId) {
        const form: FormViewModel = {
          values: {},
          fieldErrors: {},
          generalErrors: [error.message],
        };
        res.status(400);
        return renderWithLayout(res, 'listings/edit', {
          title: `Edit ${details.release.title} - The Vinyl Drop`,
          listing: details.listing,
          physicalCopy: details.physicalCopy,
          release: details.release,
          photos: details.photos,
          form,
          photoRoles: LISTING_PHOTO_ROLES,
          newPhotoRoles: NEW_LISTING_PHOTO_ROLES,
          photoRoleLabels: LISTING_PHOTO_ROLE_LABELS,
          photoRoleGuidance: LISTING_PHOTO_ROLE_GUIDANCE,
          photoError: '',
        });
      }
    }
    next(error);
  }
}

/** Streams a seller-owned private source; the object path is never sent to the browser. */
export async function getListingPhotoEditorSource(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const source = await loadListingPhotoEditorSource(
      req.params.id,
      req.params.photoId,
      req.user.id,
      undefined,
      { req }
    );
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Photo-Source-Width', String(source.sourceWidth));
    res.setHeader('X-Photo-Source-Height', String(source.sourceHeight));
    res.setHeader('X-Photo-Source-Legacy', source.sourceIsLegacy ? 'true' : 'false');
    res.status(200).send(source.buffer);
  } catch (error) {
    next(error);
  }
}

/** Applies a new public derivative while the private source remains immutable. */
export async function postEditListingPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return res.redirect('/auth/login');
    const files = req.files || [];
    if (files.length !== 1 || files[0].fieldname !== 'photo') {
      throw new ValidationError('The edited photo could not be read. Reopen the editor and try again.');
    }
    await saveListingPhotoEditor(
      req.params.id,
      req.params.photoId,
      req.user.id,
      {
        buffer: files[0].buffer,
        mimetype: files[0].mimetype,
        originalname: files[0].filename,
      },
      req.body.editorState,
      req.body.altText,
      undefined,
      { req }
    );
    setFlashCookie(res, 'success', 'Photo edits saved.');
    res.redirect(`/listings/${req.params.id}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.redirect(`/listings/${req.params.id}/edit?photoError=${encodeURIComponent(error.message)}`);
    }
    next(error);
  }
}

/** Updates a listing photo role and issues confirmation after the update succeeds. */
export async function postUpdatePhotoRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    return res.redirect('/auth/login');
  }

  const listingId = req.params.id;
  const photoId = req.params.photoId;
  try {
    await updateListingPhotoRole(listingId, photoId, req.user.id, req.body.role, undefined, { req });
    setFlashCookie(res, 'success', 'Photo role updated.');
    return res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.redirect(`/listings/${listingId}/edit?photoError=${encodeURIComponent(error.message)}`);
    }
    next(error);
  }
}

/** Deletes an owned listing photo and confirms the deletion only after success. */
export async function postDeletePhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const { id: listingId, photoId } = req.params;
    await deletePhotoFromListing(listingId, photoId, req.user.id, undefined, { req });

    setFlashCookie(res, 'success', 'Photo removed successfully.');
    res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    next(error);
  }
}

export async function postReorderPhotos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const listingId = req.params.id;
    const photoIds = req.body.photoIds;

    if (!Array.isArray(photoIds)) {
      res.status(400).json({ error: 'photoIds must be an array' });
      return;
    }

    const photos = await reorderListingPhotos(listingId, req.user.id, photoIds);
    res.status(200).json({ success: true, photos });
  } catch (error) {
    next(error);
  }
}

export async function getPreviewListingPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listingId = req.params.id;
    const details = await getListingPreviewDetails(listingId);

    if (!details) {
      res.status(404);
      return renderWithLayout(res, 'errors/404', {
        title: '404 - Page Not Found',
        message: 'The requested listing could not be found.',
        isStatusPage: true,
      });
    }

    const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;
    const priceFormatted = formatPrice(details.listing.price, isTradeOnly);

    renderWithLayout(res, 'listings/preview', {
      title: `Preview: ${details.release.title} - The Vinyl Drop`,
      listing: details.listing,
      physicalCopy: details.physicalCopy,
      release: details.release,
      seller: details.seller,
      photos: details.photos,
      priceFormatted,
    });
  } catch (error) {
    next(error);
  }
}

/** Publishes an owned listing and issues confirmation only after publication succeeds. */
export async function postPublishListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    const previewConfirmed = req.body.previewConfirmed === 'true' || req.body.previewConfirmed === true;

    await publishListing(listingId, req.user.id, { previewConfirmed });

    setFlashCookie(res, 'success', 'Listing published successfully!');
    res.redirect(`/listings/${listingId}/preview`);
  } catch (error) {
    if (error instanceof ValidationError || (error as Error).name === 'InvalidLifecycleTransitionError') {
      const listingId = req.params.id;
      const details = await getListingPreviewDetails(listingId);
      if (details) {
        const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;
        res.status(400);
        return renderWithLayout(res, 'listings/preview', {
          title: `Preview: ${details.release.title} - The Vinyl Drop`,
          listing: details.listing,
          physicalCopy: details.physicalCopy,
          release: details.release,
          seller: details.seller,
          photos: details.photos,
          priceFormatted: formatPrice(details.listing.price, isTradeOnly),
          error: (error as Error).message,
        });
      }
    }
    next(error);
  }
}

export async function postDismissCompletedListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return res.redirect('/auth/login');
    await dismissCompletedListing(req.params.id, req.user.id);
    return res.redirect('/listings');
  } catch (error) {
    next(error);
  }
}

export async function postRestoreCompletedListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return res.redirect('/auth/login');
    await restoreCompletedListing(req.params.id, req.user.id);
    return res.redirect('/listings?view=hidden');
  } catch (error) {
    next(error);
  }
}

export async function postUnpublishListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return res.redirect('/auth/login');
    await transitionListingStatus(req.params.id, req.user.id, 'draft');
    return res.redirect('/listings');
  } catch (error) {
    next(error);
  }
}

export async function postDeleteArchivedListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return res.redirect('/auth/login');
    const deleted = await permanentlyDeleteArchivedListing(req.params.id, req.user.id, undefined, { req });
    setFlashCookie(res, 'success', deleted ? 'Archived listing deleted permanently.' : 'This listing was already removed.');
    return res.redirect('/listings');
  } catch (error) {
    next(error);
  }
}

export async function postArchiveListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    await archiveListing(listingId, req.user.id);

    res.redirect('/listings');
  } catch (error) {
    next(error);
  }
}

/** Render the public listing discussion using the narrow detail projection and current comment visibility check. */
export async function getListingCommentsPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listingId = req.params.id;
    const requestingUserId = req.user?.id;

    let details;
    try {
      details = await getPublicListingDetailsForView(listingId, requestingUserId);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) {
        res.status(404);
        return renderWithLayout(
          res,
          'errors/404',
          {
            title: 'Listing Not Found',
            message: 'The requested record listing was not found or is no longer available.',
          },
          next
        );
      }
      throw err;
    }

    let comments;
    try {
      comments = await getListingCommentsForResolvedListing(listingId, details.listing, requestingUserId);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404);
        return renderWithLayout(
          res,
          'errors/404',
          {
            title: 'Listing Not Found',
            message: 'The requested record listing was not found or is no longer available.',
          },
          next
        );
      }
      throw err;
    }
    const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;

    return renderWithLayout(
      res,
      'listings/comments',
      {
        title: `Comments about ${details.release.title} — The Vinyl Drop`,
        listing: details.listing,
        physicalCopy: details.physicalCopy,
        release: details.release,
        seller: details.seller,
        photos: details.photos,
        priceFormatted: formatPrice(details.listing.price, isTradeOnly),
        comments,
        currentUser: req.user || null,
        commentsPage: true,
        commentError: (req.query.commentError as string) || null,
      },
      next
    );
  } catch (error) {
    next(error);
  }
}

/** Render a public listing detail page from the bounded joined view model. */
export async function getListingDetailPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listingId = req.params.id;
    const requestingUserId = req.user?.id;

    let details;
    try {
      details = await getPublicListingDetailsForView(listingId, requestingUserId);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) {
        res.status(404);
        return renderWithLayout(
          res,
          'errors/404',
          {
            title: 'Listing Not Found',
            message: 'The requested record listing was not found or is no longer available.',
          },
          next
        );
      }
      throw err;
    }

    let comments;
    try {
      comments = await getListingCommentsForResolvedListing(listingId, details.listing, requestingUserId);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404);
        return renderWithLayout(
          res,
          'errors/404',
          {
            title: 'Listing Not Found',
            message: 'The requested record listing was not found or is no longer available.',
          },
          next
        );
      }
      throw err;
    }
    const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;
    const priceFormatted = formatPrice(details.listing.price, isTradeOnly);

    let isFavorited = false;
    if (requestingUserId) {
      isFavorited = await isListingFavorited(requestingUserId, listingId);
    }

    renderWithLayout(
      res,
      'listings/show',
      {
        title: `${details.release.title} by ${details.release.artist} — The Vinyl Drop`,
        listing: details.listing,
        physicalCopy: details.physicalCopy,
        release: details.release,
        seller: details.seller,
        photos: details.photos,
        priceFormatted,
        comments,
        currentUser: req.user || null,
        isSeller: requestingUserId === details.listing.sellerId,
        isFavorited,
        commentsInitiallyOpen: req.query.commentsOpen === '1',
        commentError: (req.query.commentError as string) || null,
      },
      next
    );
  } catch (error) {
    next(error);
  }
}

export async function postCreateComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    const content = req.body.content || '';
    // This is a closed presentation selector, not a redirect URL. Never redirect to user input.
    const commentsPage = req.body.returnTo === 'comments';

    try {
      await addComment(listingId, req.user.id, content);
      if (commentsPage) {
        return res.redirect(`/listings/${listingId}/comments#comments`);
      }
      return res.redirect(`/listings/${listingId}?commentsOpen=1#comments`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404);
        return renderWithLayout(
          res,
          'errors/404',
          {
            title: 'Listing Not Found',
            message: 'Listing does not exist.',
          },
          next
        );
      }

      if (err instanceof ValidationError || err instanceof AuthorizationError) {
        const errMsg = (err as Error).message;
        const details = await getListingWithDetailsForView(listingId, req.user.id);
        const comments = await getListingComments(listingId, req.user.id);
        const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;

        res.status(400);
        if (commentsPage) {
          return renderWithLayout(
            res,
            'listings/comments',
            {
              title: `Comments about ${details.release.title} — The Vinyl Drop`,
              listing: details.listing,
              physicalCopy: details.physicalCopy,
              release: details.release,
              seller: details.seller,
              photos: details.photos,
              priceFormatted: formatPrice(details.listing.price, isTradeOnly),
              comments,
              currentUser: req.user,
              commentsPage: true,
              commentError: errMsg,
              submittedContent: content,
            },
            next
          );
        }

        return renderWithLayout(
          res,
          'listings/show',
          {
            title: `${details.release.title} by ${details.release.artist} — The Vinyl Drop`,
            listing: details.listing,
            physicalCopy: details.physicalCopy,
            release: details.release,
            seller: details.seller,
            photos: details.photos,
            priceFormatted: formatPrice(details.listing.price, isTradeOnly),
            comments,
            currentUser: req.user,
            isSeller: req.user.id === details.listing.sellerId,
            commentsInitiallyOpen: true,
            commentError: errMsg,
            submittedContent: content,
          },
          next
        );
      }

      throw err;
    }
  } catch (error) {
    next(error);
  }
}
