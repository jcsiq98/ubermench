'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../../lib/auth-context';
import {
  messagesApi,
  bookingsApi,
  type ChatMessage,
  type BookingSummary,
} from '../../../lib/api';
import { io, Socket } from 'socket.io-client';

// Derive WS URL from the same API URL used for REST calls
const BACKEND_WS_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const POLL_INTERVAL_MS = 5000; // poll every 5s as safety net

export default function ChatPage() {
  const router = useRouter();
  const params = useParams();
  const bookingId = params.bookingId as string;
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booking, setBooking] = useState<BookingSummary | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: smooth ? 'smooth' : 'instant',
      });
    });
  }, []);

  // Load booking info + message history
  const loadData = useCallback(async () => {
    try {
      const [bookingData, messagesData] = await Promise.all([
        bookingsApi.getById(bookingId),
        messagesApi.getHistory(bookingId, { limit: 50 }),
      ]);
      setBooking(bookingData);
      setMessages(messagesData.data);
      scrollToBottom(false);
    } catch (err: unknown) {
      console.error('Failed to load chat:', err);
      const message =
        err instanceof Error ? err.message : 'No se pudo cargar el chat';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [bookingId, scrollToBottom]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load data
  useEffect(() => {
    if (isAuthenticated && bookingId) {
      loadData();
    }
  }, [isAuthenticated, bookingId, loadData]);

  // Polling — fetches new messages every 2 seconds (primary real-time mechanism)
  useEffect(() => {
    if (!isAuthenticated || !bookingId || loading) return;

    let active = true;

    const poll = async () => {
      if (!active) return;
      try {
        const res = await messagesApi.getHistory(bookingId, { limit: 50 });
        if (!active) return;
        const fetched = res.data;
        if (!fetched || fetched.length === 0) return;

        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = fetched.filter((m) => !existingIds.has(m.id));
          if (newMsgs.length > 0) {
            console.log(`[Handy Chat] ${newMsgs.length} new message(s) from poll`);
            const merged = [...prev, ...newMsgs].sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
            // Scroll after React renders the new messages
            setTimeout(() => scrollToBottom(), 50);
            return merged;
          }
          // If fetched count differs from current (e.g. messages were deleted), sync
          if (fetched.length !== prev.length) {
            return fetched.sort(
              (a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
          }
          return prev;
        });
      } catch (err) {
        console.warn('[Handy Chat] Poll error:', err);
      }
    };

    console.log('[Handy Chat] Polling started (every 2s)');
    // First poll immediately
    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      active = false;
      clearInterval(interval);
      console.log('[Handy Chat] Polling stopped');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, bookingId, loading]);

  // WebSocket connection for real-time messages
  useEffect(() => {
    if (!isAuthenticated || !bookingId) return;

    const token = localStorage.getItem('handy_access_token');
    if (!token) return;

    const socket = io(`${BACKEND_WS_URL}/chat`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Chat socket connected');
      setWsConnected(true);
      // Join the booking room
      socket.emit('chat:join', { bookingId });
    });

    socket.on('message:new', (message: ChatMessage) => {
      console.log('[Handy Chat] WS message:new received', message.id);
      if (message.bookingId === bookingId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
        scrollToBottom();
      }
    });

    socket.on('chat:typing', (data: { userId: string; isTyping: boolean }) => {
      if (data.userId !== user?.id) {
        setIsTyping(data.isTyping);
      }
    });

    socket.on('disconnect', () => {
      console.log('Chat socket disconnected');
      setWsConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      console.warn('Chat socket connection error:', err.message);
      setWsConnected(false);
    });

    return () => {
      socket.emit('chat:leave', { bookingId });
      socket.disconnect();
      socketRef.current = null;
      setWsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, bookingId]);

  // Send message
  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending) return;

    setSending(true);
    setInput('');

    // Optimistic UI: add message immediately
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      bookingId,
      senderId: user?.id || '',
      senderType: 'CUSTOMER',
      senderName: user?.name || null,
      senderAvatar: user?.avatarUrl || null,
      content,
      channel: 'APP',
      readAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom();

    try {
      const savedMessage = await messagesApi.send(bookingId, content);
      // Replace temp with saved
      setMessages((prev) =>
        prev.map((m) => (m.id === tempMessage.id ? savedMessage : m)),
      );
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      // Remove temp on error
      setMessages((prev) => prev.filter((m) => m.id !== tempMessage.id));
      setInput(content); // Restore input
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Typing indicator
  const handleInputChange = (value: string) => {
    setInput(value);
    if (socketRef.current) {
      socketRef.current.emit('chat:typing', {
        bookingId,
        isTyping: true,
      });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socketRef.current?.emit('chat:typing', {
          bookingId,
          isTyping: false,
        });
      }, 2000);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Cargando chat...</p>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <span className="text-5xl mb-4">😕</span>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">{error}</h2>
        <button
          onClick={() => router.back()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium mt-4"
        >
          ← Volver
        </button>
      </div>
    );
  }

  const otherParty = booking?.provider;
  const isChatActive = booking
    ? ['ACCEPTED', 'PROVIDER_ARRIVING', 'IN_PROGRESS'].includes(booking.status)
    : false;

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-indigo-600 text-white px-4 pt-12 pb-3 flex items-center gap-3 shrink-0 shadow-md">
        <button
          onClick={() => router.push(`/bookings/${bookingId}`)}
          className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors text-sm"
        >
          ←
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {otherParty?.avatarUrl ? (
            <img
              src={otherParty.avatarUrl}
              alt=""
              className="w-9 h-9 rounded-full object-cover border-2 border-white/30"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
              {(otherParty?.name || '?')[0]}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">
              {otherParty?.name || 'Proveedor'}
            </p>
            <p className="text-[10px] text-indigo-200 truncate flex items-center gap-1">
              {booking?.category?.icon} {booking?.category?.name || 'Servicio'}{' '}
              · #{bookingId.slice(0, 6)}
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'}`} title={wsConnected ? 'En vivo' : 'Actualizando...'} />
            </p>
          </div>
        </div>
        {/* Status pill */}
        {booking && (
          <div className="px-2 py-1 bg-white/20 rounded-full text-[10px] font-medium shrink-0">
            {booking.status === 'ACCEPTED' && '✅ Aceptado'}
            {booking.status === 'PROVIDER_ARRIVING' && '🚗 En camino'}
            {booking.status === 'IN_PROGRESS' && '🔧 En progreso'}
            {booking.status === 'COMPLETED' && '✓ Completado'}
          </div>
        )}
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <span className="text-4xl block mb-3">💬</span>
            <p className="text-sm text-gray-500">
              Inicia la conversación con tu proveedor
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Los mensajes se envían directamente a su WhatsApp
            </p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isMe = msg.senderId === user?.id;
          const isSystem = msg.senderType === 'SYSTEM';
          const prevMsg = idx > 0 ? messages[idx - 1] : null;

          // Show timestamp if first message or 5+ min gap
          const showTime =
            !prevMsg ||
            new Date(msg.createdAt).getTime() -
              new Date(prevMsg.createdAt).getTime() >
              5 * 60 * 1000;

          // Show sender name if different from previous
          const showSender =
            !isMe && !isSystem && (!prevMsg || prevMsg.senderId !== msg.senderId);

          return (
            <div key={msg.id}>
              {showTime && (
                <div className="text-center my-3">
                  <span className="text-[10px] text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm">
                    {formatMessageTime(msg.createdAt)}
                  </span>
                </div>
              )}

              {isSystem ? (
                <div className="text-center my-2">
                  <span className="text-xs text-gray-500 bg-gray-200/60 px-3 py-1.5 rounded-full">
                    {msg.content}
                  </span>
                </div>
              ) : (
                <div
                  className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-0.5`}
                >
                  <div
                    className={`max-w-[80%] ${
                      isMe
                        ? 'bg-indigo-600 text-white rounded-2xl rounded-br-md'
                        : 'bg-white text-gray-800 rounded-2xl rounded-bl-md shadow-sm'
                    } px-3.5 py-2`}
                  >
                    {showSender && (
                      <p
                        className={`text-[10px] font-semibold mb-0.5 ${
                          isMe ? 'text-indigo-200' : 'text-indigo-600'
                        }`}
                      >
                        {msg.senderName || 'Proveedor'}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                    </p>
                    <div
                      className={`flex items-center gap-1 mt-0.5 ${
                        isMe ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span
                        className={`text-[9px] ${
                          isMe ? 'text-indigo-300' : 'text-gray-400'
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {msg.channel === 'WHATSAPP' && !isMe && (
                        <span className="text-[9px] text-green-400">via WA</span>
                      )}
                      {isMe && msg.readAt && (
                        <span className="text-[9px] text-indigo-300">✓✓</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        {isTyping && (
          <div className="flex justify-start mb-1">
            <div className="bg-white text-gray-500 rounded-2xl rounded-bl-md shadow-sm px-4 py-2.5">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      {isChatActive ? (
        <div className="bg-white border-t border-gray-200 px-3 py-3 shrink-0 safe-bottom">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe un mensaje..."
              className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              maxLength={2000}
              autoComplete="off"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
                input.trim()
                  ? 'bg-indigo-600 text-white active:scale-90'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-200 border-t border-gray-300 px-4 py-4 text-center shrink-0 safe-bottom">
          <p className="text-sm text-gray-500">
            {booking?.status === 'COMPLETED' || booking?.status === 'RATED'
              ? '✅ Servicio completado — el chat está cerrado'
              : booking?.status === 'CANCELLED' || booking?.status === 'REJECTED'
                ? '❌ Solicitud cancelada — el chat está cerrado'
                : '⏳ El chat se activa cuando el proveedor acepte tu solicitud'}
          </p>
        </div>
      )}
    </div>
  );
}

function formatMessageTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );

  const time = date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffDays === 0) return `Hoy ${time}`;
  if (diffDays === 1) return `Ayer ${time}`;
  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

