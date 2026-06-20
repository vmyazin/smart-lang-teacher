import type { ChatModel } from "../lib/providers/types";
import type { SkillItem } from "../domain/types";

const SYSTEM = `You generate ONE short, friendly conversation prompt for a language learner.
The prompt invites a 3-5 sentence spoken answer about their life or interests.
Keep it natural and open-ended. Return ONLY the prompt text, no preamble, no quotes.`;

export function dueItems(items: SkillItem[], now: Date): SkillItem[] {
  return items
    .filter(
      (i) =>
        i.status !== "mastered" &&
        new Date(i.next_review_at).getTime() <= now.getTime(),
    )
    .sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() -
        new Date(b.next_review_at).getTime(),
    );
}

export async function generatePrompt(input: {
  interests: string[];
  profile: SkillItem[];
  targetLang: string;
  now: Date;
  chat: ChatModel;
}): Promise<string> {
  const due = dueItems(input.profile, input.now);
  const user = `Target language: ${input.targetLang}
Learner interests: ${input.interests.join(", ") || "(unknown)"}
Weak areas to softly elicit (do NOT mention these to the learner): ${
    due.map((d) => `${d.category}/${d.label}`).join(", ") || "(none)"
  }`;

  const text = await input.chat.generate({ system: SYSTEM, user });
  return text.trim();
}
