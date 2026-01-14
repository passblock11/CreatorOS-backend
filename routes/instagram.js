const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const instagramController = require('../controllers/instagramController');

// Connect Instagram account
router.get('/connect', protect, instagramController.connectInstagram);

// OAuth callback
router.get('/callback', instagramController.handleCallback);

// Get connection status
router.get('/status', protect, instagramController.getStatus);

// Disconnect account
router.post('/disconnect', protect, instagramController.disconnectInstagram);

module.exports = router;
