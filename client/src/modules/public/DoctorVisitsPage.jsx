import React from 'react';
import { Stethoscope, Home, ClipboardList, Pill, ShieldCheck } from 'lucide-react';
import CallServicePage from './components/CallServicePage';
import doctorVisitImg from '../../assets/images/doctor_visit.PNG';

const DoctorVisitsPage = () => (
  <CallServicePage
    theme="turquoise"
    badge="Home Visits • Consultations • Follow-ups"
    titleTop="Doctors who"
    titleAccent="Come to You."
    subtitle="Skip the queue and the travel. Call us to arrange a qualified doctor to visit your loved one at home."
    callLabel="Call to arrange a visit"
    HeroIcon={Stethoscope}
    image={doctorVisitImg}
    featuresHeading={<>Clinic-quality care. <br /><span className="text-teal-600">At your doorstep.</span></>}
    featuresIntro="Ideal for elderly, bedridden or post-surgery patients who find hospital trips difficult. Just call and our team will arrange the visit."
    panel={{
      icon: ShieldCheck,
      title: 'Verified Doctors',
      text: 'Every visiting doctor is registered and vetted by VCare, so you can trust who walks through your door.',
    }}
    features={[
      { icon: Home, title: 'Home Consultations', desc: 'A full medical consultation in the comfort and privacy of your own home.' },
      { icon: ClipboardList, title: 'Follow-ups & Reviews', desc: 'Regular check-ups and progress reviews for ongoing conditions and recovery.' },
      { icon: Pill, title: 'Prescriptions & Advice', desc: 'Clear treatment plans and prescriptions, coordinated with your VCare nurse or caregiver.' },
    ]}
  />
);

export default DoctorVisitsPage;
