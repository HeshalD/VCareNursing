import React from 'react';
import { Check, CheckCheck, AlertCircle, FileText, ExternalLink, Image as ImageIcon, MapPin, LayoutTemplate, Bot } from 'lucide-react';
import { clockTime, templateText } from './waUtils';

const Ticks = ({ status }) => {
  if (status === 'failed') return <AlertCircle className="w-3.5 h-3.5 text-red-500" aria-label="Failed" />;
  if (status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-sky-500" aria-label="Read" />;
  if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-slate-400" aria-label="Delivered" />;
  return <Check className="w-3.5 h-3.5 text-slate-400" aria-label="Sent" />;
};

const Media = ({ msg }) => {
  const { msg_type: type, media_url: url, media_filename: name, media_mime: mime } = msg;
  if (!url) {
    // Inbound media whose download from Meta failed (media_id kept so it can be retried).
    return (
      <p className="flex items-center gap-1.5 text-xs italic text-slate-500">
        <ImageIcon className="w-3.5 h-3.5" /> {type === 'template' ? 'Attachment unavailable' : `This ${type} could not be loaded`}
      </p>
    );
  }
  if (type === 'image' || type === 'sticker' || mime?.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt={name || 'Image'} loading="lazy" className="rounded-lg max-h-72 max-w-full object-cover" />
      </a>
    );
  }
  if (type === 'video') return <video src={url} controls preload="metadata" className="rounded-lg max-h-72 max-w-full" />;
  if (type === 'audio') return <audio src={url} controls preload="metadata" className="max-w-full" />;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-sm text-slate-700"
    >
      <FileText className="w-5 h-5 text-slate-500 flex-shrink-0" />
      <span className="truncate">{name || 'Document'}</span>
      <ExternalLink className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
    </a>
  );
};

const MessageBubble = ({ msg, templates }) => {
  const out = msg.direction === 'OUT';
  const isTemplate = msg.msg_type === 'template';
  const text = isTemplate ? templateText(msg, templates) : msg.body;
  const hasMedia = !!msg.media_url || (!isTemplate && ['image', 'video', 'audio', 'document', 'sticker'].includes(msg.msg_type));

  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${
          out ? 'bg-emerald-100 rounded-br-sm' : 'bg-white rounded-bl-sm border border-slate-100'
        } ${msg.status === 'failed' ? 'ring-1 ring-red-300' : ''}`}
      >
        {isTemplate && (
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
            <LayoutTemplate className="w-3 h-3" /> Template · {msg.template_name}
          </p>
        )}
        {hasMedia && <div className="mb-1.5"><Media msg={msg} /></div>}
        {msg.msg_type === 'location' && <MapPin className="w-4 h-4 text-red-500 mb-1" />}
        {text ? (
          <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{text}</p>
        ) : (
          !hasMedia && <p className="text-xs italic text-slate-500">{msg.msg_type === 'reaction' ? 'Reacted' : `[${msg.msg_type}]`}</p>
        )}
        {msg.status === 'failed' && (
          <p className="mt-1 text-xs text-red-600">Not delivered{msg.error_message ? `: ${msg.error_message}` : ''}</p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
          {out && (
            <span className="inline-flex items-center gap-1">
              {msg.sent_by_user_id ? (msg.sent_by_name || 'Admin') : <><Bot className="w-3 h-3" /> Automated</>}
              <span aria-hidden>·</span>
            </span>
          )}
          <span>{clockTime(msg.created_at)}</span>
          {out && <Ticks status={msg.status} />}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
