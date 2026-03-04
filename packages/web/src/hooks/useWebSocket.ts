import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { useChatStore } from "@/stores/chat.store";
import { RATE_LIMITS, WS_CLOSE_CODES } from "@shared/constants";
import type { WSClientMessage, WSServerMessage, ChatMessage } from "@shared/types";

interface UseWebSocketOptions {
  enabled: boolean;
}

export function useWebSocket({ enabled }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const intentionalClose = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const token = useAuthStore((s) => s.token);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Use refs for store actions to keep connect() stable
  const logout = useAuthStore((s) => s.logout);
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const setConnected = useChatStore((s) => s.setConnected);

  const storeRef = useRef({ logout, addMessage, setTyping, setConnected });
  storeRef.current = { logout, addMessage, setTyping, setConnected };

  const connect = useCallback(() => {
    const currentToken = tokenRef.current;
    if (!enabledRef.current || !currentToken) return;

    // Don't connect if we already have an open/connecting socket
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalClose.current = false;

    // Connect directly to backend — Vite proxy can be flaky for long-lived WS
    const wsUrl = `ws://localhost:3000/ws?token=${currentToken}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Connected");
      storeRef.current.setConnected(true);
      reconnectAttempts.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data: WSServerMessage = JSON.parse(event.data);

        switch (data.type) {
          case "chat_response":
            storeRef.current.setTyping(false);
            if (data.message) {
              storeRef.current.addMessage(data.message);
            }
            break;

          case "typing_indicator":
            storeRef.current.setTyping(true);
            break;

          case "session_expired":
            intentionalClose.current = true;
            storeRef.current.logout();
            break;

          case "error":
            storeRef.current.setTyping(false);
            storeRef.current.addMessage({
              id: crypto.randomUUID(),
              role: "system",
              content: data.error || "Ha ocurrido un error. Inténtalo de nuevo.",
              responseType: "error",
              timestamp: Date.now(),
            });
            break;

          case "pong":
            break;
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    ws.onclose = (event) => {
      storeRef.current.setConnected(false);

      if (wsRef.current === ws) {
        wsRef.current = null;
      }

      // Don't reconnect if we closed intentionally or were kicked by server
      if (intentionalClose.current || event.code === WS_CLOSE_CODES.NORMAL) {
        return;
      }

      if (event.code === WS_CLOSE_CODES.AUTH_FAILED) {
        storeRef.current.logout();
        return;
      }

      // Exponential backoff reconnection for unexpected disconnects
      if (enabledRef.current && reconnectAttempts.current < RATE_LIMITS.MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          RATE_LIMITS.RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current),
          RATE_LIMITS.MAX_RECONNECT_DELAY_MS
        );
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
        reconnectTimer.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    ws.onerror = () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Stable — reads from refs

  const sendMessage = useCallback(
    (text: string) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.warn("[WS] Not connected, cannot send message");
        return;
      }

      const messageId = crypto.randomUUID();
      const userMessage: ChatMessage = {
        id: messageId,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      storeRef.current.addMessage(userMessage);
      storeRef.current.setTyping(true);

      const payload: WSClientMessage = {
        type: "chat_message",
        payload: text,
        messageId,
      };
      wsRef.current.send(JSON.stringify(payload));
    },
    []
  );

  // Connect when enabled+token change, cleanup on unmount
  useEffect(() => {
    if (enabled && token) {
      connect();
    }
    return () => {
      intentionalClose.current = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.close(WS_CLOSE_CODES.NORMAL);
        wsRef.current = null;
      }
    };
  }, [enabled, token, connect]);

  // Heartbeat ping every 30s
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const ping: WSClientMessage = { type: "ping" };
        wsRef.current.send(JSON.stringify(ping));
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { sendMessage };
}
