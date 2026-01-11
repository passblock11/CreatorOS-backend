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
    console.log('========================================');
    console.log('🔗 SNAPCHAT OAUTH CALLBACK RECEIVED');
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
    const tokens = await snapchatService.exchangeCodeForToken(code);
    console.log('✅ Tokens received:', {
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    console.log('📋 Fetching organizations...');
    const organizations = await snapchatService.getOrganizations(tokens.accessToken, userId);
    console.log('Organizations response:', JSON.stringify(organizations, null, 2));
    
    // Prefer ENTERPRISE organizations over PROVISIONAL (more permissions)
    let selectedOrg = organizations.find(org => org.organization?.type === 'ENTERPRISE');
    if (!selectedOrg) {
      selectedOrg = organizations[0]; // Fallback to first org
    }
    
    const organizationId = selectedOrg?.organization?.id;
    const organizationName = selectedOrg?.organization?.name || 'My Organization';
    const organizationType = selectedOrg?.organization?.type;
    
    console.log('Selected Organization:', {
      id: organizationId,
      name: organizationName,
      type: organizationType,
    });

    let adAccounts = [];
    let accountId = null;

    if (organizationId) {
      console.log('📋 Fetching ad accounts for organization:', organizationId);
      adAccounts = await snapchatService.getAdAccounts(organizationId, tokens.accessToken, userId);
      console.log('Ad accounts response:', JSON.stringify(adAccounts, null, 2));

      // Extract account ID with better error handling
      if (adAccounts && adAccounts.length > 0) {
        // Try different possible structures
        accountId = adAccounts[0]?.adaccount?.id || adAccounts[0]?.id || adAccounts[0]?.ad_account?.id;
        console.log('✅ Found existing account ID:', accountId);
        console.log('First ad account structure:', JSON.stringify(adAccounts[0], null, 2));
      } else {
        console.log('⚠️  No ad accounts found - Creating new one automatically...');
        
        // AUTO-CREATE AD ACCOUNT
        try {
          const newAdAccount = await snapchatService.createAdAccount(
            organizationId,
            tokens.accessToken,
            `${organizationName} - Creator OS`,
            userId
          );
          
          // Extract account ID from newly created account
          accountId = newAdAccount?.adaccount?.id || newAdAccount?.id || newAdAccount?.ad_account?.id;
          
          if (accountId) {
            console.log('✅ Successfully created new ad account with ID:', accountId);
            console.log('New ad account structure:', JSON.stringify(newAdAccount, null, 2));
          } else {
            console.log('⚠️  Ad account creation returned no ID:', JSON.stringify(newAdAccount, null, 2));
          }
        } catch (createError) {
          console.error('❌ Failed to auto-create ad account:', createError.message);
          console.error('Error details:', createError);
          // Don't throw - let user connect without ad account, they can create manually later
          console.log('⚠️  User connected but without ad account. They can create one manually in Snapchat Business Manager.');
        }
      }
    } else {
      console.log('⚠️  No organization found, cannot fetch/create ad accounts');
    }

    console.log('💾 Saving to database...');
    console.log('Data to save:', {
      isConnected: true,
      organizationId,
      accountId,
      hasAccessToken: !!tokens.accessToken,
      hasRefreshToken: !!tokens.refreshToken,
    });

    await User.findByIdAndUpdate(userId, {
      'snapchatAccount.isConnected': true,
      'snapchatAccount.accessToken': tokens.accessToken,
      'snapchatAccount.refreshToken': tokens.refreshToken,
      'snapchatAccount.expiresAt': expiresAt,
      'snapchatAccount.organizationId': organizationId,
      'snapchatAccount.accountId': accountId,
    });

    console.log('✅ Database updated successfully');
    console.log('========================================');
    console.log('✅ SNAPCHAT CONNECTION COMPLETED');
    console.log('========================================');

    res.json({
      success: true,
      message: 'Snapchat account connected successfully',
      organization: organizations[0]?.organization?.name,
      accountId: accountId,
      debug: {
        hasOrganization: !!organizationId,
        hasAdAccount: !!accountId,
        adAccountsCount: adAccounts.length,
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
