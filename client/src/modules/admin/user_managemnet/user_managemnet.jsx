import React, { useState, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, User, Mail, Phone, MapPin, CheckCircle, XCircle, DollarSign, ChevronDown, ChevronUp, FileText, Calendar, Home, Briefcase, UserCircle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [thresholdAmount, setThresholdAmount] = useState('');
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (activeTab === 'clients') {
        const response = await apiClient.getAllClients();
        setClients(response.data || []);
      } else if (activeTab === 'workers') {
        const response = await apiClient.getAllStaff();
        setWorkers(response.data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateThreshold = async (user) => {
    try {
      // Get the complete staff data including advance threshold
      const staffResponse = await apiClient.getStaffByID(user.id);
      const completeWorker = staffResponse.data;
      
      setSelectedWorker(completeWorker);
      setThresholdAmount(completeWorker?.advance_threshold_amount?.toString() || '');
      setShowThresholdModal(true);
    } catch (err) {
      console.error('Error fetching staff details:', err);
      setError('Failed to load staff details');
    }
  };

  const confirmUpdateThreshold = async () => {
    try {
      setThresholdLoading(true);
      await apiClient.updateAdvanceThreshold(selectedWorker.staff_profile_id, {
        advance_threshold_amount: parseFloat(thresholdAmount)
      });
      
      setShowThresholdModal(false);
      setSelectedWorker(null);
      setThresholdAmount('');
      
      // Refresh workers data
      if (activeTab === 'workers') {
        const response = await apiClient.getAllStaff();
        setWorkers(response.data || []);
      }
    } catch (err) {
      console.error('Error updating threshold:', err);
      setError('Failed to update advance threshold');
    } finally {
      setThresholdLoading(false);
    }
  };

  const data = activeTab === 'clients' ? clients : workers;

  const formatClientData = (client) => ({
    id: client.client_profile_id,
    name: client.full_name || 'Unknown',
    email: client.email || 'N/A',
    phone: client.mobile_number || 'N/A',
    location: client.primary_address || 'Not set',
    type: 'Client'
  });

  const formatStaffData = (staff) => ({
    id: staff.staff_profile_id,
    name: staff.full_name || 'Unknown',
    email: staff.email || 'N/A',
    phone: staff.mobile_number || 'N/A',
    location: staff.home_address || 'Not set',
    status: staff.current_status || 'Unknown',
    type: staff.role || 'Staff',
    advance_threshold_amount: staff.advance_threshold_amount || 0,
    // Additional staff profile fields
    designation: staff.designation || 'N/A',
    qualifications: staff.qualifications || 'N/A',
    document_urls: staff.document_urls || [],
    profile_picture_url: staff.profile_picture_url || null,
    gender: staff.gender || 'N/A',
    willing_to_live_in: staff.willing_to_live_in || false,
    date_of_birth: staff.date_of_birth || null,
    location_city: staff.location || 'N/A'
  });

  const displayData = activeTab === 'clients' 
    ? clients.map(formatClientData)
    : workers.map(formatStaffData);

  const toggleRowExpansion = (userId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedRows(newExpanded);
  };

  return (
    <AdminLayout
      title="User Management"
      subtitle="Manage clients, workers, and system administrators."
      /* actions={
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors">
          Add New User
        </button>
      } */
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'clients' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              Clients
            </button>
            <button
              onClick={() => setActiveTab('workers')}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'workers' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              Workers
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search users..."
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100 transition-all w-64"
              />
            </div>
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
              <Filter className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Status</th>
                {activeTab === 'workers' && (
                  <>
                    <th className="px-6 py-4">Designation</th>
                    <th className="px-6 py-4">Advance Threshold</th>
                  </>
                )}
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={activeTab === 'workers' ? "7" : "5"} className="px-6 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={activeTab === 'workers' ? "7" : "5"} className="px-6 py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : displayData.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'workers' ? "7" : "5"} className="px-6 py-8 text-center text-slate-500">
                    No {activeTab} found
                  </td>
                </tr>
              ) : (
                displayData.map((user) => (
                  <React.Fragment key={user.id}>
                    <tr className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {user.profile_picture_url ? (
                            <img
                              src={user.profile_picture_url}
                              alt={user.name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                              {user.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-slate-900">{user.name}</p>
                            <p className="text-xs text-slate-500">{user.type}</p>
                          </div>
                        </div>
                      </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Mail className="w-3.5 h-3.5" /> {user.email}
                        </div>
                        <div className="flex items-center gap-2 text-slate-500">
                          <Phone className="w-3.5 h-3.5" /> {user.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <MapPin className="w-4 h-4" /> {user.location}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${user.status === 'Active' ? 'bg-green-50 text-green-700' :
                          user.status === 'Pending' ? 'bg-amber-50 text-amber-700' :
                          user.status === 'Available' ? 'bg-green-50 text-green-700' :
                          user.status === 'Unavailable' ? 'bg-red-50 text-red-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                        {user.status === 'Active' || user.status === 'Available' ? <CheckCircle className="w-3.5 h-3.5" /> : null}
                        {user.status}
                      </span>
                    </td>
                    {activeTab === 'workers' && (
                      <td className="px-6 py-4">
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {user.designation}
                        </span>
                      </td>
                    )}
                    {activeTab === 'workers' && (
                      <td className="px-6 py-4">
                        <span className="font-medium text-slate-900">
                          Rs. {user.advance_threshold_amount?.toLocaleString('en-IN') || '0'}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        {activeTab === 'workers' && (
                          <button
                            onClick={() => handleUpdateThreshold(user)}
                            className="text-blue-600 hover:text-blue-800 p-1 rounded-lg hover:bg-blue-50 transition-colors mr-2"
                            title="Update Advance Threshold"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleRowExpansion(user.id)}
                          className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                          title="View Details"
                        >
                          {expandedRows.has(user.id) ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                        <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                          <MoreHorizontal className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {/* Collapsible Details Row */}
                  {activeTab === 'workers' && expandedRows.has(user.id) && (
                    <tr className="bg-slate-50">
                      <td colSpan={activeTab === 'workers' ? "7" : "5"} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {/* Qualifications */}
                          <div className="bg-white p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                              <Briefcase className="w-4 h-4 text-blue-600" />
                              <h4 className="text-sm font-semibold text-slate-700">Qualifications</h4>
                            </div>
                            <p className="text-xs text-slate-600">{user.qualifications}</p>
                          </div>
                          
                          {/* Personal Details */}
                          <div className="bg-white p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                              <UserCircle className="w-4 h-4 text-purple-600" />
                              <h4 className="text-sm font-semibold text-slate-700">Personal Details</h4>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-slate-600">
                                <span className="font-medium">Gender:</span> <span className="capitalize">{user.gender}</span>
                              </p>
                              <p className="text-xs text-slate-600">
                                <span className="font-medium">DOB:</span> {user.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString() : 'N/A'}
                              </p>
                              <p className="text-xs text-slate-600">
                                <span className="font-medium">Willing to Live In:</span> {user.willing_to_live_in ? 'Yes' : 'No'}
                              </p>
                            </div>
                          </div>
                          
                          {/* Location Details */}
                          <div className="bg-white p-3 rounded-lg border border-slate-200">
                            <div className="flex items-center gap-2 mb-2">
                              <MapPin className="w-4 h-4 text-green-600" />
                              <h4 className="text-sm font-semibold text-slate-700">Location Details</h4>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-slate-600">
                                <span className="font-medium">Home:</span> {user.location}
                              </p>
                              <p className="text-xs text-slate-600">
                                <span className="font-medium">City:</span> {user.location_city}
                              </p>
                            </div>
                          </div>
                          
                          {/* Documents */}
                          {user.document_urls && user.document_urls.length > 0 && (
                            <div className="bg-white p-3 rounded-lg border border-slate-200">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="w-4 h-4 text-orange-600" />
                                <h4 className="text-sm font-semibold text-slate-700">Documents</h4>
                              </div>
                              <div className="space-y-1">
                                {user.document_urls.map((docUrl, index) => (
                                  <a
                                    key={index}
                                    href={docUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  >
                                    <FileText className="w-3 h-3" /> Document {index + 1}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination placeholder */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
          <p>Showing 1 to {displayData.length} of {displayData.length} entries</p>
          <div className="flex gap-2">
            <button className="px-3 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50" disabled>Previous</button>
            <button className="px-3 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50" disabled>Next</button>
          </div>
        </div>

      </div>

      {/* Threshold Update Modal */}
      {showThresholdModal && selectedWorker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Update Advance Threshold</h2>
                <button
                  onClick={() => setShowThresholdModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-blue-800">Worker Information</h4>
                    <p className="text-blue-700 text-sm mt-1">
                      {selectedWorker.full_name || `Worker #${selectedWorker.staff_profile_id}`}
                    </p>
                    <p className="text-blue-600 text-xs mt-1">
                      Current Threshold: Rs. {selectedWorker.advance_threshold_amount?.toLocaleString('en-IN') || '0'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    New Advance Threshold Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={thresholdAmount}
                    onChange={(e) => setThresholdAmount(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter new threshold amount..."
                    min="0"
                    step="100"
                    required
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    This is the maximum amount the staff member can request as advance
                  </p>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowThresholdModal(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUpdateThreshold}
                  disabled={thresholdLoading || !thresholdAmount.trim() || parseFloat(thresholdAmount) < 0}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {thresholdLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-4 h-4" />
                      Update Threshold
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default UserManagement;
