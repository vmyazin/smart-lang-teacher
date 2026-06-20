import type { ChatModel } from "../lib/providers/types";
import { LessonSchema } from "../domain/schemas";
import type { Issue, Lesson, Severity } from "../domain/types";

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

const SYSTEM = `You are a supportive but measured language tutor.
You receive a few issues a learner made. DO NOT correct them harshly or list errors.
Open with brief, sincere encouragement, but keep the tone reserved and understated:
no superlatives ("fantastic", "amazing", "beautifully"), no exclamation marks, no gushing.
Plain, calm affirmation is the goal. Example of the right tone:
"You're doing great expressing yourself in Portuguese. I can see your ideas are coming
through and your vocabulary is growing."
Then teach 1-3 points framed positively ("here's a way to sound more natural",
"a shortcut native speakers use"). Write the explanation (and the encouragement) in the
learner's NATIVE language. For each point include one short example "phrase" in the TARGET
language they can hear and repeat.`;

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
      intro: "That came through clearly. Nothing to flag this time.",
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
