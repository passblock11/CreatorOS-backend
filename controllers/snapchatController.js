const snapchatService = require('../services/snapchatService');
const snapchatPublicProfileService = require('../services/snapchatPublicProfileService');
const User = require('../models/User');

exports.getAuthURL = async (req, res) => {
  try {
    const state = Buffer.from(JSON.stringify({
      userId: req.user._id.toString(),
      timestamp: Date.now(),
    })).toString('base64');

    const authURL = snapchatService.getAuthorizationURL(state);

    res.json({
      success: true,
      authURL,
    });
  } catch (error) {
    console.error('Get auth URL error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating authorization URL',
      error: error.message,
    });
  }
};

exports.handleCallback = async (req, res) => {
  try {
    console.log('========================================');
    console.log('🔗 SNAPCHAT PUBLIC PROFILE OAUTH CALLBACK');
    console.log('========================================');

    const { code, state } = req.query;

    if (!code) {
      console.log('❌ No authorization code provided');
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
      });
    }

    console.log('✅ Authorization code received');
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.userId;
    console.log('User ID from state:', userId);

    console.log('🔄 Exchanging code for tokens...');
    const tokens = await snapchatPublicProfileService.exchangeCodeForToken(code);
    console.log('✅ Tokens received:', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    console.log('📋 Fetching Public Profile info...');
    let publicProfile = null;
    try {
      publicProfile = await snapchatPublicProfileService.getPublicProfile(tokens.accessToken, userId);
      console.log('✅ Public Profile info:', {
        id: publicProfile?.me?.id,
        displayName: publicProfile?.me?.display_name,
        bitmoji: publicProfile?.me?.bitmoji?.avatar,
      });
    } catch (profileError) {
      console.log('⚠️  Could not fetch public profile (not critical):', profileError.message);
    }

    console.log('💾 Saving to database...');
    console.log('Data to save:', {
      isConnected: true,
      profileId: publicProfile?.me?.id,
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
    });

    await User.findByIdAndUpdate(userId, {
      'snapchatAccount.isConnected': true,
      'snapchatAccount.accessToken': tokens.accessToken,
      'snapchatAccount.refreshToken': tokens.refreshToken,
      'snapchatAccount.expiresAt': expiresAt,
      'snapchatAccount.accountId': publicProfile?.me?.id || 'public-profile',
      'snapchatAccount.organizationId': null, // Not needed for Public Profile
    });

    console.log('✅ Database updated successfully');
    console.log('========================================');
    console.log('✅ SNAPCHAT PUBLIC PROFILE CONNECTED');
    console.log('========================================');

    res.json({
      success: true,
      message: 'Snapchat Public Profile connected successfully',
      profile: {
        displayName: publicProfile?.me?.display_name,
        bitmoji: publicProfile?.me?.bitmoji?.avatar,
      },
    });
  } catch (error) {
    console.error('========================================');
    console.error('❌ SNAPCHAT CALLBACK ERROR');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('========================================');
    
    res.status(500).json({
      success: false,
      message: 'Error connecting Snapchat account',
      error: error.message,
    });
  }
};

exports.disconnect = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      'snapchatAccount.isConnected': false,
      'snapchatAccount.accessToken': null,
      'snapchatAccount.refreshToken': null,
      'snapchatAccount.expiresAt': null,
      'snapchatAccount.accountId': null,
      'snapchatAccount.organizationId': null,
    });

    res.json({
      success: true,
      message: 'Snapchat account disconnected successfully',
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      message: 'Error disconnecting Snapchat account',
      error: error.message,
    });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      isConnected: user.snapchatAccount.isConnected,
      accountId: user.snapchatAccount.accountId,
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching Snapchat status',
      error: error.message,
    });
  }
};

async function ensureValidToken(user) {
  console.log('🔐 ensureValidToken called');
  console.log('User ID:', user._id);
  console.log('Snapchat connected:', user.snapchatAccount.isConnected);

  if (!user.snapchatAccount.isConnected) {
    console.log('❌ Snapchat account not connected');
    throw new Error('Snapchat account not connected');
  }

  const now = new Date();
  const expiresAt = new Date(user.snapchatAccount.expiresAt);

  console.log('Token expiry check:', {
    now: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    isExpired: now >= expiresAt,
  });

  if (now >= expiresAt) {
    console.log('🔄 Token expired, refreshing...');
    
    try {
      const tokens = await snapchatPublicProfileService.refreshAccessToken(user.snapchatAccount.refreshToken);
      
      user.snapchatAccount.accessToken = tokens.accessToken;
      user.snapchatAccount.refreshToken = tokens.refreshToken;
      user.snapchatAccount.expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
      
      await user.save();
      console.log('✅ Token refreshed successfully');
      console.log('New expiry:', user.snapchatAccount.expiresAt);
    } catch (refreshError) {
      console.error('❌ Token refresh failed:', refreshError.message);
      throw new Error('Failed to refresh Snapchat token. Please reconnect your account.');
    }
  } else {
    console.log('✅ Token is still valid');
  }

  return user.snapchatAccount.accessToken;
}

exports.ensureValidToken = ensureValidToken;
