const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { protect, checkSubscription } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.post('/', protect, apiLimiter, postController.createPostValidation, postController.createPost);
router.get('/', protect, postController.getPosts);
router.get('/analytics', protect, postController.getAnalytics);
router.get('/:id', protect, postController.getPost);
router.put('/:id', protect, postController.updatePost);
router.delete('/:id', protect, postController.deletePost);
router.post('/:id/publish', protect, apiLimiter, postController.publishPost);
router.post('/:id/sync-instagram-analytics', protect, postController.syncInstagramAnalytics);

// Cron job endpoints (secured by secret)
router.post('/cron/sync-analytics', postController.autoSyncAllAnalytics);
router.post('/cron/publish-scheduled', postController.autoPublishScheduledPosts);

module.exports = router;
