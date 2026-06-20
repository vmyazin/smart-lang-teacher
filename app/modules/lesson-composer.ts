import type { ChatModel } from "../lib/providers/types";
import { LessonSchema } from "../domain/schemas";
import type { Issue, Lesson, Severity } from "../domain/types";

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const SYSTEM = `You are a warm, encouraging language tutor.
You receive a few issues a learner made. DO NOT correct them harshly or list errors.
Open with genuine encouragement, then teach 1-3 points framed positively
("here's a way to sound more natural", "a shortcut native speakers use").
Write the explanation in the learner's NATIVE language. For each point include one
short example "phrase" in the TARGET language they can hear and repeat.`;

export function selectTopIssues(issues: Issue[], limit = 3): Issue[] {
  return [...issues]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, limit);
}

export async function composeLesson(input: {
  issues: Issue[];
  nativeLang: string;
  targetLang: string;
  chat: ChatModel;
}): Promise<Lesson> {
  const top = selectTopIssues(input.issues);
  if (top.length === 0) {
    return {
      intro: "That sounded great — nothing to flag this time. Keep going!",
      points: [],
    };
  }

  const user = `Native language (write explanations in this): ${input.nativeLang}
Target language (write example phrases in this): ${input.targetLang}
Issues to teach gently:
${top
  .map(
    (i) =>
      `- [${i.dimension}] they said "${i.snippet}"; natural: "${i.natural_version}" (${i.explanation})`,
  )
  .join("\n")}`;

  return await input.chat.parse({
    system: SYSTEM,
    user,
    schema: LessonSchema,
  });
}
