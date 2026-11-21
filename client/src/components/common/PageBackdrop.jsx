import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// Decorative background for public pages: soft blue/indigo glows that drift
// slowly, plus a faint dot grid that fades out toward the bottom. Place inside a
// parent with `relative isolate`; it sits behind the page content and ignores
// pointer events. Motion is disabled for users who prefer reduced motion.
const Blob = ({ className, drift, duration, reduce }) => (
  <motion.div
    className={`absolute rounded-full blur-3xl ${className}`}
    animate={reduce ? undefined : { x: drift[0], y: drift[1], scale: [1, 1.12, 1] }}
    transition={{ duration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
  />
);

const PageBackdrop = () => {
  const reduce = useReducedMotion();

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <Blob
        reduce={reduce}
        duration={14}
        drift={[60, 40]}
        className="-top-40 -left-40 h-[34rem] w-[34rem] bg-blue-300/40"
      />
      <Blob
        reduce={reduce}
        duration={18}
        drift={[-70, 50]}
        className="top-1/4 -right-40 h-[30rem] w-[30rem] bg-indigo-300/35"
      />
      <Blob
        reduce={reduce}
        duration={16}
        drift={[50, -60]}
        className="-bottom-40 left-1/4 h-[28rem] w-[28rem] bg-sky-300/35"
      />
      <Blob
        reduce={reduce}
        duration={20}
        drift={[-40, -40]}
        className="top-2/3 -left-32 h-[20rem] w-[20rem] bg-violet-300/25"
      />
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: 'radial-gradient(rgb(100 116 139 / 0.4) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
          maskImage: 'linear-gradient(to bottom, black, transparent 90%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 90%)',
        }}
      />
    </div>
  );
};

export default PageBackdrop;
