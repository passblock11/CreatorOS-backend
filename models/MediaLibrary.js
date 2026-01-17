const mongoose = require('mongoose');

const mediaLibrarySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  url: {
    type: String,
    required: [true, 'Media URL is required'],
  },
  publicId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['image', 'video'],
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  width: {
    type: Number,
  },
  height: {
    type: Number,
  },
  duration: {
    type: Number, // For videos in seconds
  },
  format: {
    type: String, // jpg, png, mp4, etc.
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
  }],
  category: {
    type: String,
    trim: true,
    default: 'uncategorized',
  },
  description: {
    type: String,
    trim: true,
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  lastUsedAt: {
    type: Date,
  },
  posts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
  }],
}, {
  timestamps: true,
});

// Indexes for efficient queries
mediaLibrarySchema.index({ user: 1, createdAt: -1 });
mediaLibrarySchema.index({ user: 1, type: 1 });
mediaLibrarySchema.index({ user: 1, tags: 1 });
mediaLibrarySchema.index({ user: 1, category: 1 });
mediaLibrarySchema.index({ user: 1, usageCount: -1 });

// Method to increment usage
mediaLibrarySchema.methods.incrementUsage = async function(postId) {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  if (postId && !this.posts.includes(postId)) {
    this.posts.push(postId);
  }
  await this.save();
};

module.exports = mongoose.model('MediaLibrary', mediaLibrarySchema);
