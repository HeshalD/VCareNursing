import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Upload, CheckCircle, AlertCircle, Loader2, FileImage } from 'lucide-react';
import apiClient from '../../api/api';

const ClientPaymentReceiptPage = () => {
  const { token } = useParams();
  const fileInputRef = useRef(null);

  const [portalData, setPortalData] = useState(null);
  const [loadingPortal, setLoadingPortal] = useState(true);
  const [portalError, setPortalError] = useState('');

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    const loadPortal = async () => {
      try {
        setLoadingPortal(true);
        const res = await apiClient.getReceiptUploadPortal(token);
        setPortalData(res.data);
      } catch (err) {
        setPortalError(err.message || 'This upload link is invalid or has expired.');
      } finally {
        setLoadingPortal(false);
      }
    };
    if (token) loadPortal();
  }, [token]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) { setSelectedFile(file); setUploadError(''); }
  };

  const handleSubmit = async () => {
    if (!selectedFile) { setUploadError('Please select a file to upload.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('receipt', selectedFile);
      await apiClient.uploadPaymentReceipt(token, formData);
      setUploadSuccess(true);
    } catch (err) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loadingPortal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin" />
          <p className="text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (portalError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center"
        >
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Link Invalid or Expired</h2>
          <p className="text-sm text-slate-600">{portalError}</p>
          <p className="text-sm text-slate-500 mt-4">Please contact VCare Nursing for assistance.</p>
        </motion.div>
      </div>
    );
  }

  if (uploadSuccess || portalData?.already_uploaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-2xl border border-emerald-100 shadow-sm p-8 text-center"
        >
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Receipt Submitted</h2>
          <p className="text-sm text-slate-600">
            {uploadSuccess
              ? 'Your payment receipt has been submitted successfully. Our team will confirm your payment and update your registration status shortly.'
              : 'You have already submitted your payment receipt. Our team will confirm your payment shortly.'}
          </p>
          <p className="text-xs text-slate-400 mt-6">Thank you for choosing VCare Nursing.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-start justify-center p-4 pt-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">VCare Nursing</p>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Upload Payment Receipt</h1>
          <p className="text-sm text-slate-500">
            Hi <strong>{portalData?.full_name}</strong>, please upload proof of your registration fee payment below.
          </p>
        </div>

        {/* Fee summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Invoice Type</p>
              <p className="text-sm font-medium text-slate-800">Registration Fee</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Amount Due</p>
              <p className="text-lg font-bold text-slate-900">
                LKR {Number(portalData?.reg_fee_amount || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Upload area */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-700 mb-4">Upload your bank slip or payment confirmation</p>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              selectedFile ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileImage className="w-8 h-8 text-blue-500" />
                <p className="text-sm font-medium text-slate-800">{selectedFile.name}</p>
                <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB · Click to change</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-700">Click to select or drag & drop</p>
                <p className="text-xs text-slate-400">JPEG, PNG or PDF · Max 10 MB</p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {uploadError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading || !selectedFile}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Submit Receipt
              </>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Having trouble? Contact VCare Nursing for assistance.
        </p>
      </motion.div>
    </div>
  );
};

export default ClientPaymentReceiptPage;
