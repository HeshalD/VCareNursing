import React from 'react';
import { FlaskConical, Home, FileText, Clock, ShieldCheck } from 'lucide-react';
import CallServicePage from './components/CallServicePage';
import homeLabImg from '../../assets/images/Home Visti Lab Service.jpg';

const HomeLabServicePage = () => (
  <CallServicePage
    theme="fuchsia"
    badge="Blood Tests • Sample Collection • Lab Reports"
    titleTop="Lab tests,"
    titleAccent="Done at Home."
    subtitle="Skip the lab queue. Call us and a trained professional will visit your home to collect samples for your tests."
    callLabel="Call to book a home lab visit"
    HeroIcon={FlaskConical}
    image={homeLabImg}
    featuresHeading={<>Accurate results. <br /><span className="text-fuchsia-600">Without leaving home.</span></>}
    featuresIntro="Ideal for elderly, bedridden or post-surgery patients and anyone who finds lab visits difficult. Just call and our team will arrange the visit."
    panel={{
      icon: ShieldCheck,
      title: 'Trained Collectors',
      text: 'Samples are collected by trained, vetted professionals using sterile single-use equipment and handled with care.',
    }}
    features={[
      { icon: Home, title: 'Home Sample Collection', desc: 'A trained professional visits at a time that suits you and collects your samples at home.' },
      { icon: FileText, title: 'Reports Made Easy', desc: 'Your results are shared with you, and can be passed on to your doctor or VCare nurse.' },
      { icon: Clock, title: 'Convenient Timings', desc: 'Early-morning and flexible slots so fasting tests and busy schedules are no problem.' },
    ]}
  />
);

export default HomeLabServicePage;
