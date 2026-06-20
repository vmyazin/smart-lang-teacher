import type { ChatModel } from "../lib/providers/types";
import { IssueListSchema } from "../domain/schemas";
import type { Issue, SkillItem } from "../domain/types";

const SYSTEM = `You are a meticulous language-assessment analyst.
You receive a transcript of a learner speaking their target language.
Find EVERY way their production differs from a fluent native speaker across these
dimensions: grammar, word_choice, naturalness, idiom, register.
Judge nothing and teach nothing — only catalog issues.
For each issue give: the exact snippet, the natural_version a native would use,
a one-sentence explanation, and short tags. If the transcript is already native-like,
return an empty issues array.`;

export async function diagnose(input: {
  transcript: string;
  targetLang: string;
  nativeLang: string;
  profile: SkillItem[];
  chat: ChatModel;
}): Promise<Issue[]> {
  if (input.transcript.trim().length === 0) return [];

  const knownGaps = input.profile
    .map((s) => `- ${s.category}/${s.label} (${s.status})`)
    .join("\n");

  const user = `Target language: ${input.targetLang}
Learner's native language: ${input.nativeLang}
Known recurring gaps (pay extra attention, but report all new issues too):
${knownGaps || "(none yet)"}

Transcript:
"""
${input.transcript}
"""`;

  const result = await input.chat.parse({
    system: SYSTEM,
    user,
    schema: IssueListSchema,
    thinking: true,
  });
  return result.issues;
}
