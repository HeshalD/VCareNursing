import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Small figure card used on the client detail page (and its Statement section).
// `to` makes the card a link to the page that breaks the figure down entry by entry.
const StatCard = ({ icon: Icon, label, value, tone = 'slate', to }) => {
  const iconColor = {
    slate:   'text-gray-500',
    blue:    'text-blue-600',
    emerald: 'text-emerald-600',
    amber:   'text-amber-600',
    rose:    'text-rose-600',
    violet:  'text-violet-600',
  };
  const card = (
    // Own container so the label/value type scales with the card's real width
    // rather than the viewport — the card is nested two sidebars deep, so a
    // viewport breakpoint says nothing about how much room it actually has.
    <div className={`@container min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white p-3 @min-[13rem]:p-4 ${to ? 'transition-colors group-hover:border-blue-300 group-hover:bg-blue-50/30' : ''}`}>
      <div className="flex items-start gap-2 mb-2">
        <Icon className={`mt-px h-4 w-4 shrink-0 ${iconColor[tone] || 'text-gray-500'}`} />
        <p className="min-w-0 text-[11px] font-medium uppercase leading-tight tracking-wider text-gray-400 break-words">{label}</p>
        {to && <ArrowRight className="ml-auto mt-px h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-blue-500" />}
      </div>
      <p
        title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
        className="text-base font-semibold leading-tight text-gray-900 break-words @min-[11rem]:text-lg @min-[15rem]:text-xl"
      >
        {value}
      </p>
    </div>
  );
  return to ? (
    <Link to={to} title="See how this figure is made up" className="group block min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
      {card}
    </Link>
  ) : card;
};

export default StatCard;
