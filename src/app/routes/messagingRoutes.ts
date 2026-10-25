import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validateSameOrigin } from '../middleware/csrf';
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
router.post('/listing/:listingId', validateSameOrigin, postStartConversation);
router.post('/profile/:profileId', validateSameOrigin, postStartDirectConversation);
router.post('/saved-people/:profileId', validateSameOrigin, postSavedPersonAction);
router.post('/:conversationId/send', validateSameOrigin, postSendMessage);
router.post('/:conversationId/read', validateSameOrigin, postMarkRead);
router.post('/:conversationId/archive', validateSameOrigin, postArchiveConversation);
router.get('/:conversationId', getConversationPage);

export default router;
