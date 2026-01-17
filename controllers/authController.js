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
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    
    console.log(`🔧 [Fix Subscription] Checking subscription for user ${user._id}`);
    console.log(`   Current plan: ${user.subscription.plan}`);
    console.log(`   Current status: ${user.subscription.status}`);
    console.log(`   Stripe customer ID: ${user.subscription.stripeCustomerId}`);
    console.log(`   Stripe subscription ID: ${user.subscription.stripeSubscriptionId}`);
    
    // If no Stripe customer ID, definitely free
    if (!user.subscription.stripeCustomerId) {
      console.log(`⚠️ No Stripe customer ID, setting to free`);
      user.subscription.plan = 'free';
      user.subscription.status = 'active';
      await user.save();
      
      return res.json({
        success: true,
        message: 'No Stripe account found. Plan set to FREE.',
        subscription: user.subscription,
      });
    }
    
    // Fetch all subscriptions for this customer from Stripe
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: user.subscription.stripeCustomerId,
        status: 'all',
        limit: 10,
      });
      
      console.log(`📊 Found ${subscriptions.data.length} subscriptions in Stripe`);
      
      // Find active subscription
      const activeSubscription = subscriptions.data.find(sub => 
        sub.status === 'active' && !sub.cancel_at_period_end
      );
      
      if (activeSubscription) {
        // We have an active subscription!
        const priceId = activeSubscription.items.data[0].price.id;
        
        let plan = 'free';
        if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
          plan = 'pro';
        } else if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) {
          plan = 'business';
        }
        
        console.log(`✅ Active subscription found!`);
        console.log(`   Subscription ID: ${activeSubscription.id}`);
        console.log(`   Price ID: ${priceId}`);
        console.log(`   Determined plan: ${plan}`);
        console.log(`   Status: ${activeSubscription.status}`);
        
        user.subscription.plan = plan;
        user.subscription.status = 'active';
        user.subscription.stripeSubscriptionId = activeSubscription.id;
        user.subscription.currentPeriodEnd = new Date(activeSubscription.current_period_end * 1000);
        await user.save();
        
        return res.json({
          success: true,
          message: `Subscription synced! You are on the ${plan.toUpperCase()} plan.`,
          subscription: user.subscription,
          stripeData: {
            subscriptionId: activeSubscription.id,
            status: activeSubscription.status,
            currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
          },
        });
      }
      
      // Check if there's a subscription set to cancel at period end (still active until then)
      const cancellingSubscription = subscriptions.data.find(sub => 
        sub.status === 'active' && sub.cancel_at_period_end === true
      );
      
      if (cancellingSubscription) {
        const priceId = cancellingSubscription.items.data[0].price.id;
        let plan = 'free';
        if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
          plan = 'pro';
        } else if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) {
          plan = 'business';
        }
        
        console.log(`⚠️ Subscription cancelling at period end`);
        console.log(`   Still active until: ${new Date(cancellingSubscription.current_period_end * 1000)}`);
        
        const now = new Date();
        const periodEnd = new Date(cancellingSubscription.current_period_end * 1000);
        
        if (now < periodEnd) {
          // Still active, keep the plan
          user.subscription.plan = plan;
          user.subscription.status = 'active';
          user.subscription.stripeSubscriptionId = cancellingSubscription.id;
          user.subscription.currentPeriodEnd = periodEnd;
          await user.save();
          
          return res.json({
            success: true,
            message: `Subscription active until ${periodEnd.toLocaleDateString()}. Plan: ${plan.toUpperCase()}`,
            subscription: user.subscription,
            note: 'Subscription will cancel at period end',
          });
        }
      }
      
      // No active subscription found
      console.log(`❌ No active subscription found in Stripe`);
      user.subscription.plan = 'free';
      user.subscription.status = 'cancelled';
      user.subscription.stripeSubscriptionId = null;
      await user.save();
      
      return res.json({
        success: true,
        message: 'No active subscription found in Stripe. Plan set to FREE.',
        subscription: user.subscription,
      });
      
    } catch (stripeError) {
      console.error(`⚠️ Stripe API error: ${stripeError.message}`);
      
      // If we can't reach Stripe, keep current state but warn user
      return res.json({
        success: false,
        message: `Could not verify with Stripe: ${stripeError.message}. Current plan unchanged.`,
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
