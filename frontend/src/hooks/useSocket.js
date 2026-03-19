import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getTokens } from '../api/client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:4000';

export function useSocket(handlers = {}) {
  const socketRef   = useRef(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const { access } = getTokens();
    if (!access) return;

    const socket = io(WS_URL, {
      auth: { token: access },
      reconnectionAttempts: 5,
      reconnectionDelay:    2000,
    });

    socketRef.current = socket;

    socket.on('connect',       () => console.log('🔌 WS connected'));
    socket.on('disconnect',    () => console.log('🔌 WS disconnected'));
    socket.on('connect_error', (e) => console.warn('WS error:', e.message));

    // Register all event handlers
    const events = Object.keys(handlersRef.current);
    events.forEach(event => {
      socket.on(event, (...args) => handlersRef.current[event]?.(...args));
    });

    return () => { socket.disconnect(); };
  }, []); // only mount once

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { emit };
}