const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
  },
  mediaUrl: {
    type: String,
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'none'],
    default: 'none',
  },
  platform: {
    type: String,
    enum: ['snapchat', 'instagram', 'youtube', 'snapchat_instagram', 'snapchat_youtube', 'instagram_youtube', 'all'],
    default: 'snapchat',
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'failed'],
    default: 'draft',
  },
  scheduledFor: {
    type: Date,
  },
  publishedAt: {
    type: Date,
  },
  snapchatPostId: {
    type: String,
  },
  instagramPostId: {
    type: String,
  },
  youtubeVideoId: {
    type: String,
  },
  analytics: {
    // Snapchat analytics
    views: {
      type: Number,
      default: 0,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    reach: {
      type: Number,
      default: 0,
    },
    // Instagram analytics
    instagram: {
      likes: {
        type: Number,
        default: 0,
      },
      comments: {
        type: Number,
        default: 0,
      },
      saves: {
        type: Number,
        default: 0,
      },
      reach: {
        type: Number,
        default: 0,
      },
      impressions: {
        type: Number,
        default: 0,
      },
      engagement: {
        type: Number,
        default: 0,
      },
    },
    // YouTube analytics
    youtube: {
      views: {
        type: Number,
        default: 0,
      },
      likes: {
        type: Number,
        default: 0,
      },
      comments: {
        type: Number,
        default: 0,
      },
      watchTime: {
        type: Number,
        default: 0,
      },
    },
    lastSynced: Date,
  },
  error: {
    message: String,
    code: String,
    timestamp: Date,
  },
}, {
  timestamps: true,
});

postSchema.index({ user: 1, createdAt: -1 });
postSchema.index({ status: 1, scheduledFor: 1 });

module.exports = mongoose.model('Post', postSchema);
