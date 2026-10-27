// One shared Socket.IO connection for the WhatsApp inbox. Every admin page mounts its own
// AdminLayout, so the connection lives here (module scope) and survives page navigation;
// components just subscribe to events and unsubscribe when they unmount.

import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '';

// VITE_API_URL looks like "https://host/api"; Socket.IO is served from the host root.
const socketOrigin = () => {
  try {
    return new URL(API_URL, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

let socket = null;
let socketToken = null;

const ensureSocket = (token) => {
  if (socket && socketToken === token) return socket;
  if (socket) socket.close();
  socketToken = token;
  socket = io(socketOrigin(), { auth: { token }, transports: ['websocket', 'polling'] });
  return socket;
};

// Subscribes to { 'wa:message': fn, 'wa:status': fn, 'wa:read': fn }. Returns an unsubscribe function.
export const subscribeWhatsApp = (token, handlers) => {
  if (!token) return () => {};
  const s = ensureSocket(token);
  Object.entries(handlers).forEach(([event, fn]) => s.on(event, fn));
  return () => Object.entries(handlers).forEach(([event, fn]) => s.off(event, fn));
};

// Fires after every (re)connect, so a page can re-sync anything missed while offline.
export const onWhatsAppConnect = (token, fn) => {
  if (!token) return () => {};
  const s = ensureSocket(token);
  s.on('connect', fn);
  return () => s.off('connect', fn);
};

export const disconnectWhatsApp = () => {
  if (socket) socket.close();
  socket = null;
  socketToken = null;
};
