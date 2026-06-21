import React, { useState, useEffect } from 'react';
import { FileText, Eye, Loader2, ExternalLink } from 'lucide-react';
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

  useEffect(() => {
    if (adminToken) {
      fetchApplications();
    }
  }, [adminToken]);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      if (!adminToken) {
        setError('Admin authentication required. Please log in again.');
        setLoading(false);
        return;
      }

      const originalToken = apiClient.token;
      apiClient.setToken(adminToken);
      const response = await apiClient.getApplications();
      apiClient.setToken(originalToken);

      if (Array.isArray(response)) {
        setApplications(response);
      } else if (response.status === 'success') {
        setApplications(response.data || []);
      } else {
        setError('Failed to fetch applications');
      }
    } catch (err) {
      setError(err.message || 'Error fetching applications');
    } finally {
      setLoading(false);
    }
  };

  const statusBadge = (status) => {
    const map = {
      PENDING:  'bg-amber-50 text-amber-700 border-amber-200',
      APPROVED: 'bg-green-50 text-green-700 border-green-200',
      REJECTED: 'bg-red-50 text-red-700 border-red-200',
    };
    return `px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[status] ?? map.PENDING}`;
  };

  if (loading) {
    return (
      <AdminLayout title="Worker Verification" subtitle="Loading applications...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  if (!adminToken) {
    return (
      <AdminLayout title="Worker Verification" subtitle="Authentication required">
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg">
          Admin authentication required. Please log in to access this page.
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Worker Verification" subtitle="Error loading applications">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Worker Verification"
      subtitle="Review and verify identity documents and qualifications of new workers."
    >
      {applications.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No applications found.</p>
          <p className="text-slate-400 text-sm mt-1">New worker applications will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Applicant</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Applied Role</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Documents</th>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app.application_id} className="hover:bg-slate-50 transition-colors">
                    {/* Applicant */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {app.profile_picture_url ? (
                          <img
                            src={app.profile_picture_url}
                            alt={app.full_name}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-100"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center ring-2 ring-slate-100">
                            <span className="text-slate-500 font-semibold text-sm">
                              {app.full_name?.charAt(0) ?? 'A'}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{app.full_name ?? 'Unknown'}</p>
                          {app.application_code && (
                            <p className="text-xs font-mono font-medium text-slate-400">{app.application_code}</p>
                          )}
                          <p className="text-xs text-slate-400">{app.location ?? '—'}</p>
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-700">{app.mobile_number ?? '—'}</p>
                      <p className="text-xs text-slate-400">{app.email ?? '—'}</p>
                    </td>

                    {/* Role */}
                    <td className="px-6 py-4">
                      {app.applied_roles ? (
                        <span className="inline-block text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full font-medium">
                          {app.applied_roles.replace(/[{}"]/g, '')}
                        </span>
                      ) : (
                        <span className="text-sm text-slate-400">—</span>
                      )}
                    </td>

                    {/* Documents */}
                    <td className="px-6 py-4">
                      {app.document_urls && app.document_urls.length > 0 ? (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-sm">{app.document_urls.length} file{app.document_urls.length !== 1 ? 's' : ''}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-400">None</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={statusBadge(app.status)}>
                        {app.status ?? 'PENDING'}
                      </span>
                    </td>

                    {/* Review */}
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => navigate(`/admin/workers/${app.application_id}`)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default WorkerVerification;
