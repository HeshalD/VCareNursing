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
  ShieldOff,
  Users,
  Heart,
  Loader2,
  Check,
  ArrowLeft
} from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const ProxyServiceRequest = () => {
  const navigate = useNavigate();

  // List state
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

  // Client & care profile selection state
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [careProfiles, setCareProfiles] = useState([]);
  const [careProfilesLoading, setCareProfilesLoading] = useState(false);
  const [selectedCareProfile, setSelectedCareProfile] = useState(null);

  // Form state
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

  useEffect(() => {
    fetchServiceRequests();
  }, []);

  useEffect(() => {
    if (!isProxyMode) {
      navigate('/admin/service-requests');
    }
  }, [isProxyMode, navigate]);

  const fetchServiceRequests = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getAllServiceRequests();
      setServiceRequests(response.data || []);
    } catch (err) {
      setError(`Failed to fetch service requests: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      setClientsLoading(true);
      const response = await apiClient.getAllClients();
      setClients(response.data || []);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setClientsLoading(false);
    }
  };

  const fetchCareProfiles = async (clientId) => {
    try {
      setCareProfilesLoading(true);
      const response = await apiClient.getPatientsByClient(clientId);
      setCareProfiles(response.data || []);
    } catch (err) {
      console.error('Failed to fetch care profiles:', err);
      setCareProfiles([]);
    } finally {
      setCareProfilesLoading(false);
    }
  };

  const handleOpenForm = () => {
    fetchClients();
    setShowForm(true);
  };

  const handleSelectClient = (client) => {
    setSelectedClient(client);
    setSelectedCareProfile(null);
    setCareProfiles([]);
    setFormData(prev => ({
      ...prev,
      payer_name: client.full_name || '',
      payer_mobile: client.mobile_number || '',
      patient_name: '',
      patient_age: '',
      relationship_to_client: '',
      patient_condition: '',
      location_address: '',
    }));
    fetchCareProfiles(client.client_profile_id);
  };

  const handleDeselectClient = () => {
    setSelectedClient(null);
    setSelectedCareProfile(null);
    setCareProfiles([]);
    setFormData(prev => ({
      ...prev,
      payer_name: '',
      payer_mobile: '',
      patient_name: '',
      patient_age: '',
      relationship_to_client: '',
      patient_condition: '',
      location_address: '',
    }));
  };

  const handleSelectCareProfile = (profile) => {
    setSelectedCareProfile(profile);
    setFormData(prev => ({
      ...prev,
      patient_name: profile.full_name || '',
      patient_age: profile.age?.toString() || '',
      relationship_to_client: profile.relationship_to_client || '',
      patient_condition: profile.medical_condition || '',
      location_address: profile.residential_address || '',
    }));
  };

  const handleDeselectCareProfile = () => {
    setSelectedCareProfile(null);
    setFormData(prev => ({
      ...prev,
      patient_name: '',
      patient_age: '',
      relationship_to_client: '',
      patient_condition: '',
      location_address: '',
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!selectedClient) {
        setError('Please select a client (payer) before submitting');
        setFormLoading(false);
        return;
      }

      const requiredFields = ['payer_name', 'payer_mobile', 'patient_name', 'patient_age', 'service_type'];
      const missingFields = requiredFields.filter(field => !formData[field]);
      if (missingFields.length > 0) {
        setError(`Please fill in all required fields: ${missingFields.join(', ')}`);
        setFormLoading(false);
        return;
      }

      if (isNaN(formData.patient_age) || formData.patient_age <= 0) {
        setError('Age must be a positive number');
        setFormLoading(false);
        return;
      }

      const mobileRegex = /^[0-9]{10}$/;
      if (!mobileRegex.test(formData.payer_mobile.replace(/\s/g, ''))) {
        setError('Please enter a valid 10-digit mobile number');
        setFormLoading(false);
        return;
      }

      const requestData = {
        ...formData,
        patient_age: parseInt(formData.patient_age),
        client_id: selectedClient.client_profile_id,
      };

      await apiClient.createProxyServiceRequest(requestData);
      setSuccess('Service request created successfully!');

      setTimeout(() => {
        resetForm();
        setShowForm(false);
        fetchServiceRequests();
      }, 2000);

    } catch (err) {
      setError(err.message || 'Failed to create service request');
    } finally {
      setFormLoading(false);
    }
  };

  const resetForm = () => {
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
    setSelectedClient(null);
    setSelectedCareProfile(null);
    setCareProfiles([]);
    setClientSearch('');
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    resetForm();
    setShowForm(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'NEW_LEAD':    return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'PENDING':     return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'CONTACTED':   return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'CONFIRMED':   return 'bg-green-50 text-green-700 border-green-200';
      case 'CANCELLED':   return 'bg-red-50 text-red-700 border-red-200';
      default:            return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusDot = (status) => {
    switch (status) {
      case 'NEW_LEAD':    return 'bg-purple-500';
      case 'PENDING':     return 'bg-amber-500';
      case 'CONTACTED':   return 'bg-blue-500';
      case 'CONFIRMED':   return 'bg-green-500';
      case 'CANCELLED':   return 'bg-red-500';
      default:            return 'bg-slate-400';
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

  const filteredClients = clients.filter(c =>
    c.full_name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.mobile_number?.includes(clientSearch)
  );

  const visibleClients = clientSearch.trim() ? filteredClients : filteredClients.slice(0, 3);

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const labelMap = (str) => str.charAt(0) + str.slice(1).toLowerCase().replace(/_/g, ' ');

  const relationshipOptions = ['PARENT', 'GUARDIAN', 'GRANDPARENT', 'SELF', 'SPOUSE', 'OTHER'];
  const serviceTypeOptions   = ['NANNY', 'CAREGIVER', 'NURSE'];
  const serviceModelOptions  = ['LIVE_IN', 'SHIFT_BASED', 'VISITING'];
  const genderOptions        = ['MALE', 'FEMALE', 'ANY'];
  const statusOptions        = ['NEW_LEAD', 'PENDING', 'CONTACTED', 'CONFIRMED', 'CANCELLED'];

  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400';
  const labelCls = 'block text-sm font-medium text-slate-600 mb-1.5';

  if (loading) {
    return (
      <AdminLayout title="Service Requests" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="animate-spin w-8 h-8 text-blue-600" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={showForm ? 'New Service Request' : 'Service Requests'}
      subtitle={showForm ? 'Create a request on behalf of a registered client' : `${filteredRequests.length} requests · Proxy Mode`}
    >

      {/* ── LIST VIEW ─────────────────────────────────────────────── */}
      {!showForm && (
        <>
          {/* Toolbar */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone or service type…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="NEW_LEAD">New Lead</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              {/* Proxy toggle */}
              <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white">
                {isProxyMode
                  ? <Shield className="w-4 h-4 text-emerald-600" />
                  : <ShieldOff className="w-4 h-4 text-slate-400" />}
                <span className={`text-sm font-medium ${isProxyMode ? 'text-emerald-600' : 'text-slate-500'}`}>
                  Proxy Mode
                </span>
                <button
                  onClick={() => setIsProxyMode(!isProxyMode)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isProxyMode ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${isProxyMode ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
              </div>

              <button
                onClick={handleOpenForm}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Request
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                <FileText className="w-10 h-10 mb-3" />
                <p className="text-sm font-medium">No service requests found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                      <th className="px-5 py-3 text-left">Client / Payer</th>
                      <th className="px-5 py-3 text-left">Care Profile</th>
                      <th className="px-5 py-3 text-left">Service</th>
                      <th className="px-5 py-3 text-left">Location</th>
                      <th className="px-5 py-3 text-left">Start Date</th>
                      <th className="px-5 py-3 text-left">Status</th>
                      <th className="px-5 py-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRequests.map((req) => (
                      <tr key={req.request_id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{req.payer_name}</p>
                          <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                            <Phone className="w-3 h-3" />
                            <span className="text-xs">{req.payer_mobile}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {formatDate(req.created_at)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{req.patient_name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Age {req.patient_age}{req.relationship_to_client ? ` · ${req.relationship_to_client}` : ''}
                          </p>
                          {req.patient_condition && (
                            <p className="text-xs text-slate-400 mt-0.5 max-w-[160px] truncate">{req.patient_condition}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{req.service_type}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{req.service_model?.replace(/_/g, ' ')}</p>
                          {req.preferred_gender && req.preferred_gender !== 'ANY' && (
                            <p className="text-xs text-slate-400 mt-0.5">Prefers {req.preferred_gender}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 max-w-[160px]">
                          <div className="flex items-start gap-1 text-slate-600">
                            <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0 text-slate-400" />
                            <span className="text-xs line-clamp-2">{req.location_address || '—'}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1 text-slate-600">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span className="text-xs">
                              {req.start_date ? new Date(req.start_date).toLocaleDateString() : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(req.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(req.status)}`} />
                            {req.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── FORM VIEW ─────────────────────────────────────────────── */}
      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Messages */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* ── STEP 1: Select Client ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selectedClient ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
                {selectedClient ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm">Select Client (Payer)</p>
                <p className="text-xs text-slate-500">Choose the registered client who is paying for this service</p>
              </div>
              {selectedClient && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg ml-2">
                  <span className="text-sm font-medium text-green-700 truncate max-w-[180px]">{selectedClient.full_name}</span>
                  <button
                    type="button"
                    onClick={handleDeselectClient}
                    className="text-green-500 hover:text-green-700 flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {!selectedClient && (
              <div className="p-5">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search clients by name or phone number…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {clientsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">No clients found</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {visibleClients.map(client => (
                        <button
                          key={client.client_profile_id}
                          type="button"
                          onClick={() => handleSelectClient(client)}
                          className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all text-left group"
                        >
                          <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 transition-colors">
                            <User className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{client.full_name}</p>
                            <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                              <Phone className="w-3 h-3" />
                              <span className="text-xs">{client.mobile_number}</span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                    {!clientSearch.trim() && filteredClients.length > 3 && (
                      <p className="text-xs text-slate-400 text-center mt-3">
                        Showing 3 of {filteredClients.length} clients — search to find a specific one
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── STEP 2: Select Care Profile ── */}
          {selectedClient && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${selectedCareProfile ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
                  {selectedCareProfile ? <Check className="w-3.5 h-3.5" /> : '2'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">Select Care Profile</p>
                  <p className="text-xs text-slate-500">Choose a registered care profile for {selectedClient.full_name}</p>
                </div>
                {selectedCareProfile && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg ml-2">
                    <span className="text-sm font-medium text-green-700 truncate max-w-[180px]">{selectedCareProfile.full_name}</span>
                    <button
                      type="button"
                      onClick={handleDeselectCareProfile}
                      className="text-green-500 hover:text-green-700 flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-5">
                {careProfilesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : careProfiles.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Heart className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm font-medium">No care profiles registered for this client</p>
                    <p className="text-xs mt-1">Fill in the details manually in the section below</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {careProfiles.map(profile => {
                      const isSelected = selectedCareProfile?.patient_id === profile.patient_id;
                      return (
                        <button
                          key={profile.patient_id}
                          type="button"
                          onClick={() => handleSelectCareProfile(profile)}
                          className={`flex items-start gap-3 p-3.5 border rounded-xl transition-all text-left ${
                            isSelected
                              ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
                              : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}>
                            <Heart className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>{profile.full_name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Age {profile.age}{profile.relationship_to_client ? ` · ${profile.relationship_to_client}` : ''}
                            </p>
                            {profile.medical_condition && (
                              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{profile.medical_condition}</p>
                            )}
                            {profile.gender && (
                              <p className="text-xs text-slate-400 mt-0.5">{profile.gender}</p>
                            )}
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 3: Service Details ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Service Details</p>
                <p className="text-xs text-slate-500">Review pre-filled info and configure the service request</p>
              </div>
            </div>

            <div className="p-6 space-y-7">

              {/* Payer Info */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-700">Payer Information</h4>
                  {selectedClient && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 font-medium">
                      Auto-filled
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Payer Name <span className="text-red-500">*</span></label>
                    <input type="text" name="payer_name" value={formData.payer_name} onChange={handleInputChange} className={inputCls} placeholder="Payer's full name" />
                  </div>
                  <div>
                    <label className={labelCls}>Mobile Number <span className="text-red-500">*</span></label>
                    <input type="tel" name="payer_mobile" value={formData.payer_mobile} onChange={handleInputChange} className={inputCls} placeholder="10-digit mobile number" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Care Profile Info */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Heart className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-700">Care Profile Information</h4>
                  {selectedCareProfile && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 font-medium">
                      Auto-filled
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Full Name <span className="text-red-500">*</span></label>
                    <input type="text" name="patient_name" value={formData.patient_name} onChange={handleInputChange} className={inputCls} placeholder="Care recipient's name" />
                  </div>
                  <div>
                    <label className={labelCls}>Age <span className="text-red-500">*</span></label>
                    <input type="number" name="patient_age" value={formData.patient_age} onChange={handleInputChange} className={inputCls} placeholder="Age" min="1" />
                  </div>
                  <div>
                    <label className={labelCls}>Relationship to Client</label>
                    <select name="relationship_to_client" value={formData.relationship_to_client} onChange={handleInputChange} className={inputCls}>
                      <option value="">Select relationship</option>
                      {relationshipOptions.map(o => <option key={o} value={o}>{labelMap(o)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Medical Condition</label>
                    <textarea name="patient_condition" value={formData.patient_condition} onChange={handleInputChange} rows={2} className={inputCls} placeholder="Condition and care needs" />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Service Configuration */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-700">Service Configuration</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Service Type <span className="text-red-500">*</span></label>
                    <select name="service_type" value={formData.service_type} onChange={handleInputChange} className={inputCls} required>
                      <option value="">Select service type</option>
                      {serviceTypeOptions.map(o => <option key={o} value={o}>{labelMap(o)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Service Model</label>
                    <select name="service_model" value={formData.service_model} onChange={handleInputChange} className={inputCls}>
                      {serviceModelOptions.map(o => <option key={o} value={o}>{labelMap(o)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Preferred Staff Gender</label>
                    <select name="preferred_gender" value={formData.preferred_gender} onChange={handleInputChange} className={inputCls}>
                      {genderOptions.map(o => <option key={o} value={o}>{labelMap(o)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Initial Status</label>
                    <select name="status" value={formData.status} onChange={handleInputChange} className={inputCls}>
                      {statusOptions.map(o => <option key={o} value={o}>{labelMap(o)}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Location & Schedule */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <h4 className="text-sm font-semibold text-slate-700">Location & Schedule</h4>
                  {selectedCareProfile && selectedCareProfile.residential_address && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 font-medium">
                      Auto-filled
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className={labelCls}>Service Address</label>
                    <textarea name="location_address" value={formData.location_address} onChange={handleInputChange} rows={2} className={inputCls} placeholder="Full service address" />
                  </div>
                  <div>
                    <label className={labelCls}>Preferred Start Date</label>
                    <input type="date" name="start_date" value={formData.start_date} onChange={handleInputChange} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Additional Remarks</label>
                    <textarea name="remarks" value={formData.remarks} onChange={handleInputChange} rows={2} className={inputCls} placeholder="Special requirements or notes" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-1 pb-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={formLoading}
              className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
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
      )}

      {/* ── DETAIL MODAL ───────────────────────────────────────────── */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Service Request Details</h2>
              <button onClick={() => setSelectedRequest(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${getStatusColor(selectedRequest.status)}`}>
                  <span className={`w-2 h-2 rounded-full ${getStatusDot(selectedRequest.status)}`} />
                  {selectedRequest.status?.replace(/_/g, ' ')}
                </span>
                <span className="text-xs text-slate-400">{formatDate(selectedRequest.created_at)}</span>
              </div>

              {/* Payer */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Payer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="font-medium text-slate-900">{selectedRequest.payer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Mobile</p>
                    <p className="font-medium text-slate-900">{selectedRequest.payer_mobile}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Care Profile */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Care Profile</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Name</p>
                    <p className="font-medium text-slate-900">{selectedRequest.patient_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Age</p>
                    <p className="font-medium text-slate-900">{selectedRequest.patient_age}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Relationship</p>
                    <p className="font-medium text-slate-900">{selectedRequest.relationship_to_client || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Condition</p>
                    <p className="font-medium text-slate-900">{selectedRequest.patient_condition || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100" />

              {/* Service */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Service Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Type</p>
                    <p className="font-medium text-slate-900">{selectedRequest.service_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Model</p>
                    <p className="font-medium text-slate-900">{selectedRequest.service_model?.replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Preferred Gender</p>
                    <p className="font-medium text-slate-900">{selectedRequest.preferred_gender || 'Any'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Start Date</p>
                    <p className="font-medium text-slate-900">
                      {selectedRequest.start_date ? new Date(selectedRequest.start_date).toLocaleDateString() : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {selectedRequest.location_address && (
                <>
                  <div className="border-t border-slate-100" />
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Service Location</h3>
                    <p className="text-slate-700 text-sm">{selectedRequest.location_address}</p>
                  </div>
                </>
              )}

              {selectedRequest.remarks && (
                <>
                  <div className="border-t border-slate-100" />
                  <div>
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Remarks</h3>
                    <p className="text-slate-700 text-sm">{selectedRequest.remarks}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ProxyServiceRequest;
