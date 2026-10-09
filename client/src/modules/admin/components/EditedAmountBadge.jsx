import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PencilLine } from 'lucide-react';

/**
 * "Edited" marker for an amount that was corrected in place (see
 * backend/services/amountCorrections.js). Renders nothing unless the record
 * carries an edit — so it can be dropped next to any amount unconditionally.
 *
 * record: any row exposing the shared edit fields (backend/utils/editedAmount.js)
 *   original_amount, edited_at, edited_by_name, edit_reason, edit_count
 *
 * Clicking opens a details card (original amount, date/time, who, reason). The
 * card is portalled to <body> so table wrappers and modals don't clip it.
 */
const CARD_WIDTH = 260;

const formatRs = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDateTime = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

const EditedAmountBadge = ({ record, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (cardRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  if (!record?.edited_at) return null;

  const toggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.left, window.innerWidth - CARD_WIDTH - 8)),
      });
    }
    setOpen(v => !v);
  };

  const editCount = Number(record.edit_count || 1);
  const hasOriginal = record.original_amount !== null && record.original_amount !== undefined;
  const who = record.edited_by_name || 'Unknown';
  const when = formatDateTime(record.edited_at);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        title={`Edited ${when} by ${who}`}
        aria-expanded={open}
        className={`inline-flex items-center gap-0.5 align-middle rounded px-1.5 py-0.5 text-[10.5px] font-semibold leading-none bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors normal-case tracking-normal ${className}`}
      >
        <PencilLine className="w-3 h-3" />
        Edited{editCount > 1 ? ` ×${editCount}` : ''}
      </button>

      {open && createPortal(
        <div
          ref={cardRef}
          role="dialog"
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: CARD_WIDTH }}
          className="z-[100] bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-left text-xs text-slate-700 normal-case tracking-normal font-normal"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-2">Amount edited</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5">
            {hasOriginal && (
              <>
                <dt className="text-slate-400">Original</dt>
                <dd className="tabular-nums line-through text-slate-500">{formatRs(record.original_amount)}</dd>
              </>
            )}
            <dt className="text-slate-400">{editCount > 1 ? 'Last edited' : 'Edited on'}</dt>
            <dd>{when}</dd>
            <dt className="text-slate-400">Edited by</dt>
            <dd className="font-medium text-slate-800">{who}</dd>
            {record.edit_reason && (
              <>
                <dt className="text-slate-400">Reason</dt>
                <dd className="whitespace-pre-wrap break-words">{record.edit_reason}</dd>
              </>
            )}
            {editCount > 1 && (
              <>
                <dt className="text-slate-400">Edits</dt>
                <dd>{editCount} times</dd>
              </>
            )}
          </dl>
        </div>,
        document.body,
      )}
    </>
  );
};

export default EditedAmountBadge;
