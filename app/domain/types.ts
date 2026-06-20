export type Dimension =
  | "grammar"
  | "word_choice"
  | "naturalness"
  | "idiom"
  | "register";

export type Severity = "low" | "medium" | "high";
export type SkillStatus = "active" | "improving" | "mastered";

export interface Issue {
  dimension: Dimension;
  severity: Severity;
  snippet: string;
  natural_version: string;
  explanation: string;
  tags: string[];
}

export interface SkillItem {
  id: number;
  user_id: number;
  category: Dimension;
  label: string;
  description: string;
  severity: Severity;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  status: SkillStatus;
  next_review_at: string;
}

export interface User {
  id: number;
  display_name: string;
  native_lang: string | null;
  target_lang: string | null;
  interests: string[];
  level: string | null;
}

export interface VoicedPhrase {
  text: string;
  audio_path: string | null;
}

export interface LessonPoint {
  title: string;
  body: string;
  phrase: string;
}

export interface Lesson {
  intro: string;
  points: LessonPoint[];
}
