const User = require('../models/User');
const Post = require('../models/Post');
const ApiLog = require('../models/ApiLog');

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, plan, status } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (plan) {
      query['subscription.plan'] = plan;
    }
    
    if (status) {
      query['subscription.status'] = status;
    }

    const users = await User.find(query)
      .select('-snapchatAccount.accessToken -snapchatAccount.refreshToken')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count,
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message,
    });
  }
};

exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-snapchatAccount.accessToken -snapchatAccount.refreshToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const postCount = await Post.countDocuments({ user: user._id });
    const publishedCount = await Post.countDocuments({ user: user._id, status: 'published' });

    res.json({
      success: true,
      user,
      stats: {
        totalPosts: postCount,
        publishedPosts: publishedCount,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { role, subscriptionPlan, subscriptionStatus } = req.body;

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (role) {
      user.role = role;
    }

    if (subscriptionPlan) {
      user.subscription.plan = subscriptionPlan;
    }

    if (subscriptionStatus) {
      user.subscription.status = subscriptionStatus;
    }

    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      user,
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user',
      error: error.message,
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete admin users',
      });
    }

    await Post.deleteMany({ user: user._id });
    await ApiLog.deleteMany({ user: user._id });
    await user.deleteOne();

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user',
      error: error.message,
    });
  }
};

exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeSubscriptions = await User.countDocuments({ 
      'subscription.status': 'active',
      'subscription.plan': { $ne: 'free' },
    });
    
    const totalPosts = await Post.countDocuments();
    const publishedPosts = await Post.countDocuments({ status: 'published' });

    const usersByPlan = await User.aggregate([
      {
        $group: {
          _id: '$subscription.plan',
          count: { $sum: 1 },
        },
      },
    ]);

    const recentUsers = await User.find()
      .select('name email createdAt subscription.plan')
      .sort({ createdAt: -1 })
      .limit(10);

    const apiLogs = await ApiLog.find()
      .sort({ createdAt: -1 })
      .limit(100);

    const apiStats = {
      total: apiLogs.length,
      successful: apiLogs.filter(log => log.success).length,
      failed: apiLogs.filter(log => !log.success).length,
      byService: {},
    };

    apiLogs.forEach(log => {
      if (!apiStats.byService[log.service]) {
        apiStats.byService[log.service] = { total: 0, successful: 0, failed: 0 };
      }
      apiStats.byService[log.service].total++;
      if (log.success) {
        apiStats.byService[log.service].successful++;
      } else {
        apiStats.byService[log.service].failed++;
      }
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeSubscriptions,
        totalPosts,
        publishedPosts,
        usersByPlan,
        recentUsers,
        apiStats,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message,
    });
  }
};

exports.getApiLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, service, success } = req.query;

    const query = {};
    
    if (service) {
      query.service = service;
    }
    
    if (success !== undefined) {
      query.success = success === 'true';
    }

    const logs = await ApiLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await ApiLog.countDocuments(query);

    res.json({
      success: true,
      logs,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count,
    });
  } catch (error) {
    console.error('Get API logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching API logs',
      error: error.message,
    });
  }
};
