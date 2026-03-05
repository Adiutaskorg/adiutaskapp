export interface UserProfile {
  id: number;
  name: string;
  email: string;
}

export interface Course {
  id: number;
  name: string;
  course_code: string;
}

export interface Assignment {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  submission_types: string[];
  published: boolean;
  description: string | null;
  html_url: string | null;
  lock_at: string | null;
}

export interface Grades {
  course_name: string;
  current_score: number | null;
  current_grade: string | null;
  final_score: number | null;
}

export interface CalendarEvent {
  title: string;
  start_at: string | null;
  end_at: string | null;
  type: string;
  course_name: string | null;
  description: string | null;
  location: string | null;
}

export interface Announcement {
  title: string;
  message: string;
  posted_at: string;
  course_name: string | null;
  url: string | null;
}

export interface CourseFile {
  id: number;
  display_name: string;
  size: number;
  url: string;
  updated_at: string;
  content_type: string;
}

export interface CourseFolder {
  id: number;
  name: string;
  full_name: string;
  parent_folder_id: number | null;
  files_count: number;
  folders_count: number;
}
