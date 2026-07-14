import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Upload, Eye, FileText, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import apiClient from '../../../api/api';
// import LanguageToggle from '../../../i18n/LanguageToggle'; // hidden for this release

const DocCard = ({ title, description, url, fieldName, onUpload, uploading }) => {
  const { t } = useTranslation('staffDocumentUpload');
  const inputRef = useRef(null);
  const [localError, setLocalError] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      setLocalError(t('errors.fileTypeError'));
      return;
    }
    setLocalError('');
    onUpload(fieldName, file);
    e.target.value = '';
  };

  return (
    <div className={`rounded-2xl border-2 p-6 transition-all ${url ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${url ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          {url
            ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            : <FileText className="w-5 h-5 text-slate-400" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {url
              ? <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">{t('docCard.uploaded')}</span>
              : <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">{t('docCard.required')}</span>
            }
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          {localError && (
            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {localError}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-white text-emerald-700 text-xs font-medium hover:bg-emerald-50 transition-all"
          >
            <Eye className="w-3.5 h-3.5" /> {t('docCard.view')}
          </a>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
            url
              ? 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20'
          }`}
        >
          {uploading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Upload className="w-3.5 h-3.5" />
          }
          {uploading ? t('docCard.uploading') : url ? t('docCard.replace') : t('docCard.upload')}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};

const StaffDocumentUploadPage = () => {
  const { t } = useTranslation('staffDocumentUpload');
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staffName, setStaffName] = useState('');
  const [gramaNiladhariUrl, setGramaNiladhariUrl] = useState(null);
  const [policeReportUrl, setPoliceReportUrl] = useState(null);
  const [uploading, setUploading] = useState({ grama_niladhari: false, police_report: false });
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    const fetchPortal = async () => {
      try {
        const res = await apiClient.getDocUploadPortal(token);
        const d = res.data;
        setStaffName(d.full_name);
        setGramaNiladhariUrl(d.grama_niladhari_url);
        setPoliceReportUrl(d.police_report_url);
      } catch (err) {
        setError(err.message || t('errors.invalidLink'));
      } finally {
        setLoading(false);
      }
    };
    fetchPortal();
  }, [token]);

  const handleUpload = async (fieldName, file) => {
    setUploading(prev => ({ ...prev, [fieldName]: true }));
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append(fieldName, file);
      const res = await apiClient.uploadComplianceDocs(token, formData);
      const d = res.data;
      setGramaNiladhariUrl(d.grama_niladhari_url);
      setPoliceReportUrl(d.police_report_url);
    } catch (err) {
      setUploadError(err.message || t('errors.uploadFailed'));
    } finally {
      setUploading(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  const bothUploaded = gramaNiladhariUrl && policeReportUrl;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-red-200 p-8 text-center shadow-sm">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-900 mb-1">{t('errors.linkNotValid')}</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-500 leading-none">{t('header.appName')}</p>
            <p className="text-sm font-bold text-slate-900 leading-tight">{t('header.portalTitle')}</p>
          </div>
          {/* <LanguageToggle /> hidden for this release — see memory: language-toggle-locations */}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Welcome */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h1 className="text-lg font-bold text-slate-900">
            {t('welcome.greeting', { name: staffName })}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t('welcome.instructions')}
          </p>
        </div>

        {/* All done banner */}
        {bothUploaded && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">{t('allDone.title')}</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {t('allDone.desc')}
              </p>
            </div>
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {uploadError}
          </div>
        )}

        {/* Document cards */}
        <div className="space-y-4">
          <DocCard
            title={t('documents.gramaNiladhari.title')}
            description={t('documents.gramaNiladhari.description')}
            url={gramaNiladhariUrl}
            fieldName="grama_niladhari"
            onUpload={handleUpload}
            uploading={uploading.grama_niladhari}
          />
          <DocCard
            title={t('documents.policeReport.title')}
            description={t('documents.policeReport.description')}
            url={policeReportUrl}
            fieldName="police_report"
            onUpload={handleUpload}
            uploading={uploading.police_report}
          />
        </div>

        <p className="text-center text-xs text-slate-400 pb-6">
          {t('footer.contact')}
        </p>
      </div>
    </div>
  );
};

export default StaffDocumentUploadPage;
