import type { Disclaimer } from "@odp-market-steward/mcp-contracts";

export interface AcknowledgementKey {
  readonly id: string;
  readonly secret: Uint8Array;
}

export interface AcknowledgementPolicyIdentity {
  readonly policyVersion: string;
  readonly disclaimerStatement: string;
}

export interface AcknowledgementState {
  readonly policyVersion: string;
  readonly disclaimerDigest: string;
  readonly challengeNonceOrHash: string;
  readonly issuedAtUtc: string;
  readonly expiresAtUtc: string;
  readonly acknowledgedAtUtc: string;
  readonly replayState: "ACKNOWLEDGED";
}

export interface AcknowledgementStatePort {
  read(): Promise<AcknowledgementState | null>;
  transition<T>(
    operation: (current: AcknowledgementState | null) => {
      readonly next: AcknowledgementState | null;
      readonly result: T;
    },
  ): Promise<T>;
  clear(): Promise<void>;
}

export interface AcknowledgementServiceConfig {
  readonly sessionIdentifier: string;
  readonly currentKey: AcknowledgementKey;
  readonly previousKeys?: readonly AcknowledgementKey[];
  readonly challengeLifetimeSeconds: number;
  readonly maximumClockSkewSeconds: number;
  readonly state: AcknowledgementStatePort;
  readonly now?: () => Date;
  readonly randomBytes?: (length: number) => Uint8Array;
}

export interface IssuedAcknowledgementChallenge {
  readonly challengeToken: string;
  readonly policyVersion: string;
  readonly disclaimerDigest: string;
  readonly issuedAtUtc: string;
  readonly expiresAtUtc: string;
}

export interface AcknowledgementCommitInput {
  readonly affirmed: true;
  readonly policyVersion: string;
  readonly disclaimerDigest: string;
  readonly challengeToken: string;
}

export type AcknowledgementCommitResult =
  | {
      readonly status: "ACKNOWLEDGED";
      readonly policyVersion: string;
      readonly disclaimerDigest: string;
      readonly acknowledgedAtUtc: string;
    }
  | {
      readonly status: "REJECTED";
      readonly reason:
        | "MALFORMED"
        | "UNKNOWN_KEY"
        | "INVALID_SIGNATURE"
        | "SESSION_MISMATCH"
        | "POLICY_MISMATCH"
        | "DISCLAIMER_MISMATCH"
        | "NOT_YET_VALID"
        | "EXPIRED"
        | "LIFETIME_INVALID"
        | "ALREADY_ACKNOWLEDGED";
    };

interface ChallengeClaims {
  readonly v: 1;
  readonly kid: string;
  readonly sessionDigest: string;
  readonly policyVersion: string;
  readonly disclaimerDigest: string;
  readonly nonce: string;
  readonly issuedAtUtc: string;
  readonly expiresAtUtc: string;
}

type VerifiedChallenge =
  | { readonly valid: true; readonly claims: ChallengeClaims }
  | {
      readonly valid: false;
      readonly reason: Exclude<
        AcknowledgementCommitResult,
        { readonly status: "ACKNOWLEDGED" }
      >["reason"];
    };

const TOKEN_MAXIMUM_LENGTH = 4096;

export class SessionAcknowledgementService {
  readonly #sessionIdentifier: string;
  readonly #currentKey: AcknowledgementKey;
  readonly #keys: ReadonlyMap<string, AcknowledgementKey>;
  readonly #challengeLifetimeSeconds: number;
  readonly #maximumClockSkewSeconds: number;
  readonly #state: AcknowledgementStatePort;
  readonly #now: () => Date;
  readonly #randomBytes: (length: number) => Uint8Array;

  constructor(config: AcknowledgementServiceConfig) {
    if (config.sessionIdentifier.length < 16) {
      throw new TypeError("Acknowledgement session identifier is too short.");
    }
    if (
      !Number.isSafeInteger(config.challengeLifetimeSeconds) ||
      config.challengeLifetimeSeconds < 1 ||
      config.challengeLifetimeSeconds > 600
    ) {
      throw new RangeError(
        "Challenge lifetime must be a safe integer from 1 through 600 seconds.",
      );
    }
    if (
      !Number.isSafeInteger(config.maximumClockSkewSeconds) ||
      config.maximumClockSkewSeconds < 0 ||
      config.maximumClockSkewSeconds > 300
    ) {
      throw new RangeError(
        "Maximum clock skew must be a safe integer from 0 through 300 seconds.",
      );
    }
    const keys = [config.currentKey, ...(config.previousKeys ?? [])];
    if (
      keys.some(
        (key) =>
          !/^[A-Za-z0-9_-]{1,32}$/.test(key.id) || key.secret.length < 32,
      ) ||
      new Set(keys.map((key) => key.id)).size !== keys.length
    ) {
      throw new TypeError(
        "Acknowledgement keys require unique safe IDs and at least 32 secret bytes.",
      );
    }
    this.#sessionIdentifier = config.sessionIdentifier;
    this.#currentKey = config.currentKey;
    this.#keys = new Map(keys.map((key) => [key.id, key]));
    this.#challengeLifetimeSeconds = config.challengeLifetimeSeconds;
    this.#maximumClockSkewSeconds = config.maximumClockSkewSeconds;
    this.#state = config.state;
    this.#now = config.now ?? (() => new Date());
    this.#randomBytes =
      config.randomBytes ??
      ((length) => {
        const value = new Uint8Array(length);
        crypto.getRandomValues(value);
        return value;
      });
  }

  async isAcknowledged(
    policy: AcknowledgementPolicyIdentity,
  ): Promise<boolean> {
    const state = await this.#state.read();
    if (state === null || state.replayState !== "ACKNOWLEDGED") return false;
    const now = this.#now();
    assertValidDate(now);
    const expiresAt = new Date(state.expiresAtUtc);
    if (
      !Number.isFinite(expiresAt.getTime()) ||
      now.getTime() >
        expiresAt.getTime() + this.#maximumClockSkewSeconds * 1_000
    ) {
      await this.#state.clear();
      return false;
    }
    return (
      state.policyVersion === policy.policyVersion &&
      state.disclaimerDigest ===
        (await sha256Base16(policy.disclaimerStatement))
    );
  }

  async issue(
    policy: AcknowledgementPolicyIdentity,
  ): Promise<IssuedAcknowledgementChallenge> {
    const now = this.#now();
    assertValidDate(now);
    const issuedAtUtc = now.toISOString();
    const expiresAtUtc = new Date(
      now.getTime() + this.#challengeLifetimeSeconds * 1000,
    ).toISOString();
    const claims: ChallengeClaims = {
      v: 1,
      kid: this.#currentKey.id,
      sessionDigest: await sha256Base16(this.#sessionIdentifier),
      policyVersion: policy.policyVersion,
      disclaimerDigest: await sha256Base16(policy.disclaimerStatement),
      nonce: base64Url(this.#randomBytes(16)),
      issuedAtUtc,
      expiresAtUtc,
    };
    const payload = new TextEncoder().encode(JSON.stringify(claims));
    const signature = await hmac(this.#currentKey.secret, payload);
    return Object.freeze({
      challengeToken: `${base64Url(payload)}.${base64Url(signature)}`,
      policyVersion: claims.policyVersion,
      disclaimerDigest: claims.disclaimerDigest,
      issuedAtUtc,
      expiresAtUtc,
    });
  }

  async commit(
    input: AcknowledgementCommitInput,
    policy: AcknowledgementPolicyIdentity,
  ): Promise<AcknowledgementCommitResult> {
    const verified = await this.#verify(input, policy);
    if (!verified.valid) {
      return Object.freeze({ status: "REJECTED", reason: verified.reason });
    }
    const claims = verified.claims;
    const nonceHash = await sha256Base16(claims.nonce);
    const acknowledgedAtUtc = this.#now().toISOString();
    return await this.#state.transition<AcknowledgementCommitResult>(
      (current) => {
        if (
          current?.replayState === "ACKNOWLEDGED" &&
          current.policyVersion === claims.policyVersion &&
          current.disclaimerDigest === claims.disclaimerDigest
        ) {
          return {
            next: current,
            result: {
              status: "REJECTED" as const,
              reason: "ALREADY_ACKNOWLEDGED" as const,
            },
          };
        }
        const next: AcknowledgementState = Object.freeze({
          policyVersion: claims.policyVersion,
          disclaimerDigest: claims.disclaimerDigest,
          challengeNonceOrHash: nonceHash,
          issuedAtUtc: claims.issuedAtUtc,
          expiresAtUtc: claims.expiresAtUtc,
          acknowledgedAtUtc,
          replayState: "ACKNOWLEDGED",
        });
        return {
          next,
          result: {
            status: "ACKNOWLEDGED" as const,
            policyVersion: claims.policyVersion,
            disclaimerDigest: claims.disclaimerDigest,
            acknowledgedAtUtc,
          },
        };
      },
    );
  }

  async clear(): Promise<void> {
    await this.#state.clear();
  }

  async #verify(
    input: AcknowledgementCommitInput,
    policy: AcknowledgementPolicyIdentity,
  ): Promise<VerifiedChallenge> {
    const parts = input.challengeToken.split(".");
    if (
      input.challengeToken.length > TOKEN_MAXIMUM_LENGTH ||
      parts.length !== 2
    ) {
      return invalid("MALFORMED");
    }
    let payload: Uint8Array;
    let signature: Uint8Array;
    let claims: ChallengeClaims;
    try {
      payload = fromBase64Url(parts[0]!);
      signature = fromBase64Url(parts[1]!);
      claims = parseClaims(JSON.parse(new TextDecoder().decode(payload)));
    } catch {
      return invalid("MALFORMED");
    }
    const key = this.#keys.get(claims.kid);
    if (key === undefined) return invalid("UNKNOWN_KEY");
    if (!(await verifyHmac(key.secret, payload, signature))) {
      return invalid("INVALID_SIGNATURE");
    }
    if (
      claims.sessionDigest !== (await sha256Base16(this.#sessionIdentifier))
    ) {
      return invalid("SESSION_MISMATCH");
    }
    if (
      claims.policyVersion !== policy.policyVersion ||
      input.policyVersion !== policy.policyVersion
    ) {
      return invalid("POLICY_MISMATCH");
    }
    const disclaimerDigest = await sha256Base16(policy.disclaimerStatement);
    if (
      claims.disclaimerDigest !== disclaimerDigest ||
      input.disclaimerDigest !== disclaimerDigest
    ) {
      return invalid("DISCLAIMER_MISMATCH");
    }
    const issued = Date.parse(claims.issuedAtUtc);
    const expires = Date.parse(claims.expiresAtUtc);
    if (
      !Number.isFinite(issued) ||
      !Number.isFinite(expires) ||
      expires <= issued ||
      expires - issued > this.#challengeLifetimeSeconds * 1000
    ) {
      return invalid("LIFETIME_INVALID");
    }
    const now = this.#now().getTime();
    const skew = this.#maximumClockSkewSeconds * 1000;
    if (issued > now + skew) return invalid("NOT_YET_VALID");
    if (expires < now - skew) return invalid("EXPIRED");
    return { valid: true, claims };
  }
}

export class InMemoryAcknowledgementState implements AcknowledgementStatePort {
  #value: AcknowledgementState | null = null;
  #tail: Promise<void> = Promise.resolve();

  async read(): Promise<AcknowledgementState | null> {
    await this.#tail;
    return this.#value;
  }

  async transition<T>(
    operation: (current: AcknowledgementState | null) => {
      readonly next: AcknowledgementState | null;
      readonly result: T;
    },
  ): Promise<T> {
    let release!: () => void;
    const previous = this.#tail;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const transition = operation(this.#value);
      this.#value = transition.next;
      return transition.result;
    } finally {
      release();
    }
  }

  async clear(): Promise<void> {
    await this.transition(() => ({ next: null, result: undefined }));
  }
}

export function acknowledgementPolicy(
  disclaimer: Disclaimer,
): AcknowledgementPolicyIdentity {
  return {
    policyVersion: disclaimer.policyVersion,
    disclaimerStatement: disclaimer.statement,
  };
}

function invalid(
  reason: Exclude<
    AcknowledgementCommitResult,
    { readonly status: "ACKNOWLEDGED" }
  >["reason"],
): VerifiedChallenge {
  return { valid: false, reason };
}

function parseClaims(value: unknown): ChallengeClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Invalid challenge claims.");
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "v",
    "kid",
    "sessionDigest",
    "policyVersion",
    "disclaimerDigest",
    "nonce",
    "issuedAtUtc",
    "expiresAtUtc",
  ];
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key)) ||
    record.v !== 1 ||
    typeof record.kid !== "string" ||
    typeof record.sessionDigest !== "string" ||
    typeof record.policyVersion !== "string" ||
    typeof record.disclaimerDigest !== "string" ||
    typeof record.nonce !== "string" ||
    typeof record.issuedAtUtc !== "string" ||
    typeof record.expiresAtUtc !== "string"
  ) {
    throw new TypeError("Invalid challenge claims.");
  }
  return record as unknown as ChallengeClaims;
}

async function sha256Base16(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(
  secret: Uint8Array,
  payload: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, arrayBuffer(payload)),
  );
}

async function verifyHmac(
  secret: Uint8Array,
  payload: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "HMAC",
    key,
    arrayBuffer(signature),
    arrayBuffer(payload),
  );
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TypeError("Invalid base64url.");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(
    value.replaceAll("-", "+").replaceAll("_", "/") + padding,
  );
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function assertValidDate(value: Date): void {
  if (!Number.isFinite(value.getTime()))
    throw new TypeError("Invalid clock value.");
}
