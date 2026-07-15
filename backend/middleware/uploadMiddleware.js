// Staff-application upload middleware backed by AWS S3 (formerly Cloudinary).
// Accepts documents, profile picture and NIC card images in a single request.
// multer-s3 exposes the uploaded URL on `file.location`.

const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3, BUCKET } = require('../config/s3Config');

const folderMap = {
  profile_picture: 'vcare_profile_pictures',
  nic_front: 'vcare_nic_cards',
  nic_back: 'vcare_nic_cards',
  documents: 'vcare_documents',
  grama_niladhari: 'vcare_compliance_docs',
  police_report: 'vcare_compliance_docs',
};

const docReportFolderMap = {
  grama_niladhari: 'vcare_compliance_docs',
  police_report: 'vcare_compliance_docs',
};

const uploadApplicationFiles = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const folder = folderMap[file.fieldname] || 'vcare_documents';
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${folder}/${Date.now()}_${safeName}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    console.log('Processing file:', file.fieldname, file.originalname, file.mimetype);
    if (folderMap[file.fieldname] !== undefined) {
      console.log('File accepted:', file.fieldname);
      cb(null, true);
    } else {
      console.log('File rejected:', file.fieldname);
      cb(new Error('Unexpected field: ' + file.fieldname));
    }
  },
}).fields([
  { name: 'documents', maxCount: 5 },
  { name: 'profile_picture', maxCount: 1 },
  { name: 'nic_front', maxCount: 1 },
  { name: 'nic_back', maxCount: 1 },
  { name: 'grama_niladhari', maxCount: 1 },
  { name: 'police_report', maxCount: 1 },
]);

const uploadDocReportFiles = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const folder = docReportFolderMap[file.fieldname] || 'vcare_compliance_docs';
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${folder}/${Date.now()}_${safeName}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (docReportFolderMap[file.fieldname] !== undefined) {
      cb(null, true);
    } else {
      cb(new Error('Unexpected field: ' + file.fieldname));
    }
  },
}).fields([
  { name: 'grama_niladhari', maxCount: 1 },
  { name: 'police_report', maxCount: 1 },
]);

const uploadPaymentReceipt = multer({
  storage: multerS3({
    s3,
    bucket: BUCKET,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `vcare_payment_receipts/${Date.now()}_${safeName}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'receipt') {
      cb(null, true);
    } else {
      cb(new Error('Unexpected field: ' + file.fieldname));
    }
  },
}).single('receipt');

module.exports = { uploadApplicationFiles, uploadDocReportFiles, uploadPaymentReceipt };
