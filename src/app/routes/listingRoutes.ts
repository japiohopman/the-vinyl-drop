import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import { multipartUploadHandler } from '../middleware/upload';
import { conditionalDiscogsSearchRateLimit, rateLimits } from '../services/rateLimitService';
import {
  getSellerListings,
  getSelectReleasePage,
  getCreateListingPage,
  postCreateListing,
  getListingDetailPage,
  getListingCommentsPage,
  postCreateComment,
  getEditListingPage,
  postEditListing,
  postUpdateReleaseYouTubePreview,
  postUploadPhoto,
  postDeletePhoto,
  postUpdatePhotoRole,
  postReorderPhotos,
  getPreviewListingPage,
  postPublishListing,
  postArchiveListing,
  postDismissCompletedListing,
  postRestoreCompletedListing,
  postUnpublishListing,
} from '../controllers/listingController';
import { postFavoriteListing, postUnfavoriteListing } from '../controllers/favoriteController';

const router = Router();

// Dashboard & Creation Flow
router.get('/', requireAuth, getSellerListings);
router.get('/new', requireAuth, conditionalDiscogsSearchRateLimit, getSelectReleasePage);
router.get('/create', requireAuth, getCreateListingPage);
router.post('/', requireAuth, validateSameOrigin, rateLimits.listingCreate, postCreateListing);

// Public Listing Detail Page
router.get('/:id/comments', getListingCommentsPage);
router.get('/:id', getListingDetailPage);

// Comment Thread Operations
router.post('/:id/comments', requireAuth, validateSameOrigin, rateLimits.listingComment, postCreateComment);

// Favorite Operations
router.post('/:id/favorite', requireAuth, validateSameOrigin, postFavoriteListing);
router.post('/:id/unfavorite', requireAuth, validateSameOrigin, postUnfavoriteListing);

// Preview (public or seller)
router.get('/:id/preview', requireAuth, getPreviewListingPage);

// Editing & Details Updates
router.get('/:id/edit', requireAuth, getEditListingPage);
router.post('/:id/edit', requireAuth, validateSameOrigin, postEditListing);
router.post('/:id/release-preview', requireAuth, validateSameOrigin, postUpdateReleaseYouTubePreview);

// Photo Operations
router.post('/:id/photos', requireAuth, validateSameOrigin, rateLimits.listingPhotoUpload, multipartUploadHandler, postUploadPhoto);
router.post('/:id/photos/:photoId/delete', requireAuth, validateSameOrigin, postDeletePhoto);
router.post('/:id/photos/:photoId/role', requireAuth, validateSameOrigin, postUpdatePhotoRole);
router.post('/:id/photos/reorder', requireAuth, validateSameOrigin, postReorderPhotos);

// State Lifecycle Operations
router.post('/:id/publish', requireAuth, validateSameOrigin, postPublishListing);
router.post('/:id/unpublish', requireAuth, validateSameOrigin, postUnpublishListing);
router.post('/:id/archive', requireAuth, validateSameOrigin, postArchiveListing);
router.post('/:id/dismiss', requireAuth, validateSameOrigin, postDismissCompletedListing);
router.post('/:id/restore-dismissed', requireAuth, validateSameOrigin, postRestoreCompletedListing);

export default router;
