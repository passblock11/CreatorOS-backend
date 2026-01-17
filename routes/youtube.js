const express = require('express');
const router = express.Router();
const multer = require('multer');
const youtubeController = require('../controllers/youtubeController');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Multer setup for thumbnail uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max for thumbnails
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for thumbnails'));
    }
  },
});

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

// Sync video analytics
router.post('/analytics/:postId', protect, youtubeController.syncAnalytics);

// Upload custom thumbnail
router.post('/thumbnail/:postId', protect, upload.single('thumbnail'), youtubeController.uploadThumbnail);

module.exports = router;
