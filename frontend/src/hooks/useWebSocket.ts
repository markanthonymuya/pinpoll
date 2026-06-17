'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsEvent } from '@/lib/types';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:4000';

export function useWebSocket(code: string, onEvent: (e: WsEvent) => void) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const retryDelay = useRef(1000);
  const wsRef = useRef<WebSocket | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', code }));
      setConnected(true);
      retryDelay.current = 1000;
    };

    ws.onmessage = (evt) => {
      try {
        const data: WsEvent = JSON.parse(evt.data as string);
        onEventRef.current(data);
      } catch (_) {}
    };

    ws.onclose = () => {
      setConnected(false);
      if (!unmounted.current) {
        setTimeout(connect, retryDelay.current);
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
      }
    };

    ws.onerror = () => ws.close();
  }, [code]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
