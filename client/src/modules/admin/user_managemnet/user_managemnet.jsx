import React, { useState, useEffect } from 'react';
import { Search, Filter, MoreHorizontal, User, Mail, Phone, MapPin, CheckCircle, XCircle } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const UserManagement = () => {
  const [activeTab, setActiveTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    type: staff.role || 'Staff'
  });

  const displayData = activeTab === 'clients' 
    ? clients.map(formatClientData)
    : workers.map(formatStaffData);

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
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : displayData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    No {activeTab} found
                  </td>
                </tr>
              ) : (
                displayData.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold">
                          {user.name.charAt(0)}
                        </div>
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
                    <td className="px-6 py-4 text-right">
                      <button className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <MoreHorizontal className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
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
    </AdminLayout>
  );
};

export default UserManagement;
