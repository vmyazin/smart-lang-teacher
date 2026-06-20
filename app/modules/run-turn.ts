import type { Repository } from "../lib/repository";
import type { ChatModel, SpeechToText, TextToSpeech } from "../lib/providers/types";
import type { Lesson, User, VoicedPhrase } from "../domain/types";
import { diagnose } from "./diagnostician";
import { updateProfile } from "./profile-updater";
import { composeLesson } from "./lesson-composer";

export async function runTurn(input: {
  repo: Repository;
  user: User;
  sessionId: number;
  turnId: number;
  promptText: string;
  audio: Buffer;
  chat: ChatModel;
  stt: SpeechToText;
  tts: TextToSpeech;
  now: Date;
  saveAudio: (bytes: Buffer) => Promise<string>;
}): Promise<{ transcript: string; lesson: Lesson; voicedPhrases: VoicedPhrase[] }> {
  const { repo, user, turnId } = input;
  const targetLang = user.target_lang ?? "en";
  const nativeLang = user.native_lang ?? "en";

  const audioPath = await input.saveAudio(input.audio);
  const transcript = await input.stt.transcribe(input.audio, {
    language: targetLang,
  });
  repo.updateTurn(turnId, { audio_path: audioPath, transcript });

  if (transcript.trim().length === 0) {
    const lesson: Lesson = {
      intro: "I couldn't quite hear that — try recording a bit more.",
      points: [],
    };
    repo.saveLesson(turnId, lesson, []);
    return { transcript, lesson, voicedPhrases: [] };
  }

  const profile = repo.getSkillItems(user.id);
  const issues = await diagnose({
    transcript,
    targetLang,
    nativeLang,
    profile,
    chat: input.chat,
  });
  repo.saveDiagnosis(turnId, issues);

  const updated = updateProfile(profile, issues, input.now);
  repo.replaceSkillItems(user.id, updated);

  const lesson = await composeLesson({
    issues,
    nativeLang,
    targetLang,
    chat: input.chat,
  });

  const voicedPhrases: VoicedPhrase[] = [];
  for (const point of lesson.points) {
    try {
      const bytes = await input.tts.synthesize(point.phrase, {
        language: targetLang,
      });
      const path = await input.saveAudio(bytes);
      voicedPhrases.push({ text: point.phrase, audio_path: path });
    } catch {
      /* best-effort */ console.warn("TTS synthesis failed for a phrase");
      voicedPhrases.push({ text: point.phrase, audio_path: null });
    }
  }

  repo.saveLesson(turnId, lesson, voicedPhrases);
  return { transcript, lesson, voicedPhrases };
}
