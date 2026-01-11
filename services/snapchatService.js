const axios = require('axios');
const ApiLog = require('../models/ApiLog');

class SnapchatService {
  constructor() {
    this.baseURL = 'https://adsapi.snapchat.com/v1';
    this.authURL = 'https://accounts.snapchat.com/login/oauth2/access_token';
  }

  async logApiCall(userId, action, success, data, error = null) {
    try {
      await ApiLog.create({
        user: userId,
        service: 'snapchat',
        action,
        success,
        requestData: data.request,
        responseData: data.response,
        error: error ? { message: error.message, stack: error.stack } : null,
        statusCode: data.statusCode,
        duration: data.duration,
      });
    } catch (err) {
      console.error('Failed to log API call:', err);
    }
  }

  async refreshAccessToken(refreshToken) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(this.authURL, null, {
        params: {
          refresh_token: refreshToken,
          client_id: process.env.SNAPCHAT_CLIENT_ID,
          client_secret: process.env.SNAPCHAT_CLIENT_SECRET,
          grant_type: 'refresh_token',
        },
      });

      const duration = Date.now() - startTime;

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      throw new Error(`Failed to refresh Snapchat token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async exchangeCodeForToken(code) {
    const startTime = Date.now();
    
    try {
      const response = await axios.post(this.authURL, null, {
        params: {
          code,
          client_id: process.env.SNAPCHAT_CLIENT_ID,
          client_secret: process.env.SNAPCHAT_CLIENT_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: process.env.SNAPCHAT_REDIRECT_URI,
        },
      });

      const duration = Date.now() - startTime;

      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  async makeAuthenticatedRequest(method, endpoint, accessToken, data = null) {
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
  }

  async getOrganizations(accessToken, userId) {
    const startTime = Date.now();
    
    try {
      const data = await this.makeAuthenticatedRequest('GET', '/me/organizations', accessToken);
      
      await this.logApiCall(userId, 'get_organizations', true, {
        request: {},
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data.organizations || [];
    } catch (error) {
      await this.logApiCall(userId, 'get_organizations', false, {
        request: {},
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }

  async getAdAccounts(organizationId, accessToken, userId) {
    const startTime = Date.now();
    
    try {
      const data = await this.makeAuthenticatedRequest(
        'GET',
        `/organizations/${organizationId}/adaccounts`,
        accessToken
      );
      
      await this.logApiCall(userId, 'get_ad_accounts', true, {
        request: { organizationId },
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data.adaccounts || [];
    } catch (error) {
      await this.logApiCall(userId, 'get_ad_accounts', false, {
        request: { organizationId },
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }

  async createCreative(adAccountId, accessToken, creativeData, userId) {
    const startTime = Date.now();
    
    try {
      const payload = {
        creatives: [{
          name: creativeData.name,
          brand_name: creativeData.brandName || 'Creator OS',
          headline: creativeData.headline,
          shareable: true,
          type: creativeData.type || 'WEB_VIEW',
          top_snap_media_id: creativeData.mediaId,
          call_to_action: creativeData.callToAction || 'VIEW',
        }],
      };

      const data = await this.makeAuthenticatedRequest(
        'POST',
        `/adaccounts/${adAccountId}/creatives`,
        accessToken,
        payload
      );
      
      await this.logApiCall(userId, 'create_creative', true, {
        request: payload,
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data.creatives?.[0];
    } catch (error) {
      await this.logApiCall(userId, 'create_creative', false, {
        request: creativeData,
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw new Error(`Failed to create creative: ${error.response?.data?.request_status || error.message}`);
    }
  }

  async uploadMedia(adAccountId, accessToken, mediaData, userId) {
    const startTime = Date.now();
    
    try {
      const payload = {
        media: [{
          name: mediaData.name,
          type: mediaData.type,
          media_url: mediaData.url,
        }],
      };

      const data = await this.makeAuthenticatedRequest(
        'POST',
        `/adaccounts/${adAccountId}/media`,
        accessToken,
        payload
      );
      
      await this.logApiCall(userId, 'upload_media', true, {
        request: payload,
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data.media?.[0];
    } catch (error) {
      await this.logApiCall(userId, 'upload_media', false, {
        request: mediaData,
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      throw new Error(`Failed to upload media: ${error.response?.data?.request_status || error.message}`);
    }
  }

  async getCreativeStats(creativeId, accessToken, userId) {
    const startTime = Date.now();
    
    try {
      const data = await this.makeAuthenticatedRequest(
        'GET',
        `/creatives/${creativeId}/stats`,
        accessToken
      );
      
      await this.logApiCall(userId, 'get_creative_stats', true, {
        request: { creativeId },
        response: data,
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return data.total_stats?.[0] || {};
    } catch (error) {
      await this.logApiCall(userId, 'get_creative_stats', false, {
        request: { creativeId },
        response: error.response?.data,
        statusCode: error.response?.status,
        duration: Date.now() - startTime,
      }, error);
      
      return {};
    }
  }

  getAuthorizationURL(state) {
    const params = new URLSearchParams({
      client_id: process.env.SNAPCHAT_CLIENT_ID,
      redirect_uri: process.env.SNAPCHAT_REDIRECT_URI,
      response_type: 'code',
      scope: 'snapchat-marketing-api',
      state,
    });

    return `https://accounts.snapchat.com/login/oauth2/authorize?${params.toString()}`;
  }
}

module.exports = new SnapchatService();
