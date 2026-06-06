import React, { useState, useEffect } from 'react';
import { Check, X, FileText, Eye, ShieldAlert, Loader2, LayoutGrid, List, AlertCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';

const WorkerVerification = () => {
  const { adminToken } = useAdminAuth();
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('row'); // 'cube' or 'row'
  const [rejectModal, setRejectModal] = useState({
    isOpen: false,
    applicationId: null,
    reason: '',
    fullName: ''
  });
  const [approveModal, setApproveModal] = useState({
    isOpen: false,
    applicationId: null,
    staffId: '',
    adminRemarks: '',
    fullName: ''
  });

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

  const openApproveModal = (application) => {
    setApproveModal({
      isOpen: true,
      applicationId: application.application_id,
      staffId: '',
      adminRemarks: '',
      fullName: application.full_name || 'Unknown'
    });
  };

  const closeApproveModal = () => {
    setApproveModal({ isOpen: false, applicationId: null, staffId: '', adminRemarks: '', fullName: '' });
  };

  const handleAccept = async () => {
    if (!approveModal.staffId.trim()) {
      alert('Please enter a Staff ID before approving.');
      return;
    }
    try {
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      await apiClient.acceptApplication(approveModal.applicationId, {
        custom_staff_id: approveModal.staffId.trim(),
        admin_remarks: approveModal.adminRemarks.trim() || null,
      });
      apiClient.setToken(originalToken);
      closeApproveModal();
      fetchApplications();
    } catch (err) {
      setError(err.message || 'Error accepting application');
      console.error('Error accepting application:', err);
    }
  };

  const openRejectModal = (application) => {
    setRejectModal({
      isOpen: true,
      applicationId: application.application_id,
      reason: '',
      fullName: application.full_name || 'Unknown'
    });
  };

  const closeRejectModal = () => {
    setRejectModal({
      isOpen: false,
      applicationId: null,
      reason: '',
      fullName: ''
    });
  };

  const handleReject = async () => {
    if (!rejectModal.reason.trim()) {
      alert('Please enter a rejection reason.');
      return;
    }

    try {
      // Use admin token for API calls
      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);

      await apiClient.rejectApplication(rejectModal.applicationId, rejectModal.reason);

      // Restore original token
      apiClient.setToken(originalToken);

      // Close modal and refresh
      closeRejectModal();
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
      <div className="flex justify-end mb-4">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('cube')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'cube'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
            Cube
          </button>
          <button
            onClick={() => setViewMode('row')}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'row'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <List className="w-4 h-4" />
            Row
          </button>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-slate-500">No pending applications found.</p>
        </div>
      ) : viewMode === 'row' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Applicant</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Contact</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Roles</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Address</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Gender</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Date of Birth</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">NIC Number</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">NIC Photos</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Rejection Reason</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Documents</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Actions</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {applications.map((application) => (
                  <tr key={application.application_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {application.profile_picture_url ? (
                          <img
                            src={application.profile_picture_url}
                            alt={`${application.full_name}`}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                            <span className="text-slate-500 font-bold text-sm">
                              {application.full_name?.charAt(0) || 'A'}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-slate-900">{application.full_name || 'Unknown'}</p>
                          <p className="text-sm text-slate-500">{application.location || 'Applicant'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-700">{application.mobile_number || 'N/A'}</p>
                      <p className="text-sm text-slate-500">{application.email || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      {application.applied_roles && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {application.applied_roles.replace(/[{}]/g, '')}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-700 max-w-xs truncate" title={application.home_address || 'N/A'}>
                        {application.home_address || 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded capitalize">
                        {application.gender || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-700">
                        {application.date_of_birth ? new Date(application.date_of_birth).toLocaleDateString() : 'N/A'}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-700">{application.nic_number || 'N/A'}</p>
                    </td>
                    <td className="px-6 py-4">
                      {application.nic_front_url || application.nic_back_url ? (
                        <div className="flex items-center gap-2">
                          {application.nic_front_url && (
                            <button
                              onClick={() => window.open(application.nic_front_url, '_blank')}
                              className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                              title="View NIC front"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {application.nic_back_url && (
                            <button
                              onClick={() => window.open(application.nic_back_url, '_blank')}
                              className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                              title="View NIC back"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {application.nic_front_url && application.nic_back_url && (
                            <span className="text-xs text-slate-500">2 photos</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">No photos</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        application.status === 'PENDING'
                          ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : application.status === 'APPROVED'
                          ? 'bg-green-50 text-green-700 border-green-100'
                          : 'bg-red-50 text-red-700 border-red-100'
                      }`}>
                        {application.status || 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {application.status === 'REJECTED' && application.rejection_reason ? (
                        <span className="text-sm text-red-600">{application.rejection_reason}</span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {application.document_urls && application.document_urls.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-600">{application.document_urls.length} doc(s)</span>
                          <button
                            onClick={() => window.open(application.document_urls[0], '_blank')}
                            className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                            title="View first document"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">No documents</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {application.status === 'PENDING' ? (
                          <>
                            <button
                              onClick={() => openRejectModal(application)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </button>
                            <button
                              onClick={() => openApproveModal(application)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-all"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve
                            </button>
                          </>
                        ) : (
                          <span className="text-sm text-slate-400">No actions</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/admin/workers/${application.application_id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 mb-1">Home Address</p>
                    <p className="text-xs text-slate-500" title={application.home_address || 'N/A'}>
                      {application.home_address || 'N/A'}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm font-medium text-slate-700 mb-1">Personal Details</p>
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">Gender:</span> <span className="capitalize">{application.gender || 'N/A'}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        <span className="font-medium">DOB:</span> {application.date_of_birth ? new Date(application.date_of_birth).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {(application.nic_number || application.nic_front_url || application.nic_back_url) && (
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-sm font-medium text-slate-700 mb-2">NIC Details</p>
                      {application.nic_number && (
                        <p className="text-xs text-slate-500 mb-2">
                          <span className="font-medium">NIC Number:</span> {application.nic_number}
                        </p>
                      )}
                      {(application.nic_front_url || application.nic_back_url) && (
                        <div className="space-y-2">
                          {application.nic_front_url && (
                            <div className="p-2 bg-white rounded flex items-center justify-between hover:bg-blue-50 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                <span className="text-xs text-slate-600 group-hover:text-blue-700">NIC Front</span>
                              </div>
                              <button
                                onClick={() => window.open(application.nic_front_url, '_blank')}
                                className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                          {application.nic_back_url && (
                            <div className="p-2 bg-white rounded flex items-center justify-between hover:bg-blue-50 transition-colors cursor-pointer group">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                                <span className="text-xs text-slate-600 group-hover:text-blue-700">NIC Back</span>
                              </div>
                              <button
                                onClick={() => window.open(application.nic_back_url, '_blank')}
                                className="p-1 text-slate-400 hover:text-blue-500 transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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

                {application.status === 'REJECTED' && application.rejection_reason && (
                  <div className="bg-red-50 border border-red-100 p-3 rounded-lg mb-4">
                    <p className="text-sm font-semibold text-red-700 mb-1">Rejection Reason:</p>
                    <p className="text-sm text-red-600">{application.rejection_reason}</p>
                  </div>
                )}
              </div>

              <div className={`p-4 bg-slate-50 border-t border-slate-200 ${application.status === 'PENDING' ? 'grid grid-cols-3 gap-2' : 'flex justify-center'}`}>
                {application.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => openRejectModal(application)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all text-sm"
                    >
                      <X className="w-4 h-4" /> Reject
                    </button>
                    <button
                      onClick={() => navigate(`/admin/workers/${application.application_id}`)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-100 transition-all text-sm"
                    >
                      <ExternalLink className="w-4 h-4" /> Review
                    </button>
                    <button
                      onClick={() => openApproveModal(application)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-500 shadow-lg shadow-green-600/20 transition-all text-sm"
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                  </>
                )}
                {application.status !== 'PENDING' && (
                  <button
                    onClick={() => navigate(`/admin/workers/${application.application_id}`)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-100 transition-all"
                  >
                    <ExternalLink className="w-4 h-4" /> View Details
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Approve Modal */}
      {approveModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Approve Application</h3>
                <p className="text-sm text-slate-500">
                  Approving <span className="font-medium text-slate-700">{approveModal.fullName}</span>'s application.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Staff ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={approveModal.staffId}
                onChange={(e) => setApproveModal({ ...approveModal, staffId: e.target.value })}
                placeholder="e.g. VC-0042"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-green-300 focus:ring-2 focus:ring-green-100 text-sm"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Admin Remarks <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={approveModal.adminRemarks}
                onChange={(e) => setApproveModal({ ...approveModal, adminRemarks: e.target.value })}
                placeholder="Any notes about this approval..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-green-300 focus:ring-2 focus:ring-green-100 resize-none text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeApproveModal}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white font-medium rounded-xl hover:bg-green-500 transition-all shadow-lg shadow-green-600/20"
              >
                Confirm Approve
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Rejection Reason Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Reject Application</h3>
                <p className="text-sm text-slate-500">
                  You are rejecting <span className="font-medium text-slate-700">{rejectModal.fullName}</span>'s application.
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="rejection-reason" className="block text-sm font-medium text-slate-700 mb-2">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                id="rejection-reason"
                rows={4}
                value={rejectModal.reason}
                onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
                placeholder="Enter the reason for rejecting this application..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-red-300 focus:ring-2 focus:ring-red-100 resize-none text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={closeRejectModal}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default WorkerVerification;
