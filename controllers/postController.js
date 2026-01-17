const Post = require('../models/Post');
const User = require('../models/User');
const snapchatPublicProfileService = require('../services/snapchatPublicProfileService');
const instagramService = require('../services/instagramService');
const youtubeService = require('../services/youtubeService');
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

    // Auto-sync analytics if:
    // 1. Post is published to Instagram
    // 2. Analytics haven't been synced in the last 30 minutes
    const shouldAutoSync = 
      post.status === 'published' &&
      post.instagramPostId &&
      (!post.analytics?.lastSynced || 
       Date.now() - new Date(post.analytics.lastSynced).getTime() > 30 * 60 * 1000);

    if (shouldAutoSync) {
      try {
        console.log('🔄 [Analytics] Auto-syncing analytics for post:', post._id);
        const user = await User.findById(req.user._id);
        await syncPostAnalytics(post, user);
        console.log('✅ [Analytics] Auto-sync complete');
      } catch (syncError) {
        // Don't fail the request if auto-sync fails
        console.error('⚠️ [Analytics] Auto-sync failed:', syncError.message);
      }
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
    console.log('🗑️ [Delete] Deleting post:', req.params.id);
    
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

    const user = await User.findById(req.user._id);
    const deletionResults = {
      database: false,
      instagram: null,
      snapchat: null
    };

    // Delete from Instagram if published there
    if (post.instagramPostId && user.instagramAccount?.isConnected) {
      try {
        console.log('🗑️ [Instagram] Deleting post from Instagram:', post.instagramPostId);
        await instagramService.deletePost(post.instagramPostId, user.instagramAccount.accessToken);
        deletionResults.instagram = 'deleted';
        console.log('✅ [Instagram] Post deleted from Instagram');
      } catch (error) {
        console.error('❌ [Instagram] Failed to delete from Instagram:', error.message);
        deletionResults.instagram = `failed: ${error.message}`;
        // Continue with database deletion even if Instagram deletion fails
      }
    }

    // Delete from Snapchat if published there
    // Note: Snapchat API doesn't support post deletion via API
    if (post.snapchatPostId) {
      console.log('ℹ️ [Snapchat] Snapchat does not support post deletion via API');
      deletionResults.snapchat = 'not_supported';
    }

    // Delete from database
    await post.deleteOne();
    deletionResults.database = true;
    console.log('✅ [Delete] Post deleted from database');

    res.json({
      success: true,
      message: 'Post deleted successfully',
      details: deletionResults
    });
  } catch (error) {
    console.error('❌ [Delete] Error:', error);
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
    const publishToSnapchat = ['snapchat', 'snapchat_instagram', 'snapchat_youtube', 'all'].includes(platform);
    const publishToInstagram = ['instagram', 'snapchat_instagram', 'instagram_youtube', 'all'].includes(platform);
    const publishToYouTube = ['youtube', 'snapchat_youtube', 'instagram_youtube', 'all'].includes(platform);

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

    if (publishToYouTube && !user.youtubeAccount.isConnected) {
      console.log('❌ YouTube account not connected');
      return res.status(400).json({
        success: false,
        message: 'Please connect your YouTube account first',
      });
    }

    // YouTube validation: only videos allowed
    if (publishToYouTube && post.mediaType !== 'video') {
      console.log('❌ YouTube requires video media');
      return res.status(400).json({
        success: false,
        message: 'YouTube only supports video content. Please upload a video.',
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
      youtube: null,
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

    // Publish to YouTube
    if (publishToYouTube) {
      try {
        console.log('🎥 Publishing to YouTube...');
        
        // Check if token needs refresh
        const now = new Date();
        const expiresAt = new Date(user.youtubeAccount.expiresAt);
        if (expiresAt <= now && user.youtubeAccount.refreshToken) {
          console.log('🔄 Refreshing YouTube token...');
          const newTokens = await youtubeService.refreshAccessToken(user.youtubeAccount.refreshToken);
          user.youtubeAccount.accessToken = newTokens.access_token;
          const newExpiresAt = new Date();
          newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (newTokens.expires_in || 3600));
          user.youtubeAccount.expiresAt = newExpiresAt;
          if (newTokens.refresh_token) {
            user.youtubeAccount.refreshToken = newTokens.refresh_token;
          }
          await user.save();
        }
        
        // Extract hashtags from content for YouTube tags
        const hashtagRegex = /#\w+/g;
        const hashtags = post.content.match(hashtagRegex) || [];
        const tags = hashtags.map(tag => tag.substring(1)); // Remove # symbol
        
        const youtubeResult = await youtubeService.uploadVideo(user.youtubeAccount.accessToken, {
          videoUrl: post.mediaUrl,
          title: post.title,
          description: post.content,
          tags: tags.slice(0, 15), // YouTube allows max 15 tags
          privacyStatus: 'public', // Can be 'public', 'private', or 'unlisted'
        });

        post.youtubeVideoId = youtubeResult.videoId;
        results.youtube = { success: true, videoId: youtubeResult.videoId, videoUrl: youtubeResult.videoUrl };
        
        console.log('✅ Published to YouTube successfully:', youtubeResult.videoUrl);
      } catch (youtubeError) {
        console.error('❌ YouTube publish error:', youtubeError.message);
        results.errors.push({ platform: 'youtube', error: youtubeError.message });
        
        if (!publishToSnapchat && !publishToInstagram) {
          // If only publishing to YouTube and it failed, mark as failed
          post.status = 'failed';
          post.error = {
            message: youtubeError.message,
            code: 'YOUTUBE_ERROR',
            timestamp: new Date(),
          };
          await post.save();
          
          return res.status(500).json({
            success: false,
            message: 'Failed to publish to YouTube',
            error: youtubeError.message,
          });
        }
      }
    }

    // Determine final status
    const snapchatSuccess = !publishToSnapchat || results.snapchat?.success;
    const instagramSuccess = !publishToInstagram || results.instagram?.success;
    const youtubeSuccess = !publishToYouTube || results.youtube?.success;
    
    if (snapchatSuccess && instagramSuccess && youtubeSuccess) {
      post.status = 'published';
      post.publishedAt = new Date();
      user.usage.postsThisMonth += 1;
      console.log('✅ Post published successfully to all platforms');
    } else if (snapchatSuccess || instagramSuccess || youtubeSuccess) {
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
    console.log('YouTube:', results.youtube || 'N/A');
    console.log('Errors:', results.errors.length > 0 ? results.errors : 'None');
    console.log('========================================');

    // Build platform list for message
    const platforms = [];
    if (publishToSnapchat) platforms.push('Snapchat');
    if (publishToInstagram) platforms.push('Instagram');
    if (publishToYouTube) platforms.push('YouTube');
    const platformList = platforms.join(' & ');
    
    const successMessage = `Post published successfully to ${platformList}`;

    res.json({
      success: true,
      message: results.errors.length > 0 
        ? `${successMessage} (with some errors)`
        : successMessage,
      post,
      results: {
        snapchat: results.snapchat,
        instagram: results.instagram,
        youtube: results.youtube,
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

/**
 * Helper function to sync analytics for a single post
 */
const syncPostAnalytics = async (post, user) => {
  if (!post.instagramPostId) {
    throw new Error('Post not published to Instagram');
  }

  if (!user.instagramAccount?.isConnected) {
    throw new Error('Instagram account not connected');
  }

  console.log('📊 Fetching analytics from Instagram for post:', post._id);
  
  // Ensure valid token
  const instagramAccount = await ensureValidInstagramToken(user);
  
  // Fetch analytics
  const analytics = await instagramService.getPostInsights(
    post.instagramPostId,
    instagramAccount.accessToken
  );

  // Update post analytics
  post.analytics.instagram = {
    likes: analytics.likes,
    comments: analytics.comments,
    saves: analytics.saves,
    reach: analytics.reach,
    impressions: analytics.impressions,
    engagement: analytics.engagement,
  };
  post.analytics.lastSynced = new Date();

  await post.save();

  return post.analytics;
};

/**
 * Sync Instagram analytics for a single post (manual trigger)
 */
exports.syncInstagramAnalytics = async (req, res) => {
  try {
    console.log('📊 [Analytics] Syncing Instagram analytics for post:', req.params.id);

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

    const user = await User.findById(req.user._id);
    
    const analytics = await syncPostAnalytics(post, user);

    console.log('✅ Analytics synced successfully');

    res.json({
      success: true,
      message: 'Analytics synced successfully',
      analytics,
    });
  } catch (error) {
    console.error('❌ Sync analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing analytics',
      error: error.message,
    });
  }
};

/**
 * Auto-sync analytics for all Instagram posts (Cron job endpoint)
 */
exports.autoSyncAllAnalytics = async (req, res) => {
  try {
    console.log('🔄 [Analytics] Starting batch analytics sync...');

    // Verify cron secret or Vercel Cron header for security
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    
    if (!isVercelCron && cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Find all published posts with Instagram post IDs
    // Only sync posts that haven't been synced in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const posts = await Post.find({
      status: 'published',
      instagramPostId: { $exists: true, $ne: null },
      $or: [
        { 'analytics.lastSynced': { $lt: oneHourAgo } },
        { 'analytics.lastSynced': { $exists: false } },
      ],
    }).populate('user');

    console.log(`📊 Found ${posts.length} posts to sync`);

    const results = {
      total: posts.length,
      synced: 0,
      failed: 0,
      errors: [],
    };

    // Sync each post
    for (const post of posts) {
      try {
        if (!post.user) {
          console.log(`⚠️ Post ${post._id} has no user, skipping`);
          results.failed++;
          continue;
        }

        await syncPostAnalytics(post, post.user);
        results.synced++;
        console.log(`✅ Synced analytics for post ${post._id}`);
      } catch (error) {
        console.error(`❌ Failed to sync post ${post._id}:`, error.message);
        results.failed++;
        results.errors.push({
          postId: post._id,
          error: error.message,
        });
      }
    }

    console.log('🎉 [Analytics] Batch sync complete:', results);

    res.json({
      success: true,
      message: 'Analytics batch sync complete',
      results,
    });
  } catch (error) {
    console.error('❌ Batch sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in batch analytics sync',
      error: error.message,
    });
  }
};

/**
 * Auto-publish scheduled posts (Cron job endpoint)
 * Checks for posts with scheduledFor <= now and publishes them
 */
exports.autoPublishScheduledPosts = async (req, res) => {
  try {
    console.log('🕐 [Scheduler] Starting scheduled posts check...');

    // Verify cron secret or Vercel Cron header for security
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    
    if (!isVercelCron && cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const now = new Date();
    
    // Find all scheduled posts that are due to be published
    const scheduledPosts = await Post.find({
      status: 'scheduled',
      scheduledFor: { $lte: now },
    }).populate('user');

    console.log(`📋 [Scheduler] Found ${scheduledPosts.length} posts to publish`);

    const results = {
      total: scheduledPosts.length,
      published: 0,
      failed: 0,
      errors: [],
    };

    // Publish each scheduled post
    for (const post of scheduledPosts) {
      try {
        if (!post.user) {
          console.log(`⚠️ Post ${post._id} has no user, skipping`);
          results.failed++;
          continue;
        }

        console.log(`📤 [Scheduler] Publishing post ${post._id}: "${post.title}"`);

        const user = post.user;
        
        // Check platform connections
        const platform = post.platform || 'snapchat';
        const publishToSnapchat = platform === 'snapchat' || platform === 'both';
        const publishToInstagram = platform === 'instagram' || platform === 'both';

        if (publishToSnapchat && !user.snapchatAccount.isConnected) {
          throw new Error('Snapchat account not connected');
        }

        if (publishToInstagram && !user.instagramAccount.isConnected) {
          throw new Error('Instagram account not connected');
        }

        // Check plan limits
        const limits = user.getPlanLimits();
        if (limits.postsPerMonth !== -1 && user.usage.postsThisMonth >= limits.postsPerMonth) {
          throw new Error(`Monthly post limit reached (${limits.postsPerMonth})`);
        }

        // Validate media requirement
        if (!post.mediaUrl) {
          throw new Error('Media required for publishing');
        }

        const publishResults = {
          snapchat: null,
          instagram: null,
        };

        // Publish to Snapchat
        if (publishToSnapchat) {
          try {
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
            publishResults.snapchat = { success: true, postId: snapPostId };
            console.log(`✅ [Scheduler] Published to Snapchat: ${snapPostId}`);
          } catch (snapError) {
            console.error(`❌ [Scheduler] Snapchat error:`, snapError.message);
            publishResults.snapchat = { success: false, error: snapError.message };
            if (!publishToInstagram) {
              throw snapError;
            }
          }
        }

        // Publish to Instagram
        if (publishToInstagram) {
          try {
            const instagramAccount = await ensureValidInstagramToken(user);
            const instaResult = await instagramService.uploadAndPublish(
              instagramAccount.userId,
              instagramAccount.accessToken,
              post.mediaUrl,
              `${post.title}\n\n${post.content}`,
              post.mediaType === 'video' ? 'VIDEO' : 'IMAGE'
            );

            if (!instaResult || !instaResult.postId) {
              throw new Error('No post ID returned from Instagram');
            }

            post.instagramPostId = instaResult.postId;
            publishResults.instagram = { success: true, postId: instaResult.postId };
            console.log(`✅ [Scheduler] Published to Instagram: ${instaResult.postId}`);
          } catch (instaError) {
            console.error(`❌ [Scheduler] Instagram error:`, instaError.message);
            publishResults.instagram = { success: false, error: instaError.message };
            if (!publishToSnapchat) {
              throw instaError;
            }
          }
        }

        // Update post status
        const snapchatSuccess = !publishToSnapchat || publishResults.snapchat?.success;
        const instagramSuccess = !publishToInstagram || publishResults.instagram?.success;

        if (snapchatSuccess || instagramSuccess) {
          post.status = 'published';
          post.publishedAt = new Date();
          user.usage.postsThisMonth += 1;
          await user.save();
          results.published++;
          console.log(`✅ [Scheduler] Post ${post._id} published successfully`);
        } else {
          post.status = 'failed';
          post.error = {
            message: 'Failed to publish to all platforms',
            code: 'SCHEDULER_PUBLISH_FAILED',
            timestamp: new Date(),
          };
          results.failed++;
          console.log(`❌ [Scheduler] Post ${post._id} failed to publish`);
        }

        await post.save();
      } catch (error) {
        console.error(`❌ [Scheduler] Failed to publish post ${post._id}:`, error.message);
        results.failed++;
        results.errors.push({
          postId: post._id,
          title: post.title,
          error: error.message,
        });

        // Mark post as failed
        post.status = 'failed';
        post.error = {
          message: error.message,
          code: 'SCHEDULER_ERROR',
          timestamp: new Date(),
        };
        await post.save();
      }
    }

    console.log('🎉 [Scheduler] Batch publish complete:', results);

    res.json({
      success: true,
      message: 'Scheduled posts batch publish complete',
      results,
    });
  } catch (error) {
    console.error('❌ [Scheduler] Batch publish error:', error);
    res.status(500).json({
      success: false,
      message: 'Error in scheduled posts batch publish',
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

    // Calculate total views from both Snapchat and Instagram
    const totalViews = recentPosts.reduce((sum, post) => {
      const snapchatViews = post.analytics?.views || 0;
      const instagramImpressions = post.analytics?.instagram?.impressions || 0;
      return sum + snapchatViews + instagramImpressions;
    }, 0);
    
    const totalImpressions = recentPosts.reduce((sum, post) => {
      const snapchatImpressions = post.analytics?.impressions || 0;
      const instagramImpressions = post.analytics?.instagram?.impressions || 0;
      return sum + snapchatImpressions + instagramImpressions;
    }, 0);
    
    const totalReach = recentPosts.reduce((sum, post) => {
      const snapchatReach = post.analytics?.reach || 0;
      const instagramReach = post.analytics?.instagram?.reach || 0;
      return sum + snapchatReach + instagramReach;
    }, 0);
    
    const totalInstagramLikes = recentPosts.reduce((sum, post) => sum + (post.analytics.instagram?.likes || 0), 0);
    const totalInstagramComments = recentPosts.reduce((sum, post) => sum + (post.analytics.instagram?.comments || 0), 0);
    const totalInstagramSaves = recentPosts.reduce((sum, post) => sum + (post.analytics.instagram?.saves || 0), 0);
    const totalInstagramEngagement = recentPosts.reduce((sum, post) => sum + (post.analytics.instagram?.engagement || 0), 0);

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
        totalReach,
        totalInstagramLikes,
        totalInstagramComments,
        totalInstagramSaves,
        totalInstagramEngagement,
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
