const Post = require('../models/Post');
const User = require('../models/User');
const snapchatService = require('../services/snapchatService');
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
        message: 'Post is already published',
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.snapchatAccount.isConnected) {
      return res.status(400).json({
        success: false,
        message: 'Please connect your Snapchat account first',
      });
    }

    const limits = user.getPlanLimits();
    if (limits.postsPerMonth !== -1 && user.usage.postsThisMonth >= limits.postsPerMonth) {
      return res.status(403).json({
        success: false,
        message: `You have reached your monthly post limit (${limits.postsPerMonth}). Please upgrade your plan.`,
      });
    }

    try {
      const accessToken = await ensureValidToken(user);

      let mediaId = null;
      if (post.mediaUrl) {
        const media = await snapchatService.uploadMedia(
          user.snapchatAccount.accountId,
          accessToken,
          {
            name: post.title,
            type: post.mediaType === 'video' ? 'VIDEO' : 'IMAGE',
            url: post.mediaUrl,
          },
          user._id
        );
        mediaId = media.id;
      }

      const creative = await snapchatService.createCreative(
        user.snapchatAccount.accountId,
        accessToken,
        {
          name: post.title,
          headline: post.content.substring(0, 34),
          mediaId: mediaId,
          brandName: 'Creator OS',
          callToAction: 'VIEW',
        },
        user._id
      );

      post.status = 'published';
      post.publishedAt = new Date();
      post.snapchatCreativeId = creative.id;
      await post.save();

      user.usage.postsThisMonth += 1;
      await user.save();

      res.json({
        success: true,
        message: 'Post published to Snapchat successfully',
        post,
      });
    } catch (snapError) {
      post.status = 'failed';
      post.error = {
        message: snapError.message,
        timestamp: new Date(),
      };
      await post.save();

      return res.status(500).json({
        success: false,
        message: 'Failed to publish to Snapchat',
        error: snapError.message,
      });
    }
  } catch (error) {
    console.error('Publish post error:', error);
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
