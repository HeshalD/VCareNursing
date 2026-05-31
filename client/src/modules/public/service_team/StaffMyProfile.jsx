import React, { useState, useEffect } from 'react';
import { 
  User, Mail, Phone, MapPin, Calendar, Camera, 
  FileText, Shield, Award, CheckCircle, Edit3, Save, X, Home
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import StaffSidebar from './StaffSidebar';

const StaffMyProfile = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [staffData, setStaffData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    qualifications: '',
    designation: '',
    location: '',
    full_name: '',
  });
  const [profilePic, setProfilePic] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading) return;
      try {
        const userId = user?.user_id || user?.id;
        
        if (!userId) {
          setDataLoading(false);
          return;
        }

        const response = await apiClient.getStaffByUserID(userId);
        
        const data = response.data;
        setStaffData(data);
        setFormData({
          qualifications: data?.qualifications || '',
          designation: data?.designation || '',
          location: data?.location || '',
          full_name: data?.full_name || '',
        });
      } catch (error) {
        console.error('MyProfile - API Fetch Failed:', error);
      } finally {
        setDataLoading(false);
      }
    };

    fetchProfile();
  }, [user, authLoading]);

  const handleSave = async () => {
    if (!staffData?.staff_profile_id) return;
    
    setSaveLoading(true);
    try {
      const data = new FormData();
      data.append('qualifications', formData.qualifications);
      data.append('designation', formData.designation);
      data.append('location', formData.location);
      data.append('full_name', formData.full_name);
      if (profilePic) {
        data.append('profile_picture', profilePic);
      }

      await apiClient.updateStaffProfile(staffData.staff_profile_id, data);
      
      const response = await apiClient.getStaffByUserID(user?.user_id || user?.id);
      setStaffData(response.data);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile changes.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      setFormData({
        qualifications: staffData?.qualifications || '',
        designation: staffData?.designation || '',
        location: staffData?.location || '',
        full_name: staffData?.full_name || '',
      });
      setProfilePic(null);
    }
    setIsEditing(!isEditing);
  };

  const initials = staffData?.full_name
    ? staffData.full_name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2)
    : '—';

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin"></div>
          <div className="text-slate-600 font-medium tracking-wide">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex text-slate-900 overflow-hidden selection:bg-slate-200 selection:text-slate-900">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} />

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
          <header className="flex items-end justify-between gap-4 flex-wrap border-b border-slate-200 bg-white px-6 py-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-1">Provider Portal</p>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 tracking-tight">Profile</h1>
            </div>
            {!isEditing ? (
              <button
                onClick={handleToggleEdit}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                <Edit3 size={14} />
                Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleEdit}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <X size={14} />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  <Save size={14} />
                  {saveLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </header>

          {staffData?.verification_status && (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${staffData.verification_status === 'VERIFIED' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-amber-100 bg-amber-50 text-amber-700'}`}>
              <CheckCircle size={15} className="flex-shrink-0" />
              <span className="text-sm font-medium">
                {staffData.verification_status === 'VERIFIED' ? 'Your profile is verified.' : 'Your profile is pending verification.'}
              </span>
            </div>
          )}

          <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="relative flex-shrink-0">
                <div className="w-24 h-24 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-2xl font-semibold overflow-hidden">
                  {profilePic ? (
                    <img src={URL.createObjectURL(profilePic)} alt="Preview" className="w-full h-full object-cover" />
                  ) : staffData?.profile_picture_url ? (
                    <img src={staffData.profile_picture_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <label className="absolute -bottom-2 -right-2 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900">
                  <Camera size={16} />
                  <input type="file" className="hidden" onChange={(e) => setProfilePic(e.target.files[0])} accept="image/*" />
                </label>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-3">
                  {isEditing ? (
                    <input
                      className="w-full max-w-xl rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-3xl font-semibold tracking-tight text-slate-900 outline-none focus:border-slate-900 focus:bg-white"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Enter your full name"
                    />
                  ) : (
                    <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{staffData?.full_name}</h2>
                  )}

                  {isEditing ? (
                    <input
                      className="w-full max-w-lg rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-900 focus:bg-white"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="Professional designation"
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-500">{staffData?.designation || 'Staff Member'}</p>
                  )}

                  <div className="flex flex-wrap gap-3 pt-1 text-sm text-slate-500">
                    {isEditing ? (
                      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                        <MapPin size={16} className="text-slate-400" />
                        <input
                          className="w-full bg-transparent outline-none text-slate-700"
                          value={formData.location}
                          onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                          placeholder="Location"
                        />
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                        <MapPin size={16} className="text-slate-400" />
                        {staffData?.location || 'Location Pending'}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
                      <Calendar size={16} className="text-slate-400" />
                      Member since {staffData?.created_at ? new Date(staffData.created_at).getFullYear() : new Date().getFullYear()}
                    </span>
                    <span className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 ${staffData?.current_status === 'AVAILABLE' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                      <Shield size={16} />
                      {staffData?.current_status || 'OFFLINE'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Professional Summary</h3>
                    <p className="text-sm text-slate-500">This mirrors the cleaner client profile presentation.</p>
                  </div>
                </div>

                {isEditing ? (
                  <textarea
                    className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition-colors focus:border-slate-900 focus:bg-white"
                    value={formData.qualifications}
                    onChange={(e) => setFormData({ ...formData, qualifications: e.target.value })}
                    placeholder="Tell clients about your experience, care style, and qualifications..."
                  />
                ) : (
                  <p className="text-sm leading-7 text-slate-600">
                    {staffData?.qualifications || 'No professional summary added yet. Click edit to add one.'}
                  </p>
                )}
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Award size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Documents & Certifications</h3>
                    <p className="text-sm text-slate-500">Uploaded documents remain visible in a simple gallery.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {staffData?.document_urls?.length ? (
                    staffData.document_urls.map((doc, idx) => (
                      <div key={idx} className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                        <img src={doc} alt="Document" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                      No documents uploaded yet.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Shield size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Account Details</h3>
                    <p className="text-sm text-slate-500">Verification and availability.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-medium text-slate-500">Verification</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${staffData?.verification_status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {staffData?.verification_status || 'PENDING'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-medium text-slate-500">Availability</span>
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                      {staffData?.current_status || 'OFFLINE'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-200">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Phone size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Contact Info</h3>
                    <p className="text-sm text-slate-500">Account contact details.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div className="mt-0.5 text-slate-400"><Mail className="w-5 h-5" /></div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Email Address</p>
                      <p className="truncate text-sm font-medium text-slate-700">{user?.email || 'Not provided'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div className="mt-0.5 text-slate-400"><Phone className="w-5 h-5" /></div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Mobile Number</p>
                      <p className="text-sm font-medium text-slate-700">{staffData?.mobile_number || 'Not added'}</p>
                    </div>
                  </div>
                </div>
              </section>
            </aside>
          </div>

          {isEditing && (
            <div className="lg:hidden sticky bottom-4 z-50">
              <button
                onClick={handleSave}
                disabled={saveLoading}
                className="w-full rounded-2xl bg-slate-900 px-5 py-4 text-sm font-medium text-white shadow-lg shadow-slate-900/10 transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {saveLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default StaffMyProfile;