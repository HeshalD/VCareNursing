const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Single storage that handles both documents and profile pictures
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    if (file.fieldname === 'profile_picture') {
      return {
        folder: 'vcare_profile_pictures',
        allowed_formats: ['jpg', 'png', 'jpeg'],
        transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }]
      };
    } else if (file.fieldname === 'documents') {
      return {
        folder: 'vcare_documents',
        allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'png', 'jpeg'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
      };
    }
    return {
      folder: 'vcare_documents',
      allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'png', 'jpeg']
    };
  },
});

// Simple middleware for both file types
const uploadApplicationFiles = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    console.log('Processing file:', file.fieldname, file.originalname, file.mimetype);
    if (file.fieldname === 'documents' || file.fieldname === 'profile_picture') {
      console.log('File accepted:', file.fieldname);
      cb(null, true);
    } else {
      console.log('File rejected:', file.fieldname);
      cb(new Error('Unexpected field: ' + file.fieldname));
    }
  }
}).fields([
  { name: 'documents', maxCount: 5 },
  { name: 'profile_picture', maxCount: 1 }
]);

module.exports = { uploadApplicationFiles };
