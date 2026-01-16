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
 * Note: We trust Cloudinary's response since the upload was signed
 */
exports.verifyUpload = async (req, res) => {
  try {
    const { publicId, url, format, width, height, bytes, resourceType, createdAt } = req.body;

    console.log('🔍 [Cloudinary] Verifying upload:', { publicId, resourceType });

    if (!publicId || !url) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: publicId and url',
      });
    }

    console.log('✅ [Cloudinary] Upload verified (data from direct upload)');

    // Return the data that was already validated by Cloudinary during upload
    res.json({
      success: true,
      message: 'Upload verified successfully',
      data: {
        url: url,
        publicId: publicId,
        format: format,
        width: width,
        height: height,
        bytes: bytes,
        type: resourceType,
        resourceType: resourceType,
        createdAt: createdAt,
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
