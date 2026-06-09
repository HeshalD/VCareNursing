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
import WorkerRegistrationSuccessPage from './modules/public/service_team/WorkerRegistrationSuccessPage';
import VerifyStaffOTP from './modules/public/service_team/VerifyStaffOTP';
import WorkerDashboardDemo from './modules/public/service_team/WorkerDashboardDemo';
import ClientDashboardDemo from './modules/public/ClientDashboardDemo';
import ClientProfileDemo from './modules/public/ClientProfileDemo';
import AdminDashboard from './modules/admin/admin_dashboard_main/AdminDashboard';
import UserManagement from './modules/admin/user_managemnet/user_managemnet';
import ClientDetailPage from './modules/admin/user_managemnet/client_detail_page';
import ProxyUserManagement from './modules/admin/user_managemnet/proxy_user_management';
import ServiceRequests from './modules/admin/service_requests/service_requests';
import ProxyServiceRequest from './modules/admin/service_requests/proxy_service_request';
import QuoteBuilder from './modules/admin/service_requests/quote_builder';
import WorkerVerification from './modules/admin/worker_verifications/worker_verifications';
import WorkerVerificationDetailsPage from './modules/admin/worker_verifications/WorkerVerificationDetailsPage';
import Financials from './modules/admin/financial/financial';
import BankAccounts from './modules/admin/back_accounts/bank_accounts';
import Reports from './modules/admin/reports/reports';
import SalesByCustomer from './modules/admin/reports/sales_by_customer';
import Settings from './modules/admin/settings/settings';
import AdminLoginPage from './modules/admin/AdminLoginPage';
import { AdminAuthProvider } from './context/AdminAuthContext';
import ScrollToTop from './components/common/ScrollToTop';
import './App.css';
import HomeNursingBookingPage from './modules/public/HomeNursingBookingPage';
import BabyCareBookingPage from './modules/public/BabyCareBookingPage';
import StaffRoster from './modules/admin/service_requests/staff_roster';
import Bookings from './modules/admin/bookings/Bookings';
import ClientBookings from './modules/client/ClientBookings';
import TerminationRequests from './modules/admin/termination_requests/termination_requests';
import Statements from './modules/admin/statements/statements';
import Earnings from './modules/public/service_team/Earnings';
import AdvanceRequests from './modules/admin/advance_requests/advance_requests';
import StaffWorkingHistory from './modules/admin/advance_requests/StaffWorkingHistory';
import ForgotPasswordPage from './modules/auth/ForgotPasswordPage';
import VerifyForgotPasswordOtp from './modules/auth/VerifyForgotPasswordOtp';
import ResetPasswordPage from './modules/auth/ResetPasswordPage';
import ViewStaffPage from './modules/public/ViewStaffPage';
import StaffProfile from './modules/public/StaffProfile';
import ClientProfile from './modules/client/ClientProfile';
import ClientServiceRequests from './modules/client/ClientServiceRequests';
import ClientPatients from './modules/client/ClientPatients';
import ClientFinancial from './modules/client/ClientFinancial';
import ClientReviews from './modules/client/ClientReviews';
import ClientLayout from './modules/client/components/ClientLayout';
import WorkerBookings from './modules/public/service_team/WorkerBookings';
import StaffMyProfile from './modules/public/service_team/StaffMyProfile';
import StaffSettings from './modules/public/service_team/StaffSettings';
import StaffChangeRequestPage from './modules/public/service_team/StaffChangeRequestPage';
import ChangeRequestsPage from './modules/admin/change_requests/ChangeRequestsPage';
import ActivityLogPage from './modules/admin/activity_log/ActivityLogPage';
import QuotationsPage from './modules/admin/service_quotes/quotations';
import QuotationDetailsPage from './modules/admin/service_quotes/quotation_details';
import ServiceRequestSummaryPage from './modules/admin/service_requests/service_request_summary';
import BookingStaffRosterPage from './modules/admin/service_requests/booking_staff_roster';
import BookingStaffAssignmentPage from './modules/admin/service_requests/booking_staff_assignment';
import BookingDetailPage from './modules/admin/bookings/BookingDetailPage';
import StaffDetailPage from './modules/admin/user_managemnet/staff_detail_page';
import TotalEarningsBreakdownPage from './modules/admin/user_managemnet/TotalEarningsBreakdownPage';
import CurrentEarningsBreakdownPage from './modules/admin/user_managemnet/CurrentEarningsBreakdownPage';
import PatientsPage from './modules/admin/patients/patients';
import PatientDetailPage from './modules/admin/patients/patient_details';

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
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/forgot-password/verify-otp" element={<VerifyForgotPasswordOtp />} />
            <Route path="/forgot-password/reset" element={<ResetPasswordPage />} />
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
            <Route path="/services/view-staff" element={<ViewStaffPage />} />
            <Route path="/services/staff-profile/:id" element={<StaffProfile/>}/>
            <Route path="/booking-success" element={<BookingSuccessPage />} />
            <Route path="/services/join-team" element={<WorkersTeamPage />} />
            <Route path="/services/apply" element={<WorkerRegistrationPage />} />
            <Route path="/verify-staff-otp" element={<VerifyStaffOTP />} />
            <Route path="/worker-registration-success" element={<WorkerRegistrationSuccessPage />} />
            <Route path="/services/provider-dashboard" element={<WorkerDashboardDemo />} />
            <Route path="/services/earnings" element={<Earnings />} />
            <Route path="/services/bookings" element={<WorkerBookings />} />
            <Route path="/services/my-profile" element={<StaffMyProfile />} />
            <Route path="/services/settings" element={<StaffSettings />} />
            <Route path="/services/change-request" element={<StaffChangeRequestPage />} />
            <Route element={<ClientLayout />}>
              <Route path="/client/profile" element={<ClientProfile />} />
              <Route path="/client/bookings" element={<ClientBookings />} />
              <Route path="/client/service-requests" element={<ClientServiceRequests />} />
              <Route path="/client/patients" element={<ClientPatients />} />
              <Route path="/client/financial" element={<ClientFinancial />} />
              <Route path="/client/reviews" element={<ClientReviews />} />
            </Route>
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
            <Route path="/admin/users/:clientId/detail" element={
              <AdminAuthProvider>
                <ClientDetailPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/proxy-user-management" element={
              <AdminAuthProvider>
                <ProxyUserManagement />
              </AdminAuthProvider>
            } />
            <Route path="/admin/service-requests" element={
              <AdminAuthProvider>
                <ServiceRequests />
              </AdminAuthProvider>
            } />
            <Route path="/admin/service-requests/:requestId/summary" element={
              <AdminAuthProvider>
                <ServiceRequestSummaryPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/proxy-service-requests" element={
              <AdminAuthProvider>
                <ProxyServiceRequest />
              </AdminAuthProvider>
            } />
            <Route path="/admin/termination-requests" element={
              <AdminAuthProvider>
                <TerminationRequests />
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
            <Route path="/admin/staff/:staffProfileId/detail" element={
              <AdminAuthProvider>
                <StaffDetailPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/staff/:staffProfileId/total-earnings" element={
              <AdminAuthProvider>
                <TotalEarningsBreakdownPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/staff/:staffProfileId/current-earnings" element={
              <AdminAuthProvider>
                <CurrentEarningsBreakdownPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/workers" element={
              <AdminAuthProvider>
                <WorkerVerification />
              </AdminAuthProvider>
            } />
            <Route path="/admin/workers/:applicationId" element={
              <AdminAuthProvider>
                <WorkerVerificationDetailsPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/financial" element={
              <AdminAuthProvider>
                <Financials />
              </AdminAuthProvider>
            } />
            <Route path="/admin/bank-accounts" element={
              <AdminAuthProvider>
                <BankAccounts />
              </AdminAuthProvider>
            } />
            <Route path="/admin/quotations" element={
              <AdminAuthProvider>
                <QuotationsPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/quotations/:quoteId" element={
              <AdminAuthProvider>
                <QuotationDetailsPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/bookings/:bookingId/staff-roster" element={
              <AdminAuthProvider>
                <BookingStaffRosterPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/bookings/:bookingId/staff-assignment" element={
              <AdminAuthProvider>
                <BookingStaffAssignmentPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/bookings/:bookingId/detail" element={
              <AdminAuthProvider>
                <BookingDetailPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/reports" element={
              <AdminAuthProvider>
                <Reports />
              </AdminAuthProvider>
            } />
            <Route path="/admin/reports/sales-by-customer" element={
              <AdminAuthProvider>
                <SalesByCustomer />
              </AdminAuthProvider>
            } />
            <Route path="/admin/reports/sales_by_customer" element={
              <Navigate to="/admin/reports/sales-by-customer" replace />
            } />
            <Route path="/admin/bookings" element={
              <AdminAuthProvider>
                <Bookings />
              </AdminAuthProvider>
            } />
            <Route path="/admin/statements" element={
              <AdminAuthProvider>
                <Statements />
              </AdminAuthProvider>
            } />
            <Route path="/admin/advance-requests" element={
              <AdminAuthProvider>
                <AdvanceRequests />
              </AdminAuthProvider>
            } />
            <Route path="/admin/staff-history/:staffProfileId" element={
              <AdminAuthProvider>
                <StaffWorkingHistory />
              </AdminAuthProvider>
            } />
            <Route path="/admin/change-requests" element={
              <AdminAuthProvider>
                <ChangeRequestsPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/patients" element={
              <AdminAuthProvider>
                <PatientsPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/patients/:patientId/detail" element={
              <AdminAuthProvider>
                <PatientDetailPage />
              </AdminAuthProvider>
            } />
            <Route path="/admin/activity-log" element={
              <AdminAuthProvider>
                <ActivityLogPage />
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
