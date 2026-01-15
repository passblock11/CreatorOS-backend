const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadControllerVercel');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Upload single media file (image or video) - Vercel compatible
router.post('/media', protect, apiLimiter, uploadController.uploadMedia);

// Delete media file
router.delete('/media', protect, uploadController.deleteMedia);

module.exports = router;
