export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
