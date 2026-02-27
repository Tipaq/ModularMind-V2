/**
 * SSE streaming hook — connects to Engine SSE endpoints.
 *
 * Replaces WebSocket streaming from V1.
 * Uses native EventSource with automatic reconnection via Last-Event-ID.
 */

import { useCallback, useRef, useState } from "react";

interface StreamEvent {
  type: string;
  id?: string;
  [key: string]: unknown;
}

export function useStreaming(url: string) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    const source = new EventSource(url, { withCredentials: true });
    sourceRef.current = source;

    source.onopen = () => setIsConnected(true);

    source.addEventListener("tokens", (e) => {
      setEvents((prev) => [...prev, JSON.parse(e.data)]);
    });

    source.addEventListener("trace", (e) => {
      setEvents((prev) => [...prev, JSON.parse(e.data)]);
    });

    source.addEventListener("complete", (e) => {
      setEvents((prev) => [...prev, JSON.parse(e.data)]);
      source.close();
      setIsConnected(false);
    });

    source.addEventListener("error", (e) => {
      setEvents((prev) => [...prev, JSON.parse((e as MessageEvent).data ?? "{}")]);
      source.close();
      setIsConnected(false);
    });

    source.onerror = () => {
      setIsConnected(false);
    };
  }, [url]);

  const disconnect = useCallback(() => {
    sourceRef.current?.close();
    setIsConnected(false);
  }, []);

  const reset = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, isConnected, connect, disconnect, reset };
}
