import type { ChatModel } from "../lib/providers/types";
import type { SkillItem } from "../domain/types";

const SYSTEM = `You generate ONE short, friendly conversation prompt for a language learner.

Keep it SHORT — at most two brief sentences, and aim for around 20-30 words total.
Prefer one compact question plus a tiny follow-up invitation. Be concise and natural:
- NO long wind-ups or em-dash elaborations (don't tack on "— como surgiu a ideia e no que você está trabalhando").
- Don't stack multiple sub-questions; ask one main thing.
- It should still invite a few spoken sentences about the learner's life or interests.

Example of the right length and shape (target language Portuguese):
"Você está aprendendo a programar algo novo ou trabalhando em algum projeto pessoal que te anima? Me conta como surgiu a ideia!"

Return ONLY the prompt text, no preamble, no quotes.`;

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
