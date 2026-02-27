import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './modules/public/LandingPage';
import LoginPage from './modules/auth/LoginPage';
import RegisterPage from './modules/auth/RegisterPage';
import StaffPasswordChangePage from './modules/auth/StaffPasswordChangePage';
import HomeNursingPage from './modules/public/HomeNursingPage';
import AboutPage from './modules/public/AboutPage';
import VerifyOTPReg from './auth/VerifyOTPReg';
import { AuthProvider } from './context/AuthContext';
import HospitalStaffingPage from './modules/public/HospitalStaffingPage';
import ChildCarePage from './modules/public/ChildCarePage';
import ElderlyCarePage from './modules/public/ElderlyCarePage';
import ElderlyCareBookingPage from './modules/public/ElderlyCareBookingPage';
import BookingSuccessPage from './modules/public/BookingSuccessPage';
import WorkersTeamPage from './modules/public/service_team/WorkersTeamPage';
import WorkerRegistrationPage from './modules/public/service_team/WorkerRegistrationPage';
import WorkerDashboardDemo from './modules/public/service_team/WorkerDashboardDemo';
import ClientDashboardDemo from './modules/public/ClientDashboardDemo';
import ClientProfileDemo from './modules/public/ClientProfileDemo';
import AdminDashboard from './modules/admin/admin_dashboard_main/AdminDashboard';
import UserManagement from './modules/admin/user_managemnet/user_managemnet';
import ServiceRequests from './modules/admin/service_requests/service_requests';
import QuoteBuilder from './modules/admin/service_requests/quote_builder';
import WorkerVerification from './modules/admin/worker_verifications/worker_verifications';
import Financials from './modules/admin/financial/financial';
import Reports from './modules/admin/reports/reports';
import Settings from './modules/admin/settings/settings';
import AdminLoginPage from './modules/admin/AdminLoginPage';
import { AdminAuthProvider } from './context/AdminAuthContext';
import ScrollToTop from './components/common/ScrollToTop';
import './App.css';
import HomeNursingBookingPage from './modules/public/HomeNursingBookingPage';
import BabyCareBookingPage from './modules/public/BabyCareBookingPage';
import StaffRoster from './modules/admin/service_requests/staff_roster';
import Bookings from './modules/admin/bookings/Bookings';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="antialiased text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 min-h-screen font-sans">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/change-staff-password" element={<StaffPasswordChangePage />} />
            <Route path="/admin" element={
              <AdminAuthProvider>
                <AdminLoginPage />
              </AdminAuthProvider>
            } />
            <Route path="/verify-otp-reg" element={<VerifyOTPReg />} />
            <Route path="/services/home-nursing" element={<HomeNursingPage />} />
            <Route path="/services/home-nursing/book" element={<HomeNursingBookingPage />} />
            <Route path="/services/hospital-staffing" element={<HospitalStaffingPage />} />
            <Route path="/services/child-care" element={<ChildCarePage />} />
            <Route path='/services/child-care/book' element={<BabyCareBookingPage/>}/>
            <Route path="/services/elderly-care" element={<ElderlyCarePage />} />
            <Route path="/services/elderly-care/book" element={<ElderlyCareBookingPage />} />
            <Route path="/booking-success" element={<BookingSuccessPage />} />
            <Route path="/services/join-team" element={<WorkersTeamPage />} />
            <Route path="/services/apply" element={<WorkerRegistrationPage />} />
            <Route path="/services/provider-dashboard" element={<WorkerDashboardDemo />} />
            <Route path="/client/dashboard" element={<ClientDashboardDemo />} />
            <Route path="/client/profile" element={<ClientProfileDemo />} />
            <Route path="/admin/dashboard" element={
              <AdminAuthProvider>
                <AdminDashboard />
              </AdminAuthProvider>
            } />
            <Route path="/admin/users" element={
              <AdminAuthProvider>
                <UserManagement />
              </AdminAuthProvider>
            } />
            <Route path="/admin/service-requests" element={
              <AdminAuthProvider>
                <ServiceRequests />
              </AdminAuthProvider>
            } />
            <Route path="/admin/quote-builder/:requestId?" element={
              <AdminAuthProvider>
                <QuoteBuilder />
              </AdminAuthProvider>
            } />
            <Route path="/admin/staff-roster" element={
              <AdminAuthProvider>
                <StaffRoster />
              </AdminAuthProvider>
            } />
            <Route path="/admin/workers" element={
              <AdminAuthProvider>
                <WorkerVerification />
              </AdminAuthProvider>
            } />
            <Route path="/admin/financial" element={
              <AdminAuthProvider>
                <Financials />
              </AdminAuthProvider>
            } />
            <Route path="/admin/reports" element={
              <AdminAuthProvider>
                <Reports />
              </AdminAuthProvider>
            } />
            <Route path="/admin/bookings" element={
              <AdminAuthProvider>
                <Bookings />
              </AdminAuthProvider>
            } />
            <Route path="/admin/settings" element={
              <AdminAuthProvider>
                <Settings />
              </AdminAuthProvider>
            } />
            <Route path="/services/*" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<Navigate to="/login" replace />} />


            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
