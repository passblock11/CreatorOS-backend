const axios = require('axios');
const ApiLog = require('../models/ApiLog');

class SnapchatPublicProfileService {
  constructor() {
    this.baseURL = 'https://adsapi.snapchat.com/v1';
    this.clientId = process.env.SNAPCHAT_CLIENT_ID;
    this.clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
    this.redirectUri = process.env.SNAPCHAT_REDIRECT_URI;
  }

  async makeAuthenticatedRequest(method, endpoint, accessToken, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error('Snapchat API request failed:', {
        endpoint,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw error;
    }
  }

  async logApiCall(userId, action, success, details, error = null) {
    try {
      await ApiLog.create({
        userId,
        service: 'snapchat_public_profile',
        action,
        success,
        details,
        error: error ? error.message : null,
      });
    } catch (logError) {
      console.error('Failed to log API call:', logError);
    }
  }

  // OAuth Methods
  async exchangeCodeForToken(code) {
    try {
      const response = await axios.post('https://accounts.snapchat.com/login/oauth2/access_token', 
        new URLSearchParams({
          code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      console.error('Token exchange error:', error.response?.data);
      throw new Error('Failed to exchange authorization code');
    }
  }

  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post('https://accounts.snapchat.com/login/oauth2/access_token',
        new URLSearchParams({
          refresh_token: refreshToken,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
        }), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      console.error('Token refresh error:', error.response?.data);
      throw new Error('Failed to refresh access token');
    }
  }

  // Get user's public profile
  async getPublicProfile(accessToken, userId) {
    const startTime = Date.now();
    
    try {
      console.log('📋 Fetching public profile...');

      const data = await this.makeAuthenticatedRequest(
        'GET',
        '/me',
        accessToken
      );

      console.log('✅ Public profile response:', JSON.stringify(data, null, 2));

      await this.logApiCall(userId, 'get_public_profile', true, {
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data;
    } catch (error) {
      await this.logApiCall(userId, 'get_public_profile', false, {
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }

  // Upload media for Public Profile
  async uploadPublicMedia(accessToken, mediaData, userId) {
    const startTime = Date.now();
    
    try {
      console.log('📤 Uploading media for Public Profile...');
      console.log('Media data:', {
        name: mediaData.name,
        type: mediaData.type,
        url: mediaData.url,
      });

      // For Public Profile, we post media directly to the story
      const payload = {
        media_url: mediaData.url,
        media_type: mediaData.type.toUpperCase(),
        title: mediaData.name,
      };

      console.log('🔹 Upload payload:', JSON.stringify(payload, null, 2));

      const data = await this.makeAuthenticatedRequest(
        'POST',
        '/me/media',
        accessToken,
        payload
      );

      console.log('✅ Media uploaded:', JSON.stringify(data, null, 2));

      await this.logApiCall(userId, 'upload_public_media', true, {
        request: payload,
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data;
    } catch (error) {
      console.error('❌ Upload media error:', {
        status: error.response?.status,
        data: error.response?.data,
      });

      await this.logApiCall(userId, 'upload_public_media', false, {
        request: mediaData,
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw new Error(`Failed to upload media: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Post to Public Profile (Story)
  async postToPublicProfile(accessToken, postData, userId) {
    const startTime = Date.now();
    
    try {
      console.log('📸 Posting to Public Profile...');
      console.log('Post data:', postData);

      const payload = {
        headline: postData.headline || postData.title,
        media_url: postData.mediaUrl,
        media_type: postData.mediaType?.toUpperCase() || 'IMAGE',
      };

      // Add optional fields if present
      if (postData.attachmentUrl) {
        payload.attachment_url = postData.attachmentUrl;
      }

      console.log('🔹 Post payload:', JSON.stringify(payload, null, 2));

      const data = await this.makeAuthenticatedRequest(
        'POST',
        '/me/public_content',
        accessToken,
        payload
      );

      console.log('✅ Posted to Public Profile:', JSON.stringify(data, null, 2));

      await this.logApiCall(userId, 'post_public_content', true, {
        request: payload,
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data;
    } catch (error) {
      console.error('❌ Post to Public Profile error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });

      await this.logApiCall(userId, 'post_public_content', false, {
        request: postData,
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw new Error(`Failed to post to Public Profile: ${error.response?.data?.error_description || error.message}`);
    }
  }

  // Get Public Profile stats
  async getPublicProfileStats(accessToken, userId) {
    const startTime = Date.now();
    
    try {
      const data = await this.makeAuthenticatedRequest(
        'GET',
        '/me/insights',
        accessToken
      );

      await this.logApiCall(userId, 'get_public_profile_stats', true, {
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data;
    } catch (error) {
      await this.logApiCall(userId, 'get_public_profile_stats', false, {
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }
}

module.exports = new SnapchatPublicProfileService();
