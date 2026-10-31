import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
import { rateLimits } from '../services/rateLimitService';
import {
  messagingFeatureGuard,
  getWidgetUnreadCount,
  getWidgetInbox,
  getWidgetConversation,
  getInboxPage,
  getConversationPage,
  postStartConversation,
  postStartDirectConversation,
  postSavedPersonAction,
  postSendMessage,
  postMarkRead,
  postArchiveConversation,
} from '../controllers/messagingController';

const router = Router();

router.use(messagingFeatureGuard);
router.use(requireAuth);

// Widget JSON routes stay behind the same fail-closed feature guard and auth middleware.
router.get('/widget/unread-count', getWidgetUnreadCount);
router.get('/widget/data', getWidgetInbox);
router.get('/widget/:conversationId', getWidgetConversation);
router.get('/', getInboxPage);
router.post('/listing/:listingId', validateSameOrigin, rateLimits.messageStart, postStartConversation);
// Preserve the original Listing message-start URL for existing callers.
router.post('/:listingId', validateSameOrigin, rateLimits.messageStart, postStartConversation);
router.post('/profile/:profileId', validateSameOrigin, rateLimits.messageStart, postStartDirectConversation);
router.post('/saved-people/:profileId', validateSameOrigin, postSavedPersonAction);
router.post('/:conversationId/send', validateSameOrigin, rateLimits.messageSend, postSendMessage);
router.post('/:conversationId/read', validateSameOrigin, postMarkRead);
router.post('/:conversationId/archive', validateSameOrigin, postArchiveConversation);
router.get('/:conversationId', getConversationPage);

export default router;
