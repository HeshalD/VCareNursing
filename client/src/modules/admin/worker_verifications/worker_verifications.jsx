import React, { useState, useEffect } from 'react';
import { Check, X, FileText, Download, Eye, ShieldAlert, Loader2 } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const WorkerVerification = () => {
  const { adminToken } = useAdminAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (adminToken) {
      fetchApplications();
    }
  }, [adminToken]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      
      // Check if admin token is available
      if (!adminToken) {
        setError('Admin authentication required. Please log in again.');
        setLoading(false);
        return;
      }
      
      console.log('Using admin token:', adminToken.substring(0, 20) + '...');
      
      // Use admin token for API calls
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      
      const response = await apiClient.getApplications();
      
      // Restore original token
      apiClient.setToken(originalToken);
      
      console.log('API Response:', response);
      
      // Handle different response formats
      if (Array.isArray(response)) {
        // Direct array response
        setApplications(response);
      } else if (response.status === 'success') {
        // Object with status and data
        setApplications(response.data || []);
      } else {
        setError('Failed to fetch applications');
        console.log('Response status:', response.status);
        console.log('Response message:', response.message);
      }
    } catch (err) {
      setError(err.message || 'Error fetching applications');
      console.error('Error fetching applications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (applicationId) => {
    try {
      // Use admin token for API calls
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      
      await apiClient.acceptApplication(applicationId);
      
      // Restore original token
      apiClient.setToken(originalToken);
      
      // Refresh the applications list
      fetchApplications();
    } catch (err) {
      setError(err.message || 'Error accepting application');
      console.error('Error accepting application:', err);
    }
  };

  const handleReject = async (applicationId) => {
    try {
      // Use admin token for API calls
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      
      await apiClient.rejectApplication(applicationId, 'Rejected by admin');
      
      // Restore original token
      apiClient.setToken(originalToken);
      
      // Refresh the applications list
      fetchApplications();
    } catch (err) {
      setError(err.message || 'Error rejecting application');
      console.error('Error rejecting application:', err);
    }
  };

  if (loading) {
    return (
      <AdminLayout
        title="Worker Verification"
        subtitle="Loading applications..."
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!adminToken) {
    return (
      <AdminLayout
        title="Worker Verification"
        subtitle="Authentication required"
      >
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg">
          Admin authentication required. Please log in to access this page.
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout
        title="Worker Verification"
        subtitle="Error loading applications"
      >
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Worker Verification"
      subtitle="Verify identity documents and qualifications of new workers."
    >
      {applications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">No pending applications found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {applications.map((application) => (
            <div key={application.application_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {application.profile_picture_url ? (
                      <img 
                        src={application.profile_picture_url} 
                        alt={`${application.full_name}`} 
                        className="w-12 h-12 rounded-xl object-cover" 
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center">
                        <span className="text-slate-500 font-bold">
                          {application.full_name?.charAt(0) || 'A'}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-bold text-slate-900">{application.full_name || 'Unknown'}</h3>
                      <p className="text-sm text-slate-500">
                        {application.location || 'Applicant'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    application.status === 'PENDING' 
                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                      : application.status === 'APPROVED'
                      ? 'bg-green-50 text-green-700 border-green-100'
                      : 'bg-red-50 text-red-700 border-red-100'
                  }`}>
                    {application.status || 'Pending'}
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 mb-1">Contact Information</p>
                    <p className="text-xs text-slate-500">{application.mobile_number || 'N/A'}</p>
                    <p className="text-xs text-slate-500">{application.email || 'N/A'}</p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 mb-1">Applied Roles</p>
                    <div className="flex flex-wrap gap-1">
                      {application.applied_roles && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {application.applied_roles.replace(/[{}]/g, '')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 mb-1">Qualifications</p>
                    <p className="text-xs text-slate-500">{application.qualifications || 'N/A'}</p>
                  </div>

                  {application.document_urls && application.document_urls.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Documents</p>
                      {application.document_urls.map((docUrl, index) => (
                        <div key={index} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between group cursor-pointer hover:bg-blue-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-slate-400 group-hover:text-blue-500" />
                            <div>
                              <p className="font-medium text-sm text-slate-700 group-hover:text-blue-700">
                                Document {index + 1}
                              </p>
                              <p className="text-xs text-slate-400">
                                Click to view document
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => window.open(docUrl, '_blank')}
                            className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {application.status === 'PENDING' && (
                  <div className="bg-blue-50 p-3 rounded-lg flex gap-3 text-blue-700 text-sm mb-4">
                    <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                    <p>Application pending verification. Please review documents and approve or reject.</p>
                  </div>
                )}
              </div>

              {application.status === 'PENDING' && (
                <div className="p-4 bg-slate-50 border-t border-slate-200 grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handleReject(application.application_id)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                  <button 
                    onClick={() => handleAccept(application.application_id)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-500 shadow-lg shadow-green-600/20 transition-all"
                  >
                    <Check className="w-4 h-4" /> Approve
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default WorkerVerification;
