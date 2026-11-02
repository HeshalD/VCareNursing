import { useEffect, useState } from 'react';
import apiClient from '../api/api';

// Used until an admin uploads a Terms of Service on the admin Documents page.
const LEGACY_TERMS_URL = 'https://res.cloudinary.com/dohaktkth/image/upload/v1780652854/VCare_Client_Service_Agreement_znjsim.pdf';

// Current Privacy Policy / Terms of Service links, managed from the admin Documents page.
export default function useLegalDocuments() {
  const [legal, setLegal] = useState({});

  useEffect(() => {
    apiClient.getPublicLegalDocuments()
      .then((res) => setLegal(res?.data || {}))
      .catch(() => {});
  }, []);

  return {
    termsUrl: legal.terms_of_service || LEGACY_TERMS_URL,
    privacyUrl: legal.privacy_policy || null,
  };
}
