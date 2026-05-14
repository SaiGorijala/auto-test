/**
 * hooks/useSocket.js
 *
 * Manages a Socket.IO connection for a specific deployment room.
 *
 * Features:
 *   • Auto-reconnect (socket.io-client built-in)
 *   • On every (re)connect → calls GET /api/deploy/:id/logs?from=lastId
 *     to replay any logs that arrived while the socket was down.
 *   • Exposes `connected` flag for UI indicators.
 *   • Cleans up on unmount or when deploymentId changes.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || '';

export function useSocket({ deploymentId, onLog, onPhase, onStatus, enabled = true }) {
  const [connected, setConnected] = useState(false);
  const socketRef   = useRef(null);
  const lastIdRef   = useRef(0);       // tracks highest log.id received
  const onLogRef    = useRef(onLog);
  const onPhaseRef  = useRef(onPhase);
  const onStatusRef = useRef(onStatus);

  // Keep callback refs current without re-running the effect
  useEffect(() => { onLogRef.current   = onLog;    }, [onLog]);
  useEffect(() => { onPhaseRef.current = onPhase;  }, [onPhase]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const fetchMissedLogs = useCallback(async () => {
    if (!deploymentId) return;
    try {
      const from = lastIdRef.current;
      const res  = await fetch(`${API_BASE}/api/deploy/${deploymentId}/logs?from=${from}&limit=500`);
      if (!res.ok) return;
      const data = await res.json();
      data.logs.forEach(entry => {
        onLogRef.current?.(entry);
        if (entry.id > lastIdRef.current) lastIdRef.current = entry.id;
      });
    } catch (e) {
      console.warn('[useSocket] fetchMissedLogs failed:', e.message);
    }
  }, [deploymentId]);

  useEffect(() => {
    if (!deploymentId || !enabled) return;

    const socket = io(API_BASE || window.location.origin, {
      reconnection:         true,
      reconnectionDelay:    1_000,
      reconnectionDelayMax: 8_000,
      reconnectionAttempts: 20,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join', deploymentId);
      // Replay any logs missed during the disconnection window
      fetchMissedLogs();
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('log', entry => {
      onLogRef.current?.(entry);
      if (entry.id && entry.id > lastIdRef.current) lastIdRef.current = entry.id;
    });

    socket.on('phase',  data => onPhaseRef.current?.(data));
    socket.on('status', data => onStatusRef.current?.(data));

    return () => {
      socket.emit('leave', deploymentId);
      socket.disconnect();
      setConnected(false);
    };
  }, [deploymentId, enabled, fetchMissedLogs]);

  return { connected };
}
