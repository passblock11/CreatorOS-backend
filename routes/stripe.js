const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');
const { protect } = require('../middleware/auth');

router.get('/plans', stripeController.getPlans);
router.post('/create-checkout', protect, stripeController.createCheckout);
router.post('/create-portal-session', protect, stripeController.createPortalSession);
router.post('/cancel-subscription', protect, stripeController.cancelSubscription);
router.post('/webhook', express.raw({ type: 'application/json' }), stripeController.webhook);

module.exports = router;
