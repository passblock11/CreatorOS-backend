const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
//
// Configure multer for memory storage
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept images and videos
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/quicktime', // .mov
    'video/x-msvideo', // .avi
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, MOV, AVI) are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
  fileFilter: fileFilter,
});

/**
 * Upload file to Cloudinary
 */
const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || 'creator-os',
        resource_type: options.resource_type || 'auto', // auto, image, video, raw
        transformation: options.transformation || null,
        format: options.format || null,
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

    uploadStream.end(fileBuffer);
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

/**
 * Get file details from Cloudinary
 */
const getFileDetails = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error('❌ [Upload] Error getting file details:', error);
    throw error;
  }
};

module.exports = {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  getFileDetails,
  cloudinary,
};
