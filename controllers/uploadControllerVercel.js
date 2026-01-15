const { parseForm, uploadToCloudinary, deleteFromCloudinary } = require('../services/uploadServiceVercel');
const fs = require('fs');

/**
 * Upload media file (Vercel-compatible)
 */
exports.uploadMedia = async (req, res) => {
  let tempFilePath = null;

  try {
    console.log('📤 [Upload] Upload request received');
    console.log('📤 [Upload] Content-Type:', req.headers['content-type']);
    console.log('📤 [Upload] Method:', req.method);

    // Parse form data
    console.log('📤 [Upload] Parsing form data...');
    const { fields, files } = await parseForm(req);
    console.log('📤 [Upload] Form parsed successfully');
    
    // Get the uploaded file
    const file = files.file;
    
    if (!file) {
      console.log('❌ [Upload] No file provided');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    // Handle both single file and array of files
    const uploadedFile = Array.isArray(file) ? file[0] : file;

    console.log('📁 [Upload] File details:', {
      originalFilename: uploadedFile.originalFilename,
      mimetype: uploadedFile.mimetype,
      size: `${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB`,
      filepath: uploadedFile.filepath,
    });

    // Validate file type
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
    ];

    if (!allowedMimes.includes(uploadedFile.mimetype)) {
      // Clean up temp file
      if (fs.existsSync(uploadedFile.filepath)) {
        fs.unlinkSync(uploadedFile.filepath);
      }
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, MOV, AVI) are allowed.',
      });
    }

    // Validate file size
    const maxImageSize = 50 * 1024 * 1024; // 50MB for images
    const maxVideoSize = 100 * 1024 * 1024; // 100MB for videos
    const isVideo = uploadedFile.mimetype.startsWith('video/');
    const maxSize = isVideo ? maxVideoSize : maxImageSize;

    if (uploadedFile.size > maxSize) {
      // Clean up temp file
      if (fs.existsSync(uploadedFile.filepath)) {
        fs.unlinkSync(uploadedFile.filepath);
      }
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${isVideo ? '100MB for videos' : '50MB for images'}.`,
      });
    }

    // Determine resource type
    const resourceType = isVideo ? 'video' : 'image';

    console.log(`📤 [Upload] Uploading ${resourceType} to Cloudinary...`);
    console.log(`📤 [Upload] File size: ${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB`);

    tempFilePath = uploadedFile.filepath;

    // Upload to Cloudinary
    const result = await uploadToCloudinary(uploadedFile.filepath, {
      folder: 'creator-os/posts',
      resource_type: resourceType,
    });

    // Clean up temp file
    if (fs.existsSync(uploadedFile.filepath)) {
      fs.unlinkSync(uploadedFile.filepath);
    }

    console.log('✅ [Upload] Upload successful');

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
      },
    });
  } catch (error) {
    console.error('❌ [Upload] Upload error:', error);
    console.error('❌ [Upload] Error stack:', error.stack);
    console.error('❌ [Upload] Error details:', {
      message: error.message,
      code: error.code,
      httpCode: error.httpCode,
    });
    
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('🗑️ [Upload] Temp file cleaned up');
      } catch (cleanupError) {
        console.error('❌ [Upload] Error cleaning up temp file:', cleanupError);
      }
    }

    // Send appropriate error response
    const statusCode = error.httpCode || 500;
    res.status(statusCode).json({
      success: false,
      message: 'Error uploading file',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
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
