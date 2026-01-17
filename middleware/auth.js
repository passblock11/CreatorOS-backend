const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route',
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      req.user = await User.findById(decoded.id);
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found',
        });
      }

      // Auto-reset monthly usage counter if we're in a new month
      const now = new Date();
      const lastReset = req.user.usage.lastResetDate ? new Date(req.user.usage.lastResetDate) : null;
      
      const needsReset = !lastReset || 
        now.getMonth() !== lastReset.getMonth() || 
        now.getFullYear() !== lastReset.getFullYear();

      if (needsReset) {
        console.log(`🔄 [Usage Reset] Resetting monthly usage for user ${req.user._id}`);
        req.user.usage.postsThisMonth = 0;
        req.user.usage.lastResetDate = now;
        await req.user.save();
        console.log(`✅ [Usage Reset] Counter reset to 0`);
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Token is invalid or expired',
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

const checkSubscription = (requiredPlan = 'free') => {
  const planHierarchy = { free: 0, pro: 1, business: 2 };
  
  return (req, res, next) => {
    const userPlanLevel = planHierarchy[req.user.subscription.plan] || 0;
    const requiredPlanLevel = planHierarchy[requiredPlan] || 0;
    
    if (userPlanLevel < requiredPlanLevel) {
      return res.status(403).json({
        success: false,
        message: `This feature requires ${requiredPlan} plan or higher`,
        requiredPlan,
        currentPlan: req.user.subscription.plan,
      });
    }
    
    if (req.user.subscription.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your subscription is not active',
        status: req.user.subscription.status,
      });
    }
    
    next();
  };
};

module.exports = { protect, authorize, checkSubscription };
