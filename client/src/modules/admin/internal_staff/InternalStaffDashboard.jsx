import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Briefcase, DollarSign, Calendar, Clock, ChevronDown, Check, X } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';

const API_BASE = 'http://localhost:5001/api/internal-staff'; // Adjust if needed or use apiClient wrapper

const InternalStaffDashboard = () => {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modals state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  
  // Selected items
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [activeTab, setActiveTab] = useState('staff'); // staff, tasks, payroll
  
  // Fetch initial data
  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(API_BASE, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch internal staff');
      const data = await response.json();
      setStaffList(data.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteStaff = async (id) => {
    if(!window.confirm("Are you sure you want to delete this internal staff member?")) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchStaff();
    } catch (err) {
      alert('Error deleting staff');
    }
  };

  const openAddModal = () => {
    setSelectedStaff(null);
    setIsStaffModalOpen(true);
  };

  const openEditModal = (staff) => {
    setSelectedStaff(staff);
    setIsStaffModalOpen(true);
  };

  const openTaskModal = (staff) => {
    setSelectedStaff(staff);
    setIsTaskModalOpen(true);
  };

  const openPayrollModal = (staff) => {
    setSelectedStaff(staff);
    setIsPayrollModalOpen(true);
  };

  return (
    <AdminLayout title="Internal Staff Management" subtitle="Manage your internal team, assign tasks, and track payroll.">
      
      {/* Top Actions */}
      <div className="flex justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6">
        <div className="flex gap-4">
          <button 
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'staff' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Staff Directory
          </button>
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'tasks' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Tasks Overview
          </button>
          <button 
            onClick={() => setActiveTab('payroll')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'payroll' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Payroll History
          </button>
          <button 
            onClick={() => setActiveTab('settlement')}
            className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${activeTab === 'settlement' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Monthly Settlement
          </button>
        </div>
        
        <button 
          onClick={openAddModal}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-md shadow-indigo-200"
        >
          <Plus size={18} />
          Add Internal Staff
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>
      ) : error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-xl">{error}</div>
      ) : (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          
          {activeTab === 'staff' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="p-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Staff Member</th>
                    <th className="p-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Role</th>
                    <th className="p-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Contact</th>
                    <th className="p-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="p-5 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffList.map((staff) => (
                    <tr key={staff.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                            {staff.full_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{staff.full_name}</p>
                            <p className="text-xs text-slate-400">Joined: {new Date(staff.joined_date).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                          {staff.role}
                        </span>
                      </td>
                      <td className="p-5">
                        <p className="text-sm text-slate-600">{staff.email}</p>
                        <p className="text-xs text-slate-400">{staff.phone}</p>
                      </td>
                      <td className="p-5">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full flex items-center gap-1 w-max ${
                          staff.status === 'Active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {staff.status === 'Active' ? <CheckCircle size={12}/> : <XCircle size={12}/>}
                          {staff.status}
                        </span>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openTaskModal(staff)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Assign Task">
                            <Briefcase size={18} />
                          </button>
                          <button onClick={() => openPayrollModal(staff)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Manage Payroll">
                            <DollarSign size={18} />
                          </button>
                          <button onClick={() => openEditModal(staff)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => deleteStaff(staff.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {staffList.length === 0 && (
                    <tr><td colSpan="5" className="p-8 text-center text-slate-400">No internal staff found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="p-8 text-center text-slate-500">
              Select a staff member from the directory to view and manage their specific tasks.
            </div>
          )}

          {activeTab === 'payroll' && (
            <AllPayrollView />
          )}

          {activeTab === 'settlement' && (
            <MonthlySettlementView staffList={staffList} />
          )}

        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {isStaffModalOpen && (
          <StaffFormModal 
            staff={selectedStaff} 
            onClose={() => setIsStaffModalOpen(false)} 
            onSuccess={() => { setIsStaffModalOpen(false); fetchStaff(); }} 
          />
        )}
        {isTaskModalOpen && (
          <TaskModal 
            staff={selectedStaff} 
            onClose={() => setIsTaskModalOpen(false)} 
          />
        )}
        {isPayrollModalOpen && (
          <PayrollModal 
            staff={selectedStaff} 
            onClose={() => setIsPayrollModalOpen(false)} 
          />
        )}
      </AnimatePresence>
    </AdminLayout>
  );
};

// --- Sub Components (Modals) ---

const StaffFormModal = ({ staff, onClose, onSuccess }) => {
  const [formData, setFormData] = useState(staff || {
    full_name: '', role: 'Admin', email: '', phone: '', address: '', base_salary: '', status: 'Active'
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const url = staff ? `${API_BASE}/${staff.id}` : API_BASE;
      const method = staff ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if(!res.ok) throw new Error("Failed to save");
      onSuccess();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">{staff ? 'Edit Staff Member' : 'Add New Staff'}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-full transition-colors"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Full Name</label>
            <input type="text" required value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Role</label>
              <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                <option>Super Admin</option>
                <option>Admin</option>
                <option>Developer</option>
                <option>Support</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Status</label>
              <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
              <input type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Phone</label>
              <input type="text" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Address</label>
            <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="123 Main St..." />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Base Salary (Monthly)</label>
            <input type="number" step="0.01" value={formData.base_salary} onChange={e => setFormData({...formData, base_salary: e.target.value})} className="w-full mt-1 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" placeholder="e.g. 50000.00" />
          </div>
          
          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 p-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 p-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Staff'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

const TaskModal = ({ staff, onClose }) => {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState({ task_type: 'Data Entry', description: '' });
  const taskOptions = ['Data Entry', 'Server Maintenance', 'Customer Support', 'Audit', 'Other'];

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/${staff.id}/tasks`, { headers: { 'Authorization': `Bearer ${token}` }});
    const data = await res.json();
    setTasks(data.data || []);
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/${staff.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ staff_id: staff.id, ...newTask })
    });
    setNewTask({ task_type: 'Data Entry', description: '' });
    fetchTasks();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
          <div>
            <h2 className="text-xl font-bold text-indigo-900">Task Assignment</h2>
            <p className="text-sm text-indigo-600 mt-1">Assigning to: {staff.full_name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-indigo-400 hover:text-indigo-600 bg-white rounded-full shadow-sm"><X size={20}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <form onSubmit={handleAssign} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
            <h3 className="font-bold text-slate-700 flex items-center gap-2"><Briefcase size={16}/> New Task</h3>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Task Category</label>
              <select value={newTask.task_type} onChange={e => setNewTask({...newTask, task_type: e.target.value})} className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg outline-none">
                {taskOptions.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
              <textarea required value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} className="w-full mt-1 p-2.5 bg-white border border-slate-200 rounded-lg outline-none resize-none h-24" placeholder="Task details..."></textarea>
            </div>
            <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors">Assign Task</button>
          </form>

          <div>
            <h3 className="font-bold text-slate-800 mb-4">Current Tasks</h3>
            <div className="space-y-3">
              {tasks.map(task => (
                <div key={task.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">{task.task_type}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${task.status === 'Completed' ? 'text-emerald-500' : 'text-amber-500'}`}>{task.status}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-2">{task.description}</p>
                </div>
              ))}
              {tasks.length === 0 && <p className="text-center text-sm text-slate-400 py-4">No tasks assigned yet.</p>}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const PayrollModal = ({ staff, onClose }) => {
  const [payroll, setPayroll] = useState([]);
  const [newPay, setNewPay] = useState({ amount: staff.base_salary || '', payment_month: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }) });

  useEffect(() => { fetchPayroll(); }, []);

  const fetchPayroll = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/${staff.id}/payroll`, { headers: { 'Authorization': `Bearer ${token}` }});
    const data = await res.json();
    setPayroll(data.data || []);
  };

  const handlePay = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    await fetch(`${API_BASE}/${staff.id}/payroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ staff_id: staff.id, status: 'Paid', ...newPay })
    });
    setNewPay({ amount: staff.base_salary || '', payment_month: '' });
    fetchPayroll();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
      <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
        <div className="p-6 border-b border-emerald-100 flex justify-between items-center bg-emerald-50/50">
          <div>
            <h2 className="text-xl font-bold text-emerald-900">Payroll Tracker</h2>
            <p className="text-sm text-emerald-600 mt-1">{staff.full_name} • Base: LKR {staff.base_salary}</p>
          </div>
          <button onClick={onClose} className="p-2 text-emerald-400 hover:text-emerald-600 bg-white rounded-full shadow-sm"><X size={20}/></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <form onSubmit={handlePay} className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100 space-y-4">
            <h3 className="font-bold text-emerald-800 flex items-center gap-2"><DollarSign size={16}/> Record Payment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-emerald-600/70 uppercase">Amount</label>
                <input type="number" step="0.01" required value={newPay.amount} onChange={e => setNewPay({...newPay, amount: e.target.value})} className="w-full mt-1 p-2.5 bg-white border border-emerald-200 rounded-lg outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-emerald-600/70 uppercase">Payment Date</label>
                <input type="date" required value={newPay.payment_month} onChange={e => setNewPay({...newPay, payment_month: e.target.value})} className="w-full mt-1 p-2.5 bg-white border border-emerald-200 rounded-lg outline-none" />
              </div>
            </div>
            <button type="submit" className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-lg shadow-emerald-200">Mark as Paid</button>
          </form>

          <div>
            <h3 className="font-bold text-slate-800 mb-4">Payment History</h3>
            <div className="space-y-3">
              {payroll.map(pay => (
                <div key={pay.id} className="p-4 rounded-xl border border-slate-200 bg-white flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800">{pay.payment_month}</p>
                    <p className="text-xs text-slate-400">Paid on {new Date(pay.paid_on).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-600">LKR {parseFloat(pay.amount).toFixed(2)}</p>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full mt-1 inline-block"><Check size={10} className="inline mr-1"/>{pay.status}</span>
                  </div>
                </div>
              ))}
              {payroll.length === 0 && <p className="text-center text-sm text-slate-400 py-4">No payment records found.</p>}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AllPayrollView = () => {
  const [allPayroll, setAllPayroll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  useEffect(() => {
    fetchAllPayroll();
  }, []);

  const fetchAllPayroll = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/payroll/all`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      setAllPayroll(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = allPayroll.filter(pay => {
    const matchStatus = filterStatus === 'All' || pay.status === filterStatus;
    const matchMonth = !filterMonth || (pay.payment_month && pay.payment_month.startsWith(filterMonth));
    return matchStatus && matchMonth;
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-slate-800">Global Payroll History</h2>
        <div className="flex gap-4">
          <input 
            type="month" 
            value={filterMonth} 
            onChange={e => setFilterMonth(e.target.value)} 
            className="px-3 py-2 border border-slate-200 rounded-lg outline-none text-sm bg-slate-50" 
            placeholder="Filter by Month"
          />
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)} 
            className="px-3 py-2 border border-slate-200 rounded-lg outline-none text-sm bg-slate-50"
          >
            <option value="All">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full"></div></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-emerald-100">
                <th className="p-4 text-xs font-bold text-emerald-800 uppercase tracking-wider">Staff Member</th>
                <th className="p-4 text-xs font-bold text-emerald-800 uppercase tracking-wider">Amount</th>
                <th className="p-4 text-xs font-bold text-emerald-800 uppercase tracking-wider">Payment Date</th>
                <th className="p-4 text-xs font-bold text-emerald-800 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.map(pay => (
                <tr key={pay.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <p className="font-bold text-slate-800">{pay.full_name}</p>
                    <p className="text-xs text-slate-500">{pay.role}</p>
                  </td>
                  <td className="p-4 font-bold text-emerald-600">
                    LKR {parseFloat(pay.amount).toFixed(2)}
                  </td>
                  <td className="p-4">
                    <p className="text-sm font-medium text-slate-700">{pay.payment_month}</p>
                    {pay.paid_on && <p className="text-xs text-slate-400">Processed: {new Date(pay.paid_on).toLocaleDateString()}</p>}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${pay.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {pay.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr><td colSpan="4" className="p-8 text-center text-slate-400">No payment records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const MonthlySettlementView = ({ staffList }) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [monthPayroll, setMonthPayroll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [confirmPayStaff, setConfirmPayStaff] = useState(null);

  useEffect(() => {
    fetchMonthPayroll();
  }, [selectedMonth]);

  const fetchMonthPayroll = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/payroll/all`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      
      // Filter the payroll data to only include records matching the selected YYYY-MM prefix
      const filtered = (data.data || []).filter(pay => pay.payment_month && pay.payment_month.startsWith(selectedMonth));
      setMonthPayroll(filtered);
    } catch (err) {
      console.error("Error fetching settlement:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async (staff) => {
    try {
      setProcessingId(staff.id);
      const token = localStorage.getItem('token');
      
      const payload = {
        staff_id: staff.id,
        amount: staff.base_salary,
        payment_month: `${selectedMonth}-01`, // Default to the 1st of the selected month
        status: 'Paid',
        notes: 'Quick Paid via Monthly Settlement'
      };

      const res = await fetch(`${API_BASE}/${staff.id}/payroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error("Payment failed");
      
      // Refresh the view
      await fetchMonthPayroll();
      setConfirmPayStaff(null);
    } catch (err) {
      alert(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  // Combine staffList with their payroll status for the selected month
  const settlementGrid = staffList.filter(s => s.status === 'Active').map(staff => {
    const payRecord = monthPayroll.find(p => p.staff_id === staff.id);
    return {
      ...staff,
      isPaid: !!payRecord && payRecord.status === 'Paid',
      payRecord
    };
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
        <div>
          <h2 className="text-xl font-bold text-indigo-900">Monthly Payroll Settlement</h2>
          <p className="text-sm text-indigo-600 mt-1">See instantly who is unpaid and settle their accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-bold text-indigo-800">Select Month:</label>
          <input 
            type="month" 
            value={selectedMonth} 
            onChange={e => setSelectedMonth(e.target.value)} 
            className="px-4 py-2 border-2 border-indigo-200 rounded-xl outline-none text-indigo-900 font-bold bg-white focus:border-indigo-400 transition-colors shadow-sm"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {settlementGrid.map(staff => (
            <div key={staff.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
              {staff.isPaid && <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500 transform rotate-45 translate-x-8 -translate-y-8 z-0"></div>}
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">{staff.full_name}</h3>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{staff.role}</p>
                  </div>
                  {staff.isPaid ? (
                    <span className="px-3 py-1 bg-emerald-100 text-emerald-700 font-bold text-xs rounded-full flex items-center gap-1 shadow-sm">
                      <CheckCircle size={14} /> Paid
                    </span>
                  ) : (
                    <span className="px-3 py-1 bg-rose-100 text-rose-700 font-bold text-xs rounded-full flex items-center gap-1 shadow-sm">
                      <XCircle size={14} /> Unpaid
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between mt-6">
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Base Salary</p>
                    <p className="text-xl font-black text-slate-800">LKR {parseFloat(staff.base_salary).toLocaleString()}</p>
                  </div>
                  
                  {!staff.isPaid ? (
                    <button 
                      onClick={() => setConfirmPayStaff(staff)}
                      disabled={processingId === staff.id}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center gap-2"
                    >
                      {processingId === staff.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <DollarSign size={16} />
                      )}
                      Pay Now
                    </button>
                  ) : (
                    <div className="text-right">
                      <p className="text-xs text-emerald-600 font-bold">Processed</p>
                      <p className="text-xs text-slate-400">{new Date(staff.payRecord.paid_on).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {settlementGrid.length === 0 && (
            <div className="col-span-full p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              No active staff found to settle.
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmPayStaff && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-indigo-100 bg-indigo-50/50">
                <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                  <DollarSign size={20} />
                  Confirm Payment
                </h2>
              </div>
              <div className="p-6 space-y-4 text-center">
                <p className="text-slate-600">Are you sure you want to process payroll for</p>
                <p className="text-2xl font-bold text-slate-800">{confirmPayStaff.full_name}?</p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4 inline-block mx-auto text-left w-full">
                  <div className="flex justify-between mb-2">
                    <span className="text-slate-500 text-sm">Month:</span>
                    <span className="font-bold text-slate-800">{selectedMonth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 text-sm">Amount:</span>
                    <span className="font-bold text-emerald-600 text-lg">LKR {parseFloat(confirmPayStaff.base_salary).toLocaleString()}</span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setConfirmPayStaff(null)} 
                  className="flex-1 p-3 rounded-xl font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handlePayNow(confirmPayStaff)} 
                  disabled={processingId === confirmPayStaff.id}
                  className="flex-1 p-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex justify-center items-center gap-2"
                >
                  {processingId === confirmPayStaff.id ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    "Confirm & Pay"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InternalStaffDashboard;
