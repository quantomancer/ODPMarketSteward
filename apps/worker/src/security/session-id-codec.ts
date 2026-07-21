export interface SessionIdCodec {
  issue(): Promise<string>;
  verify(candidate: string): Promise<boolean>;
}

export const sessionIdCodecStatus = "PORT_DEFINED_PENDING_DLD_004" as const;
