const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const { upload } = require('../services/uploadService');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Upload single media file (image or video)
router.post('/media', protect, apiLimiter, upload.single('file'), uploadController.uploadMedia);

// Delete media file
router.delete('/media', protect, uploadController.deleteMedia);

module.exports = router;
