import type { Campaign, RetrievedMemory, Message, CompiledPrompt, MessageRole } from "@/types/echolore";

/**
 * The Prompt Compiler — EchoLore's secret sauce.
 *
 * Assembles the mega-prompt in this exact order:
 *   1. Core Directive
 *   2. World & Personas
 *   3. World State (raw JSON from the lorebook)
 *   4. Retrieved Memories (top 5 vectorized past events)
 *   5. Working Memory (last 5 raw messages) — passed as actual message history
 *   6. User Input — passed as the final user message
 *
 * The Vercel AI SDK uses `system` as the system prompt and `messages` as the
 * chat history. Items 5 and 6 become the messages array; items 1–4 become
 * the system prompt.
 */

const CORE_DIRECTIVE = `You are an immersive AI roleplayer. Stay in character at all times. Use the provided World, User Persona, and your Role to generate the next response.

Rules:
- Never break the fourth wall or refer to yourself as an AI language model.
- Use the World State JSON to track location, inventory, health, quests, and any other state the user has defined. Treat it as ground truth.
- Reference Past Events naturally when relevant — they happened earlier in the story.
- Match the tone of the World Description. Be vivid, specific, and sensory.
- Drive the story forward. Present choices, consequences, and stakes.
- Do not act for the user. End your turn when it's the user's move.
- If the user takes an action that should change the World State (picks up an item, moves to a new location, takes damage, gains a quest), reflect that in your narration — the lorebook updater will catch it.`;

export function compilePrompt(args: {
  campaign: Pick<Campaign, "worldDescription" | "userPersona" | "aiPersona">;
  worldState: Record<string, unknown> | null;
  memories: RetrievedMemory[];
  workingMemory: Message[]; // last 5 raw messages, oldest → newest
  userMessage: string;
}): CompiledPrompt {
  const { campaign, worldState, memories, workingMemory, userMessage } = args;

  const sections: string[] = [CORE_DIRECTIVE];

  // 2. World & Personas
  sections.push(`# World
${campaign.worldDescription}

# User Persona
${campaign.userPersona}

# Your Role
${campaign.aiPersona}`);

  // 3. World State
  const stateJson = worldState
    ? JSON.stringify(worldState, null, 2)
    : "{}";
  sections.push(`# World State (current lorebook — treat as ground truth)
\`\`\`json
${stateJson}
\`\`\``);

  // 4. Retrieved Memories
  if (memories.length > 0) {
    const memoryBlock = memories
      .map((m, i) => `### Past Event ${i + 1} (similarity ${(m.similarity * 100).toFixed(1)}%)
${m.content}`)
      .join("\n\n");
    sections.push(`# Past Events (retrieved from memory — these happened earlier in the story)
${memoryBlock}`);
  } else {
    sections.push(`# Past Events
(none yet — this is the start of the story)`);
  }

  const system = sections.join("\n\n---\n\n");

  // 5 + 6. Working memory as message history + current user input
  const messages: { role: MessageRole; content: string }[] = workingMemory.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  messages.push({ role: "user", content: userMessage });

  return { system, messages };
}
