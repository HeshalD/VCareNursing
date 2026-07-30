const express = require('express');
const router = express.Router();
const staffDocUploadController = require('../controllers/staffDocUploadController');
const { uploadDocReportFiles } = require('../middleware/uploadMiddleware');
const { protect, restrictTo, requirePermission } = require('../middleware/authMiddleware');

// Admin: send WhatsApp document upload request to an accepted applicant
router.post(
  '/applications/:applicationId/send-document-request',
  protect,
  requirePermission('STAFF_DOC_SEND_REQUEST'),
  staffDocUploadController.sendDocumentRequest
);

// Admin: manually upload compliance docs on behalf of a staff member
router.post(
  '/applications/:applicationId/admin-upload-docs',
  protect,
  requirePermission('STAFF_DOC_ADMIN_UPLOAD'),
  uploadDocReportFiles,
  staffDocUploadController.adminUploadDocuments
);

// Public (no auth): get upload portal info by token
router.get('/doc-upload/:token', staffDocUploadController.getDocUploadPortal);

// Public (no auth): upload grama_niladhari and/or police_report files
router.post('/doc-upload/:token', uploadDocReportFiles, staffDocUploadController.uploadDocuments);

module.exports = router;
