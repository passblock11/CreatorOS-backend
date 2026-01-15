const Post = require('../models/Post');
const User = require('../models/User');
const snapchatPublicProfileService = require('../services/snapchatPublicProfileService');
const instagramService = require('../services/instagramService');
const { ensureValidToken: ensureValidSnapchatToken } = require('./snapchatController');
const { ensureValidToken: ensureValidInstagramToken } = require('./instagramController');
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

    const { title, content, mediaUrl, mediaType, platform, scheduledFor } = req.body;

    const post = await Post.create({
      user: req.user._id,
      title,
      content,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || 'none',
      platform: platform || 'snapchat',
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
    const { title, content, mediaUrl, mediaType, platform, scheduledFor, status } = req.body;

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
    if (platform) post.platform = platform;
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
      platform: post.platform,
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
      instagramConnected: user.instagramAccount.isConnected,
      plan: user.subscription.plan,
      postsThisMonth: user.usage.postsThisMonth,
    });

    // Check platform connections
    const platform = post.platform || 'snapchat';
    const publishToSnapchat = platform === 'snapchat' || platform === 'both';
    const publishToInstagram = platform === 'instagram' || platform === 'both';

    if (publishToSnapchat && !user.snapchatAccount.isConnected) {
      console.log('❌ Snapchat account not connected');
      return res.status(400).json({
        success: false,
        message: 'Please connect your Snapchat account first',
      });
    }

    if (publishToInstagram && !user.instagramAccount.isConnected) {
      console.log('❌ Instagram account not connected');
      return res.status(400).json({
        success: false,
        message: 'Please connect your Instagram account first',
      });
    }

    // Check plan limits
    const limits = user.getPlanLimits();
    console.log('📊 Plan limits:', limits);
    
    if (limits.postsPerMonth !== -1 && user.usage.postsThisMonth >= limits.postsPerMonth) {
      console.log('❌ Monthly post limit reached');
      return res.status(403).json({
        success: false,
        message: `You have reached your monthly post limit (${limits.postsPerMonth}). Please upgrade your plan.`,
      });
    }

    // Validate media requirement
    if (!post.mediaUrl) {
      console.log('❌ No media URL - Both platforms require media');
      return res.status(400).json({
        success: false,
        message: 'Media (image or video) is required for publishing',
      });
    }

    const results = {
      snapchat: null,
      instagram: null,
      errors: [],
    };

    // Publish to Snapchat
    if (publishToSnapchat) {
      try {
        console.log('👻 Publishing to Snapchat...');
        const snapchatToken = await ensureValidSnapchatToken(user);
        
        const snapResult = await snapchatPublicProfileService.postToPublicProfile(
          snapchatToken,
          {
            title: post.title,
            headline: post.content?.substring(0, 255) || post.title,
            mediaUrl: post.mediaUrl,
            mediaType: post.mediaType || 'image',
          },
          user._id
        );

        const snapPostId = snapResult?.data?.id || snapResult?.id || 'published';
        post.snapchatPostId = snapPostId;
        results.snapchat = { success: true, postId: snapPostId };
        
        console.log('✅ Published to Snapchat successfully');
      } catch (snapError) {
        console.error('❌ Snapchat publish error:', snapError.message);
        results.errors.push({ platform: 'snapchat', error: snapError.message });
        
        if (!publishToInstagram) {
          // If only publishing to Snapchat and it failed, mark as failed
          post.status = 'failed';
          post.error = {
            message: snapError.message,
            code: 'SNAPCHAT_ERROR',
            timestamp: new Date(),
          };
          await post.save();
          
          return res.status(500).json({
            success: false,
            message: 'Failed to publish to Snapchat',
            error: snapError.message,
          });
        }
      }
    }

    // Publish to Instagram
    if (publishToInstagram) {
      try {
        console.log('📷 Publishing to Instagram...');
        const instagramAccount = await ensureValidInstagramToken(user);
        
        console.log('📷 Instagram account details:', {
          userId: instagramAccount.userId,
          username: instagramAccount.username,
          hasAccessToken: !!instagramAccount.accessToken
        });
        
        console.log('📷 Post details:', {
          mediaUrl: post.mediaUrl,
          mediaType: post.mediaType,
          caption: `${post.title}\n\n${post.content}`.substring(0, 100) + '...'
        });
        
        const instaResult = await instagramService.uploadAndPublish(
          instagramAccount.userId,
          instagramAccount.accessToken,
          post.mediaUrl,
          `${post.title}\n\n${post.content}`,
          post.mediaType === 'video' ? 'VIDEO' : 'IMAGE'
        );

        console.log('📷 Instagram result:', instaResult);

        if (!instaResult || !instaResult.postId) {
          throw new Error('No post ID returned from Instagram');
        }

        post.instagramPostId = instaResult.postId;
        results.instagram = { success: true, postId: instaResult.postId };
        
        console.log('✅ Published to Instagram successfully, Post ID:', instaResult.postId);
      } catch (instaError) {
        console.error('❌ Instagram publish error:', instaError.message);
        console.error('❌ Instagram error stack:', instaError.stack);
        results.errors.push({ platform: 'instagram', error: instaError.message });
        
        if (!publishToSnapchat) {
          // If only publishing to Instagram and it failed, mark as failed
          post.status = 'failed';
          post.error = {
            message: instaError.message,
            code: 'INSTAGRAM_ERROR',
            timestamp: new Date(),
          };
          await post.save();
          
          return res.status(500).json({
            success: false,
            message: 'Failed to publish to Instagram',
            error: instaError.message,
          });
        }
      }
    }

    // Determine final status
    const snapchatSuccess = !publishToSnapchat || results.snapchat?.success;
    const instagramSuccess = !publishToInstagram || results.instagram?.success;
    
    if (snapchatSuccess && instagramSuccess) {
      post.status = 'published';
      post.publishedAt = new Date();
      user.usage.postsThisMonth += 1;
      console.log('✅ Post published successfully to all platforms');
    } else if (snapchatSuccess || instagramSuccess) {
      post.status = 'published';
      post.publishedAt = new Date();
      user.usage.postsThisMonth += 1;
      console.log('⚠️  Post published to some platforms with errors');
    } else {
      post.status = 'failed';
      post.error = {
        message: 'Failed to publish to all platforms',
        code: 'ALL_PLATFORMS_FAILED',
        timestamp: new Date(),
      };
      console.log('❌ Failed to publish to all platforms');
    }

    await post.save();
    await user.save();

    console.log('========================================');
    console.log('📊 PUBLISH RESULTS:');
    console.log('Snapchat:', results.snapchat || 'N/A');
    console.log('Instagram:', results.instagram || 'N/A');
    console.log('Errors:', results.errors.length > 0 ? results.errors : 'None');
    console.log('========================================');

    const successMessage = platform === 'both' 
      ? 'Post published successfully'
      : `Post published to ${platform} successfully`;

    res.json({
      success: true,
      message: results.errors.length > 0 
        ? `${successMessage} (with some errors)`
        : successMessage,
      post,
      results: {
        snapchat: results.snapchat,
        instagram: results.instagram,
        errors: results.errors,
      },
    });
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
