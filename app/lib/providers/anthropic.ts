import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ChatModel } from "./types";

export function createAnthropicChatModel(
  client: Anthropic,
  model = "claude-sonnet-4-6",
): ChatModel {
  return {
    async parse({ system, user, schema, thinking }) {
      const res = await client.messages.parse({
        model,
        max_tokens: 4096,
        system,
        ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
        messages: [{ role: "user", content: user }],
        output_config: { format: zodOutputFormat(schema as any) },
      });
      if (res.parsed_output == null) {
        throw new Error(`No parsed output (stop_reason=${res.stop_reason})`);
      }
      return res.parsed_output as any;
    },

    async generate({ system, user }) {
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      });
      const block = res.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") {
        throw new Error(`No text in response (stop_reason=${res.stop_reason})`);
      }
      return block.text;
    },
  };
}
