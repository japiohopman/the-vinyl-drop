import { Request, Response, NextFunction } from 'express';
import { renderWithLayout } from '../utils/render';
import { listReleases, findReleaseById } from '../repositories/releaseRepository';
import {
  getUserListings,
  getListingWithDetails,
  getListingWithDetailsForView,
  createListingFromRelease,
  updateListing,
  addPhotoToListing,
  deletePhotoFromListing,
  reorderListingPhotos,
  publishListing,
  archiveListing,
} from '../services/listingService';
import { getListingComments, addComment } from '../services/commentService';
import { formatPrice } from '../view-models/listingCardViewModel';
import { FormViewModel } from '../view-models/formViewModel';
import { parsePriceEurToCents } from '../../validators/listing';
import { ValidationError, NotFoundError, AuthorizationError } from '../services/errors';

export async function getSellerListings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const rawListings = await getUserListings(req.user.id);
    const detailedListings = [];

    for (const listing of rawListings) {
      const details = await getListingWithDetails(listing.id);
      if (details) {
        const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;
        detailedListings.push({
          ...details,
          id: details.listing.id,
          status: details.listing.status,
          tradeAvailable: details.listing.tradeAvailable,
          priceFormatted: formatPrice(details.listing.price, isTradeOnly),
        });
      }
    }

    renderWithLayout(res, 'listings/index', {
      title: 'My Listings - The Vinyl Drop',
      listings: detailedListings,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSelectReleasePage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const releases = await listReleases(100);
    renderWithLayout(res, 'listings/select-release', {
      title: 'Select a Release - The Vinyl Drop',
      releases,
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
      return renderWithLayout(res, 'errors/500', {
        title: '404 Not Found',
        message: 'Selected release was not found.',
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
    const details = await getListingWithDetails(listingId);

    if (!details) {
      res.status(404);
      return renderWithLayout(res, 'errors/500', {
        title: '404 Not Found',
        message: 'Listing not found.',
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
      const details = await getListingWithDetails(listingId);
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
        });
      }
    }
    next(error);
  }
}

export async function postUploadPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    const files = req.files || [];

    if (files.length === 0) {
      throw new ValidationError('Please select an image file to upload.');
    }

    for (const file of files) {
      await addPhotoToListing(listingId, req.user.id, {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.filename,
      }, req.body.altText);
    }

    res.redirect(`/listings/${listingId}/edit`);
  } catch (error) {
    if (error instanceof ValidationError) {
      const listingId = req.params.id;
      const details = await getListingWithDetails(listingId);
      if (details) {
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
        });
      }
    }
    next(error);
  }
}

export async function postDeletePhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const { id: listingId, photoId } = req.params;
    await deletePhotoFromListing(listingId, photoId, req.user.id);

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
    const details = await getListingWithDetails(listingId);

    if (!details) {
      res.status(404);
      return renderWithLayout(res, 'errors/500', {
        title: '404 Not Found',
        message: 'Listing not found.',
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

export async function postPublishListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return res.redirect('/auth/login');
    }

    const listingId = req.params.id;
    const previewConfirmed = req.body.previewConfirmed === 'true' || req.body.previewConfirmed === true;

    await publishListing(listingId, req.user.id, { previewConfirmed });

    res.redirect(`/listings/${listingId}/preview`);
  } catch (error) {
    if (error instanceof ValidationError || (error as Error).name === 'InvalidLifecycleTransitionError') {
      const listingId = req.params.id;
      const details = await getListingWithDetails(listingId);
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

export async function getListingDetailPage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listingId = req.params.id;
    const requestingUserId = req.user?.id;

    let details;
    try {
      details = await getListingWithDetailsForView(listingId, requestingUserId);
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

    const comments = await getListingComments(listingId, requestingUserId);
    const isTradeOnly = details.listing.tradeAvailable && details.listing.price === null;
    const priceFormatted = formatPrice(details.listing.price, isTradeOnly);

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

    try {
      await addComment(listingId, req.user.id, content);
      res.redirect(`/listings/${listingId}#comments`);
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
