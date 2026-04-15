import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, MoreHorizontal, User, Mail, Phone, MapPin, CheckCircle, XCircle, DollarSign, ChevronDown, ChevronUp, FileText, Calendar, Home, Briefcase, UserCircle, Shield, ShieldOff, Plus, Edit, Trash2, Save, X, Upload } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const ProxyUserManagement = () => {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isProxyMode, setIsProxyMode] = useState(true);

  // Form states for adding/editing staff
  const [formData, setFormData] = useState({
    user_id: '',
    full_name: '',
    email: '',
    mobile_number: '',
    designation: '',
    qualifications: '',
    documents: [],
    home_address: '',
    location: '',
    profile_picture: null,
    gender: '',
    role: [],
    willing_to_live_in: false,
    date_of_birth: ''
  });

  const [profilePicturePreview, setProfilePicturePreview] = useState('');
  const [documentPreviews, setDocumentPreviews] = useState([]);
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    setIsProxyMode(true);
    fetchWorkers();
  }, []);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.getAllStaff();
      setWorkers(response.data || []);
    } catch (err) {
      console.error('Error fetching workers:', err);
      setError('Failed to load workers');
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureChange = (file) => {
    if (file) {
      setFormData(prev => ({ ...prev, profile_picture: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfilePictureDelete = () => {
    setFormData(prev => ({ ...prev, profile_picture: null }));
    setProfilePicturePreview('');
  };

  const handleDocumentsChange = (files) => {
    const newDocuments = Array.from(files);
    setFormData(prev => ({ ...prev, documents: newDocuments }));
    
    // Create previews for new documents
    const newPreviews = newDocuments.map(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setDocumentPreviews(prev => {
            const filtered = prev.filter(p => p.name !== file.name);
            return [...filtered, { name: file.name, type: file.type, preview: reader.result }];
          });
        };
        reader.readAsDataURL(file);
        return { name: file.name, type: file.type, preview: null };
      } else {
        return { name: file.name, type: file.type, preview: null };
      }
    });
    
    setDocumentPreviews(prev => {
      const filtered = prev.filter(p => !newDocuments.find(doc => doc.name === p.name));
      return [...filtered, ...newPreviews.filter(p => p.preview === null)];
    });
  };

  const handleDocumentDelete = (fileName) => {
    const updatedDocuments = formData.documents.filter(doc => doc.name !== fileName);
    setFormData(prev => ({ ...prev, documents: updatedDocuments }));
    setDocumentPreviews(prev => prev.filter(p => p.name !== fileName));
  };

  const handleAddStaff = () => {
    setFormData({
      user_id: '',
      full_name: '',
      email: '',
      mobile_number: '',
      designation: '',
      qualifications: '',
      documents: [],
      home_address: '',
      location: '',
      profile_picture: null,
      gender: '',
      willing_to_live_in: false,
      date_of_birth: ''
    });
    setProfilePicturePreview('');
    setDocumentPreviews([]);
    setIsEditMode(false);
    setSelectedWorker(null);
    setShowAddForm(!showAddForm);
  };

  const handleEditStaff = (worker) => {
    setFormData({
      user_id: worker.user_id || '',
      full_name: worker.name || '',
      email: worker.email || '',
      mobile_number: worker.phone || '',
      designation: worker.designation || '',
      qualifications: worker.qualifications || '',
      documents: [],
      home_address: worker.location || '',
      location: worker.location_city || '',
      profile_picture: null,
      gender: worker.gender || '',
      role: worker.role && worker.role.length > 0 ? worker.role : [],
      willing_to_live_in: worker.willing_to_live_in || false,
      date_of_birth: worker.date_of_birth || ''
    });
    setProfilePicturePreview(worker.profile_picture_url || '');
    setDocumentPreviews([]);
    setSelectedWorker(worker);
    setIsEditMode(true);
    setShowAddForm(true);
  };

  const handleDeleteStaff = async (workerId) => {
    if (!window.confirm('Are you sure you want to delete this staff member?')) {
      return;
    }

    try {
      await apiClient.deleteStaffProfile(workerId);
      fetchWorkers(); // Refresh the list
    } catch (err) {
      console.error('Error deleting staff:', err);
      setError('Failed to delete staff member');
    }
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      // Validate required fields
      if (!formData.full_name || !formData.designation || !formData.gender || !formData.date_of_birth) {
        setError('Please fill in all required fields: Full Name, Designation, Gender, Date of Birth');
        setFormLoading(false);
        return;
      }

      // Create FormData for file uploads
      const submitData = new FormData();
      submitData.append('full_name', formData.full_name);
      submitData.append('email', formData.email);
      submitData.append('mobile_number', formData.mobile_number);
      submitData.append('designation', formData.designation);
      submitData.append('role', formData.role.length > 0 ? formData.role[0] : 'NURSE');
      submitData.append('qualifications', formData.qualifications);
      submitData.append('home_address', formData.home_address);
      submitData.append('location', formData.location);
      submitData.append('gender', formData.gender);
      submitData.append('willing_to_live_in', formData.willing_to_live_in);
      submitData.append('date_of_birth', formData.date_of_birth);
      
      if (formData.profile_picture) {
        submitData.append('profile_picture', formData.profile_picture);
      }
      
      formData.documents.forEach((doc, index) => {
        submitData.append(`documents`, doc);
      });

      // Debug: Log what's being sent
      console.log('Submitting FormData:', {
        full_name: formData.full_name,
        email: formData.email,
        mobile_number: formData.mobile_number,
        designation: formData.designation,
        role: formData.role.length > 0 ? formData.role[0] : 'NURSE',
        gender: formData.gender,
        date_of_birth: formData.date_of_birth
      });

      await apiClient.createStaffProfile(submitData);
      setShowAddForm(false);
      setIsEditMode(false);
      setError(null);
      fetchWorkers(); // Refresh the list
    } catch (err) {
      console.error('Error adding staff:', err);
      setError(err.response?.data?.message || 'Failed to add staff member');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSubmitEdit = async (e) => {
    e.preventDefault();
    setFormLoading(true);

    try {
      // Validate required fields
      if (!formData.full_name || !formData.designation || !formData.gender || !formData.date_of_birth) {
        setError('Please fill in all required fields: Full Name, Designation, Gender, Date of Birth');
        setFormLoading(false);
        return;
      }

      // Create FormData for file uploads
      const submitData = new FormData();
      submitData.append('user_id', formData.user_id);
      submitData.append('full_name', formData.full_name);
      submitData.append('email', formData.email);
      submitData.append('mobile_number', formData.mobile_number);
      submitData.append('designation', formData.designation);
      submitData.append('role', formData.role.length > 0 ? formData.role[0] : 'NURSE');
      submitData.append('qualifications', formData.qualifications);
      submitData.append('home_address', formData.home_address);
      submitData.append('location', formData.location);
      submitData.append('gender', formData.gender);
      submitData.append('willing_to_live_in', formData.willing_to_live_in);
      submitData.append('date_of_birth', formData.date_of_birth);
      
      if (formData.profile_picture) {
        submitData.append('profile_picture', formData.profile_picture);
      }
      
      formData.documents.forEach((doc, index) => {
        submitData.append(`documents`, doc);
      });

      // Debug: Log what's being sent
      console.log('Updating FormData:', {
        user_id: formData.user_id,
        full_name: formData.full_name,
        email: formData.email,
        mobile_number: formData.mobile_number,
        designation: formData.designation,
        role: formData.role.length > 0 ? formData.role[0] : 'NURSE',
        gender: formData.gender,
        date_of_birth: formData.date_of_birth
      });

      // Update staff profile API call
      if (selectedWorker && selectedWorker.id) {
        await apiClient.updateStaffProfile(selectedWorker.id, submitData);
      }
      setShowAddForm(false);
      setIsEditMode(false);
      setError(null);
      fetchWorkers(); // Refresh the list
    } catch (err) {
      console.error('Error updating staff:', err);
      setError(err.response?.data?.message || 'Failed to update staff member');
    } finally {
      setFormLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const toggleRowExpansion = (workerId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(workerId)) {
      newExpanded.delete(workerId);
    } else {
      newExpanded.add(workerId);
    }
    setExpandedRows(newExpanded);
  };

  const formatStaffData = (staff) => ({
    id: staff.staff_profile_id,
    name: staff.full_name || 'Unknown',
    email: staff.email || 'N/A',
    phone: staff.mobile_number || 'N/A',
    location: staff.home_address || 'Not set',
    status: staff.current_status || 'Unknown',
    type: staff.role || 'Staff',
    advance_threshold_amount: staff.advance_threshold_amount || 0,
    designation: staff.designation || 'N/A',
    qualifications: staff.qualifications || 'N/A',
    document_urls: staff.document_urls || [],
    profile_picture_url: staff.profile_picture_url || null,
    gender: staff.gender || 'N/A',
    willing_to_live_in: staff.willing_to_live_in || false,
    date_of_birth: staff.date_of_birth || null,
    location_city: staff.location || 'N/A',
    user_id: staff.user_id
  });

  const displayData = workers.map(formatStaffData);

  return (
    <AdminLayout
      title="Proxy User Management"
      subtitle="Manual staff management with full access to add, edit, and delete staff profiles."
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-slate-900">Staff Management</h3>
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-600">Proxy Mode Active</span>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <button
              onClick={() => {
                setIsProxyMode(false);
                navigate('/admin/users');
              }}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ShieldOff className="w-4 h-4" />
              <span className="text-sm">Exit Proxy</span>
            </button>
            
            <button
              onClick={handleAddStaff}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Add Staff</span>
            </button>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff..."
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
                <th className="px-6 py-4">Staff Member</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Designation</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : displayData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                    No staff found
                  </td>
                </tr>
              ) : (
                displayData.map((worker) => (
                  <React.Fragment key={worker.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium text-slate-900">{worker.name}</div>
                            <div className="text-xs text-slate-500">ID: {worker.user_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-slate-600">
                            <Mail className="w-3 h-3" />
                            <span className="text-xs">{worker.email}</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-600">
                            <Phone className="w-3 h-3" />
                            <span className="text-xs">{worker.phone}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-slate-600">
                          <MapPin className="w-3 h-3" />
                          <span className="text-xs">{worker.location}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          worker.status === 'AVAILABLE' 
                            ? 'bg-green-100 text-green-700'
                            : worker.status === 'UNAVAILABLE'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            worker.status === 'AVAILABLE' 
                              ? 'bg-green-500'
                              : worker.status === 'UNAVAILABLE'
                              ? 'bg-red-500'
                              : 'bg-yellow-500'
                          }`} />
                          {worker.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-slate-600">{worker.designation}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => toggleRowExpansion(worker.id)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
                          >
                            {expandedRows.has(worker.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleEditStaff(worker)}
                            className="p-1 text-blue-400 hover:text-blue-600 rounded hover:bg-blue-50"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStaff(worker.id)}
                            className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedRows.has(worker.id) && (
                      <tr className="bg-slate-50">
                        <td colSpan="6" className="px-6 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-slate-700">Qualifications:</span>
                              <p className="text-slate-600">{worker.qualifications}</p>
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">Gender:</span>
                              <p className="text-slate-600">{worker.gender}</p>
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">Willing to Live In:</span>
                              <p className="text-slate-600">{worker.willing_to_live_in ? 'Yes' : 'No'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">Date of Birth:</span>
                              <p className="text-slate-600">{worker.date_of_birth || 'Not set'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">Location City:</span>
                              <p className="text-slate-600">{worker.location_city}</p>
                            </div>
                            <div>
                              <span className="font-medium text-slate-700">Documents:</span>
                              <p className="text-slate-600">{worker.document_urls?.length || 0} files</p>
                            </div>
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
      </div>

      {/* Collapsible Staff Form Section */}
      {showAddForm && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-4">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <h3 className="text-lg font-semibold text-slate-900">
              {isEditMode ? 'Edit Staff Member' : 'Add New Staff Member'}
            </h3>
            <button
              onClick={() => {
                setShowAddForm(false);
                setIsEditMode(false);
                setError(null);
              }}
              className="p-1 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>

          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={isEditMode ? handleSubmitEdit : handleSubmitAdd} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isEditMode && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">User ID</label>
                  <input
                    type="text"
                    name="user_id"
                    value={formData.user_id}
                    disabled
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required={!isEditMode}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mobile Number *</label>
                <input
                  type="tel"
                  name="mobile_number"
                  value={formData.mobile_number}
                  onChange={handleInputChange}
                  required={!isEditMode}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Designation *</label>
                <input
                  type="text"
                  name="designation"
                  value={formData.designation}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Role *</label>
                <div className="grid grid-cols-2 gap-3">
                  {['NURSE', 'NANNY', 'CARETAKER', 'COORDINATOR'].map((roleOption) => (
                    <button
                      key={roleOption}
                      type="button"
                      onClick={() => {
                        const currentRoles = formData.role || [];
                        let newRoles;
                        if (currentRoles.includes(roleOption)) {
                          // Remove role if already selected
                          newRoles = currentRoles.filter(r => r !== roleOption);
                        } else {
                          // Add role if not selected
                          newRoles = [...currentRoles, roleOption];
                        }
                        setFormData({
                          ...formData,
                          role: newRoles
                        });
                      }}
                      className={`px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                        formData.role && formData.role.includes(roleOption)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      {roleOption}
                    </button>
                  ))}
                </div>
                {formData.role && formData.role.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    Selected: {formData.role.join(', ')}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Gender *</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Gender</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth *</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Home Address</label>
                <input
                  type="text"
                  name="home_address"
                  value={formData.home_address}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Qualifications */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Qualifications</label>
              <textarea
                name="qualifications"
                value={formData.qualifications}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Profile Picture Upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Profile Picture</label>
              {profilePicturePreview ? (
                <div className="relative w-24">
                  <img
                    src={profilePicturePreview}
                    alt="Profile preview"
                    className="w-24 h-24 object-cover rounded-lg border-2 border-blue-200 shadow-md"
                  />
                  <button
                    type="button"
                    onClick={handleProfilePictureDelete}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                    title="Remove profile picture"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="mt-2">
                    <input
                      type="file"
                      id="profile-reupload"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) handleProfilePictureChange(file);
                      }}
                    />
                    <label
                      htmlFor="profile-reupload"
                      className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors cursor-pointer text-xs font-medium"
                    >
                      <Upload className="w-3 h-3" />
                      Change
                    </label>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="file"
                    id="profile-upload"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) handleProfilePictureChange(file);
                    }}
                  />
                  <label
                    htmlFor="profile-upload"
                    className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                  >
                    <div className="flex flex-col items-center justify-center">
                      <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500 mb-1 transition-colors" />
                      <p className="text-xs text-slate-500 font-medium">Click to upload</p>
                      <p className="text-xs text-slate-400 mt-0.5">JPG, PNG (Max 2MB)</p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Documents Upload */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Documents</label>
              <div className="relative">
                <input
                  type="file"
                  id="documents-upload"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) handleDocumentsChange(files);
                  }}
                />
                <label
                  htmlFor="documents-upload"
                  className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all cursor-pointer group"
                >
                  <div className="flex flex-col items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500 mb-1 transition-colors" />
                    <p className="text-xs text-slate-500 font-medium">Click to upload documents</p>
                    <p className="text-xs text-slate-400 mt-0.5">PDF, JPG, PNG (Max 5MB each)</p>
                  </div>
                </label>
              </div>

              {/* Documents Preview */}
              {formData.documents.length > 0 && (
                <div className="mt-3 space-y-2">
                  {formData.documents.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span className="text-xs text-slate-700 font-medium truncate">{doc.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDocumentDelete(doc.name)}
                        className="ml-2 p-1 text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Willing to live in checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                name="willing_to_live_in"
                checked={formData.willing_to_live_in}
                onChange={handleInputChange}
                className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
              />
              <label className="ml-2 text-sm text-slate-700">Willing to live in with clients</label>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setIsEditMode(false);
                }}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {formLoading ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Staff' : 'Add Staff')}
              </button>
            </div>
          </form>
        </div>
      )}
    </AdminLayout>
  );
};

export default ProxyUserManagement;
