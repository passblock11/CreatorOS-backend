const cloudinary = require('cloudinary').v2;
const { formidable } = require('formidable');
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
      maxFileSize: 50 * 1024 * 1024, // 50MB for images
      maxTotalFileSize: 100 * 1024 * 1024, // 100MB total
      keepExtensions: true,
      multiples: false,
      allowEmptyFiles: false,
      minFileSize: 1, // At least 1 byte
      maxFields: 1000,
      maxFieldsSize: 50 * 1024 * 1024, // 50MB
    });

    form.parse(req, (err, fields, files) => {
      if (err) {
        console.error('❌ [Upload] Formidable parse error:', err);
        reject(err);
      } else {
        console.log('✅ [Upload] Formidable parsed successfully');
        console.log('📁 [Upload] Files received:', Object.keys(files));
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
    const uploadOptions = {
      folder: options.folder || 'creator-os',
      resource_type: options.resource_type || 'auto',
      transformation: options.transformation || null,
    };

    // For videos, add specific options
    if (options.resource_type === 'video') {
      uploadOptions.chunk_size = 6000000; // 6MB chunks for large videos
      uploadOptions.timeout = 120000; // 2 minutes timeout
    }

    cloudinary.uploader.upload(
      filePath,
      uploadOptions,
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
