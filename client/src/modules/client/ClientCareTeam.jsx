import React, { useState } from 'react';
import DocPage, { Badge, fmtDate } from './components/DocPage';

const statusTone = s => ({ ACTIVE: 'green', SCHEDULED: 'blue', COMPLETED: 'grey', TERMINATED: 'red' }[s] || 'grey');

const ClientCareTeam = () => {
  const [error, setError] = useState('');

  return (
    <DocPage
      title="Care Team Log" subtitle="Every staff member who has provided care for you, with the booking they served."
      listKey="staff-log" searchFields={['staff_name', 'booking_code', 'service_type', 'patient_name', 'designation']}
      error={error} setError={setError}
    >
      {rows => (
        <table className="doc-table">
          <thead>
            <tr><th>Staff Member</th><th>Booking</th><th>Care Profile</th><th>Service Period</th><th>Assignment</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.assignment_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.staff_name}</div>
                  {r.designation && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.designation}</div>}
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.booking_code || `#${String(r.booking_id).slice(0, 8)}`}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {[r.service_type, r.service_model && r.service_model.replace('_', ' ')].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ marginTop: 4 }}><Badge tone={statusTone(r.booking_status)}>{r.booking_status}</Badge></div>
                </td>
                <td>{r.patient_name || '—'}</td>
                <td>{fmtDate(r.service_start_date)} – {r.service_end_date ? fmtDate(r.service_end_date) : 'Present'}</td>
                <td><Badge tone={statusTone(r.assignment_status)}>{r.assignment_status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DocPage>
  );
};

export default ClientCareTeam;
