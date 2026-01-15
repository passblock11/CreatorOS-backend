const User = require('../models/User');
const instagramService = require('../services/instagramService');

/**
 * Initiate Instagram OAuth flow
 */
exports.connectInstagram = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🔗 [Instagram] Initiating OAuth for user:', userId);
    
    const authUrl = instagramService.getAuthorizationUrl(userId);
    
    res.json({
      success: true,
      authUrl
    });
  } catch (error) {
    console.error('❌ [Instagram] Connect error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate Instagram connection',
      error: error.message
    });
  }
};

/**
 * Handle Instagram OAuth callback
 */
exports.handleCallback = async (req, res) => {
  const { code, state, error, error_description } = req.query;

  try {
    console.log('📲 [Instagram] OAuth callback received');
    
    // Check for OAuth errors
    if (error) {
      console.error('❌ [Instagram] OAuth error:', error, error_description);
      return res.redirect(`${process.env.FRONTEND_URL}/settings?instagram=error&message=${encodeURIComponent(error_description || error)}`);
    }

    // Validate state
    const stateData = instagramService.validateState(state);
    const userId = stateData.userId;
    
    console.log('🔍 [Instagram] User ID from state:', userId);

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      console.error('❌ [Instagram] User not found:', userId);
      return res.redirect(`${process.env.FRONTEND_URL}/settings?instagram=error&message=User not found`);
    }

    // Exchange code for access token
    console.log('🔄 [Instagram] Exchanging code for token...');
    const tokenData = await instagramService.exchangeCodeForToken(code);
    
    // Get user's Facebook pages
    console.log('📄 [Instagram] Fetching pages...');
    console.log('📄 Token Data:', { hasAccessToken: !!tokenData.access_token, expiresIn: tokenData.expires_in });
    
    const pages = await instagramService.getUserPages(tokenData.access_token);
    
    console.log('📄 Pages returned:', pages?.length || 0);
    console.log('📄 Full pages data:', JSON.stringify(pages, null, 2));
    
    if (!pages || pages.length === 0) {
      console.error('\n❌ [Instagram] NO FACEBOOK PAGES FOUND');
      console.error('❌ Troubleshooting steps:');
      console.error('   1. Check if user is ADMIN of Facebook Page (not Editor/Moderator)');
      console.error('   2. Verify Facebook Page exists and is active');
      console.error('   3. Ensure OAuth scopes include: pages_show_list, pages_read_engagement');
      console.error('   4. Check if user granted all permissions during OAuth');
      console.error('   5. Try creating a NEW Facebook Page where user is default Admin');
      console.error('\n');
      return res.redirect(`${process.env.FRONTEND_URL}/settings?instagram=error&message=No Facebook pages found. Please create a Facebook page connected to your Instagram Business account.`);
    }

    // Find page with Instagram Business Account
    let selectedPage = null;
    let instagramAccount = null;

    for (const page of pages) {
      if (page.instagram_business_account) {
        selectedPage = page;
        console.log('✅ [Instagram] Found page with Instagram account:', page.name);
        
        // Get Instagram account details
        instagramAccount = await instagramService.getInstagramAccount(
          page.instagram_business_account.id,
          page.access_token
        );
        break;
      }
    }

    if (!selectedPage || !instagramAccount) {
      console.error('❌ [Instagram] No Instagram Business Account found on any page');
      return res.redirect(`${process.env.FRONTEND_URL}/settings?instagram=error&message=No Instagram Business Account found. Please connect your Instagram Business or Creator account to a Facebook page.`);
    }

    // Calculate expiration date
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    
    console.log('💾 [Instagram] Saving account data...');
    console.log('📱 Instagram User:', instagramAccount.username);
    console.log('📄 Facebook Page:', selectedPage.name);
    console.log('⏰ Token expires at:', expiresAt);

    // Save Instagram account data
    user.instagramAccount = {
      isConnected: true,
      accessToken: selectedPage.access_token, // Use page access token for posting
      expiresAt: expiresAt,
      userId: instagramAccount.id,
      username: instagramAccount.username,
      accountType: instagramAccount.account_type,
      pageId: selectedPage.id,
      pageName: selectedPage.name
    };

    await user.save();
    
    console.log('✅ [Instagram] Account connected successfully!');
    
    res.redirect(`${process.env.FRONTEND_URL}/settings?instagram=success`);
  } catch (error) {
    console.error('❌ [Instagram] Callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?instagram=error&message=${encodeURIComponent(error.message)}`);
  }
};

/**
 * Get Instagram connection status
 */
exports.getStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isConnected = user.instagramAccount?.isConnected || false;
    
    res.json({
      success: true,
      isConnected,
      account: isConnected ? {
        username: user.instagramAccount.username,
        accountType: user.instagramAccount.accountType,
        pageName: user.instagramAccount.pageName
      } : null
    });
  } catch (error) {
    console.error('❌ [Instagram] Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Instagram status',
      error: error.message
    });
  }
};

/**
 * Disconnect Instagram account
 */
exports.disconnectInstagram = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('🔌 [Instagram] Disconnecting account for user:', user._id);

    // Clear Instagram account data
    user.instagramAccount = {
      isConnected: false,
      accessToken: null,
      expiresAt: null,
      userId: null,
      username: null,
      accountType: null,
      pageId: null,
      pageName: null
    };

    await user.save();
    
    console.log('✅ [Instagram] Account disconnected');

    res.json({
      success: true,
      message: 'Instagram account disconnected successfully'
    });
  } catch (error) {
    console.error('❌ [Instagram] Disconnect error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Instagram',
      error: error.message
    });
  }
};

/**
 * Ensure valid Instagram token (refresh if needed)
 */
exports.ensureValidToken = async (user) => {
  try {
    if (!user.instagramAccount?.isConnected) {
      throw new Error('Instagram account not connected');
    }

    // Check if token is expired or will expire soon (within 7 days)
    const expiresAt = new Date(user.instagramAccount.expiresAt);
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (expiresAt < sevenDaysFromNow) {
      console.log('🔄 [Instagram] Token expiring soon, refreshing...');
      
      const refreshedToken = await instagramService.refreshAccessToken(user.instagramAccount.accessToken);
      
      user.instagramAccount.accessToken = refreshedToken.access_token;
      user.instagramAccount.expiresAt = new Date(Date.now() + (refreshedToken.expires_in * 1000));
      
      await user.save();
      
      console.log('✅ [Instagram] Token refreshed');
    }

    return user.instagramAccount;
  } catch (error) {
    console.error('❌ [Instagram] Token validation error:', error);
    throw error;
  }
};

module.exports = exports;
