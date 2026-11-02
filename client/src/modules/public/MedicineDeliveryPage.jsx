import React from 'react';
import { Pill, Truck, Clock, ShieldCheck, ClipboardList } from 'lucide-react';
import CallServicePage from './components/CallServicePage';
import medicineDeliveryImg from '../../assets/images/Medicine Delivey.jpg';

const MedicineDeliveryPage = () => (
  <CallServicePage
    theme="orange"
    badge="Prescriptions • Pharmacy • Doorstep Delivery"
    titleTop="Medicine, delivered"
    titleAccent="To Your Door."
    subtitle="No more pharmacy queues or trips out. Call us and we'll get your prescribed medicines delivered safely to your home."
    callLabel="Call to order medicine"
    HeroIcon={Pill}
    image={medicineDeliveryImg}
    featuresHeading={<>Your prescription. <br /><span className="text-orange-600">Right at your doorstep.</span></>}
    featuresIntro="Ideal for elderly, bedridden or recovering patients and busy families. Just call, share the prescription and our team will arrange the delivery."
    panel={{
      icon: ShieldCheck,
      title: 'Genuine Medicines',
      text: 'We source from trusted pharmacies and check every order against the prescription before it leaves for your home.',
    }}
    features={[
      { icon: ClipboardList, title: 'Prescription Handling', desc: 'Share your prescription over the phone or WhatsApp and we take care of the rest.' },
      { icon: Truck, title: 'Doorstep Delivery', desc: 'Medicines are packed carefully and brought straight to your home.' },
      { icon: Clock, title: 'Regular Refills', desc: 'Ongoing medication? We can help you keep a steady supply so you never run out.' },
    ]}
  />
);

export default MedicineDeliveryPage;
