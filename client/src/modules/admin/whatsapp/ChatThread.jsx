import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, X, Loader2, LayoutTemplate, Clock, Lock, ExternalLink, MessageCircle } from 'lucide-react';
import { formatMobileNumber } from '../../../utils/phoneFormat';
import MessageBubble from './MessageBubble';
import { CONTACT_LABEL, contactPath, conversationTitle, dayLabel, isSameDay, windowRemaining } from './waUtils';

const WINDOW_MS = 24 * 60 * 60 * 1000;

const ChatThread = ({ conversation, messages, hasMore, loading, loadingOlder, templates, canReply, onLoadOlder, onSend, onOpenTemplate, onBack }) => {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const listRef = useRef(null);
  const fileRef = useRef(null);
  const stickToBottom = useRef(true);
  const prevFirstId = useRef(null);
  const prevHeight = useRef(0);

  // Re-evaluate the reply window every 30s so the banner and composer flip when it closes.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Keep the newest message in view, but leave the scroll alone while the admin reads history;
  // when an older page is prepended, hold the current messages steady instead of jumping.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const firstId = messages[0]?.message_id;
    if (prevFirstId.current && firstId !== prevFirstId.current && prevHeight.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirstId.current = firstId;
    prevHeight.current = el.scrollHeight;
  }, [messages]);

  const lastInbound = conversation.last_inbound_at ? new Date(conversation.last_inbound_at).getTime() : null;
  const windowOpen = !!lastInbound && Date.now() - lastInbound < WINDOW_MS;
  const remaining = windowOpen ? windowRemaining(new Date(lastInbound + WINDOW_MS).toISOString()) : null;
  const link = contactPath(conversation);

  const submit = async () => {
    if ((!text.trim() && !file) || sending) return;
    setSending(true);
    setError('');
    try {
      await onSend({ text: text.trim(), file });
      setText('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      stickToBottom.current = true;
    } catch (err) {
      setError(err?.message || 'Failed to send.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
        <button type="button" onClick={onBack} className="md:hidden p-1.5 -ml-1.5 rounded-md text-slate-500 hover:bg-slate-100" aria-label="Back to conversations">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 truncate">{conversationTitle(conversation)}</p>
          <p className="text-xs text-slate-500 truncate">
            {formatMobileNumber(conversation.phone_e164)}
            {conversation.wa_profile_name && conversation.display_name && conversation.wa_profile_name !== conversation.display_name ? ` · WhatsApp name: ${conversation.wa_profile_name}` : ''}
          </p>
        </div>
        {link ? (
          <Link to={link} className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full px-2.5 py-1 flex-shrink-0">
            {CONTACT_LABEL[conversation.contact_type]} <ExternalLink className="w-3 h-3" />
          </Link>
        ) : (
          <span className="text-xs text-slate-400 flex-shrink-0">Unknown contact</span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-2 bg-slate-100/70"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button type="button" onClick={onLoadOlder} disabled={loadingOlder} className="text-xs font-medium text-blue-700 bg-white border border-slate-200 rounded-full px-3 py-1 hover:bg-blue-50 disabled:opacity-50">
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No messages yet.</p>
        ) : (
          messages.map((m, i) => (
            <React.Fragment key={m.message_id}>
              {(i === 0 || !isSameDay(messages[i - 1].created_at, m.created_at)) && (
                <div className="flex justify-center py-1">
                  <span className="text-[11px] font-medium text-slate-500 bg-white rounded-full px-3 py-0.5 shadow-sm">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <MessageBubble msg={m} templates={templates} />
            </React.Fragment>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3 space-y-2">
        {!canReply ? (
          <p className="flex items-center gap-2 text-sm text-slate-500 px-1"><Lock className="w-4 h-4" /> You don't have permission to reply.</p>
        ) : !windowOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
            <p className="flex items-start gap-2 text-sm text-amber-900">
              <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>The 24-hour reply window is closed.</strong>{' '}
                {lastInbound ? 'WhatsApp only allows an approved template message now.' : 'This person has not messaged us yet, so only an approved template can start the chat.'}
              </span>
            </p>
            <button type="button" onClick={onOpenTemplate} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
              <LayoutTemplate className="w-4 h-4" /> Send template
            </button>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-emerald-700 flex items-center gap-1 px-1"><MessageCircle className="w-3 h-3" /> Reply window open · closes in {remaining}</p>
            {file && (
              <div className="flex items-center gap-2 text-sm bg-slate-100 rounded-lg px-3 py-1.5 w-fit max-w-full">
                <Paperclip className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="truncate">{file.name}</span>
                <button type="button" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-slate-400 hover:text-slate-700" aria-label="Remove attachment">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <button type="button" onClick={() => fileRef.current?.click()} className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Attach a file" aria-label="Attach a file">
                <Paperclip className="w-5 h-5" />
              </button>
              <button type="button" onClick={onOpenTemplate} className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Send a template" aria-label="Send a template">
                <LayoutTemplate className="w-5 h-5" />
              </button>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={4096}
                placeholder={file ? 'Add a caption (optional)…' : 'Type a message…'}
                className="flex-1 resize-none max-h-32 px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={submit}
                disabled={(!text.trim() && !file) || sending}
                className="p-2.5 rounded-xl text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Send"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}
      </div>
    </div>
  );
};

export default ChatThread;
