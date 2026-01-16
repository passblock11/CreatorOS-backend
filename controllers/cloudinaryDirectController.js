const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Generate signed upload parameters for direct Cloudinary upload
 * This allows frontend to upload directly to Cloudinary, bypassing Vercel's body size limits
 */
exports.getUploadSignature = async (req, res) => {
  try {
    console.log('🔐 [Cloudinary] Generating upload signature');

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = 'creator-os/posts';

    // Parameters to sign
    const params = {
      timestamp,
      folder,
      upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || undefined,
    };

    // Remove undefined values
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

    // Generate signature
    const signature = cloudinary.utils.api_sign_request(
      params,
      process.env.CLOUDINARY_API_SECRET
    );

    console.log('✅ [Cloudinary] Signature generated');

    res.json({
      success: true,
      data: {
        signature,
        timestamp,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        folder,
        uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
      },
    });
  } catch (error) {
    console.error('❌ [Cloudinary] Error generating signature:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating upload signature',
      error: error.message,
    });
  }
};

/**
 * Verify and save uploaded file metadata
 * Called after frontend successfully uploads to Cloudinary
 */
exports.verifyUpload = async (req, res) => {
  try {
    const { publicId } = req.body;

    console.log('🔍 [Cloudinary] Verifying upload:', { publicId });

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: publicId',
      });
    }

    // Get file details from Cloudinary to verify it exists
    // Try video first, then image if that fails
    let resource;
    try {
      resource = await cloudinary.api.resource(publicId, {
        resource_type: 'video',
      });
    } catch (videoError) {
      // If not a video, try as image
      try {
        resource = await cloudinary.api.resource(publicId, {
          resource_type: 'image',
        });
      } catch (imageError) {
        // If neither works, return error
        throw new Error('Resource not found in Cloudinary');
      }
    }

    console.log('✅ [Cloudinary] Upload verified:', resource.resource_type);

    res.json({
      success: true,
      message: 'Upload verified successfully',
      data: {
        url: resource.secure_url,
        publicId: resource.public_id,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        bytes: resource.bytes,
        type: resource.resource_type,
        resourceType: resource.resource_type,
        createdAt: resource.created_at,
      },
    });
  } catch (error) {
    console.error('❌ [Cloudinary] Error verifying upload:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying upload',
      error: error.message,
    });
  }
};

module.exports = exports;
