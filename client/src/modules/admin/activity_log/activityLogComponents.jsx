// Shared small components between ActivityLogPage.jsx (global log) and the
// client-scoped Activities tab on client_detail_page.jsx.

export const Tag = ({ label, dot }) => (
  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot || 'bg-slate-400'}`} />
    {label}
  </span>
);

// Renders a log's `details` JSONB payload as a plain field/value table instead
// of a raw JSON dump — mirrors the DiffDisplay pattern on the change-requests page.
export const DetailsTable = ({ details }) => {
  let value = details;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return <p className="text-xs text-slate-400 italic">{details}</p>; }
  }
  if (value === null || typeof value !== 'object') {
    return <p className="text-xs text-slate-400 italic">{String(value ?? '—')}</p>;
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  if (entries.length === 0) return <p className="text-xs text-slate-400 italic">No details recorded.</p>;

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, val]) => (
            <tr key={key}>
              <td className="px-3 py-2 w-1/3 align-top font-medium text-slate-500 capitalize">{key.replace(/_/g, ' ')}</td>
              <td className="px-3 py-2 text-slate-800 break-all">
                {val === null || val === undefined || val === '' ? (
                  <span className="text-slate-300">—</span>
                ) : typeof val === 'object' ? (
                  <pre className="whitespace-pre-wrap text-[11px] text-slate-600">{JSON.stringify(val, null, 2)}</pre>
                ) : (
                  String(val)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
