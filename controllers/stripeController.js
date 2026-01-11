const stripeService = require('../services/stripeService');
const User = require('../models/User');

exports.createCheckout = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!['pro', 'business'].includes(plan)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected',
      });
    }

    const user = await User.findById(req.user._id);

    let customerId = user.subscription.stripeCustomerId;

    if (!customerId) {
      const customer = await stripeService.createCustomer(
        user.email,
        user.name,
        user._id
      );
      customerId = customer.id;

      user.subscription.stripeCustomerId = customerId;
      await user.save();
    }

    const priceId = plan === 'pro' 
      ? process.env.STRIPE_PRICE_ID_PRO 
      : process.env.STRIPE_PRICE_ID_BUSINESS;

    const successUrl = `${process.env.FRONTEND_URL}/dashboard?subscription=success`;
    const cancelUrl = `${process.env.FRONTEND_URL}/dashboard?subscription=cancelled`;

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      user._id,
      successUrl,
      cancelUrl
    );

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating checkout session',
      error: error.message,
    });
  }
};

exports.createPortalSession = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.subscription.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        message: 'No subscription found',
      });
    }

    const returnUrl = `${process.env.FRONTEND_URL}/dashboard`;

    const session = await stripeService.createBillingPortalSession(
      user.subscription.stripeCustomerId,
      returnUrl
    );

    res.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error('Create portal session error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating portal session',
      error: error.message,
    });
  }
};

exports.cancelSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.subscription.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found',
      });
    }

    await stripeService.cancelSubscription(
      user.subscription.stripeSubscriptionId,
      user._id
    );

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the billing period',
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling subscription',
      error: error.message,
    });
  }
};

exports.webhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripeService.constructWebhookEvent(req.body, sig);

    await stripeService.handleWebhook(event);

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({
      success: false,
      message: `Webhook Error: ${error.message}`,
    });
  }
};

exports.getPlans = async (req, res) => {
  try {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        interval: 'month',
        features: [
          '10 posts per month',
          '5 scheduled posts',
          'Basic Snapchat integration',
          'Email support',
        ],
        limits: {
          postsPerMonth: 10,
          scheduledPosts: 5,
          analytics: false,
        },
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        interval: 'month',
        priceId: process.env.STRIPE_PRICE_ID_PRO,
        features: [
          '100 posts per month',
          '50 scheduled posts',
          'Advanced analytics',
          'Priority support',
          'Custom branding',
        ],
        limits: {
          postsPerMonth: 100,
          scheduledPosts: 50,
          analytics: true,
        },
      },
      {
        id: 'business',
        name: 'Business',
        price: 99,
        interval: 'month',
        priceId: process.env.STRIPE_PRICE_ID_BUSINESS,
        features: [
          'Unlimited posts',
          'Unlimited scheduled posts',
          'Advanced analytics',
          'Priority support',
          'Custom branding',
          'API access',
          'Team collaboration',
        ],
        limits: {
          postsPerMonth: -1,
          scheduledPosts: -1,
          analytics: true,
        },
      },
    ];

    res.json({
      success: true,
      plans,
    });
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching plans',
      error: error.message,
    });
  }
};
