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

export type LlmProvider = "gemini" | "openai" | "anthropic";

export interface ByokConfig {
  provider: LlmProvider;
  keys: {
    gemini?: string;
    openai?: string;
    anthropic?: string;
  };
  // Model identifiers per provider (Vercel AI SDK syntax)
  chatModel: string;
  loreModel: string;   // cheap/fast model for the lorebook updater
  embedModel: string;  // OpenAI text-embedding-3-small for now (used by all providers,
                       // since gemini embeddings have a different dim — see README for notes)
}

// Form payload for the New Campaign setup modal
export interface NewCampaignInput {
  title: string;
  worldDescription: string;
  userPersona: string;
  aiPersona: string;
  startingState?: Record<string, unknown>;
}
