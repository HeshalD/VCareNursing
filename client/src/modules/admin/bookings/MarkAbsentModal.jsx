import React, { useState } from 'react';
import DateInput from '../../../components/common/DateInput';

const label = { fontSize: 12, fontWeight: 600, color: '#5A554B', marginBottom: 5, display: 'block' };
const field = { width: '100%', border: '1px solid #E7E1D6', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, boxSizing: 'border-box' };

/**
 * LIVE_IN only. Marks a staff member absent on a set of days (a from/to range, or
 * individually picked dates) and takes back any salary already paid for them.
 * `onSubmit({ from, to } | { dates }, reason)` resolves with the API result body.
 */
export default function MarkAbsentModal({ staffName, minDate, onClose, onSubmit }) {
  const [mode, setMode] = useState('range');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pickedDates, setPickedDates] = useState([]);
  const [pickInput, setPickInput] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const addPicked = (value) => {
    setPickInput(value);
    if (value && !pickedDates.includes(value)) {
      setPickedDates([...pickedDates, value].sort());
      setPickInput('');
    }
  };

  const ready = reason.trim() && (mode === 'range' ? from && to && from <= to : pickedDates.length > 0);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const selection = mode === 'range' ? { from, to } : { dates: pickedDates };
      const res = await onSubmit(selection, reason.trim());
      setResult(res?.data || res);
    } catch (e) {
      setError(e?.message || 'Failed to mark absent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460, padding: 22, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2A2722' }}>Mark absent &amp; revoke salary</div>
        <p style={{ fontSize: 12.5, color: '#6F6A60', margin: '4px 0 16px' }}>
          {staffName} will be marked absent on the selected days and any salary already paid for them is taken back. The client invoice is not changed.
        </p>

        {result ? (
          <div>
            <div style={{ fontSize: 13, color: '#2A2722', marginBottom: 8 }}>
              Marked {result.marked?.length || 0} day(s) absent
              {result.total_salary_reversed > 0 && <> — Rs. {Number(result.total_salary_reversed).toLocaleString()} salary reversed</>}.
            </div>
            {result.skipped?.length > 0 && (
              <div style={{ fontSize: 12, color: '#B07A1E', background: '#FBF1DD', border: '1px solid #F3E3BC', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                Skipped: {result.skipped.map(s => `${s.service_date} (${s.reason})`).join(', ')}
              </div>
            )}
            <button type="button" onClick={onClose} style={{ marginTop: 8, background: '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Done</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['range', 'Date range'], ['dates', 'Specific days']].map(([key, text]) => (
                <button key={key} type="button" onClick={() => setMode(key)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (mode === key ? '#374151' : '#E7E1D6'), background: mode === key ? '#374151' : '#fff', color: mode === key ? '#fff' : '#5A554B' }}>
                  {text}
                </button>
              ))}
            </div>

            {mode === 'range' ? (
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1 }}><span style={label}>From</span><DateInput value={from} onChange={setFrom} min={minDate} style={field} /></div>
                <div style={{ flex: 1 }}><span style={label}>To</span><DateInput value={to} onChange={setTo} min={from || minDate} style={field} /></div>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <span style={label}>Add a day</span>
                <DateInput value={pickInput} onChange={addPicked} min={minDate} style={field} />
                {pickedDates.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {pickedDates.map(d => (
                      <span key={d} style={{ fontSize: 12, background: '#FBF9F4', border: '1px solid #EFEAE0', borderRadius: 999, padding: '3px 6px 3px 10px' }}>
                        {d}{' '}
                        <button type="button" onClick={() => setPickedDates(pickedDates.filter(x => x !== d))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#A39D91' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <span style={label}>Reason (required)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} style={{ ...field, resize: 'vertical' }} />
            </div>

            {error && <div style={{ fontSize: 12.5, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px', marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={onClose} disabled={busy} style={{ background: '#fff', border: '1px solid #E7E1D6', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={submit} disabled={!ready || busy}
                style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: ready && !busy ? 'pointer' : 'not-allowed', opacity: ready && !busy ? 1 : 0.5 }}>
                {busy ? 'Saving…' : 'Mark absent & revoke'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
