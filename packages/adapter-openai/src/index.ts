import OpenAI from "openai";

export interface StewardBriefClientOptions {
  readonly apiKey: string;
}

export function createStewardBriefClient(
  options: StewardBriefClientOptions,
): OpenAI {
  return new OpenAI({ apiKey: options.apiKey });
}
