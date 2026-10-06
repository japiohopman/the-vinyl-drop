import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import {
  getCreateCustomReleasePage,
  postCreateCustomRelease,
  postImportDiscogsRelease,
} from '../controllers/releaseController';

import { multipartUploadHandler } from '../middleware/upload';

const router = Router();

router.get('/new', requireAuth, getCreateCustomReleasePage);
router.post('/new', requireAuth, validateSameOrigin, multipartUploadHandler, postCreateCustomRelease);
router.post('/import-discogs', requireAuth, validateSameOrigin, postImportDiscogsRelease);

export default router;
