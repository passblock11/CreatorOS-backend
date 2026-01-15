const cloudinary = require('cloudinary').v2;
const formidable = require('formidable');
const fs = require('fs');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Parse form data (Vercel-compatible)
 */
const parseForm = (req) => {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 100 * 1024 * 1024, // 100MB
      keepExtensions: true,
      multiples: false,
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
      } else {
        resolve({ fields, files });
      }
    });
  });
};

/**
 * Upload file to Cloudinary from file path
 */
const uploadToCloudinary = (filePath, options = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        folder: options.folder || 'creator-os',
        resource_type: options.resource_type || 'auto',
        transformation: options.transformation || null,
      },
      (error, result) => {
        if (error) {
          console.error('❌ [Upload] Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ [Upload] File uploaded to Cloudinary:', result.secure_url);
          resolve(result);
        }
      }
    );
  });
};

/**
 * Delete file from Cloudinary
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    console.log('🗑️ [Upload] Deleting file from Cloudinary:', publicId);
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    console.log('✅ [Upload] File deleted from Cloudinary');
    return result;
  } catch (error) {
    console.error('❌ [Upload] Error deleting from Cloudinary:', error);
    throw error;
  }
};

module.exports = {
  parseForm,
  uploadToCloudinary,
  deleteFromCloudinary,
  cloudinary,
};
