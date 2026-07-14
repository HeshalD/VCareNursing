import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Staff dashboard
import staffSidebarEn from './locales/en/staffSidebar.json';
import staffSidebarSi from './locales/si/staffSidebar.json';
import workerDashboardEn from './locales/en/workerDashboard.json';
import workerDashboardSi from './locales/si/workerDashboard.json';
import workerBookingsEn from './locales/en/workerBookings.json';
import workerBookingsSi from './locales/si/workerBookings.json';
import earningsEn from './locales/en/earnings.json';
import earningsSi from './locales/si/earnings.json';
import staffMyProfileEn from './locales/en/staffMyProfile.json';
import staffMyProfileSi from './locales/si/staffMyProfile.json';
import staffChangeRequestEn from './locales/en/staffChangeRequest.json';
import staffChangeRequestSi from './locales/si/staffChangeRequest.json';
import staffLeaveRequestEn from './locales/en/staffLeaveRequest.json';
import staffLeaveRequestSi from './locales/si/staffLeaveRequest.json';

// Worker registration
import workersTeamEn from './locales/en/workersTeam.json';
import workersTeamSi from './locales/si/workersTeam.json';
import workerRegistrationEn from './locales/en/workerRegistration.json';
import workerRegistrationSi from './locales/si/workerRegistration.json';
import verifyStaffOtpEn from './locales/en/verifyStaffOtp.json';
import verifyStaffOtpSi from './locales/si/verifyStaffOtp.json';
import workerRegistrationSuccessEn from './locales/en/workerRegistrationSuccess.json';
import workerRegistrationSuccessSi from './locales/si/workerRegistrationSuccess.json';
import staffDocumentUploadEn from './locales/en/staffDocumentUpload.json';
import staffDocumentUploadSi from './locales/si/staffDocumentUpload.json';

const STORAGE_KEY = 'vcare_staff_language';

i18n.use(initReactI18next).init({
  resources: {
    en: {
      staffSidebar: staffSidebarEn,
      workerDashboard: workerDashboardEn,
      workerBookings: workerBookingsEn,
      earnings: earningsEn,
      staffMyProfile: staffMyProfileEn,
      staffChangeRequest: staffChangeRequestEn,
      staffLeaveRequest: staffLeaveRequestEn,
      workersTeam: workersTeamEn,
      workerRegistration: workerRegistrationEn,
      verifyStaffOtp: verifyStaffOtpEn,
      workerRegistrationSuccess: workerRegistrationSuccessEn,
      staffDocumentUpload: staffDocumentUploadEn,
    },
    si: {
      staffSidebar: staffSidebarSi,
      workerDashboard: workerDashboardSi,
      workerBookings: workerBookingsSi,
      earnings: earningsSi,
      staffMyProfile: staffMyProfileSi,
      staffChangeRequest: staffChangeRequestSi,
      staffLeaveRequest: staffLeaveRequestSi,
      workersTeam: workersTeamSi,
      workerRegistration: workerRegistrationSi,
      verifyStaffOtp: verifyStaffOtpSi,
      workerRegistrationSuccess: workerRegistrationSuccessSi,
      staffDocumentUpload: staffDocumentUploadSi,
    },
  },
  // Toggle UI is hidden for this release (see memory: language-toggle-locations),
  // so force English regardless of any 'si' choice persisted from before.
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export const setAppLanguage = (lang) => {
  i18n.changeLanguage(lang);
  localStorage.setItem(STORAGE_KEY, lang);
};

export default i18n;
