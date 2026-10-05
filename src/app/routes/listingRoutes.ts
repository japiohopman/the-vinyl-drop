import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import { multipartUploadHandler } from '../middleware/upload';
import {
  getSellerListings,
  getSelectReleasePage,
  getCreateListingPage,
  postCreateListing,
  getEditListingPage,
  postEditListing,
  postUploadPhoto,
  postDeletePhoto,
  postReorderPhotos,
  getPreviewListingPage,
  postPublishListing,
  postArchiveListing,
} from '../controllers/listingController';

const router = Router();

// Dashboard & Creation Flow
router.get('/', requireAuth, getSellerListings);
router.get('/new', requireAuth, getSelectReleasePage);
router.get('/create', requireAuth, getCreateListingPage);
router.post('/', requireAuth, validateSameOrigin, postCreateListing);

// Preview (public or seller)
router.get('/:id/preview', requireAuth, getPreviewListingPage);

// Editing & Details Updates
router.get('/:id/edit', requireAuth, getEditListingPage);
router.post('/:id/edit', requireAuth, validateSameOrigin, postEditListing);

// Photo Operations
router.post('/:id/photos', requireAuth, validateSameOrigin, multipartUploadHandler, postUploadPhoto);
router.post('/:id/photos/:photoId/delete', requireAuth, validateSameOrigin, postDeletePhoto);
router.post('/:id/photos/reorder', requireAuth, validateSameOrigin, postReorderPhotos);

// State Lifecycle Operations
router.post('/:id/publish', requireAuth, validateSameOrigin, postPublishListing);
router.post('/:id/archive', requireAuth, validateSameOrigin, postArchiveListing);

export default router;
