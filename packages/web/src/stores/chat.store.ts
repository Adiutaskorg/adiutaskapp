import { create } from "zustand";
import type { ChatMessage, QuickAction } from "@shared/types";
import { DEFAULT_QUICK_ACTIONS } from "@shared/constants";

type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  quickActions: QuickAction[];

  addMessage: (message: ChatMessage) => void;
  setTyping: (typing: boolean) => void;
  setConnected: (connected: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setQuickActions: (actions: QuickAction[]) => void;
  clearMessages: () => void;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "bot",
  content:
    "¡Hola! 👋 Soy adiutask, tu asistente académico. Puedo ayudarte a consultar notas, ver próximas entregas, buscar archivos de tus cursos y mucho más. ¿En qué te puedo ayudar?",
  responseType: "text",
  timestamp: Date.now(),
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [WELCOME_MESSAGE],
  isTyping: false,
  isConnected: false,
  connectionStatus: "disconnected",
  quickActions: [...DEFAULT_QUICK_ACTIONS],

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setTyping: (isTyping) => set({ isTyping }),
  setConnected: (isConnected) =>
    set({
      isConnected,
      connectionStatus: isConnected ? "connected" : "disconnected",
    }),
  setConnectionStatus: (connectionStatus) =>
    set({
      connectionStatus,
      isConnected: connectionStatus === "connected",
    }),
  setQuickActions: (quickActions) => set({ quickActions }),
  clearMessages: () => set({ messages: [WELCOME_MESSAGE] }),
}));
