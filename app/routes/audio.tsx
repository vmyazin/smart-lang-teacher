import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { Route } from "./+types/audio";

export async function loader({ params }: Route.LoaderArgs) {
  const name = params.name ?? "";

  // Path-traversal guard: reject anything that is not a plain filename
  if (!name || basename(name) !== name || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const audioDir = process.env.AUDIO_DIR ?? "data/audio";
  const filePath = join(audioDir, name);

  if (!existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = readFileSync(filePath);
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "audio/webm" },
  });
}
