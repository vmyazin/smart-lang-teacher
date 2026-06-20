import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileBasename } from "./paths";

/**
 * Best-effort delete of saved audio files by basename within AUDIO_DIR.
 * Only the basename of each path is joined to the audio directory (no traversal),
 * missing files are skipped, and unlink errors never throw — callers use this for
 * cleanup that must not fail the surrounding operation.
 */
export function unlinkAudioFiles(paths: string[]): void {
  const dir = process.env.AUDIO_DIR ?? "data/audio";
  for (const p of paths) {
    const fp = join(dir, fileBasename(p));
    if (existsSync(fp)) {
      try {
        unlinkSync(fp);
      } catch {
        /* best-effort */
      }
    }
  }
}
