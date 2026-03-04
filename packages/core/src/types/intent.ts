export type Intent =
  | { type: "courses" }
  | { type: "assignments"; courseName?: string; onlyPending?: boolean }
  | { type: "grades"; courseName?: string }
  | { type: "calendar"; days?: number }
  | { type: "announcements"; courseName?: string }
  | { type: "files"; courseName?: string; fileExtension?: string }
  | { type: "help" }
  | { type: "greeting" }
  | { type: "link_account" }
  | { type: "unlink_account" }
  | { type: "status" }
  | { type: "unknown" };

export interface ClassifyResult {
  intents: Intent[];
  courseName?: string;
}
