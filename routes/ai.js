const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

// All AI routes require authentication
// Rate limiting applied to prevent abuse

/**
 * @route   POST /api/ai/generate
 * @desc    Generate content based on title
 * @access  Private
 */
router.post('/generate', protect, apiLimiter, aiController.generateContent);

/**
 * @route   POST /api/ai/variations
 * @desc    Generate multiple content variations
 * @access  Private
 */
router.post('/variations', protect, apiLimiter, aiController.generateVariations);

/**
 * @route   POST /api/ai/improve
 * @desc    Improve existing content
 * @access  Private
 */
router.post('/improve', protect, apiLimiter, aiController.improveContent);

/**
 * @route   POST /api/ai/hashtags
 * @desc    Generate hashtags for content
 * @access  Private
 */
router.post('/hashtags', protect, apiLimiter, aiController.generateHashtags);

module.exports = router;
