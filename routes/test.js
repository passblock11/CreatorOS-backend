const express = require('express');
const router = express.Router();
const MediaLibrary = require('../models/MediaLibrary');
const { protect } = require('../middleware/auth');

// Test endpoint to manually create a media library entry
router.post('/create-test-media', protect, async (req, res) => {
  try {
    console.log('🧪 [Test] Creating test media library entry...');
    console.log('User ID:', req.user._id);
    
    const testMedia = await MediaLibrary.create({
      user: req.user._id,
      url: 'https://test.com/test.jpg',
      publicId: 'test_' + Date.now(),
      type: 'image',
      filename: 'test-image.jpg',
      size: 1024,
      width: 1920,
      height: 1080,
      format: 'jpg',
      category: 'test',
      tags: ['test'],
      description: 'Test media entry',
    });
    
    console.log('✅ [Test] Test media created:', testMedia._id);
    
    res.json({
      success: true,
      message: 'Test media created successfully',
      mediaId: testMedia._id,
      media: testMedia,
    });
  } catch (error) {
    console.error('❌ [Test] Failed to create test media:');
    console.error('Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test media',
      error: error.message,
      fullError: error.toString(),
    });
  }
});

// Test endpoint to count media library entries
router.get('/count-media', protect, async (req, res) => {
  try {
    const count = await MediaLibrary.countDocuments({ user: req.user._id });
    const allMedia = await MediaLibrary.find({ user: req.user._id }).limit(5);
    
    res.json({
      success: true,
      count,
      sampleMedia: allMedia,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
