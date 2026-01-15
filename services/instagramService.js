const axios = require('axios');
const crypto = require('crypto');

class InstagramService {
  constructor() {
    this.appId = process.env.INSTAGRAM_APP_ID;
    this.appSecret = process.env.INSTAGRAM_APP_SECRET;
    this.redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
    this.graphApiUrl = 'https://graph.facebook.com/v18.0';
  }

  /**
   * Generate OAuth authorization URL
   * Updated to include business management permissions
   */
  getAuthorizationUrl(userId) {
    const state = Buffer.from(JSON.stringify({
      userId,
      timestamp: Date.now()
    })).toString('base64');

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      // Added business_management scope for Business Manager pages
      scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management',
      response_type: 'code',
      state: state
    });

    return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      console.log('📱 [Instagram] Exchanging code for access token...');
      
      const params = new URLSearchParams({
        client_id: this.appId,
        client_secret: this.appSecret,
        redirect_uri: this.redirectUri,
        code: code
      });

      const response = await axios.get(`${this.graphApiUrl}/oauth/access_token`, { params });
      
      console.log('✅ [Instagram] Short-lived token obtained');
      
      // Exchange short-lived token for long-lived token
      return await this.getLongLivedToken(response.data.access_token);
    } catch (error) {
      console.error('❌ [Instagram] Token exchange error:', error.response?.data || error.message);
      throw new Error(`Failed to exchange code for token: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  async getLongLivedToken(shortLivedToken) {
    try {
      console.log('📱 [Instagram] Exchanging for long-lived token...');
      
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: shortLivedToken
      });

      const response = await axios.get(`${this.graphApiUrl}/oauth/access_token`, { params });
      
      console.log('✅ [Instagram] Long-lived token obtained (60 days)');
      
      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in || 5184000 // 60 days in seconds
      };
    } catch (error) {
      console.error('❌ [Instagram] Long-lived token error:', error.response?.data || error.message);
      throw new Error(`Failed to get long-lived token: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get pages from Business Manager
   */
  async getBusinessPages(accessToken) {
    try {
      console.log('🏢 [Instagram] Fetching Business Manager pages...');
      
      // Get user's businesses
      const businessesResponse = await axios.get(`${this.graphApiUrl}/me/businesses`, {
        params: {
          access_token: accessToken,
          fields: 'id,name'
        }
      });

      console.log('🏢 Found businesses:', businessesResponse.data.data?.length || 0);

      const allPages = [];

      // For each business, get its pages
      for (const business of businessesResponse.data.data || []) {
        console.log(`🏢 Fetching pages for business: ${business.name} (${business.id})`);
        
        try {
          const pagesResponse = await axios.get(`${this.graphApiUrl}/${business.id}/client_pages`, {
            params: {
              access_token: accessToken,
              fields: 'id,name,instagram_business_account{id,username,name},access_token,category'
            }
          });

          if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
            console.log(`✅ Found ${pagesResponse.data.data.length} pages in business ${business.name}`);
            allPages.push(...pagesResponse.data.data);
          }
        } catch (error) {
          console.log(`⚠️ Could not fetch pages for business ${business.name}:`, error.message);
        }
      }

      return allPages;
    } catch (error) {
      console.error('❌ [Instagram] Get business pages error:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Get user's Facebook pages and Instagram accounts
   * Supports both personal pages AND Business Manager pages
   */
  async getUserPages(accessToken) {
    try {
      console.log('📱 [Instagram] Fetching user pages...');
      console.log('🔑 Access Token (first 30 chars):', accessToken?.substring(0, 30) + '...');
      
      // First, get basic user info for debugging
      console.log('👤 Getting user info first...');
      const userInfoResponse = await axios.get(`${this.graphApiUrl}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,email'
        }
      });
      console.log('👤 User Info:', JSON.stringify(userInfoResponse.data, null, 2));
      
      // Strategy: Try BOTH personal pages AND business manager pages
      let allPages = [];

      // Method 1: Try personal pages first
      console.log('\n📄 Method 1: Fetching personal pages...');
      try {
        const personalResponse = await axios.get(`${this.graphApiUrl}/me/accounts`, {
          params: {
            access_token: accessToken,
            fields: 'id,name,instagram_business_account{id,username,name},access_token,category,tasks'
          }
        });

        console.log('📊 Personal Pages Response:', JSON.stringify(personalResponse.data, null, 2));
        
        if (personalResponse.data.data && personalResponse.data.data.length > 0) {
          console.log(`✅ Found ${personalResponse.data.data.length} personal pages`);
          allPages.push(...personalResponse.data.data);
        } else {
          console.log('⚠️ No personal pages found');
        }
      } catch (error) {
        console.log('⚠️ Could not fetch personal pages:', error.message);
      }

      // Method 2: Try Business Manager pages
      console.log('\n🏢 Method 2: Fetching Business Manager pages...');
      const businessPages = await this.getBusinessPages(accessToken);
      
      if (businessPages.length > 0) {
        console.log(`✅ Found ${businessPages.length} business pages`);
        allPages.push(...businessPages);
      } else {
        console.log('⚠️ No business pages found');
      }

      // Remove duplicates based on page ID
      const uniquePages = Array.from(new Map(allPages.map(page => [page.id, page])).values());
      
      console.log(`\n📊 TOTAL UNIQUE PAGES: ${uniquePages.length}`);
      
      if (uniquePages.length > 0) {
        uniquePages.forEach((page, index) => {
          console.log(`\n📄 Page ${index + 1} Details:`);
          console.log('  - ID:', page.id);
          console.log('  - Name:', page.name);
          console.log('  - Category:', page.category);
          console.log('  - Has Access Token:', !!page.access_token);
          console.log('  - Has Instagram:', !!page.instagram_business_account);
          console.log('  - Instagram ID:', page.instagram_business_account?.id || 'N/A');
          console.log('  - Instagram Username:', page.instagram_business_account?.username || 'N/A');
          console.log('  - Tasks/Permissions:', page.tasks || 'N/A');
        });
      } else {
        console.log('\n❌ NO PAGES FOUND (neither personal nor business)');
        console.log('❌ Possible reasons:');
        console.log('  1. User is not Admin of any Facebook Page');
        console.log('  2. OAuth permissions not granted (check scopes)');
        console.log('  3. Facebook Page not created yet');
        console.log('  4. Business Manager permissions not granted');
      }
      
      return uniquePages;
    } catch (error) {
      console.error('❌ [Instagram] Get pages error:', error.response?.data || error.message);
      console.error('❌ Full error object:', JSON.stringify(error.response?.data || error, null, 2));
      throw new Error(`Failed to get user pages: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get Instagram account details
   */
  async getInstagramAccount(instagramBusinessAccountId, pageAccessToken) {
    try {
      console.log('📱 [Instagram] Fetching Instagram account details...');
      
      const response = await axios.get(`${this.graphApiUrl}/${instagramBusinessAccountId}`, {
        params: {
          access_token: pageAccessToken,
          // Removed 'account_type' - not available on IGUser
          fields: 'id,username,name,profile_picture_url'
        }
      });

      console.log(`✅ [Instagram] Account: @${response.data.username}`);
      
      return response.data;
    } catch (error) {
      console.error('❌ [Instagram] Get account error:', error.response?.data || error.message);
      throw new Error(`Failed to get Instagram account: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Upload media to Instagram (creates a container)
   */
  async createMediaContainer(instagramAccountId, pageAccessToken, mediaUrl, caption, mediaType = 'IMAGE') {
    try {
      console.log(`📱 [Instagram] Creating ${mediaType} container...`);
      console.log('📸 Media URL:', mediaUrl);
      console.log('📝 Caption:', caption.substring(0, 50) + '...');
      
      const params = {
        access_token: pageAccessToken,
        caption: caption
      };

      if (mediaType === 'VIDEO') {
        params.media_type = 'REELS';
        params.video_url = mediaUrl;
        params.share_to_feed = true;
      } else {
        params.image_url = mediaUrl;
      }

      const response = await axios.post(
        `${this.graphApiUrl}/${instagramAccountId}/media`,
        null,
        { params }
      );

      console.log('✅ [Instagram] Container created:', response.data.id);
      
      return response.data.id;
    } catch (error) {
      console.error('❌ [Instagram] Create container error:', error.response?.data || error.message);
      throw new Error(`Failed to create media container: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Check container status (for videos)
   */
  async checkContainerStatus(containerId, pageAccessToken) {
    try {
      const response = await axios.get(`${this.graphApiUrl}/${containerId}`, {
        params: {
          access_token: pageAccessToken,
          fields: 'status_code'
        }
      });

      return response.data.status_code;
    } catch (error) {
      console.error('❌ [Instagram] Check status error:', error.response?.data || error.message);
      throw new Error(`Failed to check container status: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Publish media container
   */
  async publishMedia(instagramAccountId, pageAccessToken, containerId) {
    try {
      console.log('📱 [Instagram] Publishing media...');
      
      const response = await axios.post(
        `${this.graphApiUrl}/${instagramAccountId}/media_publish`,
        null,
        {
          params: {
            access_token: pageAccessToken,
            creation_id: containerId
          }
        }
      );

      console.log('✅ [Instagram] Media published:', response.data.id);
      
      return response.data.id;
    } catch (error) {
      console.error('❌ [Instagram] Publish error:', error.response?.data || error.message);
      throw new Error(`Failed to publish media: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Full workflow: Upload and publish to Instagram
   */
  async uploadAndPublish(instagramAccountId, pageAccessToken, mediaUrl, caption, mediaType) {
    try {
      console.log('🚀 [Instagram] Starting upload and publish workflow...');
      
      // Step 1: Create container
      const containerId = await this.createMediaContainer(
        instagramAccountId,
        pageAccessToken,
        mediaUrl,
        caption,
        mediaType
      );

      // Step 2: For videos, wait for processing
      if (mediaType === 'VIDEO') {
        console.log('⏳ [Instagram] Waiting for video processing...');
        
        let statusCode = 'IN_PROGRESS';
        let attempts = 0;
        const maxAttempts = 20; // 2 minutes max wait
        
        while (statusCode === 'IN_PROGRESS' && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 6 seconds
          statusCode = await this.checkContainerStatus(containerId, pageAccessToken);
          attempts++;
          console.log(`⏳ [Instagram] Status: ${statusCode} (attempt ${attempts}/${maxAttempts})`);
        }

        if (statusCode === 'ERROR') {
          throw new Error('Video processing failed');
        }
        
        if (statusCode !== 'FINISHED') {
          throw new Error('Video processing timeout');
        }
        
        console.log('✅ [Instagram] Video processing complete');
      }

      // Step 3: Publish
      const postId = await this.publishMedia(instagramAccountId, pageAccessToken, containerId);
      
      console.log('🎉 [Instagram] Post published successfully!');
      
      return {
        postId,
        containerId,
        success: true
      };
    } catch (error) {
      console.error('❌ [Instagram] Upload and publish failed:', error.message);
      throw error;
    }
  }

  /**
   * Refresh access token (Instagram tokens last 60 days)
   */
  async refreshAccessToken(currentToken) {
    try {
      console.log('📱 [Instagram] Refreshing access token...');
      
      const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.appId,
        client_secret: this.appSecret,
        fb_exchange_token: currentToken
      });

      const response = await axios.get(`${this.graphApiUrl}/oauth/access_token`, { params });
      
      console.log('✅ [Instagram] Token refreshed');
      
      return {
        access_token: response.data.access_token,
        expires_in: response.data.expires_in || 5184000
      };
    } catch (error) {
      console.error('❌ [Instagram] Refresh token error:', error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Validate state parameter
   */
  validateState(state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
      const age = Date.now() - decoded.timestamp;
      
      // State should be less than 10 minutes old
      if (age > 600000) {
        throw new Error('State expired');
      }
      
      return decoded;
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
  }
}

module.exports = new InstagramService();
