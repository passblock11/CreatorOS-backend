const express = require('express');
const router = express.Router();
const youtubeController = require('../controllers/youtubeController');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Get YouTube OAuth URL
router.get('/auth-url', protect, youtubeController.getAuthURL);

// Handle OAuth callback
router.get('/callback', protect, youtubeController.handleCallback);

// Get connection status
router.get('/status', protect, youtubeController.getStatus);

// Disconnect YouTube
router.post('/disconnect', protect, apiLimiter, youtubeController.disconnect);

// Upload video
router.post('/upload', protect, apiLimiter, youtubeController.uploadVideo);

module.exports = router;
