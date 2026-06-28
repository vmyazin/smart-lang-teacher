import type { ChatModel } from "../lib/providers/types";
import type { SkillItem } from "../domain/types";

const SYSTEM = `You generate ONE short, friendly conversation prompt for a language learner.

LENGTH: at most two brief sentences, around 20-30 words. One compact question plus a tiny follow-up invitation.
- NO long wind-ups or em-dash elaborations.
- Don't stack multiple sub-questions; ask one main thing.
- It should invite a few spoken sentences about the learner's life or interests.

BE CREATIVE — this is the priority. Generic openers like "Tell me about your hobby" or
"Do you like cooking?" are boring and forgettable. Instead, pick a SPECIFIC, vivid angle, and
rotate which angle you use each time so prompts never feel like a template with the noun swapped:
- a concrete scenario or a memorable moment ("the last time…", "a time when…")
- a strong opinion or a friendly debate ("what's overrated/underrated about…")
- a hypothetical ("if you could… / what would you do if…")
- a small recent win, struggle, or surprise
- an unexpected detail, ritual, or trade-off within the interest
- occasionally connect TWO of the learner's interests in a surprising way

Avoid repeating or closely paraphrasing any recent prompts you're given — choose a different
interest or a clearly different angle from them.

Examples (target language Portuguese), note the varied angles:
"No jiu-jitsu, qual foi a finalização que mais te deu trabalho pra aprender? Conta como foi sacar ela."
"Se você só pudesse cozinhar um prato pelo resto do mês, qual seria? Me convence de que vale a pena."
"Qual bug recente te tirou o sono e como você descobriu a solução? Quero os detalhes."

Return ONLY the prompt text, no preamble, no quotes.`;

/** How freely to pitch vocabulary and structure for the learner's chosen level. */
export function levelGuidance(level?: string | null): string {
  switch ((level ?? "").trim().toLowerCase()) {
    case "beginner":
      return "Beginner: use only simple, common words and short, basic sentence structures. Avoid idioms, slang, and complex tenses.";
    case "advanced":
      return "Advanced: no vocabulary limits — use rich, natural, idiomatic language; nuanced or sophisticated phrasing is welcome.";
    case "intermediate":
    default:
      return "Intermediate: use everyday vocabulary with some variety (a few less-common words and natural phrasing are fine); keep structures moderate.";
  }
}

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
  level?: string | null;
  now: Date;
  chat: ChatModel;
  recentPrompts?: string[];
}): Promise<string> {
  const due = dueItems(input.profile, input.now);
  const recent = (input.recentPrompts ?? []).filter((p) => p && p.trim());
  const recentBlock = recent.length
    ? recent.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : "(none yet)";
  const user = `Target language: ${input.targetLang}
Learner interests: ${input.interests.join(", ") || "(unknown)"}
Vocabulary level — match the prompt's words and grammar to this:
${levelGuidance(input.level)}
Weak areas to softly elicit (do NOT mention these to the learner): ${
    due.map((d) => `${d.category}/${d.label}`).join(", ") || "(none)"
  }
Recent prompts already asked (do NOT repeat or echo these — pick a fresh topic or angle):
${recentBlock}`;

  const text = await input.chat.generate({ system: SYSTEM, user });
  return text.trim();
}
