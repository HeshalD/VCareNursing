import React from 'react';
import {
  Home, User, Calendar, Plus, Search,
  MapPin, Clock, Star, Heart, ArrowRight,
  Stethoscope, Baby, Activity, LogOut, MessageSquare
} from 'lucide-react';
import { Link } from 'react-router-dom';

const ClientDashboardDemo = () => {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20 md:pb-0">

      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
            V
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900 hidden md:block">VCare</span>
        </div>

        <div className="flex-1 max-w-md mx-8 hidden md:block">
          <div className="relative group">
            <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input
              type="text"
              placeholder="Search for services or professionals..."
              className="w-full pl-12 pr-4 py-3 bg-slate-100 border-transparent focus:bg-white border focus:border-blue-500 rounded-xl outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition-colors">
            <Plus className="w-4 h-4" /> New Request
          </button>
          <Link to="/client/profile">
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
              <img src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop" alt="User" />
            </div>
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-10">

        {/* Welcome Section */}
        <section className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900">Good Morning, Mr. Perera ☀️</h1>
            <p className="text-slate-500 mt-2">Who do you need to care for today?</p>
          </div>
          {/* Live Status Card */}
          <div className="w-full md:w-auto bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4 animate-in slide-in-from-right duration-700">
            <div className="relative">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                <Clock className="w-6 h-6" />
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full animate-pulse"></span>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Active Booking</p>
              <p className="font-bold text-slate-900">Nurse Sarath is on the way</p>
              <p className="text-xs text-blue-600 font-medium">Arriving in 15 mins</p>
            </div>
            <button className="ml-4 px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors">Track</button>
          </div>
        </section>

        {/* Service Categories */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ServiceCard title="Home Nursing" icon={Stethoscope} color="blue" delay={0} />
          <ServiceCard title="Elderly Care" icon={Heart} color="rose" delay={100} />
          <ServiceCard title="Child Care" icon={Baby} color="amber" delay={200} />
          <ServiceCard title="Physiotherapy" icon={Activity} color="emerald" delay={300} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Recommended Professionals */}
          <section className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Top Rated Near You</h2>
              <a href="#" className="text-blue-600 font-semibold hover:underline">View All</a>
            </div>

            <div className="space-y-4">
              <ProCard
                name="Nimali Fernando"
                role="ICU Nurse"
                location="Colombo 03"
                rating="4.9"
                reviews="124"
                price="1500"
                image="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=200&auto=format&fit=crop"
              />
              <ProCard
                name="Kamal Disanayake"
                role="Elderly Caretaker"
                location="Dehiwala"
                rating="5.0"
                reviews="89"
                price="1200"
                image="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=200&auto=format&fit=crop"
              />
              <ProCard
                name="Deepika Kumari"
                role="Certified Nanny"
                location="Nugegoda"
                rating="4.8"
                reviews="210"
                price="1000"
                image="https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop"
              />
            </div>
          </section>

          {/* Recent History */}
          <aside className="space-y-6">
            <h2 className="text-xl font-bold text-slate-900">Recent Activity</h2>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-6">
              <ActivityItem type="booking" title="Night Care Shift" date="Yesterday" status="Completed" />
              <ActivityItem type="payment" title="Invoice #8821" date="Oct 24" status="Paid LKR 4500" />
              <ActivityItem type="booking" title="Physio Session" date="Oct 20" status="Completed" />
            </div>

            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold text-lg mb-2">Invite a Friend</h3>
                <p className="text-blue-100 text-sm mb-4">Get LKR 1000 off your next booking when you refer a friend.</p>
                <button className="px-4 py-2 bg-white text-blue-700 rounded-lg text-sm font-bold hover:bg-blue-50 transition-colors">Copy Link</button>
              </div>
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            </div>
          </aside>

        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 p-4 flex justify-around z-40 pb-safe">
        <NavIcon icon={Home} label="Home" active />
        <NavIcon icon={Calendar} label="Bookings" />
        <NavIcon icon={MessageSquare} label="Chat" />
        <NavIcon icon={User} label="Profile" />
      </div>

    </div>
  );
};

// Helper Components
const ServiceCard = ({ title, icon: Icon, color, delay }) => {
  const colors = {
    blue: "bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
    rose: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
    amber: "bg-amber-50 text-amber-600 group-hover:bg-amber-600 group-hover:text-white",
    emerald: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
  };

  return (
    <button className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group flex flex-col items-center gap-4">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${colors[color]}`}>
        <Icon className="w-8 h-8" />
      </div>
      <span className="font-bold text-slate-700 group-hover:text-slate-900">{title}</span>
    </button>
  );
};

const ProCard = ({ name, role, location, rating, reviews, price, image }) => (
  <div className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors flex items-center gap-4 cursor-pointer group">
    <img src={image} alt={name} className="w-16 h-16 rounded-xl object-cover bg-slate-200" />
    <div className="flex-1">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-bold text-slate-900 text-lg group-hover:text-blue-600 transition-colors">{name}</h3>
          <p className="text-slate-500 text-sm">{role}</p>
        </div>
        <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-lg">
          <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          <span className="text-xs font-bold text-slate-700">{rating}</span>
          <span className="text-xs text-slate-400">({reviews})</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <MapPin className="w-3.5 h-3.5" /> {location}
        </div>
        <div className="text-blue-600 font-bold text-sm">
          LKR {price}<span className="text-slate-400 font-normal">/hr</span>
        </div>
      </div>
    </div>
  </div>
);

const ActivityItem = ({ type, title, date, status }) => (
  <div className="flex items-center gap-4">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${type === 'booking' ? 'bg-indigo-50 text-indigo-600' : 'bg-green-50 text-green-600'}`}>
      {type === 'booking' ? <Calendar className="w-5 h-5" /> : <ArrowRight className="w-5 h-5 -rotate-45" />}
    </div>
    <div className="flex-1">
      <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
      <p className="text-xs text-slate-400">{date}</p>
    </div>
    <span className="text-xs font-bold px-2 py-1 bg-slate-100 text-slate-600 rounded-md">{status}</span>
  </div>
);

const NavIcon = ({ icon: Icon, label, active }) => (
  <button className={`flex flex-col items-center gap-1 ${active ? 'text-blue-600' : 'text-slate-400'}`}>
    <Icon className="w-6 h-6" />
    <span className="text-[10px] font-medium">{label}</span>
  </button>
);

export default ClientDashboardDemo;
