import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  User, 
  Phone, 
  MapPin, 
  Calendar, 
  FileText,
  Plus,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  Filter,
  Search,
  Eye,
  Shield,
  ShieldOff
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const ProxyServiceRequest = () => {
  console.log('ProxyServiceRequest component loaded');
  const navigate = useNavigate();
  const [serviceRequests, setServiceRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [isProxyMode, setIsProxyMode] = useState(true);

  useEffect(() => {
    console.log('ProxyServiceRequest: Fetching service requests');
    fetchServiceRequests();
  }, []);

  useEffect(() => {
    console.log('ProxyServiceRequest: Proxy mode changed:', isProxyMode);
    if (!isProxyMode) {
      console.log('ProxyServiceRequest: Navigating back to service requests');
      navigate('/admin/service-requests');
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

  // Form states
  const [formData, setFormData] = useState({
    payer_name: '',
    payer_mobile: '',
    patient_name: '',
    patient_age: '',
    relationship_to_client: '',
    patient_condition: '',
    service_type: '',
    service_model: 'SHIFT_BASED',
    location_address: '',
    start_date: '',
    remarks: '',
    preferred_gender: 'ANY',
    status: 'NEW_LEAD'
  });

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
        return <Calendar className="w-4 h-4" />;
      case 'CONFIRMED':
        return <CheckCircle className="w-4 h-4" />;
      case 'CANCELLED':
        return <X className="w-4 h-4" />;
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

  // Options for dropdown fields
  const relationshipOptions = [
    'PARENT', 'GUARDIAN', 'GRANDPARENT', 'SELF', 'SPOUSE', 'OTHER'
  ];

  const serviceTypeOptions = [
    'NANNY', 'CAREGIVER', 'NURSE'
  ];

  const serviceModelOptions = [
    'LIVE_IN', 'SHIFT_BASED', 'VISITING'
  ];

  const genderOptions = [
    'MALE', 'FEMALE', 'ANY'
  ];

  const statusOptions = [
    'NEW_LEAD', 'PENDING', 'CONTACTED', 'CONFIRMED', 'CANCELLED'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear errors when user starts typing
    if (error) {
      setError(null);
    }
    if (success) {
      setSuccess(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate required fields
      const requiredFields = ['payer_name', 'payer_mobile', 'patient_name', 'patient_age', 'service_type'];
      const missingFields = requiredFields.filter(field => !formData[field]);
      
      if (missingFields.length > 0) {
        setError(`Please fill in all required fields: ${missingFields.join(', ')}`);
        setFormLoading(false);
        return;
      }

      // Validate patient age
      if (isNaN(formData.patient_age) || formData.patient_age <= 0) {
        setError('Age must be a positive number');
        setFormLoading(false);
        return;
      }

      // Validate mobile number (basic validation)
      const mobileRegex = /^[0-9]{10}$/;
      if (!mobileRegex.test(formData.payer_mobile.replace(/\s/g, ''))) {
        setError('Please enter a valid 10-digit mobile number');
        setFormLoading(false);
        return;
      }

      // Prepare data for API
      const requestData = {
        ...formData,
        patient_age: parseInt(formData.patient_age),
        client_id: null // Admin creates without linking to client
      };

      console.log('Submitting service request:', requestData);

      const response = await apiClient.createProxyServiceRequest(requestData);
      
      setSuccess('Service request created successfully!');
      console.log('Service request created:', response.data);

      // Reset form after successful submission
      setTimeout(() => {
        setFormData({
          payer_name: '',
          payer_mobile: '',
          patient_name: '',
          patient_age: '',
          relationship_to_client: '',
          patient_condition: '',
          service_type: '',
          service_model: 'SHIFT_BASED',
          location_address: '',
          start_date: '',
          remarks: '',
          preferred_gender: 'ANY',
          status: 'NEW_LEAD'
        });
        setSuccess(null);
        setShowForm(false);
        fetchServiceRequests(); // Refresh the list
      }, 2000);

    } catch (err) {
      console.error('Error creating service request:', err);
      setError(err.message || 'Failed to create service request');
    } finally {
      setFormLoading(false);
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setFormData({
      payer_name: '',
      payer_mobile: '',
      patient_name: '',
      patient_age: '',
      relationship_to_client: '',
      patient_condition: '',
      service_type: '',
      service_model: 'SHIFT_BASED',
      location_address: '',
      start_date: '',
      remarks: '',
      preferred_gender: 'ANY',
      status: 'NEW_LEAD'
    });
    setError(null);
    setSuccess(null);
  };

  const handleBackToServiceRequests = () => {
    navigate('/admin/service-requests');
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

  if (error && !showForm) {
    return (
      <AdminLayout title="Service Requests" subtitle="Error occurred">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <X className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout 
      title="Service Requests" 
      subtitle={`Total ${filteredRequests.length} requests - Proxy Mode`}
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
          
          {/* Proxy Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg">
            {isProxyMode ? (
              <Shield className="w-4 h-4 text-emerald-600" />
            ) : (
              <ShieldOff className="w-4 h-4 text-slate-400" />
            )}
            <span className={`text-sm font-medium ${isProxyMode ? 'text-emerald-600' : 'text-slate-500'}`}>
              Proxy Mode
            </span>
            <button
              onClick={() => setIsProxyMode(!isProxyMode)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isProxyMode ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  isProxyMode ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Add Service Request Button */}
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Service Request
          </button>
        </div>
      </div>

      {/* Service Requests List - Hidden when form is shown */}
      {!showForm && (
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Form - Shown when Add Service Request is clicked */}
      {showForm && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Add Service Request</h2>
              <p className="text-slate-600 mt-1">Manually create a service request on behalf of a client</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
                <AlertCircle className="w-4 h-4" />
                Admin Mode
              </span>
            </div>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error and Success Messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <X className="w-5 h-5 text-red-600" />
                  <span className="text-red-800">{error}</span>
                </div>
              </div>
            )}

            {success && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-green-800">{success}</span>
                </div>
              </div>
            )}

            {/* Payer Information */}
            <div className="border-b border-slate-200 pb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Payer Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Payer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="payer_name"
                    value={formData.payer_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter payer's full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Payer Mobile <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    name="payer_mobile"
                    value={formData.payer_mobile}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter 10-digit mobile number"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Patient Information */}
            <div className="border-b border-slate-200 pb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Care Profile Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="patient_name"
                    value={formData.patient_name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter full name"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Age <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    name="patient_age"
                    value={formData.patient_age}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter age"
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Relationship to Client
                  </label>
                  <select
                    name="relationship_to_client"
                    value={formData.relationship_to_client}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select relationship</option>
                    {relationshipOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase().replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Condition
                  </label>
                  <textarea
                    name="patient_condition"
                    value={formData.patient_condition}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Describe the condition and care needs"
                  />
                </div>
              </div>
            </div>

            {/* Service Details */}
            <div className="border-b border-slate-200 pb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Service Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Service Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select service type</option>
                    {serviceTypeOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Service Model
                  </label>
                  <select
                    name="service_model"
                    value={formData.service_model}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {serviceModelOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase().replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Preferred Gender
                  </label>
                  <select
                    name="preferred_gender"
                    value={formData.preferred_gender}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {genderOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Request Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {statusOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0) + option.slice(1).toLowerCase().replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Location and Schedule */}
            <div className="border-b border-slate-200 pb-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Location & Schedule
              </h2>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Service Address
                  </label>
                  <textarea
                    name="location_address"
                    value={formData.location_address}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter complete service address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Preferred Start Date
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Additional Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={formData.remarks}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Any additional information or special requirements"
                  />
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-4 pt-6">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
                disabled={formLoading}
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={formLoading}
              >
                {formLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Create Request
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

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
                  <X className="w-6 h-6" />
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
                <h3 className="font-semibold text-slate-900 mb-3">Care Profile Information</h3>
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

export default ProxyServiceRequest;