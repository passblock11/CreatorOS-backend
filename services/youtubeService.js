const { google } = require('googleapis');
const axios = require('axios');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client,
});

/**
 * Generate YouTube OAuth URL
 */
exports.getAuthURL = () => {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent', // Force to get refresh token
  });

  return authUrl;
};

/**
 * Exchange authorization code for tokens
 */
exports.getTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Error getting YouTube tokens:', error);
    throw new Error('Failed to exchange authorization code for tokens');
  }
};

/**
 * Refresh access token
 */
exports.refreshAccessToken = async (refreshToken) => {
  try {
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials;
  } catch (error) {
    console.error('Error refreshing YouTube token:', error);
    throw new Error('Failed to refresh access token');
  }
};

/**
 * Get channel information
 */
exports.getChannelInfo = async (accessToken) => {
  try {
    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    const response = await youtube.channels.list({
      part: 'snippet', // Only get essential info to save quota
      mine: true,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('No YouTube channel found for this account');
    }

    const channel = response.data.items[0];
    return {
      channelId: channel.id,
      channelTitle: channel.snippet.title,
      description: channel.snippet.description,
      thumbnailUrl: channel.snippet.thumbnails.default.url,
      // Statistics removed to save quota - not needed for connection
    };
  } catch (error) {
    console.error('Error getting channel info:', error);
    throw new Error('Failed to get channel information');
  }
};

/**
 * Upload video to YouTube
 */
exports.uploadVideo = async (accessToken, videoData) => {
  try {
    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    const { videoUrl, title, description, tags, privacyStatus = 'public', categoryId = '22' } = videoData;

    // Download video from URL (Cloudinary)
    const videoResponse = await axios.get(videoUrl, {
      responseType: 'stream',
    });

    console.log('📤 [YouTube] Uploading video:', title);

    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: title.substring(0, 100), // YouTube max 100 chars
          description: description || '',
          tags: tags || [],
          categoryId: categoryId, // 22 = People & Blogs
        },
        status: {
          privacyStatus: privacyStatus, // 'public', 'private', or 'unlisted'
        },
      },
      media: {
        body: videoResponse.data,
      },
    });

    const videoId = response.data.id;
    const videoLink = `https://www.youtube.com/watch?v=${videoId}`;

    console.log('✅ [YouTube] Video uploaded successfully:', videoLink);

    return {
      videoId,
      videoUrl: videoLink,
      title: response.data.snippet.title,
      description: response.data.snippet.description,
      publishedAt: response.data.snippet.publishedAt,
      thumbnailUrl: response.data.snippet.thumbnails.default.url,
    };
  } catch (error) {
    console.error('❌ [YouTube] Upload error:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      const errorMessage = error.response.data.error.message || 'Failed to upload video';
      throw new Error(`YouTube API Error: ${errorMessage}`);
    }
    
    throw new Error('Failed to upload video to YouTube');
  }
};

/**
 * Get video details
 */
exports.getVideoDetails = async (accessToken, videoId) => {
  try {
    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    const response = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      id: videoId,
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = response.data.items[0];
    return {
      videoId: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      thumbnailUrl: video.snippet.thumbnails.default.url,
      publishedAt: video.snippet.publishedAt,
      viewCount: video.statistics.viewCount,
      likeCount: video.statistics.likeCount,
      commentCount: video.statistics.commentCount,
      duration: video.contentDetails.duration,
    };
  } catch (error) {
    console.error('Error getting video details:', error);
    throw new Error('Failed to get video details');
  }
};

/**
 * Delete video from YouTube
 */
exports.deleteVideo = async (accessToken, videoId) => {
  try {
    oauth2Client.setCredentials({
      access_token: accessToken,
    });

    await youtube.videos.delete({
      id: videoId,
    });

    console.log('✅ [YouTube] Video deleted:', videoId);
    return true;
  } catch (error) {
    console.error('Error deleting video:', error);
    throw new Error('Failed to delete video from YouTube');
  }
};

/**
 * Check if token is valid
 */
exports.validateToken = async (accessToken) => {
  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      params: { access_token: accessToken },
    });
    return response.data;
  } catch (error) {
    return null;
  }
};

module.exports = exports;
