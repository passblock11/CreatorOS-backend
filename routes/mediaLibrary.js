const express = require('express');
const router = express.Router();
const mediaLibraryController = require('../controllers/mediaLibraryController');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// Get all media with filters
router.get('/', protect, mediaLibraryController.getMedia);

// Get library stats
router.get('/stats', protect, mediaLibraryController.getStats);

// Get all tags
router.get('/tags', protect, mediaLibraryController.getTags);

// Get all categories
router.get('/categories', protect, mediaLibraryController.getCategories);

// Get single media item
router.get('/:id', protect, mediaLibraryController.getMediaById);

// Update media metadata
router.put('/:id', protect, apiLimiter, mediaLibraryController.updateMedia);

// Delete single media
router.delete('/:id', protect, mediaLibraryController.deleteMedia);

// Bulk delete media
router.post('/bulk-delete', protect, apiLimiter, mediaLibraryController.bulkDeleteMedia);

module.exports = router;
