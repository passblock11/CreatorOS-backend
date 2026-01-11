const express = require('express');
const router = express.Router();
const snapchatController = require('../controllers/snapchatController');
const { protect } = require('../middleware/auth');
const { snapchatLimiter } = require('../middleware/rateLimiter');

router.get('/auth-url', protect, snapchatController.getAuthURL);
router.get('/callback', snapchatController.handleCallback);
router.post('/disconnect', protect, snapchatController.disconnect);
router.get('/status', protect, snapchatController.getStatus);

module.exports = router;
