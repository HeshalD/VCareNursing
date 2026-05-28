import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { 
  Calendar, 
  User, 
  Phone, 
  MapPin, 
  Clock, 
  FileText,
  Filter,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calculator,
  Shield,
  ShieldOff,
  Settings
} from 'lucide-react';
import PresetManager from '../service_quotes/PresetManager';

const ServiceRequests = () => {
  const navigate = useNavigate();
  const [serviceRequests, setServiceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [isProxyMode, setIsProxyMode] = useState(false);
  const [showPresetManager, setShowPresetManager] = useState(false);

  useEffect(() => {
    fetchServiceRequests();
  }, []);

  useEffect(() => {
    console.log('Proxy mode changed:', isProxyMode);
    if (isProxyMode) {
      console.log('Proxy mode activated, navigating to proxy-service-requests');
      navigate('/admin/proxy-service-requests');
    } else {
      console.log('Proxy mode deactivated');
    }
  }, [isProxyMode, navigate]);

  const fetchServiceRequests = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getAllServiceRequests();
      console.log('Service requests data:', response.data);
      setServiceRequests(response.data || []);
    } catch (err) {
      console.error('Service Requests fetch error:', err);
      setError(`Failed to fetch service requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'NEW_LEAD':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'CONTACTED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CONFIRMED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'NEW_LEAD':
        return <AlertCircle className="w-4 h-4" />;
      case 'PENDING':
        return <AlertCircle className="w-4 h-4" />;
      case 'CONTACTED':
        return <Clock className="w-4 h-4" />;
      case 'CONFIRMED':
        return <CheckCircle className="w-4 h-4" />;
      case 'CANCELLED':
        return <XCircle className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const filteredRequests = serviceRequests.filter(request => {
    const matchesSearch = 
      request.payer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.patient_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.payer_mobile?.includes(searchTerm) ||
      request.service_type?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <AdminLayout title="Service Requests" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Service Requests" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Service Requests" 
      subtitle={`Total ${filteredRequests.length} requests`}
    >
      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, phone, or service type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option key="all" value="all">All Status</option>
              <option key="new_lead" value="NEW_LEAD">New Lead</option>
              <option key="pending" value="PENDING">Pending</option>
              <option key="contacted" value="CONTACTED">Contacted</option>
              <option key="confirmed" value="CONFIRMED">Confirmed</option>
              <option key="cancelled" value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-3">
            {/* Proxy Mode Toggle */}
            <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md bg-white shadow-sm">
              {isProxyMode ? (
                <Shield className="w-5 h-5 text-emerald-600" />
              ) : (
                <ShieldOff className="w-5 h-5 text-slate-400" />
              )}
              <span className={`text-sm font-medium ${isProxyMode ? 'text-emerald-600' : 'text-slate-600'}`}>
                Proxy Mode
              </span>
              <button
                onClick={() => setIsProxyMode(!isProxyMode)}
                aria-pressed={isProxyMode}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isProxyMode ? 'bg-emerald-600' : 'bg-slate-300'}`}
                title="Toggle proxy mode"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isProxyMode ? 'translate-x-5' : 'translate-x-1'}`}
                />
              </button>
            </div>

            {/* Manage Presets Button */}
            <button
              onClick={() => setShowPresetManager(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-shadow shadow"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Manage Presets</span>
            </button>
          </div>
        </div>
      </div>

      {/* Service Requests List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        {filteredRequests.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center">
              <FileText className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No service requests</h3>
            <p className="text-sm text-slate-500">There are no service requests matching your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-white">
                <tr className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Request Details</th>
                  <th className="px-4 py-3">Patient Info</th>
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Start Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filteredRequests.map((request) => (
                  <tr key={request.request_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 align-top">
                      <div>
                        <div className="font-medium text-slate-900">{request.payer_name}</div>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mt-1">
                          <Phone className="w-3 h-3" />
                          <span>{request.payer_mobile}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">{formatDate(request.created_at)}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div>
                        <div className="font-medium text-slate-900">{request.patient_name}</div>
                        <div className="text-sm text-slate-500">Age: {request.patient_age} • {request.relationship_to_client}</div>
                        <div className="text-sm text-slate-500 mt-1">{request.patient_condition}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div>
                        <div className="font-medium text-slate-900">{request.service_type}</div>
                        <div className="text-sm text-slate-500">{request.service_model?.replace('_', ' ')}</div>
                        {request.preferred_gender && (
                          <div className="text-xs text-slate-500 mt-1">Prefers: {request.preferred_gender}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top max-w-xs">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-slate-600 line-clamp-2">{request.location_address}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="w-3 h-3" />
                        <span>{request.start_date ? new Date(request.start_date).toLocaleDateString() : 'Not set'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold border ${getStatusColor(request.status || 'PENDING')}`}>
                        {getStatusIcon(request.status || 'PENDING')}
                        <span className="uppercase">{request.status || 'PENDING'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/admin/service-requests/${request.request_id}/summary`)}
                          className="p-2 rounded-md bg-slate-50 hover:bg-slate-100 text-blue-600 transition"
                          title="Open Summary"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {request.status === 'NEW_LEAD' && (
                          <button
                            onClick={() => navigate(`/admin/quote-builder/${request.request_id}`)}
                            className="p-2 rounded-md bg-slate-50 hover:bg-slate-100 text-green-600 transition"
                            title="Create Quote"
                          >
                            <Calculator className="w-4 h-4" />
                          </button>
                        )}
                        {/* Assign Staff removed — not used in this process */}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Service Request Details</h2>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Payer Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Payer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Name</label>
                    <p className="font-medium">{selectedRequest.payer_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Mobile</label>
                    <p className="font-medium">{selectedRequest.payer_mobile}</p>
                  </div>
                </div>
              </div>

              {/* Patient Information */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Patient Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Name</label>
                    <p className="font-medium">{selectedRequest.patient_name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Age</label>
                    <p className="font-medium">{selectedRequest.patient_age}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Relationship</label>
                    <p className="font-medium">{selectedRequest.relationship_to_client}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Condition</label>
                    <p className="font-medium">{selectedRequest.patient_condition}</p>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Service Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate-500">Service Type</label>
                    <p className="font-medium">{selectedRequest.service_type}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Service Model</label>
                    <p className="font-medium">{selectedRequest.service_model?.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Preferred Gender</label>
                    <p className="font-medium">{selectedRequest.preferred_gender || 'Any'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-slate-500">Start Date</label>
                    <p className="font-medium">
                      {selectedRequest.start_date ? new Date(selectedRequest.start_date).toLocaleDateString() : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Service Location</h3>
                <p className="text-slate-700">{selectedRequest.location_address}</p>
              </div>

              {/* Remarks */}
              {selectedRequest.remarks && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3">Remarks</h3>
                  <p className="text-slate-700">{selectedRequest.remarks}</p>
                </div>
              )}

              {/* Status */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">Status</h3>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(selectedRequest.status || 'PENDING')}`}>
                  {getStatusIcon(selectedRequest.status || 'PENDING')}
                  {selectedRequest.status || 'PENDING'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preset Manager Modal */}
      <PresetManager
        isOpen={showPresetManager}
        onClose={() => setShowPresetManager(false)}
        onSave={() => {
          setShowPresetManager(false);
        }}
      />
    </AdminLayout>
  );
};

export default ServiceRequests;