import React from 'react';
import {
  User, Mail, Phone, MapPin, Edit2,
  CreditCard, Shield, Clock, Camera, ArrowLeft
} from 'lucide-react';
import { Link } from 'react-router-dom';

const ClientProfileDemo = () => {
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/client/dashboard" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900">My Profile</h1>
        </div>
        <button className="text-blue-600 font-semibold text-sm hover:underline">Settings</button>
      </div>

      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">

        {/* Profile Header Card */}
        <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-6 md:gap-8 text-center md:text-left relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-blue-600 to-indigo-700"></div>

          <div className="relative mt-8 md:mt-0">
            <div className="w-28 h-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-slate-200">
              <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=300&auto=format&fit=crop" alt="Profile" className="w-full h-full object-cover" />
            </div>
            <button className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full hover:bg-slate-800 transition-colors shadow-lg">
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 pt-8 md:pt-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Mr. Kamal Perera</h2>
                <p className="text-slate-500">Premium Member since 2024</p>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm hover:bg-blue-100 transition-colors">
                <Edit2 className="w-4 h-4" /> Edit Profile
              </button>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" /> Personal Details
          </h3>
          <div className="grid md:grid-cols-2 gap-y-6 gap-x-12">
            <InfoItem label="Full Name" value="Kamal Perera" icon={User} />
            <InfoItem label="Email Address" value="kamal.perera@example.com" icon={Mail} />
            <InfoItem label="Mobile Number" value="+94 77 123 4567" icon={Phone} />
            <InfoItem label="Location" value="Nugegoda, Colombo" icon={MapPin} />
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-500" /> Payment Methods
            </h3>
            <button className="text-sm font-bold text-blue-600 hover:underline">+ Add New</button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-slate-900 rounded flex items-center justify-center text-white font-bold text-xs">VISA</div>
                <div>
                  <p className="font-bold text-slate-900">Visa ending in 4242</p>
                  <p className="text-xs text-slate-500">Expires 12/28</p>
                </div>
              </div>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold">Default</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-orange-600 rounded flex items-center justify-center text-white font-bold text-xs">MC</div>
                <div>
                  <p className="font-bold text-slate-900">Mastercard ending in 8821</p>
                  <p className="text-xs text-slate-500">Expires 09/25</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Summary */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" /> History Summary
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <p className="font-bold text-slate-900">Home Nursing - 12 Hours</p>
                <p className="text-sm text-slate-500">Yesterday • 8:00 PM</p>
              </div>
              <span className="font-bold text-slate-900">LKR 4,500</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Physiotherapy Session</p>
                <p className="text-sm text-slate-500">Oct 24 • 10:00 AM</p>
              </div>
              <span className="font-bold text-slate-900">LKR 2,500</span>
            </div>
          </div>
          <button className="w-full mt-6 py-3 text-sm font-bold text-slate-600 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
            View Full History
          </button>
        </div>

      </div>
    </div>
  );
};

const InfoItem = ({ label, value, icon: Icon }) => (
  <div className="flex items-start gap-4">
    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0">
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-slate-900 font-medium text-lg">{value}</p>
    </div>
  </div>
);

export default ClientProfileDemo;
