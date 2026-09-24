import React from 'react';
import { Ambulance, Clock, HeartPulse, MapPin, ShieldCheck } from 'lucide-react';
import CallServicePage from './components/CallServicePage';
import ambulanceImg from '../../assets/images/ambulance.PNG';

const AmbulanceServicePage = () => (
  <CallServicePage
    theme="red"
    badge="Emergency • Transfers • 24/7"
    titleTop="Help, when"
    titleAccent="Every Minute Counts."
    subtitle="Need an ambulance? Call us now and we'll get trained responders and a fully equipped vehicle to you."
    callLabel="Call for an ambulance"
    HeroIcon={Ambulance}
    image={ambulanceImg}
    featuresHeading={<>Fast response. <br /><span className="text-red-600">Careful transport.</span></>}
    featuresIntro="For emergencies and planned patient transfers alike, our team is a phone call away. In a life-threatening emergency, call immediately."
    panel={{
      icon: ShieldCheck,
      title: 'Trained Crews',
      text: 'Our ambulance crews are trained in emergency response and patient handling, so you are in safe hands from pickup to arrival.',
    }}
    features={[
      { icon: Clock, title: 'Rapid Response', desc: 'Call any number on this page and we will dispatch help as quickly as possible.' },
      { icon: HeartPulse, title: 'Emergency Care On Board', desc: 'Basic life support equipment and trained staff to stabilise patients on the way.' },
      { icon: MapPin, title: 'Hospital & Home Transfers', desc: 'Planned transfers between home, hospital and clinics for patients who need assisted transport.' },
    ]}
  />
);

export default AmbulanceServicePage;
