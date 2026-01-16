const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadControllerVercel');
const cloudinaryDirectController = require('../controllers/cloudinaryDirectController');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Upload single media file (image or video) - Vercel compatible
// For files < 50MB
router.post('/media', protect, apiLimiter, uploadController.uploadMedia);

// Get signed upload URL for direct Cloudinary upload
// For files > 50MB or to bypass Vercel body size limits
router.get('/signature', protect, cloudinaryDirectController.getUploadSignature);

// Verify direct Cloudinary upload
router.post('/verify', protect, cloudinaryDirectController.verifyUpload);

// Delete media file
router.delete('/media', protect, uploadController.deleteMedia);

module.exports = router;
