const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { body, validationResult } = require('express-validator');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
];

exports.loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, password, name } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email',
      });
    }

    const user = await User.create({
      email,
      password,
      name,
      role: 'creator',
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
        snapchatAccount: {
          isConnected: user.snapchatAccount.isConnected,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message,
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscription: user.subscription,
        snapchatAccount: {
          isConnected: user.snapchatAccount.isConnected,
        },
        usage: user.usage,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user data',
      error: error.message,
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name } = req.body;

    const user = await User.findById(req.user._id);

    if (name) {
      user.name = name;
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message,
    });
  }
};

exports.resetMonthlyUsage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const Post = require('../models/Post');
    
    console.log(`🔄 [Manual Reset] Recalculating usage for user ${user._id}`);
    console.log(`   Old counter: ${user.usage.postsThisMonth}`);
    
    // Calculate actual posts from this month from database
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const postsThisMonth = await Post.countDocuments({
      user: user._id,
      status: 'published',
      publishedAt: { $gte: startOfMonth }
    });
    
    user.usage.postsThisMonth = postsThisMonth;
    user.usage.lastResetDate = now;
    await user.save();
    
    console.log(`✅ [Manual Reset] Counter recalculated to ${postsThisMonth}`);

    res.json({
      success: true,
      message: `Monthly usage recalculated: ${postsThisMonth} posts this month`,
      usage: user.usage,
    });
  } catch (error) {
    console.error('Reset usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting usage',
      error: error.message,
    });
  }
};

exports.fixSubscription = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    console.log(`🔧 [Fix Subscription] Checking subscription for user ${user._id}`);
    console.log(`   Current plan: ${user.subscription.plan}`);
    console.log(`   Current status: ${user.subscription.status}`);
    console.log(`   Stripe subscription ID: ${user.subscription.stripeSubscriptionId}`);
    
    // If user has no active Stripe subscription, downgrade to free
    if (!user.subscription.stripeSubscriptionId || user.subscription.status === 'cancelled') {
      console.log(`⚠️ No active Stripe subscription, downgrading to free`);
      user.subscription.plan = 'free';
      user.subscription.status = 'active';
      await user.save();
      
      return res.json({
        success: true,
        message: 'Subscription fixed: downgraded to free plan',
        subscription: user.subscription,
      });
    }
    
    // Otherwise, fetch from Stripe to verify
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    try {
      const subscription = await stripe.subscriptions.retrieve(user.subscription.stripeSubscriptionId);
      
      console.log(`📊 Stripe subscription status: ${subscription.status}`);
      console.log(`   Cancel at period end: ${subscription.cancel_at_period_end}`);
      
      if (subscription.status === 'canceled' || subscription.cancel_at_period_end) {
        user.subscription.plan = 'free';
        user.subscription.status = 'cancelled';
        user.subscription.stripeSubscriptionId = null;
        await user.save();
        
        return res.json({
          success: true,
          message: 'Subscription fixed: cancelled subscription detected, downgraded to free',
          subscription: user.subscription,
        });
      }
      
      res.json({
        success: true,
        message: 'Subscription is valid and active',
        subscription: user.subscription,
      });
    } catch (stripeError) {
      console.log(`⚠️ Could not fetch Stripe subscription: ${stripeError.message}`);
      console.log(`   Downgrading to free as a safety measure`);
      
      user.subscription.plan = 'free';
      user.subscription.status = 'cancelled';
      user.subscription.stripeSubscriptionId = null;
      await user.save();
      
      res.json({
        success: true,
        message: 'Subscription fixed: invalid Stripe subscription, downgraded to free',
        subscription: user.subscription,
      });
    }
  } catch (error) {
    console.error('Fix subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fixing subscription',
      error: error.message,
    });
  }
};
