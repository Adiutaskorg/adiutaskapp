// ============================================
// Shared types for WebSocket communication
// Used by both client (PWA) and server (Bun)
// ============================================

/** Direction of the message in the chat */
export type MessageRole = "user" | "bot" | "system";

/** Visual type of bot response for rich rendering */
export type ResponseType =
  | "text"
  | "grades_table"
  | "assignment_card"
  | "file_list"
  | "calendar_event"
  | "quick_actions"
  | "error";

/** A single chat message */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  responseType?: ResponseType;
  metadata?: MessageMetadata;
  timestamp: number;
}

/** Structured metadata attached to bot responses */
export interface MessageMetadata {
  /** For grades_table */
  grades?: GradeEntry[];
  /** For assignment_card */
  assignment?: AssignmentInfo;
  /** For file_list */
  files?: FileInfo[];
  /** For calendar_event */
  events?: CalendarEvent[];
  /** For quick_actions */
  actions?: QuickAction[];
  /** Which routing tier resolved this */
  resolvedBy?: "keyword" | "fuzzy" | "context" | "llm" | "system";
  /** Processing time in ms */
  processingTime?: number;
}

// --- Domain models ---

export interface GradeEntry {
  courseName: string;
  assignmentName: string;
  score: number | null;
  maxScore: number;
  grade?: string;
  submittedAt?: string;
}

export interface AssignmentInfo {
  id: string;
  name: string;
  courseName: string;
  dueAt: string | null;
  pointsPossible: number;
  status: "upcoming" | "overdue" | "submitted" | "graded";
  description?: string;
  submissionUrl?: string;
}

export interface FileInfo {
  id: string;
  name: string;
  courseName: string;
  size: number;
  contentType: string;
  url: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  courseName?: string;
  startAt: string;
  endAt?: string;
  type: "assignment" | "event" | "exam";
  location?: string;
}

export interface QuickAction {
  id: string;
  label: string;
  icon?: string;
  /** The message to send when the action is tapped */
  payload: string;
}

// --- WebSocket protocol ---

/** Client → Server */
export interface WSClientMessage {
  type: "chat_message" | "typing" | "ping";
  payload?: string;
  messageId?: string;
}

/** Server → Client */
export interface WSServerMessage {
  type:
    | "chat_response"
    | "typing_indicator"
    | "pong"
    | "error"
    | "session_expired";
  message?: ChatMessage;
  error?: string;
}
