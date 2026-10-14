import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import {
  messagingFeatureGuard,
  getInboxPage,
  getConversationPage,
  postStartConversation,
  postSendMessage,
  postMarkRead,
  postArchiveConversation,
} from '../controllers/messagingController';

const router = Router();

router.use(messagingFeatureGuard);
router.use(requireAuth);

router.get('/', getInboxPage);
router.get('/:conversationId', getConversationPage);
router.post('/listing/:listingId', validateSameOrigin, postStartConversation);
router.post('/:conversationId/send', validateSameOrigin, postSendMessage);
router.post('/:conversationId/read', validateSameOrigin, postMarkRead);
router.post('/:conversationId/archive', validateSameOrigin, postArchiveConversation);

export default router;
