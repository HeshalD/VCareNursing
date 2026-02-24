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
  Calculator
} from 'lucide-react';

const ServiceRequests = () => {
  const navigate = useNavigate();
  const [serviceRequests, setServiceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);

  useEffect(() => {
    fetchServiceRequests();
  }, []);

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
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, phone, or service type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option key="all" value="all">All Status</option>
              <option key="new_lead" value="NEW_LEAD">New Lead</option>
              <option key="pending" value="PENDING">Pending</option>
              <option key="contacted" value="CONTACTED">Contacted</option>
              <option key="confirmed" value="CONFIRMED">Confirmed</option>
              <option key="cancelled" value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Service Requests List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No service requests found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Request Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Patient Info
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Start Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {filteredRequests.map((request) => (
                  <tr key={request.request_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-slate-900">{request.payer_name}</div>
                        <div className="flex items-center gap-1 text-sm text-slate-500 mt-1">
                          <Phone className="w-3 h-3" />
                          {request.payer_mobile}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {formatDate(request.created_at)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-slate-900">{request.patient_name}</div>
                        <div className="text-sm text-slate-500">
                          Age: {request.patient_age} • {request.relationship_to_client}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">
                          {request.patient_condition}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-slate-900">{request.service_type}</div>
                        <div className="text-sm text-slate-500">
                          {request.service_model?.replace('_', ' ')}
                        </div>
                        {request.preferred_gender && (
                          <div className="text-xs text-slate-500 mt-1">
                            Prefers: {request.preferred_gender}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-xs">
                        <div className="flex items-start gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                          <span className="text-sm text-slate-600 line-clamp-2">
                            {request.location_address}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Calendar className="w-3 h-3" />
                        {request.start_date ? new Date(request.start_date).toLocaleDateString() : 'Not set'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(request.status || 'PENDING')}`}>
                        {getStatusIcon(request.status || 'PENDING')}
                        {request.status || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedRequest(request)}
                          className="text-blue-600 hover:text-blue-800 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {request.status === 'NEW_LEAD' && (
                          <button
                            onClick={() => navigate(`/admin/quote-builder/${request.request_id}`)}
                            className="text-green-600 hover:text-green-800 transition-colors"
                            title="Create Quote"
                          >
                            <Calculator className="w-4 h-4" />
                          </button>
                        )}
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
    </AdminLayout>
  );
};

export default ServiceRequests;