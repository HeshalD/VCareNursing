import React, { useMemo, useState } from 'react';
import { X, Search, Loader2, Send, RefreshCw, ArrowLeft, Paperclip, AlertTriangle, LayoutTemplate } from 'lucide-react';
import apiClient from '../../../api/api';
import { fillTemplate } from './waUtils';

const MEDIA_ACCEPT = {
  IMAGE: 'image/jpeg,image/png',
  VIDEO: 'video/mp4,video/3gpp',
  DOCUMENT: 'application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt',
};

const Field = ({ label, children, hint }) => (
  <label className="block">
    <span className="text-xs font-semibold text-slate-600">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-0.5">{hint}</span>}
  </label>
);

const inputCls = 'mt-1 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

// Highlights {{n}} placeholders that haven't been filled in yet.
const Preview = ({ def, bodyParams, headerParams }) => {
  const parts = fillTemplate(def.body.text, bodyParams).split(/(\{\{\d+\}\})/g);
  return (
    <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 space-y-1.5">
      {def.header?.format === 'TEXT' && def.header.text && (
        <p className="text-sm font-bold text-slate-800">{fillTemplate(def.header.text, headerParams)}</p>
      )}
      {def.header && def.header.format !== 'TEXT' && (
        <p className="text-xs text-slate-500 italic">[{def.header.format.toLowerCase()} attached]</p>
      )}
      <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
        {parts.map((p, i) => (/^\{\{\d+\}\}$/.test(p) ? <span key={i} className="px-1 rounded bg-amber-200 text-amber-900">{p}</span> : p))}
      </p>
      {def.footer && <p className="text-xs text-slate-400">{def.footer}</p>}
      {def.buttons.length > 0 && (
        <div className="pt-1.5 flex flex-wrap gap-1.5">
          {def.buttons.map((b, i) => (
            <span key={i} className="text-xs font-medium text-sky-700 bg-white border border-sky-100 rounded-md px-2 py-1">{b.text}</span>
          ))}
        </div>
      )}
    </div>
  );
};

// mode: { conversationId } to message an existing chat, or { newChat: true } to start one by phone number.
const TemplateDialog = ({ mode, templates, configured, loading, onReload, onClose, onSent }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [phone, setPhone] = useState('');
  const [bodyParams, setBodyParams] = useState([]);
  const [headerParams, setHeaderParams] = useState([]);
  const [buttonParams, setButtonParams] = useState([]);
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (templates || []).filter((t) => !q || t.name.toLowerCase().includes(q) || t.body.text.toLowerCase().includes(q));
  }, [templates, query]);

  const pick = (def) => {
    setSelected(def);
    setBodyParams(Array(def.body.variableCount).fill(''));
    setHeaderParams(Array(def.header?.variableCount || 0).fill(''));
    setButtonParams(Array(def.buttons.filter((b) => b.urlVariableCount).length).fill(''));
    setFile(null);
    setError('');
  };

  const setAt = (setter) => (i, v) => setter((arr) => arr.map((x, idx) => (idx === i ? v : x)));

  const needsFile = selected?.header && selected.header.format !== 'TEXT';
  const complete = selected
    && bodyParams.every((p) => p.trim())
    && headerParams.every((p) => p.trim())
    && buttonParams.every((p) => p.trim())
    && (!needsFile || file)
    && (mode.conversationId || phone.trim());

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await apiClient.sendWaTemplate({
        conversationId: mode.conversationId,
        phone: mode.newChat ? phone : undefined,
        name: selected.name,
        language: selected.language,
        bodyParams,
        headerParams,
        buttonParams,
        file,
      });
      onSent(res.conversation_id);
    } catch (err) {
      setError(err?.message || 'Failed to send the template.');
    } finally {
      setSending(false);
    }
  };

  let urlButtonIdx = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {selected && (
              <button type="button" onClick={() => setSelected(null)} className="p-1 rounded-md text-slate-500 hover:bg-slate-100" aria-label="Back to templates">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 truncate">{mode.newChat ? 'Start a new chat' : 'Send a template message'}</h2>
              <p className="text-xs text-slate-500">Approved templates can be sent at any time, even after the 24-hour window.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {mode.newChat && (
            <Field label="Phone number" hint="Sri Lankan numbers can be typed as 077 123 4567; other countries need the + code.">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 123 4567" className={inputCls} />
            </Field>
          )}

          {!selected ? (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search templates…"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button type="button" onClick={onReload} disabled={loading} title="Reload from WhatsApp" className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loading && !templates ? (
                <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
              ) : !configured ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 flex gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Templates can't be loaded yet. Add <code className="font-mono text-xs">META_WA_WABA_ID</code> (your WhatsApp Business Account ID) to the server settings.</span>
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No approved templates match.</p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((t) => (
                    <li key={`${t.name}:${t.language}`}>
                      <button
                        type="button"
                        disabled={!t.supported}
                        onClick={() => pick(t)}
                        className="w-full text-left rounded-xl border border-slate-200 p-3 hover:border-blue-400 hover:bg-blue-50/40 disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <LayoutTemplate className="w-4 h-4 text-emerald-600" />
                          <span className="font-semibold text-sm text-slate-900">{t.name}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">{t.category}</span>
                          <span className="text-[10px] text-slate-400">{t.language}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.body.text}</p>
                        {!t.supported && <p className="text-[11px] text-amber-700 mt-1">{t.unsupportedReason}</p>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              {selected.header?.format === 'TEXT' && selected.header.variableCount > 0 && headerParams.map((v, i) => (
                <Field key={`h${i}`} label={`Header variable ${i + 1}`}>
                  <input type="text" value={v} onChange={(e) => setAt(setHeaderParams)(i, e.target.value)} className={inputCls} />
                </Field>
              ))}
              {needsFile && (
                <Field label={`Header ${selected.header.format.toLowerCase()}`} hint="This template needs a file attached to its header.">
                  <label className="mt-1 flex items-center gap-2 px-3 py-2 text-sm border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-600">
                    <Paperclip className="w-4 h-4" />
                    <span className="truncate">{file ? file.name : 'Choose a file…'}</span>
                    <input type="file" accept={MEDIA_ACCEPT[selected.header.format]} className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  </label>
                </Field>
              )}
              {bodyParams.map((v, i) => (
                <Field key={`b${i}`} label={`Message variable {{${i + 1}}}`}>
                  <input type="text" value={v} onChange={(e) => setAt(setBodyParams)(i, e.target.value)} className={inputCls} />
                </Field>
              ))}
              {selected.buttons.map((b, i) => {
                if (!b.urlVariableCount) return null;
                urlButtonIdx += 1;
                const idx = urlButtonIdx;
                return (
                  <Field key={`btn${i}`} label={`"${b.text}" button link`} hint={`Added to the end of ${b.url.replace(/\{\{\d+\}\}/, '')}`}>
                    <input type="text" value={buttonParams[idx]} onChange={(e) => setAt(setButtonParams)(idx, e.target.value)} className={inputCls} />
                  </Field>
                );
              })}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Preview</p>
                <Preview def={selected} bodyParams={bodyParams} headerParams={headerParams} />
              </div>
            </>
          )}

          {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
        </div>

        {selected && (
          <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
            <button
              type="button"
              disabled={!complete || sending}
              onClick={send}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateDialog;
