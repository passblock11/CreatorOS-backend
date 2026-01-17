const User = require('../models/User');
const youtubeService = require('../services/youtubeService');

/**
 * Get YouTube OAuth URL
 */
exports.getAuthURL = async (req, res) => {
  try {
    const authUrl = youtubeService.getAuthURL();
    
    res.json({
      success: true,
      authUrl,
    });
  } catch (error) {
    console.error('YouTube auth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating YouTube auth URL',
      error: error.message,
    });
  }
};

/**
 * Handle OAuth callback
 */
exports.handleCallback = async (req, res) => {
  try {
    const { code } = req.query;
    const userId = req.user._id;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
      });
    }

    console.log('🔐 [YouTube] Processing OAuth callback for user:', userId);

    // Exchange code for tokens
    const tokens = await youtubeService.getTokens(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    if (!tokens.refresh_token) {
      console.warn('⚠️  [YouTube] No refresh token received. User may need to reauthorize.');
    }

    // Get channel information
    const channelInfo = await youtubeService.getChannelInfo(tokens.access_token);

    // Calculate token expiry
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expiry_date ? tokens.expires_in : 3600));

    // Update user with YouTube credentials
    const user = await User.findById(userId);
    user.youtubeAccount = {
      isConnected: true,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.youtubeAccount?.refreshToken, // Keep old refresh token if not provided
      expiresAt,
      channelId: channelInfo.channelId,
      channelTitle: channelInfo.channelTitle,
      thumbnailUrl: channelInfo.thumbnailUrl,
    };
    await user.save();

    console.log('✅ [YouTube] Account connected successfully:', channelInfo.channelTitle);

    res.json({
      success: true,
      message: 'YouTube account connected successfully',
      channel: {
        channelId: channelInfo.channelId,
        channelTitle: channelInfo.channelTitle,
        thumbnailUrl: channelInfo.thumbnailUrl,
      },
    });
  } catch (error) {
    console.error('❌ [YouTube] Callback error:', error);
    res.status(500).json({
      success: false,
      message: 'Error connecting YouTube account',
      error: error.message,
    });
  }
};

/**
 * Get YouTube connection status
 */
exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.youtubeAccount?.isConnected) {
      return res.json({
        success: true,
        isConnected: false,
      });
    }

    // Check if token needs refresh
    const now = new Date();
    const expiresAt = new Date(user.youtubeAccount.expiresAt);
    const needsRefresh = expiresAt <= now;

    if (needsRefresh && user.youtubeAccount.refreshToken) {
      try {
        console.log('🔄 [YouTube] Refreshing access token...');
        const newTokens = await youtubeService.refreshAccessToken(user.youtubeAccount.refreshToken);
        
        const newExpiresAt = new Date();
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + (newTokens.expires_in || 3600));

        user.youtubeAccount.accessToken = newTokens.access_token;
        user.youtubeAccount.expiresAt = newExpiresAt;
        if (newTokens.refresh_token) {
          user.youtubeAccount.refreshToken = newTokens.refresh_token;
        }
        await user.save();

        console.log('✅ [YouTube] Token refreshed successfully');
      } catch (refreshError) {
        console.error('❌ [YouTube] Token refresh failed:', refreshError);
        // Token refresh failed, disconnect account
        user.youtubeAccount.isConnected = false;
        await user.save();
        
        return res.json({
          success: true,
          isConnected: false,
          error: 'Token expired. Please reconnect your YouTube account.',
        });
      }
    }

    res.json({
      success: true,
      isConnected: true,
      channel: {
        channelId: user.youtubeAccount.channelId,
        channelTitle: user.youtubeAccount.channelTitle,
        thumbnailUrl: user.youtubeAccount.thumbnailUrl,
      },
    });
  } catch (error) {
    console.error('YouTube status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking YouTube status',
      error: error.message,
    });
  }
};

/**
 * Disconnect YouTube account
 */
exports.disconnect = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    user.youtubeAccount = {
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      channelId: null,
      channelTitle: null,
      thumbnailUrl: null,
    };
    
    await user.save();

    console.log('✅ [YouTube] Account disconnected');

    res.json({
      success: true,
      message: 'YouTube account disconnected successfully',
    });
  } catch (error) {
    console.error('YouTube disconnect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting YouTube account',
      error: error.message,
    });
  }
};

/**
 * Upload video to YouTube
 */
exports.uploadVideo = async (req, res) => {
  try {
    const { videoUrl, title, description, tags, privacyStatus } = req.body;

    if (!videoUrl || !title) {
      return res.status(400).json({
        success: false,
        message: 'Video URL and title are required',
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.youtubeAccount?.isConnected) {
      return res.status(400).json({
        success: false,
        message: 'YouTube account not connected',
      });
    }

    // Check if token needs refresh
    const now = new Date();
    const expiresAt = new Date(user.youtubeAccount.expiresAt);
    if (expiresAt <= now && user.youtubeAccount.refreshToken) {
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

    const result = await youtubeService.uploadVideo(user.youtubeAccount.accessToken, {
      videoUrl,
      title,
      description,
      tags,
      privacyStatus: privacyStatus || 'public',
    });

    res.json({
      success: true,
      message: 'Video uploaded to YouTube successfully',
      data: result,
    });
  } catch (error) {
    console.error('YouTube upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading video to YouTube',
      error: error.message,
    });
  }
};

module.exports = exports;
