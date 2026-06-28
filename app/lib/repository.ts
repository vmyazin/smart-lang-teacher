import type { Db } from "./db";
import type {
  ApiProvider,
  Issue,
  Lesson,
  SkillItem,
  TurnDetail,
  TurnSummary,
  TurnStatus,
  User,
  VoicedPhrase,
} from "../domain/types";

export interface Credential {
  provider: ApiProvider;
  secret_enc: string;
  hint: string | null;
}

function rowToUser(row: any): User {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name ?? null,
    native_lang: row.native_lang,
    target_lang: row.target_lang,
    interests: JSON.parse(row.interests),
    level: row.level,
    current_prompt: row.current_prompt ?? null,
  };
}

export function createRepository(db: Db) {
  return {
    createUser(input: {
      email: string;
      password_hash: string;
      display_name?: string | null;
    }): User {
      const info = db
        .prepare(
          "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)",
        )
        .run(input.email, input.password_hash, input.display_name ?? null);
      return this.getUser(Number(info.lastInsertRowid))!;
    },

    findUserByEmail(email: string): (User & { password_hash: string }) | null {
      const row = db
        .prepare("SELECT * FROM users WHERE email = ?")
        .get(email) as any;
      if (!row) return null;
      return { ...rowToUser(row), password_hash: row.password_hash };
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

    setCurrentPrompt(userId: number, prompt: string | null): void {
      db.prepare("UPDATE users SET current_prompt = ? WHERE id = ?").run(prompt, userId);
    },

    /** The user's most recently shown prompts (answered or skipped), newest first. */
    recentPrompts(userId: number, limit: number): string[] {
      const rows = db
        .prepare(
          `SELECT t.prompt_text
           FROM turns t JOIN sessions s ON t.session_id = s.id
           WHERE s.user_id = ?
           ORDER BY t.id DESC
           LIMIT ?`,
        )
        .all(userId, limit) as { prompt_text: string }[];
      return rows.map((r) => r.prompt_text);
    },

    getCredential(userId: number, provider: ApiProvider): Credential | null {
      const row = db
        .prepare(
          "SELECT provider, secret_enc, hint FROM api_credentials WHERE user_id = ? AND provider = ?",
        )
        .get(userId, provider) as Credential | undefined;
      return row ?? null;
    },

    listCredentialHints(userId: number): { provider: ApiProvider; hint: string | null }[] {
      return db
        .prepare("SELECT provider, hint FROM api_credentials WHERE user_id = ?")
        .all(userId) as { provider: ApiProvider; hint: string | null }[];
    },

    upsertCredential(
      userId: number,
      provider: ApiProvider,
      secretEnc: string,
      hint: string,
      now: string,
    ): void {
      db.prepare(
        `INSERT INTO api_credentials (user_id, provider, secret_enc, hint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, provider) DO UPDATE SET
           secret_enc = excluded.secret_enc,
           hint = excluded.hint,
           updated_at = excluded.updated_at`,
      ).run(userId, provider, secretEnc, hint, now, now);
    },

    deleteCredential(userId: number, provider: ApiProvider): void {
      db.prepare(
        "DELETE FROM api_credentials WHERE user_id = ? AND provider = ?",
      ).run(userId, provider);
    },

    /** True if `basename` is an audio file referenced by a turn or lesson owned by the user. */
    ownsAudio(userId: number, basename: string): boolean {
      const like = `%${basename}`;
      const row = db
        .prepare(
          `SELECT 1
           FROM turns t
           JOIN sessions s ON t.session_id = s.id
           LEFT JOIN lessons l ON l.turn_id = t.id
           WHERE s.user_id = ?
             AND (
               t.audio_path LIKE ?
               OR EXISTS (
                 SELECT 1 FROM json_each(l.voiced_phrases) vp
                 WHERE json_extract(vp.value, '$.audio_path') LIKE ?
               )
             )
           LIMIT 1`,
        )
        .get(userId, like, like) as unknown;
      return row != null;
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
      status?: TurnStatus;
    }): number {
      const info = db
        .prepare(
          "INSERT INTO turns (session_id, prompt_text, created_at, status) VALUES (?, ?, ?, ?)",
        )
        .run(input.session_id, input.prompt_text, input.created_at, input.status ?? "answered");
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

    getTurnDetail(turnId: number, userId: number): TurnDetail | null {
      const row = db
        .prepare(
          `SELECT t.id, t.created_at, t.prompt_text, t.transcript, t.audio_path, t.status AS status,
                  d.issues AS issues, l.content AS lesson, l.voiced_phrases AS voiced
           FROM turns t
           JOIN sessions s  ON t.session_id = s.id
           LEFT JOIN diagnoses d ON d.turn_id = t.id
           LEFT JOIN lessons   l ON l.turn_id = t.id
           WHERE t.id = ? AND s.user_id = ?`,
        )
        .get(turnId, userId) as any;
      if (!row) return null;
      return {
        id: row.id,
        created_at: row.created_at,
        prompt_text: row.prompt_text,
        transcript: row.transcript,
        audio_path: row.audio_path,
        status: row.status,
        issues: row.issues ? JSON.parse(row.issues) : [],
        lesson: row.lesson ? JSON.parse(row.lesson) : null,
        voicedPhrases: row.voiced ? JSON.parse(row.voiced) : [],
      };
    },

    deleteTurn(turnId: number, userId: number): { audioPaths: string[] } | null {
      const owned = db
        .prepare(
          `SELECT t.id FROM turns t JOIN sessions s ON t.session_id = s.id
           WHERE t.id = ? AND s.user_id = ?`,
        )
        .get(turnId, userId) as { id: number } | undefined;
      if (!owned) return null;

      const turnRow = db.prepare("SELECT audio_path FROM turns WHERE id = ?").get(turnId) as
        | { audio_path: string | null }
        | undefined;
      const lessonRow = db.prepare("SELECT voiced_phrases FROM lessons WHERE turn_id = ?").get(turnId) as
        | { voiced_phrases: string }
        | undefined;

      const audioPaths: string[] = [];
      if (turnRow?.audio_path) audioPaths.push(turnRow.audio_path);
      if (lessonRow?.voiced_phrases) {
        for (const vp of JSON.parse(lessonRow.voiced_phrases) as VoicedPhrase[]) {
          if (vp.audio_path) audioPaths.push(vp.audio_path);
        }
      }

      const tx = db.transaction(() => {
        db.prepare("DELETE FROM lessons WHERE turn_id = ?").run(turnId);
        db.prepare("DELETE FROM diagnoses WHERE turn_id = ?").run(turnId);
        db.prepare("DELETE FROM turns WHERE id = ?").run(turnId);
      });
      tx();

      return { audioPaths };
    },

    listTurns(
      userId: number,
      opts: { search?: string; skill?: string } = {},
    ): TurnSummary[] {
      const where: string[] = ["s.user_id = ?"];
      const args: unknown[] = [userId];

      const search = opts.search?.trim();
      if (search) {
        const like = `%${search}%`;
        where.push("(t.prompt_text LIKE ? OR t.transcript LIKE ?)");
        args.push(like, like);
      }

      const skill = opts.skill?.trim();
      if (skill) {
        where.push(`EXISTS (
          SELECT 1 FROM diagnoses d2, json_each(d2.issues) je
          WHERE d2.turn_id = t.id
            AND ( json_extract(je.value, '$.dimension') = ?
                  OR EXISTS (SELECT 1 FROM json_each(json_extract(je.value, '$.tags')) tg
                             WHERE tg.value = ?) )
        )`);
        args.push(skill, skill);
      }

      const rows = db
        .prepare(
          `SELECT t.id, t.created_at, t.prompt_text, t.transcript, t.status AS status, d.issues AS issues
           FROM turns t
           JOIN sessions s ON t.session_id = s.id
           LEFT JOIN diagnoses d ON d.turn_id = t.id
           WHERE ${where.join(" AND ")}
           ORDER BY t.id DESC`,
        )
        .all(...args) as any[];

      return rows.map((r) => {
        const issues: Issue[] = r.issues ? JSON.parse(r.issues) : [];
        return {
          id: r.id,
          created_at: r.created_at,
          prompt_text: r.prompt_text,
          transcript: r.transcript,
          status: r.status,
          issueCount: issues.length,
          dimensions: [...new Set(issues.map((i) => i.dimension))],
        };
      });
    },

    listSkillFacets(userId: number): string[] {
      const rows = db
        .prepare(
          `SELECT d.issues AS issues
           FROM turns t
           JOIN sessions s ON t.session_id = s.id
           JOIN diagnoses d ON d.turn_id = t.id
           WHERE s.user_id = ?`,
        )
        .all(userId) as any[];
      const facets = new Set<string>();
      for (const r of rows) {
        for (const i of JSON.parse(r.issues) as Issue[]) {
          facets.add(i.dimension);
          for (const tag of i.tags) facets.add(tag);
        }
      }
      return [...facets].sort();
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
