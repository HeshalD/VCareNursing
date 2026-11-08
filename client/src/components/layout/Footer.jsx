import React, { useEffect, useState } from 'react';
import apiClient from '../../api/api';
import { ShieldCheck, Facebook, Instagram, Youtube, Mail, Phone, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CONTACT_NUMBERS } from '../../constants/contactNumbers';
import { OFFICE_ADDRESS_LINES, OFFICE_MAP_URL } from '../../constants/company';
import logoUrl from '../../assets/Logo/VCareLogo.png';

// Same services (and routes) as the landing page grid, nursing first.
const SERVICE_LINKS = [
  { label: 'Home Nursing', to: '/services/home-nursing' },
  { label: 'Patient Care', to: '/services/patient-care' },
  { label: 'Hospital Care', to: '/services/hospital-care' },
  { label: 'Child Care', to: '/services/child-care' },
  { label: 'Elderly Care', to: '/services/elderly-care' },
  { label: 'Doctor Visits', to: '/services/doctor-visits' },
  { label: 'Ambulance Service', to: '/services/ambulance' },
  { label: 'Medicine Delivery', to: '/services/medicine-delivery' },
  { label: 'Home Visit Lab Service', to: '/services/home-lab' },
];

const Footer = () => {
  const [legal, setLegal] = useState({});

  // Links are managed from the admin Documents page; each shows only once a PDF has been uploaded.
  useEffect(() => {
    apiClient.getPublicLegalDocuments()
      .then((res) => setLegal(res?.data || {}))
      .catch(() => {});
  }, []);

  return (
    <footer className="bg-slate-50 border-t border-slate-200 pt-20 pb-12">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-16">
          {/* Brand Column */}
          <div>
            <Link to="/" className="flex items-center gap-2 mb-6">
              <img src={logoUrl} alt="VCare Nursing" className="h-12 w-auto object-contain" />
            </Link>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              Sri Lanka's first healthcare staffing network.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://www.facebook.com/vcarenursing" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-blue-600 hover:text-white transition-all">
                <Facebook className="w-5 h-5" />
              </a>
              <a href="https://www.instagram.com/vcarenursing" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-pink-600 hover:text-white transition-all">
                <Instagram className="w-5 h-5" />
              </a>
              <a href="https://www.tiktok.com/@vcarenursing.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-900 hover:text-white transition-all">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2h-3.4v13.3a2.9 2.9 0 1 1-2-2.8V9.5a6.3 6.3 0 1 0 5.4 6.3V9a8.2 8.2 0 0 0 4.8 1.5V7.1a4.8 4.8 0 0 1-1-.4z" />
                </svg>
              </a>
              <a href="https://youtube.com/@vcarenursing" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-red-600 hover:text-white transition-all">
                <Youtube className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Services Column */}
          <div>
            <h4 className="font-bold text-slate-900 text-lg mb-6">Our Services</h4>
            <ul className="space-y-4 text-sm text-slate-600">
              {SERVICE_LINKS.map((s) => (
                <li key={s.to}><Link to={s.to} className="hover:text-blue-400 transition-colors">{s.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* Quick Links Column */}
          <div>
            <h4 className="font-bold text-slate-900 text-lg mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-slate-600">
              <li><Link to="/about" className="hover:text-blue-600 transition-colors">About Us</Link></li>
              <li><Link to="/priority-membership" className="hover:text-blue-600 transition-colors">Priority Membership</Link></li>
              <li><Link to="/success-stories" className="hover:text-blue-600 transition-colors">Success Stories</Link></li>
              <li><a href="#" className="hover:text-blue-600 transition-colors">Contact Support</a></li>
            </ul>
          </div>

          {/* Contact Column */}
          <div>
            <h4 className="font-bold text-slate-900 text-lg mb-6">Contact Us</h4>
            <ul className="space-y-6 text-sm text-slate-600">
              <li className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-blue-600" />
                </div>
                <a href={OFFICE_MAP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors" aria-label="Open our office location in Google Maps">
                  {OFFICE_ADDRESS_LINES.map((line, i) => (
                    <React.Fragment key={line}>{i > 0 && <br />}{line}</React.Fragment>
                  ))}
                </a>
              </li>
              <li className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex flex-col gap-1">
                  {CONTACT_NUMBERS.map(n => (
                    <a key={n.tel} href={`tel:${n.tel}`} className="hover:text-blue-600">{n.display}</a>
                  ))}
                </div>
              </li>
              <li className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <a href="mailto:info@vcarenursing.com" className="hover:text-blue-600">info@vcarenursing.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-slate-500 text-sm flex flex-col md:flex-row items-center gap-1 md:gap-4">
            <span>2026 VCare. All rights reserved.</span>
            <span className="hidden md:inline text-slate-300">|</span>
            <span>
              Designed and Developed by{' '}
              <a
                href="https://www.endermonks.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-slate-700 hover:text-blue-600 transition-colors"
              >
                EnderMonks
              </a>
            </span>
          </div>
          <div className="flex gap-8 text-sm text-slate-500">
            {legal.privacy_policy && (
              <a href={legal.privacy_policy} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Privacy Policy</a>
            )}
            {legal.terms_of_service && (
              <a href={legal.terms_of_service} target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors">Terms of Service</a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
