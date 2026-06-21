// Multer upload middleware backed by AWS S3 (formerly Cloudinary).
// Filename kept as cloudinaryConfig.js so existing route imports don't change.
//
// multer-s3 exposes the uploaded URL on `file.location` (Cloudinary used
// `file.path`). Consumers have been updated accordingly.

const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3, BUCKET } = require('./s3Config');

// Maps the form field name to an S3 "folder" prefix.
const folderMap = {
  profile_picture: 'vcare_profile_pictures',
  nic_front: 'vcare_nic_cards',
  nic_back: 'vcare_nic_cards',
  documents: 'vcare_documents',
  payment_slip: 'vcare_payment_slips',
  image: 'vcare_products',
};

const storage = multerS3({
  s3,
  bucket: BUCKET,
  // Serve files with their real content-type so PDFs/images render inline.
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    const folder = folderMap[file.fieldname] || 'vcare_documents';
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${folder}/${Date.now()}_${safeName}`);
  },
});

const upload = multer({ storage });
const uploadProfilePicture = multer({ storage });

// For applications that need both documents and profile picture
const uploadDocuments = upload.array('documents', 5);
const uploadProfilePictureSingle = uploadProfilePicture.single('profile_picture');

module.exports = { upload, uploadProfilePicture, uploadDocuments, uploadProfilePictureSingle };
