const Post = require('../models/Post');
const User = require('../models/User');
const snapchatPublicProfileService = require('../services/snapchatPublicProfileService');
const { ensureValidToken } = require('./snapchatController');
const { body, validationResult } = require('express-validator');

exports.createPostValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
];

exports.createPost = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { title, content, mediaUrl, mediaType, scheduledFor } = req.body;

    const post = await Post.create({
      user: req.user._id,
      title,
      content,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || 'none',
      status: scheduledFor ? 'scheduled' : 'draft',
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
    });

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      post,
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating post',
      error: error.message,
    });
  }
};

exports.getPosts = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;

    const query = { user: req.user._id };
    if (status) {
      query.status = status;
    }

    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Post.countDocuments(query);

    res.json({
      success: true,
      posts,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count,
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching posts',
      error: error.message,
    });
  }
};

exports.getPost = async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    res.json({
      success: true,
      post,
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching post',
      error: error.message,
    });
  }
};

exports.updatePost = async (req, res) => {
  try {
    const { title, content, mediaUrl, mediaType, scheduledFor, status } = req.body;

    const post = await Post.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    if (post.status === 'published') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit published posts',
      });
    }

    if (title) post.title = title;
    if (content) post.content = content;
    if (mediaUrl !== undefined) post.mediaUrl = mediaUrl;
    if (mediaType) post.mediaType = mediaType;
    if (scheduledFor) {
      post.scheduledFor = new Date(scheduledFor);
      post.status = 'scheduled';
    }
    if (status) post.status = status;

    await post.save();

    res.json({
      success: true,
      message: 'Post updated successfully',
      post,
    });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating post',
      error: error.message,
    });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    await post.deleteOne();

    res.json({
      success: true,
      message: 'Post deleted successfully',
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting post',
      error: error.message,
    });
  }
};

exports.publishPost = async (req, res) => {
  try {
    console.log('========================================');
    console.log('📤 PUBLISH POST REQUEST STARTED');
    console.log('Post ID:', req.params.id);
    console.log('User ID:', req.user._id);
    console.log('========================================');

    const post = await Post.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!post) {
      console.log('❌ Post not found');
      return res.status(404).json({
        success: false,
        message: 'Post not found',
      });
    }

    console.log('✅ Post found:', {
      title: post.title,
      status: post.status,
      mediaType: post.mediaType,
      mediaUrl: post.mediaUrl,
    });

    if (post.status === 'published') {
      console.log('❌ Post already published');
      return res.status(400).json({
        success: false,
        message: 'Post is already published',
      });
    }

    const user = await User.findById(req.user._id);
    console.log('✅ User loaded:', {
      email: user.email,
      snapchatConnected: user.snapchatAccount.isConnected,
      accountId: user.snapchatAccount.accountId,
      plan: user.subscription.plan,
      postsThisMonth: user.usage.postsThisMonth,
    });

    if (!user.snapchatAccount.isConnected) {
      console.log('❌ Snapchat account not connected');
      return res.status(400).json({
        success: false,
        message: 'Please connect your Snapchat account first',
      });
    }

    if (!user.snapchatAccount.accountId) {
      console.log('❌ Snapchat account ID missing');
      return res.status(400).json({
        success: false,
        message: 'Snapchat account ID is missing. Please reconnect your Snapchat account.',
      });
    }

    const limits = user.getPlanLimits();
    console.log('📊 Plan limits:', limits);
    
    if (limits.postsPerMonth !== -1 && user.usage.postsThisMonth >= limits.postsPerMonth) {
      console.log('❌ Monthly post limit reached');
      return res.status(403).json({
        success: false,
        message: `You have reached your monthly post limit (${limits.postsPerMonth}). Please upgrade your plan.`,
      });
    }

    try {
      console.log('🔐 Getting/refreshing access token...');
      const accessToken = await ensureValidToken(user);
      console.log('✅ Access token obtained:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');

      if (!post.mediaUrl) {
        console.log('❌ No media URL - Public Profile posts require media');
        return res.status(400).json({
          success: false,
          message: 'Media (image or video) is required for Snapchat Public Profile posts',
        });
      }

      console.log('📸 Posting to Snapchat Public Profile...');
      console.log('Post details:', {
        title: post.title,
        content: post.content,
        mediaType: post.mediaType,
        mediaUrl: post.mediaUrl,
      });

      const result = await snapchatPublicProfileService.postToPublicProfile(
        accessToken,
        {
          title: post.title,
          headline: post.content?.substring(0, 255) || post.title,
          mediaUrl: post.mediaUrl,
          mediaType: post.mediaType || 'image',
        },
        user._id
      );

      console.log('✅ Posted to Public Profile successfully');
      console.log('Post result:', JSON.stringify(result, null, 2));

      // Extract story/post ID from response
      const postId = result?.data?.id || result?.id || 'published';

      post.status = 'published';
      post.publishedAt = new Date();
      post.snapchatCreativeId = postId;
      await post.save();
      console.log('✅ Post saved as published');

      user.usage.postsThisMonth += 1;
      await user.save();
      console.log('✅ User usage incremented');

      console.log('========================================');
      console.log('✅ PUBLISH TO PUBLIC PROFILE COMPLETED');
      console.log('Post ID:', postId);
      console.log('========================================');

      res.json({
        success: true,
        message: 'Post published to Snapchat Public Profile successfully',
        post,
      });
    } catch (snapError) {
      console.error('========================================');
      console.error('❌ SNAPCHAT PUBLIC PROFILE POST ERROR:');
      console.error('Error message:', snapError.message);
      console.error('Error stack:', snapError.stack);
      console.error('========================================');

      post.status = 'failed';
      post.error = {
        message: snapError.message,
        code: snapError.response?.data?.request_status || 'UNKNOWN',
        timestamp: new Date(),
      };
      await post.save();
      console.log('⚠️  Post marked as failed and saved');

      return res.status(500).json({
        success: false,
        message: 'Failed to publish to Snapchat',
        error: snapError.message,
        details: snapError.response?.data,
      });
    }
  } catch (error) {
    console.error('========================================');
    console.error('❌ PUBLISH POST ERROR (OUTER):');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================');
    
    res.status(500).json({
      success: false,
      message: 'Error publishing post',
      error: error.message,
    });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const totalPosts = await Post.countDocuments({ user: req.user._id });
    const publishedPosts = await Post.countDocuments({ user: req.user._id, status: 'published' });
    const scheduledPosts = await Post.countDocuments({ user: req.user._id, status: 'scheduled' });
    const draftPosts = await Post.countDocuments({ user: req.user._id, status: 'draft' });

    const recentPosts = await Post.find({ user: req.user._id, status: 'published' })
      .sort({ publishedAt: -1 })
      .limit(10);

    const totalViews = recentPosts.reduce((sum, post) => sum + post.analytics.views, 0);
    const totalImpressions = recentPosts.reduce((sum, post) => sum + post.analytics.impressions, 0);

    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      analytics: {
        totalPosts,
        publishedPosts,
        scheduledPosts,
        draftPosts,
        totalViews,
        totalImpressions,
        postsThisMonth: user.usage.postsThisMonth,
        planLimits: user.getPlanLimits(),
      },
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message,
    });
  }
};
