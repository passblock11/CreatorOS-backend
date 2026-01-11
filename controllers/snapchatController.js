const snapchatService = require('../services/snapchatService');
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
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Authorization code is required',
      });
    }

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const userId = stateData.userId;

    const tokens = await snapchatService.exchangeCodeForToken(code);

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    const organizations = await snapchatService.getOrganizations(tokens.accessToken, userId);
    
    const organizationId = organizations[0]?.organization?.id;
    const adAccounts = organizationId 
      ? await snapchatService.getAdAccounts(organizationId, tokens.accessToken, userId)
      : [];

    await User.findByIdAndUpdate(userId, {
      'snapchatAccount.isConnected': true,
      'snapchatAccount.accessToken': tokens.accessToken,
      'snapchatAccount.refreshToken': tokens.refreshToken,
      'snapchatAccount.expiresAt': expiresAt,
      'snapchatAccount.organizationId': organizationId,
      'snapchatAccount.accountId': adAccounts[0]?.adaccount?.id,
    });

    res.json({
      success: true,
      message: 'Snapchat account connected successfully',
      organization: organizations[0]?.organization?.name,
    });
  } catch (error) {
    console.error('Snapchat callback error:', error);
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
      const tokens = await snapchatService.refreshAccessToken(user.snapchatAccount.refreshToken);
      
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
