import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { 
  Users,
  Filter,
  Search,
  UserCheck,
  UserX,
  Home,
  User,
  Clock,
  MapPin,
  Phone,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText
} from 'lucide-react';

const StaffRoster = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [assigningStaff, setAssigningStaff] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [assignmentStep, setAssignmentStep] = useState(1); // 1: Select Agent, 2: Upload Payment, 3: Confirm
  const [selectedStaffForAssignment, setSelectedStaffForAssignment] = useState(null);
  const [paymentSlipFile, setPaymentSlipFile] = useState(null);
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [bookingCompleted, setBookingCompleted] = useState(false);
  const [availableStaffForAssignment, setAvailableStaffForAssignment] = useState([]);
  const [useSmartFiltering, setUseSmartFiltering] = useState(true);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [liveInFilter, setLiveInFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  
  // Get service request data from location state
  const serviceRequest = location.state?.serviceRequest;

  useEffect(() => {
    fetchStaff();
  }, [statusFilter, genderFilter, liveInFilter, roleFilter]);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      
      let response;
      
      // Always start with all staff and apply filters
      response = await apiClient.getAllStaff();
      let allStaff = response.data || [];
      
      // Debug: Log role data structure
      console.log('Role data structure sample:', allStaff[0]?.role);
      console.log('All unique roles in database:', [...new Set(allStaff.map(staff => staff.role))]);
      
      // Apply filters client-side for better control
      let filteredStaff = allStaff;
      
      // Status filter
      if (statusFilter !== 'all') {
        filteredStaff = filteredStaff.filter(staff => staff.current_status === statusFilter);
      }
      
      // Gender filter
      if (genderFilter !== 'all') {
        filteredStaff = filteredStaff.filter(staff => staff.gender === genderFilter);
      }
      
      // Live-in filter
      if (liveInFilter !== 'all') {
        if (liveInFilter === 'yes') {
          filteredStaff = filteredStaff.filter(staff => staff.willing_to_live_in === true);
        } else {
          filteredStaff = filteredStaff.filter(staff => staff.willing_to_live_in === false);
        }
      }
      
      // Role filter
      if (roleFilter !== 'all') {
        filteredStaff = filteredStaff.filter(staff => {
          // Handle different role data structures
          if (Array.isArray(staff.role)) {
            return staff.role.includes(roleFilter);
          } else if (typeof staff.role === 'string') {
            // Remove curly braces and quotes, then split by comma if multiple roles
            const cleanRole = staff.role.replace(/[{}"]/g, '');
            const roles = cleanRole.includes(',') ? cleanRole.split(',') : [cleanRole];
            return roles.includes(roleFilter);
          } else if (staff.role && typeof staff.role === 'object') {
            // Handle PostgreSQL array format: {role: ["NURSE", "CARETAKER"]}
            const roles = Object.values(staff.role);
            return roles.includes(roleFilter);
          }
          return false;
        });
      }
      
      console.log('Filtered staff data:', filteredStaff);
      setStaff(filteredStaff);
    } catch (err) {
      console.error('Staff fetch error:', err);
      setError(`Failed to fetch staff: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'ASSIGNED':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'UNAVAILABLE':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'AVAILABLE':
        return <UserCheck className="w-4 h-4" />;
      case 'ASSIGNED':
        return <Clock className="w-4 h-4" />;
      case 'UNAVAILABLE':
        return <UserX className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  const filteredStaff = staff.filter(staffMember => {
    const matchesSearch = 
      staffMember.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staffMember.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      staffMember.mobile_number?.includes(searchTerm) ||
      staffMember.home_address?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const handleAssignStaff = async (staffMember) => {
    if (!serviceRequest) {
      setError('No service request selected for assignment');
      return;
    }

    let matchingStaff;

    if (useSmartFiltering) {
      // Map service types to required roles
      const serviceToRoleMap = {
        'HOME_NURSING': ['NURSE'],
        'BABY_CARE': ['NANNY'],
        'CARETAKER': ['CARETAKER', 'NURSE']
      };

      // Get required roles for this service type
      const requiredRoles = serviceToRoleMap[serviceRequest.service_type] || [];

      // Filter available staff that match service request criteria
      matchingStaff = staff.filter(s => 
        s.current_status === 'AVAILABLE' &&
        (!serviceRequest.preferred_gender || serviceRequest.preferred_gender === 'ANY' || s.gender === serviceRequest.preferred_gender) &&
        (requiredRoles.length === 0 || requiredRoles.some(role => {
          // Handle different role data structures
          if (Array.isArray(s.role)) {
            return s.role.includes(role);
          } else if (typeof s.role === 'string') {
            // Remove curly braces and quotes, then split by comma if multiple roles
            const cleanRole = s.role.replace(/[{}"]/g, '');
            const roles = cleanRole.includes(',') ? cleanRole.split(',') : [cleanRole];
            return roles.includes(role);
          } else if (s.role && typeof s.role === 'object') {
            // Handle PostgreSQL array format: {role: ["NURSE", "CARETAKER"]}
            const roles = Object.values(s.role);
            return roles.includes(role);
          }
          return false;
        }))
      );
    } else {
      // Show all available staff (manual selection mode)
      matchingStaff = staff.filter(s => s.current_status === 'AVAILABLE');
    }

    setAvailableStaffForAssignment(matchingStaff);
    setShowAssignModal(true);
  };

  const handleConfirmAssignment = (staffMember) => {
    setSelectedStaffForAssignment(staffMember);
    setAssignmentStep(2); // Move to step 2: Upload Payment
  };

  const handlePaymentNext = () => {
    if (!paymentSlipFile) {
      setError('Please upload a payment slip');
      return;
    }
    setAssignmentStep(3); // Move to step 3: Confirm
  };

  const handlePaymentSubmit = async () => {
    try {
      setUploadingPayment(true);
      
      // First, try to get quote for this service request
      let quoteId = serviceRequest.quote_id;
      
      if (!quoteId) {
        // Try to fetch quote for this service request
        try {
          const quotesResponse = await apiClient.getServiceRequestQuotes(serviceRequest.request_id);
          if (quotesResponse.data && quotesResponse.data.length > 0) {
            quoteId = quotesResponse.data[0].quote_id;
            console.log('Found existing quote:', quoteId);
          }
        } catch (quoteErr) {
          console.log('Could not fetch quotes:', quoteErr);
        }
      }
      
      const bookingData = {
        request_id: serviceRequest.request_id,
        assigned_staff_id: selectedStaffForAssignment.staff_profile_id,
        quote_id: quoteId || null
      };
      
      console.log('Sending booking data:', bookingData);
      console.log('Payment slip file:', paymentSlipFile);
      
      // Call convertToBooking API with file upload
      await apiClient.convertToBooking(bookingData, paymentSlipFile);
      
      // Show success message
      setBookingCompleted(true);
      
      // Navigate back to service requests after a delay
      setTimeout(() => {
        navigate('/admin/service-requests', { 
          state: { 
            message: 'Staff assigned successfully and booking created!',
            type: 'success'
          }
        });
      }, 3000); // Wait 3 seconds to show success message
    } catch (err) {
      console.error('Assignment error:', err);
      setError(`Failed to assign staff: ${err.message || 'Unknown error'}`);
    } finally {
      setUploadingPayment(false);
    }
  };

  const handleStepBack = () => {
    if (assignmentStep > 1) {
      setAssignmentStep(assignmentStep - 1);
    }
  };

  const resetAssignmentFlow = () => {
    setShowAssignModal(false);
    setAssignmentStep(1);
    setSelectedStaffForAssignment(null);
    setPaymentSlipFile(null);
    setError(null);
    setBookingCompleted(false);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <AdminLayout title="Staff Roster" subtitle="Loading...">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Staff Roster" subtitle="Error occurred">
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
      title="Staff Roster" 
      subtitle={`${filteredStaff.length} staff members available`}
    >
      {/* Service Request Info */}
      {serviceRequest && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Assigning Staff for Service Request</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Patient: {serviceRequest.patient_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Contact: {serviceRequest.payer_mobile}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Location: {serviceRequest.location_address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Start: {new Date(serviceRequest.start_date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Service: {serviceRequest.service_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Age: {serviceRequest.patient_age}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Condition: {serviceRequest.patient_condition}</span>
                </div>
              </div>
              {serviceRequest.preferred_gender && serviceRequest.preferred_gender !== 'ANY' && (
                <div className="mt-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-blue-800">Preferred Gender: {serviceRequest.preferred_gender}</span>
                </div>
              )}
              {serviceRequest.remarks && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-blue-800 mb-1">Remarks:</p>
                  <p className="text-sm text-blue-700">{serviceRequest.remarks}</p>
                </div>
              )}
              
              {/* Assign Button */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <button
                  onClick={() => handleAssignStaff()}
                  disabled={loading || assigningStaff}
                  className="px-6 py-2 font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigningStaff ? 'Processing...' : 'Assign Staff'}
                </button>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/service-requests')}
              className="px-4 py-2 text-blue-600 hover:text-blue-800 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-700">Filters:</span>
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="AVAILABLE">Available</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>
            
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Genders</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            
            <select
              value={liveInFilter}
              onChange={(e) => setLiveInFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Live-in Preference</option>
              <option value="yes">Willing to Live-in</option>
              <option value="no">Not Willing to Live-in</option>
            </select>
            
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Roles</option>
              <option value="NURSE">Nurse</option>
              <option value="CARETAKER">Caregiver</option>
              <option value="NANNY">Nanny</option>
            </select>
          </div>
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {filteredStaff.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No staff members found matching your criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Staff Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Gender
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Live-in
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
                {filteredStaff.map((staffMember) => (
                  <tr key={staffMember.staff_profile_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                          {staffMember.profile_picture_url ? (
                            <img 
                              src={staffMember.profile_picture_url} 
                              alt={staffMember.full_name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <User className="w-5 h-5 text-slate-500" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{staffMember.full_name}</div>
                          <div className="text-sm text-slate-500">ID: {staffMember.staff_profile_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm text-slate-600">
                          <Phone className="w-3 h-3" />
                          {staffMember.mobile_number}
                        </div>
                        <div className="text-sm text-slate-500">{staffMember.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(staffMember.role) ? staffMember.role.map((r, index) => (
                          <span key={index} className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {r}
                          </span>
                        )) : (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            {staffMember.role}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        staffMember.gender === 'MALE' 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-pink-100 text-pink-800'
                      }`}>
                        {staffMember.gender}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        {staffMember.willing_to_live_in ? (
                          <>
                            <Home className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-green-600">Yes</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-red-600" />
                            <span className="text-sm text-red-600">No</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(staffMember.current_status)}`}>
                        {getStatusIcon(staffMember.current_status)}
                        {staffMember.current_status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedStaff(staffMember)}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                          title="View Details"
                        >
                          <User className="w-4 h-4" />
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

      {/* Staff Details Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Staff Details</h2>
                <button
                  onClick={() => setSelectedStaff(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <XCircle className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center">
                  {selectedStaff.profile_picture_url ? (
                    <img 
                      src={selectedStaff.profile_picture_url} 
                      alt={selectedStaff.full_name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-slate-500" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{selectedStaff.full_name}</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(selectedStaff.current_status)}`}>
                    {getStatusIcon(selectedStaff.current_status)}
                    {selectedStaff.current_status}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <p className="text-sm text-slate-900">{selectedStaff.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <p className="text-sm text-slate-900">{selectedStaff.mobile_number}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                  <p className="text-sm text-slate-900">{selectedStaff.gender}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Willing to Live-in</label>
                  <p className="text-sm text-slate-900">{selectedStaff.willing_to_live_in ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                  <p className="text-sm text-slate-900">{formatDate(selectedStaff.date_of_birth)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Member Since</label>
                  <p className="text-sm text-slate-900">{formatDate(selectedStaff.created_at)}</p>
                </div>
              </div>
              
              {selectedStaff.qualifications && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Qualifications</label>
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">{selectedStaff.qualifications}</p>
                </div>
              )}
              
              {selectedStaff.home_address && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                  <p className="text-sm text-slate-900">{selectedStaff.home_address}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 backdrop-blur-sm bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto border-solid border-[1px] border-black/20">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900">Assign Staff to Service Request</h2>
                <button
                  onClick={resetAssignmentFlow}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              {/* Step Indicators */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  {[
                    { step: 1, label: 'Select Agent' },
                    { step: 2, label: 'Upload Payment' },
                    { step: 3, label: 'Confirm Payment' }
                  ].map((item) => (
                    <div key={item.step} className="flex items-center">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                        assignmentStep >= item.step 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {item.step}
                      </div>
                      <span className={`ml-2 text-sm font-medium ${
                        assignmentStep >= item.step ? 'text-blue-600' : 'text-slate-500'
                      }`}>
                        {item.label}
                      </span>
                      {item.step < 3 && (
                        <div className={`ml-4 w-8 h-0.5 ${
                          assignmentStep > item.step ? 'bg-blue-600' : 'bg-slate-200'
                        }`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Step 1: Select Agent */}
              {assignmentStep === 1 && (
                <>
                  {/* Service Request Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-4">Service Request Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Patient: {serviceRequest.patient_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Contact: {serviceRequest.payer_mobile}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Location: {serviceRequest.location_address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Start: {new Date(serviceRequest.start_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Service: {serviceRequest.service_type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Model: {serviceRequest.service_model?.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Age: {serviceRequest.patient_age}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Condition: {serviceRequest.patient_condition}</span>
                      </div>
                    </div>
                    {serviceRequest.preferred_gender && serviceRequest.preferred_gender !== 'ANY' && (
                      <div className="mt-3 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        <span className="text-blue-800">Preferred Gender: {serviceRequest.preferred_gender}</span>
                      </div>
                    )}
                    {serviceRequest.remarks && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-blue-800 mb-1">Remarks:</p>
                        <p className="text-sm text-blue-700">{serviceRequest.remarks}</p>
                      </div>
                    )}
                  </div>

                  {/* Available Staff Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-slate-900">
                        Available Staff Matching Criteria ({availableStaffForAssignment.length} found)
                      </h3>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-600">Smart Filter:</label>
                        <button
                          onClick={() => setUseSmartFiltering(!useSmartFiltering)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            useSmartFiltering ? 'bg-blue-600' : 'bg-slate-200'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              useSmartFiltering ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    
                    {!useSmartFiltering && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <p className="text-sm text-amber-800">
                          <strong>Manual Selection Mode:</strong> Showing all available staff. Use filters above to narrow down options.
                        </p>
                      </div>
                    )}
                    {availableStaffForAssignment.length === 0 ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                        <AlertCircle className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                        <p className="text-yellow-800">No available staff match the service request criteria</p>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {availableStaffForAssignment.map((staffMember) => (
                          <div key={staffMember.staff_profile_id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-slate-200 rounded-full flex items-center justify-center">
                                  {staffMember.profile_picture_url ? (
                                    <img 
                                      src={staffMember.profile_picture_url} 
                                      alt={staffMember.full_name}
                                      className="w-10 h-10 rounded-full object-cover"
                                    />
                                  ) : (
                                    <User className="w-5 h-5 text-slate-500" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-slate-900">{staffMember.full_name}</div>
                                  <div className="text-sm text-slate-600">{staffMember.mobile_number}</div>
                                  <div className="text-sm text-slate-500">{staffMember.email}</div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(staffMember.current_status)}`}>
                                      {getStatusIcon(staffMember.current_status)}
                                      {staffMember.current_status}
                                    </span>
                                    {staffMember.willing_to_live_in && (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border-green-200">
                                        <Home className="w-3 h-3" />
                                        Live-in
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => handleConfirmAssignment(staffMember)}
                                disabled={assigningStaff}
                                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {assigningStaff ? 'Assigning...' : 'Select'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Step 2: Upload Payment Slip */}
              {assignmentStep === 2 && (
                <div className="space-y-6">
                  {selectedStaffForAssignment && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <h3 className="font-semibold text-green-900 mb-3">Selected Staff Member</h3>
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center">
                          {selectedStaffForAssignment.profile_picture_url ? (
                            <img 
                              src={selectedStaffForAssignment.profile_picture_url} 
                              alt={selectedStaffForAssignment.full_name}
                              className="w-12 h-12 rounded-full object-cover"
                            />
                          ) : (
                            <User className="w-6 h-6 text-green-600" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-green-900">{selectedStaffForAssignment.full_name}</div>
                          <div className="text-sm text-green-700">{selectedStaffForAssignment.mobile_number}</div>
                          <div className="text-sm text-green-600">{selectedStaffForAssignment.email}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">Upload Payment Slip</h3>
                    <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center">
                      <FileText className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                      <label className="block cursor-pointer hover:bg-slate-50 rounded-lg p-4 -m-4 transition-colors">
                        <span className="text-slate-700 font-medium">Click to upload or drag and drop</span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => setPaymentSlipFile(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                      <p className="text-sm text-slate-500 mt-2">
                        PNG, JPG, PDF up to 5MB
                      </p>
                    </div>
                    
                    {paymentSlipFile && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm font-medium text-blue-900">Selected file:</p>
                        <p className="text-sm text-blue-800">{paymentSlipFile.name}</p>
                        <p className="text-xs text-blue-600">
                          Size: {(paymentSlipFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Confirm Payment */}
              {assignmentStep === 3 && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-4">Assignment Summary</h3>
                    
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-sm font-medium text-blue-800 mb-2">Service Request</h4>
                        <div className="space-y-1 text-sm text-blue-700">
                          <p>Patient: {serviceRequest.patient_name}</p>
                          <p>Location: {serviceRequest.location_address}</p>
                          <p>Service: {serviceRequest.service_type}</p>
                          <p>Start Date: {new Date(serviceRequest.start_date).toLocaleDateString()}</p>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-blue-800 mb-2">Assigned Staff</h4>
                        <div className="space-y-1 text-sm text-blue-700">
                          <p>Name: {selectedStaffForAssignment.full_name}</p>
                          <p>Contact: {selectedStaffForAssignment.mobile_number}</p>
                          <p>Email: {selectedStaffForAssignment.email}</p>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-medium text-blue-800 mb-2">Payment Slip</h4>
                        <div className="space-y-1 text-sm text-blue-700">
                          <p>File: {paymentSlipFile.name}</p>
                          <p>Size: {(paymentSlipFile.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                      <strong>Please review all details carefully.</strong> Once confirmed, this will create the booking and assign the staff member. The staff member will be notified immediately.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {bookingCompleted && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Booking Completed Successfully!</p>
                      <p className="text-sm text-green-700 mt-1">
                        {selectedStaffForAssignment?.full_name} has been assigned and will be notified. Redirecting to service requests...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              {!bookingCompleted && (
                <div className="flex justify-between pt-4 border-t border-slate-200">
                <div>
                  {assignmentStep > 1 && (
                    <button
                      onClick={handleStepBack}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Back
                    </button>
                  )}
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={resetAssignmentFlow}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  
                  {assignmentStep === 1 && (
                    <button
                      disabled={availableStaffForAssignment.length === 0}
                      className="px-4 py-2 text-sm font-medium text-white bg-slate-400 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Select Staff Member to Continue
                    </button>
                  )}
                  
                  {assignmentStep === 2 && (
                    <button
                      onClick={handlePaymentNext}
                      disabled={!paymentSlipFile}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Next
                    </button>
                  )}
                  
                  {assignmentStep === 3 && (
                    <button
                      onClick={handlePaymentSubmit}
                      disabled={uploadingPayment}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {uploadingPayment ? 'Processing...' : 'Confirm Assignment'}
                    </button>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default StaffRoster;
