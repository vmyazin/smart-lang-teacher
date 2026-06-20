import type { Db } from "./db";
import type { Issue, Lesson, SkillItem, User, VoicedPhrase } from "../domain/types";

function rowToUser(row: any): User {
  return {
    id: row.id,
    display_name: row.display_name,
    native_lang: row.native_lang,
    target_lang: row.target_lang,
    interests: JSON.parse(row.interests),
    level: row.level,
  };
}

export function createRepository(db: Db) {
  return {
    createUser(input: { display_name: string; passcode_hash: string }): User {
      const info = db
        .prepare(
          "INSERT INTO users (display_name, passcode_hash) VALUES (?, ?)",
        )
        .run(input.display_name, input.passcode_hash);
      return this.getUser(Number(info.lastInsertRowid))!;
    },

    findUserByName(name: string): (User & { passcode_hash: string }) | null {
      const row = db
        .prepare("SELECT * FROM users WHERE display_name = ?")
        .get(name) as any;
      if (!row) return null;
      return { ...rowToUser(row), passcode_hash: row.passcode_hash };
    },

    getUser(id: number): User | null {
      const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
      return row ? rowToUser(row) : null;
    },

    updateUserProfile(
      id: number,
      p: { native_lang: string; target_lang: string; interests: string[]; level: string },
    ): void {
      db.prepare(
        "UPDATE users SET native_lang=?, target_lang=?, interests=?, level=? WHERE id=?",
      ).run(p.native_lang, p.target_lang, JSON.stringify(p.interests), p.level, id);
    },

    createSession(userId: number, startedAt: string): number {
      const info = db
        .prepare("INSERT INTO sessions (user_id, started_at) VALUES (?, ?)")
        .run(userId, startedAt);
      return Number(info.lastInsertRowid);
    },

    createTurn(input: {
      session_id: number;
      prompt_text: string;
      created_at: string;
    }): number {
      const info = db
        .prepare(
          "INSERT INTO turns (session_id, prompt_text, created_at) VALUES (?, ?, ?)",
        )
        .run(input.session_id, input.prompt_text, input.created_at);
      return Number(info.lastInsertRowid);
    },

    updateTurn(id: number, p: { audio_path?: string; transcript?: string }): void {
      if (p.audio_path !== undefined)
        db.prepare("UPDATE turns SET audio_path=? WHERE id=?").run(p.audio_path, id);
      if (p.transcript !== undefined)
        db.prepare("UPDATE turns SET transcript=? WHERE id=?").run(p.transcript, id);
    },

    saveDiagnosis(turnId: number, issues: Issue[]): void {
      db.prepare("INSERT INTO diagnoses (turn_id, issues) VALUES (?, ?)").run(
        turnId,
        JSON.stringify(issues),
      );
    },

    saveLesson(turnId: number, lesson: Lesson, voicedPhrases: VoicedPhrase[]): void {
      db.prepare(
        "INSERT INTO lessons (turn_id, content, voiced_phrases) VALUES (?, ?, ?)",
      ).run(turnId, JSON.stringify(lesson), JSON.stringify(voicedPhrases));
    },

    getSkillItems(userId: number): SkillItem[] {
      return db
        .prepare("SELECT * FROM skill_items WHERE user_id = ?")
        .all(userId) as SkillItem[];
    },

    replaceSkillItems(userId: number, items: SkillItem[]): void {
      const tx = db.transaction(() => {
        db.prepare("DELETE FROM skill_items WHERE user_id = ?").run(userId);
        const stmt = db.prepare(
          `INSERT INTO skill_items
           (user_id, category, label, description, severity, occurrences,
            first_seen, last_seen, status, next_review_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const it of items) {
          stmt.run(
            userId,
            it.category,
            it.label,
            it.description,
            it.severity,
            it.occurrences,
            it.first_seen,
            it.last_seen,
            it.status,
            it.next_review_at,
          );
        }
      });
      tx();
    },
  };
}

export type Repository = ReturnType<typeof createRepository>;
