import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Loader2, MessageCircle, Plus, CheckCheck, LayoutTemplate } from 'lucide-react';
import AdminLayout from '../components/AdminLayout';
import apiClient from '../../../api/api';
import { useAdminAuth } from '../../../context/AdminAuthContext';
import ChatThread from './ChatThread';
import TemplateDialog from './TemplateDialog';
import { subscribeWhatsApp, onWhatsAppConnect } from './waSocket';
import { CONTACT_LABEL, conversationTitle, initialsOf, listTime } from './waUtils';

const byNewest = (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0);

// Inserts/updates one conversation in the list, keeping it sorted newest first.
const upsertConversation = (list, conv) => {
  const rest = list.filter((c) => c.conversation_id !== conv.conversation_id);
  return [conv, ...rest].sort(byNewest);
};

// Merges messages by id (a message can arrive via both the socket and a refetch), oldest first.
const mergeMessages = (existing, incoming) => {
  const map = new Map(existing.map((m) => [m.message_id, m]));
  incoming.forEach((m) => map.set(m.message_id, { ...map.get(m.message_id), ...m }));
  return [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
};

const ConversationRow = ({ conv, active, onClick }) => {
  const outLast = conv.last_message_direction === 'OUT';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-slate-100 transition-colors ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
    >
      <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
        {initialsOf(conv)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${conv.unread_count ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{conversationTitle(conv)}</p>
          <span className={`text-[11px] flex-shrink-0 ${conv.unread_count ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>{listTime(conv.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-slate-500 truncate flex items-center gap-1">
            {outLast && <CheckCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
            {conv.last_message_preview || '—'}
          </p>
          {conv.unread_count > 0 && (
            <span className="bg-emerald-500 text-white text-[10px] font-bold min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center flex-shrink-0">{conv.unread_count}</span>
          )}
        </div>
        {conv.contact_type !== 'UNKNOWN' && <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-0.5">{CONTACT_LABEL[conv.contact_type]}</p>}
      </div>
    </button>
  );
};

const WhatsAppInboxPage = () => {
  const { adminToken, hasPermission } = useAdminAuth();
  const canReply = hasPermission('WHATSAPP_REPLY');

  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);

  const [selectedId, setSelectedId] = useState(null);
  const [extraConv, setExtraConv] = useState(null); // selected chat that isn't in the loaded list yet
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [templateData, setTemplateData] = useState({ configured: true, templates: null, loading: true });
  const [dialog, setDialog] = useState(null); // { conversationId } | { newChat: true }

  const PAGE = 30;
  const selectedRef = useRef(null);
  const filtersRef = useRef({ search: '', unreadOnly: false });
  selectedRef.current = selectedId;
  filtersRef.current = { search, unreadOnly };

  const selected = conversations.find((c) => c.conversation_id === selectedId) || (extraConv?.conversation_id === selectedId ? extraConv : null);

  const loadList = useCallback(async () => {
    try {
      const { search: q, unreadOnly: u } = filtersRef.current;
      const res = await apiClient.getWaConversations({ search: q.trim(), unreadOnly: u, limit: PAGE });
      setConversations(res.conversations || []);
      setCanLoadMore((res.conversations || []).length >= PAGE);
      setListError('');
    } catch (err) {
      setListError(err?.message || 'Failed to load conversations.');
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadMoreList = async () => {
    const last = conversations[conversations.length - 1];
    if (!last) return;
    try {
      const res = await apiClient.getWaConversations({ search: search.trim(), unreadOnly, limit: PAGE, before: last.last_message_at });
      setConversations((prev) => [...prev, ...(res.conversations || []).filter((c) => !prev.some((p) => p.conversation_id === c.conversation_id))]);
      setCanLoadMore((res.conversations || []).length >= PAGE);
    } catch (err) {
      setListError(err?.message || 'Failed to load more.');
    }
  };

  // Admin routes share one ApiClient; make sure it carries this admin's token.
  useEffect(() => {
    if (adminToken) apiClient.setToken(adminToken);
  }, [adminToken]);

  // Initial load, then reload (debounced) whenever the search/filter changes.
  useEffect(() => {
    if (!adminToken) return undefined;
    const t = setTimeout(loadList, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [adminToken, search, unreadOnly, loadList]);

  // Templates: needed up-front to show readable text for automated template messages in history.
  const loadTemplates = useCallback(async (refresh = false) => {
    setTemplateData((d) => ({ ...d, loading: true }));
    try {
      const res = await apiClient.getWaTemplates(refresh);
      setTemplateData({ configured: res.configured, templates: res.templates, loading: false });
    } catch {
      setTemplateData((d) => ({ ...d, loading: false }));
    }
  }, []);
  useEffect(() => {
    if (adminToken) loadTemplates();
  }, [adminToken, loadTemplates]);

  const openConversation = useCallback(async (id, knownConv) => {
    setSelectedId(id);
    setExtraConv(knownConv || null);
    setMessages([]);
    setHasMore(false);
    setThreadLoading(true);
    try {
      const [msgRes, conv] = await Promise.all([
        apiClient.getWaMessages(id),
        knownConv ? Promise.resolve(knownConv) : apiClient.getWaConversation(id),
      ]);
      if (selectedRef.current !== id) return; // admin already moved to another chat
      setMessages(msgRes.messages || []);
      setHasMore(!!msgRes.has_more);
      if (!knownConv) setExtraConv(conv);
      if ((conv.unread_count || 0) > 0) {
        apiClient.markWaConversationRead(id).catch(() => {});
        setConversations((prev) => prev.map((c) => (c.conversation_id === id ? { ...c, unread_count: 0 } : c)));
      }
    } catch (err) {
      setListError(err?.message || 'Failed to open the conversation.');
    } finally {
      if (selectedRef.current === id) setThreadLoading(false);
    }
  }, []);

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    try {
      const res = await apiClient.getWaMessages(selectedId, messages[0].created_at);
      setMessages((prev) => mergeMessages(prev, res.messages || []));
      setHasMore(!!res.has_more);
    } finally {
      setLoadingOlder(false);
    }
  };

  // Live updates. Handlers read refs so the subscription is made once per login, not per render.
  useEffect(() => {
    if (!adminToken) return undefined;

    const onMessage = ({ conversation, message }) => {
      const isOpen = selectedRef.current === conversation.conversation_id;
      const { search: q, unreadOnly: u } = filtersRef.current;
      if (isOpen) {
        setMessages((prev) => mergeMessages(prev, [message]));
        if (message.direction === 'IN' && !document.hidden) {
          apiClient.markWaConversationRead(conversation.conversation_id).catch(() => {});
          conversation = { ...conversation, unread_count: 0 };
        }
        setExtraConv((c) => (c?.conversation_id === conversation.conversation_id ? conversation : c));
      }
      if (q.trim() || u) loadList(); // a filtered list can't be patched locally with confidence
      else setConversations((prev) => upsertConversation(prev, conversation));
    };
    const onStatus = ({ conversation_id: cid, message_id: mid, status, error_code: code, error_message: msg }) => {
      if (selectedRef.current !== cid) return;
      setMessages((prev) => prev.map((m) => (m.message_id === mid ? { ...m, status, error_code: code, error_message: msg } : m)));
    };
    const onRead = ({ conversation }) => setConversations((prev) => prev.map((c) => (c.conversation_id === conversation.conversation_id ? { ...c, unread_count: conversation.unread_count } : c)));

    const unsubscribe = subscribeWhatsApp(adminToken, { 'wa:message': onMessage, 'wa:status': onStatus, 'wa:read': onRead });
    // After a dropped connection, anything missed is re-synced.
    const offConnect = onWhatsAppConnect(adminToken, () => {
      loadList();
      const id = selectedRef.current;
      if (id) apiClient.getWaMessages(id).then((res) => setMessages((prev) => mergeMessages(prev, res.messages || []))).catch(() => {});
    });
    return () => { unsubscribe(); offConnect(); };
  }, [adminToken, loadList]);

  // Refetch the newest page after sending, so the message shows even if the live connection is down.
  const handleSend = async ({ text, file }) => {
    await apiClient.sendWaMessage(selectedId, { text, file });
    const res = await apiClient.getWaMessages(selectedId);
    setMessages((prev) => mergeMessages(prev, res.messages || []));
  };

  const handleTemplateSent = async (conversationId) => {
    setDialog(null);
    await loadList();
    if (conversationId) await openConversation(conversationId);
  };

  const backToList = () => { setSelectedId(null); setExtraConv(null); };

  return (
    <AdminLayout
      title="WhatsApp Inbox"
      subtitle="Every message sent to or received from your clients and staff. Reply live while the 24-hour window is open, or send an approved template."
      actions={canReply && (
        <button
          type="button"
          onClick={() => setDialog({ newChat: true })}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus className="w-4 h-4" /> New chat
        </button>
      )}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex h-[calc(100vh-14rem)] min-h-[480px]">
        {/* Conversation list */}
        <div className={`${selectedId ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 lg:w-96 border-r border-slate-200 flex-shrink-0`}>
          <div className="p-3 space-y-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or number…"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex gap-1.5">
              {[['All', false], ['Unread', true]].map(([label, val]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setUnreadOnly(val)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full ${unreadOnly === val ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {listError && <div className="m-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{listError}</div>}
            {listLoading ? (
              <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>
            ) : conversations.length === 0 ? (
              <div className="py-16 px-6 text-center text-sm text-slate-400">
                <MessageCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                {search || unreadOnly ? 'No conversations match.' : 'No WhatsApp messages yet. They appear here as soon as one is sent or received.'}
              </div>
            ) : (
              <>
                {conversations.map((c) => (
                  <ConversationRow key={c.conversation_id} conv={c} active={c.conversation_id === selectedId} onClick={() => openConversation(c.conversation_id, c)} />
                ))}
                {canLoadMore && (
                  <button type="button" onClick={loadMoreList} className="w-full py-3 text-xs font-medium text-blue-700 hover:bg-blue-50">Load more</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
          {selected ? (
            <ChatThread
              key={selected.conversation_id}
              conversation={selected}
              messages={messages}
              hasMore={hasMore}
              loading={threadLoading}
              loadingOlder={loadingOlder}
              templates={templateData.templates}
              canReply={canReply}
              onLoadOlder={loadOlder}
              onSend={handleSend}
              onOpenTemplate={() => setDialog({ conversationId: selected.conversation_id })}
              onBack={backToList}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-6">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3"><MessageCircle className="w-7 h-7 text-slate-300" /></div>
              <p className="font-semibold text-slate-600">Select a conversation</p>
              <p className="text-sm mt-1 max-w-xs">Pick a chat on the left to read the history and reply.</p>
              {canReply && (
                <button type="button" onClick={() => setDialog({ newChat: true })} className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg">
                  <LayoutTemplate className="w-4 h-4" /> Start a chat with a template
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <TemplateDialog
          mode={dialog}
          templates={templateData.templates}
          configured={templateData.configured}
          loading={templateData.loading}
          onReload={() => loadTemplates(true)}
          onClose={() => setDialog(null)}
          onSent={handleTemplateSent}
        />
      )}
    </AdminLayout>
  );
};

export default WhatsAppInboxPage;
