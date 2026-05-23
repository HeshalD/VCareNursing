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

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-sky-50 to-violet-50 flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
          <div className="text-violet-600 font-semibold tracking-wide">Loading premium profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50/50 via-sky-50/50 to-violet-50/50 font-sans flex text-slate-800 selection:bg-violet-200 selection:text-violet-900">
      <StaffSidebar staffProfileId={staffData?.staff_profile_id} />

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
          
          {/* Header Card */}
          <div className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80 flex flex-col md:flex-row gap-8 items-center md:items-start relative overflow-hidden group">
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-gradient-to-bl from-rose-200/40 via-fuchsia-200/40 to-violet-200/40 rounded-full blur-3xl -z-0 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-gradient-to-tr from-sky-200/40 to-indigo-200/40 rounded-full blur-3xl -z-0 group-hover:scale-110 transition-transform duration-700 delay-100"></div>
            
            <div className="relative z-10 flex-shrink-0">
              <div className="w-36 h-36 rounded-full p-1.5 bg-gradient-to-tr from-rose-400 via-fuchsia-500 to-violet-500 shadow-xl shadow-fuchsia-200/50 relative">
                <div className="w-full h-full rounded-full border-4 border-white overflow-hidden bg-slate-50 relative group/pic">
                  {profilePic ? (
                    <img src={URL.createObjectURL(profilePic)} alt="Preview" className="w-full h-full object-cover transition-transform duration-500 group-hover/pic:scale-110" />
                  ) : staffData?.profile_picture_url ? (
                    <img src={staffData.profile_picture_url} alt="Profile" className="w-full h-full object-cover transition-transform duration-500 group-hover/pic:scale-110" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-50 to-fuchsia-50 text-violet-300">
                      <User size={64} />
                    </div>
                  )}
                  <label className="absolute inset-0 bg-black/40 opacity-0 group-hover/pic:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                    <div className="bg-white/20 backdrop-blur-sm p-3 rounded-full text-white transform translate-y-4 group-hover/pic:translate-y-0 transition-all duration-300">
                      <Camera size={24} />
                    </div>
                    <input type="file" className="hidden" onChange={(e) => setProfilePic(e.target.files[0])} accept="image/*" />
                  </label>
                </div>
              </div>
            </div>

            <div className="flex-1 text-center md:text-left z-10 pt-4">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                {isEditing ? (
                  <input 
                    className="text-3xl font-extrabold text-slate-800 bg-white/50 backdrop-blur-sm border-2 border-violet-200 rounded-2xl px-4 py-2 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 w-full max-w-md transition-all placeholder:text-slate-400"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    placeholder="Enter your full name"
                  />
                ) : (
                  <>
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-900 to-fuchsia-800 tracking-tight">{staffData?.full_name}</h1>
                    {staffData?.verification_status === 'VERIFIED' && (
                      <div className="bg-emerald-100/80 backdrop-blur-sm p-1 rounded-full text-emerald-600 shadow-sm">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                    )}
                  </>
                )}
              </div>
              
              {isEditing ? (
                <input 
                  className="text-violet-600 font-bold mb-5 bg-white/50 backdrop-blur-sm border-2 border-violet-200 rounded-xl px-4 py-2 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 w-full max-w-sm transition-all"
                  value={formData.designation}
                  onChange={(e) => setFormData({...formData, designation: e.target.value})}
                  placeholder="Professional Designation"
                />
              ) : (
                <p className="text-violet-600 font-bold text-lg mb-5 tracking-wide">{staffData?.designation || 'Staff Member'}</p>
              )}
              
              <div className="flex flex-wrap justify-center md:justify-start gap-6 text-sm font-medium text-slate-500">
                {isEditing ? (
                  <div className="flex items-center gap-2 bg-white/50 backdrop-blur-sm border-2 border-violet-200 rounded-xl px-4 py-2 focus-within:border-violet-500 focus-within:ring-4 focus-within:ring-violet-500/20 transition-all">
                    <MapPin size={18} className="text-violet-400" />
                    <input 
                      className="bg-transparent outline-none w-full text-slate-700"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      placeholder="Location"
                    />
                  </div>
                ) : (
                  <span className="flex items-center gap-2 bg-white/60 px-4 py-2 rounded-xl shadow-sm border border-slate-100/50"><MapPin size={18} className="text-violet-400" /> {staffData?.location || 'Location Pending'}</span>
                )}
                <span className="flex items-center gap-2 bg-white/60 px-4 py-2 rounded-xl shadow-sm border border-slate-100/50"><Calendar size={18} className="text-sky-400" /> Member since {new Date(staffData?.created_at).getFullYear() || new Date().getFullYear()}</span>
              </div>
            </div>

            <button 
              onClick={() => setIsEditing(!isEditing)}
              className={`md:absolute top-8 right-8 flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all duration-300 border-2 z-20 ${
                isEditing 
                  ? 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:border-rose-300 shadow-sm shadow-rose-100' 
                  : 'bg-white text-slate-700 border-slate-100 hover:border-violet-300 hover:text-violet-600 shadow-[0_4px_20px_rgb(0,0,0,0.04)] hover:shadow-violet-100'
              }`}
            >
              {isEditing ? <><X size={18} strokeWidth={2.5} /> Cancel Edit</> : <><Edit3 size={18} strokeWidth={2.5} /> Edit Profile</>}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left Column: Details */}
            <div className="md:col-span-2 space-y-8">
              <section className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-sky-100/50 to-transparent rounded-bl-full -z-0"></div>
                <h3 className="text-2xl font-extrabold text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                  <div className="p-2.5 bg-sky-100 text-sky-600 rounded-xl">
                    <FileText size={22} strokeWidth={2.5} />
                  </div>
                  Professional Summary
                </h3>
                {isEditing ? (
                  <textarea 
                    className="w-full min-h-[180px] p-5 rounded-2xl bg-white/80 border-2 border-violet-100 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20 outline-none text-slate-700 leading-relaxed transition-all resize-y text-lg placeholder:text-slate-400 font-medium"
                    value={formData.qualifications}
                    onChange={(e) => setFormData({...formData, qualifications: e.target.value})}
                    placeholder="Tell clients about your experience, care style, and unique qualifications..."
                  />
                ) : (
                  <div className="space-y-4 relative z-10">
                    <p className="text-slate-600 leading-relaxed font-medium text-lg">
                      {staffData?.qualifications || 'No professional summary added yet. Click edit to tell your story.'}
                    </p>
                  </div>
                )}
              </section>

              <section className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-fuchsia-100/50 to-transparent rounded-bl-full -z-0"></div>
                <h3 className="text-2xl font-extrabold text-slate-800 mb-6 flex items-center gap-3 relative z-10">
                  <div className="p-2.5 bg-fuchsia-100 text-fuchsia-600 rounded-xl">
                    <Award size={22} strokeWidth={2.5} />
                  </div>
                  Documents & Certifications
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-5 relative z-10">
                  {staffData?.document_urls?.map((doc, idx) => (
                    <div key={idx} className="group relative aspect-[3/4] rounded-2xl border-2 border-white overflow-hidden bg-slate-100 shadow-md hover:shadow-xl hover:shadow-fuchsia-200/50 transition-all duration-300 cursor-pointer">
                      <img src={doc} alt="Document" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                        <span className="text-white text-sm font-bold px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/30">View Document</span>
                      </div>
                    </div>
                  ))}
                  <button className="aspect-[3/4] rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/50 flex flex-col items-center justify-center text-violet-400 hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-all duration-300 group">
                    <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                      <span className="text-2xl font-light">+</span>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">Upload New</span>
                  </button>
                </div>
              </section>
            </div>

            {/* Right Column: Identity & Account */}
            <div className="space-y-8">
              <section className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80">
                <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
                    <Shield size={20} strokeWidth={2.5} />
                  </div>
                  Account Status
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/80 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <span className="text-sm text-slate-500 font-bold tracking-wide">Verification</span>
                    <span className={`text-xs font-black tracking-widest uppercase px-3 py-1.5 rounded-xl border ${staffData?.verification_status === 'VERIFIED' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                      {staffData?.verification_status || 'PENDING'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-white/80 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                    <span className="text-sm text-slate-500 font-bold tracking-wide">Availability</span>
                    <span className="text-xs font-black tracking-widest uppercase px-3 py-1.5 rounded-xl border bg-violet-50 text-violet-600 border-violet-200">
                      {staffData?.current_status || 'OFFLINE'}
                    </span>
                  </div>
                </div>
              </section>

              <section className="bg-white/60 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white/80">
                <h3 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center gap-3">
                  <div className="p-2 bg-rose-100 text-rose-600 rounded-xl">
                    <Phone size={20} strokeWidth={2.5} />
                  </div>
                  Contact Info
                </h3>
                <div className="space-y-6">
                  <div className="flex gap-4 items-center p-2 rounded-2xl hover:bg-white/50 transition-colors">
                    <div className="p-3 bg-white shadow-sm rounded-xl border border-slate-100 text-slate-400">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Email Address</p>
                      <p className="text-sm text-slate-700 font-bold truncate">{user?.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-center p-2 rounded-2xl hover:bg-white/50 transition-colors">
                    <div className="p-3 bg-white shadow-sm rounded-xl border border-slate-100 text-slate-400">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Mobile Number</p>
                      <p className="text-sm text-slate-700 font-bold">{staffData?.mobile_number || 'Not added'}</p>
                    </div>
                  </div>
                </div>
              </section>

              {isEditing && (
                <div className="sticky bottom-8 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
                  <button 
                    onClick={handleSave}
                    disabled={saveLoading}
                    className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white p-5 rounded-[1.5rem] font-bold text-lg shadow-[0_8px_30px_rgb(139,92,246,0.4)] hover:shadow-[0_8px_40px_rgb(139,92,246,0.6)] hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {saveLoading ? 'Saving Changes...' : <><Save size={22} strokeWidth={2.5} /> Save All Changes</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default StaffMyProfile;
