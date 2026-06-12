import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';

/**
 * Popup — a reusable, professional modal/dialog.
 *
 * Reusable across the app for confirmations, success/error notices, and welcome
 * messages. Render it conditionally and control visibility with `isOpen`.
 *
 * Props:
 *  - isOpen        : boolean — whether the popup is visible
 *  - onClose       : () => void — called on backdrop click, X button, or Escape
 *  - variant       : 'success' | 'info' | 'warning' | 'error' (default 'info')
 *  - title         : string — bold heading
 *  - message       : string | ReactNode — body content
 *  - primaryAction : { label, onClick } — main button (optional)
 *  - secondaryAction: { label, onClick } — secondary/ghost button (optional)
 *  - autoCloseMs   : number — auto-dismiss after N ms (optional)
 *  - showClose     : boolean — show the top-right X (default true)
 *  - icon          : ReactNode — override the default variant icon (optional)
 */
const VARIANTS = {
  success: {
    Icon: CheckCircle2,
    iconWrap: 'bg-green-100 text-green-600',
    accent: 'bg-green-600 hover:bg-green-700 shadow-green-600/20',
  },
  info: {
    Icon: Info,
    iconWrap: 'bg-blue-100 text-blue-600',
    accent: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',
  },
  warning: {
    Icon: AlertTriangle,
    iconWrap: 'bg-amber-100 text-amber-600',
    accent: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20',
  },
  error: {
    Icon: XCircle,
    iconWrap: 'bg-red-100 text-red-600',
    accent: 'bg-red-600 hover:bg-red-700 shadow-red-600/20',
  },
};

const Popup = ({
  isOpen,
  onClose,
  variant = 'info',
  title,
  message,
  primaryAction,
  secondaryAction,
  autoCloseMs,
  showClose = true,
  icon,
}) => {
  const cfg = VARIANTS[variant] || VARIANTS.info;
  const Icon = cfg.Icon;

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Auto-close timer
  useEffect(() => {
    if (!isOpen || !autoCloseMs) return;
    const t = setTimeout(() => onClose && onClose(), autoCloseMs);
    return () => clearTimeout(t);
  }, [isOpen, autoCloseMs, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0.2 }}
            className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/10 overflow-hidden"
          >
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="p-8 text-center">
              {/* Icon */}
              <div className={`mx-auto mb-5 w-16 h-16 rounded-full flex items-center justify-center ${cfg.iconWrap}`}>
                {icon || <Icon className="w-8 h-8" />}
              </div>

              {/* Title */}
              {title && (
                <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
              )}

              {/* Message */}
              {message && (
                <div className="text-slate-600 text-sm leading-relaxed">{message}</div>
              )}

              {/* Actions */}
              {(primaryAction || secondaryAction) && (
                <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3 sm:justify-center">
                  {secondaryAction && (
                    <button
                      type="button"
                      onClick={secondaryAction.onClick}
                      className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
                    >
                      {secondaryAction.label}
                    </button>
                  )}
                  {primaryAction && (
                    <button
                      type="button"
                      onClick={primaryAction.onClick}
                      className={`px-6 py-2.5 rounded-lg text-white font-semibold shadow-lg transition-colors ${cfg.accent}`}
                    >
                      {primaryAction.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Popup;
