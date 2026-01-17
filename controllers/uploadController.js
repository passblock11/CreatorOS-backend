const { uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadService');
const MediaLibrary = require('../models/MediaLibrary');

/**
 * Upload media file (image or video)
 */
exports.uploadMedia = async (req, res) => {
  try {
    console.log('📤 [Upload] Upload request received');

    if (!req.file) {
      console.log('❌ [Upload] No file provided');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    const file = req.file;
    console.log('📁 [Upload] File details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    });

    // Determine resource type
    const isVideo = file.mimetype.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';

    console.log(`📤 [Upload] Uploading ${resourceType} to Cloudinary...`);

    // Upload to Cloudinary
    const result = await uploadToCloudinary(file.buffer, {
      folder: 'creator-os/posts',
      resource_type: resourceType,
    });

    console.log('✅ [Upload] Upload successful');

    // Save to Media Library
    let mediaLibraryItem = null;
    try {
      const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
      
      console.log('💾 [MediaLibrary] Attempting to save to library...', {
        user: req.user._id,
        filename: file.originalname,
        type: resourceType,
      });
      
      mediaLibraryItem = await MediaLibrary.create({
        user: req.user._id,
        url: result.secure_url,
        publicId: result.public_id,
        type: resourceType,
        filename: file.originalname,
        size: result.bytes,
        width: result.width,
        height: result.height,
        duration: result.duration,
        format: result.format,
        category: req.body.category || 'uncategorized',
        tags,
        description: req.body.description || '',
      });
      console.log(`✅ [MediaLibrary] Saved to library successfully: ${mediaLibraryItem._id}`);
    } catch (libraryError) {
      console.error('❌ [MediaLibrary] FAILED TO SAVE:');
      console.error('Error message:', libraryError.message);
      console.error('Error stack:', libraryError.stack);
      console.error('Full error:', libraryError);
      // Don't fail the upload if library save fails
    }

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        type: resourceType,
        resourceType: result.resource_type,
        createdAt: result.created_at,
        mediaLibraryId: mediaLibraryItem?._id,
      },
    });
  } catch (error) {
    console.error('❌ [Upload] Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message,
    });
  }
};

/**
 * Delete media file
 */
exports.deleteMedia = async (req, res) => {
  try {
    const { publicId, resourceType = 'image' } = req.body;

    console.log('🗑️ [Upload] Delete request:', { publicId, resourceType });

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required',
      });
    }

    const result = await deleteFromCloudinary(publicId, resourceType);

    res.json({
      success: true,
      message: 'File deleted successfully',
      result,
    });
  } catch (error) {
    console.error('❌ [Upload] Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message,
    });
  }
};

module.exports = exports;
