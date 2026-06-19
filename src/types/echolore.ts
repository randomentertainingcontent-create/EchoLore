// EchoLore shared types
// These mirror the Prisma models 1:1 and are used across client + server.

export type MessageRole = "user" | "assistant" | "system";

export interface Campaign {
  id: string;
  userId: string;
  title: string;
  worldDescription: string;
  userPersona: string;
  aiPersona: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Message {
  id: string;
  campaignId: string;
  role: MessageRole;
  content: string;
  createdAt: string; // ISO
}

export interface WorldState {
  campaignId: string;
  stateJson: Record<string, unknown>;
  updatedAt: string;
}

// --- BYOK (Bring Your Own Key) ---

// EchoLore uses TWO keys:
//   - OpenRouter (https://openrouter.ai) for chat + lorebook — one key gives
//     access to hundreds of models including free ones.
//   - Jina AI (https://jina.ai) for embeddings — free tier, 1024-dim by default.
//
// Why two keys? OpenRouter doesn't natively host an embeddings endpoint that's
// both free and stable, so we route embeddings through Jina's generous free API.
// Both keys live in localStorage only — never persisted server-side.
export interface ByokConfig {
  openrouterKey: string;
  jinaKey: string;
  chatModel: string;     // OpenRouter model id, e.g. "meta-llama/llama-3.2-3b-instruct:free"
  loreModel: string;     // OpenRouter model id (cheap/fast for lorebook updates)
  embedModel: string;    // Jina model name, e.g. "jina-embeddings-v3"
  embedDimensions: number; // Jina supports dimension truncation; we use 1024
}

// Form payload for the New Campaign setup modal
export interface NewCampaignInput {
  title: string;
  worldDescription: string;
  userPersona: string;
  aiPersona: string;
  startingState?: Record<string, unknown>;
}

// --- RAG pipeline types (server-side) ---

export interface RetrievedMemory {
  id: string;
  messageId: string;
  content: string;
  similarity: number;
}

export interface CompiledPrompt {
  system: string;
  // ModelMessage-shaped ({role, content}) — passed directly to streamText
  messages: { role: MessageRole; content: string }[];
}
