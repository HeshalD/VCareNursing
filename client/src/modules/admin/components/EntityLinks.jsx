import React from 'react';
import { Link } from 'react-router-dom';

// Shared admin links for people names. Each renders plain text when no id is
// available (e.g. anonymous review, unassigned booking, departed staff), so it is
// always safe to wrap a name in one of these.
const makeLink = (buildPath, title) => ({ id, children, className = '' }) => {
  if (!id) return <>{children}</>;
  return (
    <Link
      to={buildPath(id)}
      onClick={(e) => e.stopPropagation()}
      title={title}
      className={`hover:text-blue-600 hover:underline transition-colors ${className}`}
    >
      {children}
    </Link>
  );
};

export const ClientLink = makeLink((id) => `/admin/users/${id}/detail`, 'View client profile');
// Patients and care profiles share one page.
export const PatientLink = makeLink((id) => `/admin/patients/${id}/detail`, 'View patient profile');
export const StaffLink = makeLink((id) => `/admin/staff/${id}/detail`, 'View staff profile');
export const InternalStaffLink = makeLink((id) => `/admin/internal-staff/${id}`, 'View internal staff profile');
