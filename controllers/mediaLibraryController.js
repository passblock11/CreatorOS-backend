const MediaLibrary = require('../models/MediaLibrary');
const cloudinary = require('cloudinary').v2;

/**
 * Get all media from user's library with filters
 */
exports.getMedia = async (req, res) => {
  try {
    const { 
      type, 
      category, 
      tags, 
      search, 
      sortBy = 'createdAt', 
      order = 'desc',
      page = 1, 
      limit = 24 
    } = req.query;

    const query = { user: req.user._id };

    // Apply filters
    if (type) query.type = type;
    if (category && category !== 'all') query.category = category;
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }
    if (search) {
      query.$or = [
        { filename: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const sortOrder = order === 'desc' ? -1 : 1;
    const sortOptions = { [sortBy]: sortOrder };

    const media = await MediaLibrary.find(query)
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const count = await MediaLibrary.countDocuments(query);

    // Get all tags and categories for filters
    const allMedia = await MediaLibrary.find({ user: req.user._id }).lean();
    const allTags = [...new Set(allMedia.flatMap(m => m.tags || []))].sort();
    const allCategories = [...new Set(allMedia.map(m => m.category))].sort();

    res.json({
      success: true,
      media,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit),
      },
      filters: {
        tags: allTags,
        categories: allCategories,
      },
    });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching media',
      error: error.message,
    });
  }
};

/**
 * Get single media item
 */
exports.getMediaById = async (req, res) => {
  try {
    const media = await MediaLibrary.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate('posts', 'title status createdAt');

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found',
      });
    }

    res.json({
      success: true,
      media,
    });
  } catch (error) {
    console.error('Get media by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching media',
      error: error.message,
    });
  }
};

/**
 * Update media metadata (tags, category, description)
 */
exports.updateMedia = async (req, res) => {
  try {
    const { tags, category, description } = req.body;

    const media = await MediaLibrary.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found',
      });
    }

    if (tags !== undefined) {
      media.tags = Array.isArray(tags) 
        ? tags.map(tag => tag.trim().toLowerCase()).filter(Boolean)
        : [];
    }
    if (category !== undefined) media.category = category;
    if (description !== undefined) media.description = description;

    await media.save();

    res.json({
      success: true,
      message: 'Media updated successfully',
      media,
    });
  } catch (error) {
    console.error('Update media error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating media',
      error: error.message,
    });
  }
};

/**
 * Delete media from library and Cloudinary
 */
exports.deleteMedia = async (req, res) => {
  try {
    const media = await MediaLibrary.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!media) {
      return res.status(404).json({
        success: false,
        message: 'Media not found',
      });
    }

    // Delete from Cloudinary
    try {
      const resourceType = media.type === 'video' ? 'video' : 'image';
      await cloudinary.uploader.destroy(media.publicId, { resource_type: resourceType });
      console.log(`✅ Deleted from Cloudinary: ${media.publicId}`);
    } catch (cloudinaryError) {
      console.error('Cloudinary deletion error:', cloudinaryError.message);
      // Continue with database deletion even if Cloudinary fails
    }

    // Delete from database
    await media.deleteOne();

    res.json({
      success: true,
      message: 'Media deleted successfully',
    });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting media',
      error: error.message,
    });
  }
};

/**
 * Bulk delete media
 */
exports.bulkDeleteMedia = async (req, res) => {
  try {
    const { mediaIds } = req.body;

    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of media IDs',
      });
    }

    const mediaItems = await MediaLibrary.find({
      _id: { $in: mediaIds },
      user: req.user._id,
    });

    const results = {
      deleted: 0,
      failed: 0,
      errors: [],
    };

    // Delete from Cloudinary and database
    for (const media of mediaItems) {
      try {
        const resourceType = media.type === 'video' ? 'video' : 'image';
        await cloudinary.uploader.destroy(media.publicId, { resource_type: resourceType });
        await media.deleteOne();
        results.deleted++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          mediaId: media._id,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Deleted ${results.deleted} media items`,
      results,
    });
  } catch (error) {
    console.error('Bulk delete media error:', error);
    res.status(500).json({
      success: false,
      message: 'Error bulk deleting media',
      error: error.message,
    });
  }
};

/**
 * Get library stats
 */
exports.getStats = async (req, res) => {
  try {
    const stats = await MediaLibrary.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: null,
          totalMedia: { $sum: 1 },
          totalImages: {
            $sum: { $cond: [{ $eq: ['$type', 'image'] }, 1, 0] },
          },
          totalVideos: {
            $sum: { $cond: [{ $eq: ['$type', 'video'] }, 1, 0] },
          },
          totalSize: { $sum: '$size' },
          totalUsage: { $sum: '$usageCount' },
          mostUsedMedia: { $max: '$usageCount' },
        },
      },
    ]);

    // Get most used media
    const topMedia = await MediaLibrary.find({ user: req.user._id })
      .sort({ usageCount: -1 })
      .limit(5)
      .lean();

    // Get recent uploads
    const recentUploads = await MediaLibrary.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const statsData = stats[0] || {
      totalMedia: 0,
      totalImages: 0,
      totalVideos: 0,
      totalSize: 0,
      totalUsage: 0,
      mostUsedMedia: 0,
    };

    res.json({
      success: true,
      stats: statsData,
      topMedia,
      recentUploads,
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message,
    });
  }
};

/**
 * Get all unique tags
 */
exports.getTags = async (req, res) => {
  try {
    const media = await MediaLibrary.find({ user: req.user._id }).lean();
    const tags = [...new Set(media.flatMap(m => m.tags || []))].sort();

    res.json({
      success: true,
      tags,
    });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tags',
      error: error.message,
    });
  }
};

/**
 * Get all unique categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await MediaLibrary.distinct('category', { user: req.user._id });

    res.json({
      success: true,
      categories: categories.sort(),
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: error.message,
    });
  }
};
