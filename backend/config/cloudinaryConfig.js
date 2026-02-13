const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Storage for documents
const documentStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    return {
      folder: 'vcare_documents',
      allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'png', 'jpeg'],
      transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
    };
  },
});

// Storage for profile pictures
const profilePictureStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    return {
      folder: 'vcare_profile_pictures',
      allowed_formats: ['jpg', 'png', 'jpeg'],
      transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }]
    };
  },
});

const upload = multer({ storage: documentStorage });
const uploadProfilePicture = multer({ storage: profilePictureStorage });

// For applications that need both documents and profile picture
const uploadDocuments = upload.array('documents', 5);
const uploadProfilePictureSingle = uploadProfilePicture.single('profile_picture');

module.exports = { upload, uploadProfilePicture, uploadDocuments, uploadProfilePictureSingle };