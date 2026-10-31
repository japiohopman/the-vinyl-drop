import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import {
  getCreateCustomReleasePage,
  getDiscogsMetadataLookup,
  postCreateCustomRelease,
  postImportDiscogsRelease,
} from '../controllers/releaseController';

import { multipartUploadHandler } from '../middleware/upload';
import { rateLimits } from '../services/rateLimitService';

const router = Router();

router.get('/lookup-metadata', requireAuth, rateLimits.discogsMetadataLookup, getDiscogsMetadataLookup);
router.get('/new', requireAuth, getCreateCustomReleasePage);
router.post('/new', requireAuth, validateSameOrigin, multipartUploadHandler, postCreateCustomRelease);
router.post('/import-discogs', requireAuth, validateSameOrigin, rateLimits.discogsImport, postImportDiscogsRelease);

export default router;
