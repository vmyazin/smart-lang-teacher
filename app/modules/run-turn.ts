import type { Repository } from "../lib/repository";
import type { ChatModel, SpeechToText, TextToSpeech } from "../lib/providers/types";
import type { StageLogger } from "../lib/log.server";
import type { Lesson, User, VoicedPhrase } from "../domain/types";
import { diagnose } from "./diagnostician";
import { updateProfile } from "./profile-updater";
import { composeLesson } from "./lesson-composer";

const noopLog: StageLogger = () => {};

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
  log?: StageLogger;
}): Promise<{ transcript: string; lesson: Lesson; voicedPhrases: VoicedPhrase[] }> {
  const { repo, user, turnId } = input;
  const log = input.log ?? noopLog;
  const targetLang = user.target_lang ?? "en";
  const nativeLang = user.native_lang ?? "en";

  const audioPath = await input.saveAudio(input.audio);
  log("audio saved", { bytes: input.audio.length, path: audioPath });

  log("transcribe: start");
  const transcript = await input.stt.transcribe(input.audio, {
    language: targetLang,
  });
  log("transcribe: done", { chars: transcript.trim().length });
  repo.updateTurn(turnId, { audio_path: audioPath, transcript });

  if (transcript.trim().length === 0) {
    log("transcript empty — short-circuiting");
    const lesson: Lesson = {
      intro: "I couldn't quite hear that — try recording a bit more.",
      points: [],
    };
    repo.saveLesson(turnId, lesson, []);
    return { transcript, lesson, voicedPhrases: [] };
  }

  const profile = repo.getSkillItems(user.id);
  log("diagnose: start", { profileItems: profile.length });
  const issues = await diagnose({
    transcript,
    targetLang,
    nativeLang,
    profile,
    chat: input.chat,
  });
  log("diagnose: done", { issues: issues.length });
  repo.saveDiagnosis(turnId, issues);

  const updated = updateProfile(profile, issues, input.now);
  repo.replaceSkillItems(user.id, updated);
  log("profile updated", { items: updated.length });

  log("compose lesson: start");
  const lesson = await composeLesson({
    issues,
    nativeLang,
    targetLang,
    chat: input.chat,
  });
  log("compose lesson: done", { points: lesson.points.length });

  const voicedPhrases: VoicedPhrase[] = [];
  for (const [i, point] of lesson.points.entries()) {
    try {
      log("tts: start", { phrase: i + 1, of: lesson.points.length });
      const bytes = await input.tts.synthesize(point.phrase, {
        language: targetLang,
      });
      const path = await input.saveAudio(bytes);
      voicedPhrases.push({ text: point.phrase, audio_path: path });
      log("tts: done", { phrase: i + 1 });
    } catch (err) {
      log("tts: failed (best-effort)", { phrase: i + 1, message: String(err) });
      voicedPhrases.push({ text: point.phrase, audio_path: null });
    }
  }

  repo.saveLesson(turnId, lesson, voicedPhrases);
  return { transcript, lesson, voicedPhrases };
}
