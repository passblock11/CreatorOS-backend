const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false,
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
  },
  role: {
    type: String,
    enum: ['creator', 'admin'],
    default: 'creator',
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'pro', 'business'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled', 'past_due'],
      default: 'active',
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodEnd: Date,
  },
  snapchatAccount: {
    isConnected: {
      type: Boolean,
      default: false,
    },
    accessToken: String,
    refreshToken: String,
    expiresAt: Date,
    accountId: String,
    organizationId: String,
  },
  usage: {
    postsThisMonth: {
      type: Number,
      default: 0,
    },
    lastResetDate: {
      type: Date,
      default: Date.now,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLogin: {
    type: Date,
  },
}, {
  timestamps: true,
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getPlanLimits = function() {
  const limits = {
    free: {
      postsPerMonth: 10,
      scheduledPosts: 5,
      analytics: false,
    },
    pro: {
      postsPerMonth: 100,
      scheduledPosts: 50,
      analytics: true,
    },
    business: {
      postsPerMonth: -1,
      scheduledPosts: -1,
      analytics: true,
    },
  };
  
  return limits[this.subscription.plan] || limits.free;
};

module.exports = mongoose.model('User', userSchema);
