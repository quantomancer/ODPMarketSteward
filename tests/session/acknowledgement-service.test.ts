import {
  InMemoryAcknowledgementState,
  SessionAcknowledgementService,
  type AcknowledgementKey,
  type AcknowledgementPolicyIdentity,
} from "../../packages/application/src";
import { describe, expect, it } from "vitest";

const policy: AcknowledgementPolicyIdentity = {
  policyVersion: "1.2.0",
  disclaimerStatement: "MARKET DATA DEMO fixture disclaimer",
};
const currentKey: AcknowledgementKey = {
  id: "current",
  secret: new Uint8Array(32).fill(17),
};
const previousKey: AcknowledgementKey = {
  id: "previous",
  secret: new Uint8Array(32).fill(23),
};

function fixture(options: {
  readonly session?: string;
  readonly key?: AcknowledgementKey;
  readonly previousKeys?: readonly AcknowledgementKey[];
  readonly state?: InMemoryAcknowledgementState;
}) {
  let now = new Date("2026-07-21T18:45:00.000Z");
  let randomCounter = 0;
  const state = options.state ?? new InMemoryAcknowledgementState();
  const service = new SessionAcknowledgementService({
    sessionIdentifier:
      options.session ?? "oms_session_fixture_0000000000000001",
    currentKey: options.key ?? currentKey,
    ...(options.previousKeys === undefined
      ? {}
      : { previousKeys: options.previousKeys }),
    challengeLifetimeSeconds: 600,
    maximumClockSkewSeconds: 30,
    state,
    now: () => new Date(now),
    randomBytes: (length) => new Uint8Array(length).fill((randomCounter += 1)),
  });
  return {
    service,
    state,
    setNow(value: string) {
      now = new Date(value);
    },
  };
}

describe("server-owned acknowledgement service", () => {
  it("validates a signed challenge without storing acknowledgement state", async () => {
    const { service, state } = fixture({});
    const challenge = await service.issue(policy);
    const result = await service.validate(
      {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: challenge.challengeToken,
      },
      policy,
    );
    expect(result).toMatchObject({
      status: "VALID",
      policyVersion: "1.2.0",
      disclaimerDigest: challenge.disclaimerDigest,
    });
    expect(await state.read()).toBeNull();
  });

  it("validates a signed demo challenge across ChatGPT transport sessions", async () => {
    const issuer = fixture({
      session: "oms_transport_issuer_00000000000001",
    });
    const validator = fixture({
      session: "oms_transport_button_00000000000001",
    });
    const challenge = await issuer.service.issue(policy);
    await expect(
      validator.service.validate(
        {
          affirmed: true,
          policyVersion: challenge.policyVersion,
          disclaimerDigest: challenge.disclaimerDigest,
          challengeToken: challenge.challengeToken,
        },
        policy,
      ),
    ).resolves.toMatchObject({ status: "VALID" });
    await expect(
      validator.service.commit(
        {
          affirmed: true,
          policyVersion: challenge.policyVersion,
          disclaimerDigest: challenge.disclaimerDigest,
          challengeToken: challenge.challengeToken,
        },
        policy,
      ),
    ).resolves.toMatchObject({
      status: "REJECTED",
      reason: "SESSION_MISMATCH",
    });
  });

  it("issues a policy/session-bound challenge and commits bounded state", async () => {
    const { service, state } = fixture({});
    expect(await service.isAcknowledged(policy)).toBe(false);
    const challenge = await service.issue(policy);
    expect(challenge).toMatchObject({
      policyVersion: "1.2.0",
      issuedAtUtc: "2026-07-21T18:45:00.000Z",
      expiresAtUtc: "2026-07-21T18:55:00.000Z",
    });
    expect(challenge.challengeToken.length).toBeGreaterThan(32);
    expect(challenge.disclaimerDigest).toMatch(/^[a-f0-9]{64}$/);

    const result = await service.commit(
      {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: challenge.challengeToken,
      },
      policy,
    );
    expect(result).toMatchObject({
      status: "ACKNOWLEDGED",
      policyVersion: "1.2.0",
      acknowledgedAtUtc: "2026-07-21T18:45:00.000Z",
    });
    expect(await service.isAcknowledged(policy)).toBe(true);
    expect(await state.read()).toMatchObject({
      policyVersion: "1.2.0",
      disclaimerDigest: challenge.disclaimerDigest,
      replayState: "ACKNOWLEDGED",
    });
    expect(JSON.stringify(await state.read())).not.toContain(
      challenge.challengeToken,
    );
  });

  it("rejects tampering, malformed tokens and unknown rotation keys", async () => {
    const { service } = fixture({});
    const challenge = await service.issue(policy);
    const last = challenge.challengeToken.at(-1)!;
    const modified = `${challenge.challengeToken.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    await expectCommitReason(service, modified, challenge, "INVALID_SIGNATURE");
    await expectCommitReason(service, "not-a-token", challenge, "MALFORMED");

    const oldIssuer = fixture({ key: previousKey }).service;
    const oldChallenge = await oldIssuer.issue(policy);
    await expectCommitReason(
      service,
      oldChallenge.challengeToken,
      oldChallenge,
      "UNKNOWN_KEY",
    );
  });

  it("accepts a narrowly configured previous key during rotation", async () => {
    const old = fixture({ key: previousKey });
    const challenge = await old.service.issue(policy);
    const rotated = fixture({ previousKeys: [previousKey] });
    const result = await rotated.service.commit(
      {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: challenge.challengeToken,
      },
      policy,
    );
    expect(result.status).toBe("ACKNOWLEDGED");
  });

  it("rejects cross-session use, policy change and disclaimer change", async () => {
    const issuer = fixture({});
    const challenge = await issuer.service.issue(policy);
    const otherSession = fixture({
      session: "oms_session_fixture_0000000000000002",
    }).service;
    await expectCommitReason(
      otherSession,
      challenge.challengeToken,
      challenge,
      "SESSION_MISMATCH",
    );
    await expectCommitReason(
      issuer.service,
      challenge.challengeToken,
      challenge,
      "POLICY_MISMATCH",
      { ...policy, policyVersion: "1.3.0" },
    );
    await expectCommitReason(
      issuer.service,
      challenge.challengeToken,
      challenge,
      "DISCLAIMER_MISMATCH",
      { ...policy, disclaimerStatement: `${policy.disclaimerStatement}.` },
    );
  });

  it("enforces bounded UTC validity and skew", async () => {
    const expired = fixture({});
    const challenge = await expired.service.issue(policy);
    expired.setNow("2026-07-21T18:55:31.000Z");
    await expectCommitReason(
      expired.service,
      challenge.challengeToken,
      challenge,
      "EXPIRED",
    );

    const future = fixture({});
    future.setNow("2026-07-21T18:46:00.000Z");
    const futureChallenge = await future.service.issue(policy);
    future.setNow("2026-07-21T18:45:29.000Z");
    await expectCommitReason(
      future.service,
      futureChallenge.challengeToken,
      futureChallenge,
      "NOT_YET_VALID",
    );
  });

  it("serializes concurrent challenges so exactly one transition wins", async () => {
    const { service } = fixture({});
    const [first, second] = await Promise.all([
      service.issue(policy),
      service.issue(policy),
    ]);
    const results = await Promise.all(
      [first, second].map(
        async (challenge) =>
          await service.commit(
            {
              affirmed: true,
              policyVersion: challenge.policyVersion,
              disclaimerDigest: challenge.disclaimerDigest,
              challengeToken: challenge.challengeToken,
            },
            policy,
          ),
      ),
    );
    expect(
      results.filter((result) => result.status === "ACKNOWLEDGED"),
    ).toHaveLength(1);
    expect(results).toContainEqual({
      status: "REJECTED",
      reason: "ALREADY_ACKNOWLEDGED",
    });
  });

  it("invalidates old state on policy rotation and supports idempotent cleanup", async () => {
    const { service } = fixture({});
    const challenge = await service.issue(policy);
    await service.commit(
      {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: challenge.challengeToken,
      },
      policy,
    );
    expect(
      await service.isAcknowledged({ ...policy, policyVersion: "1.3.0" }),
    ).toBe(false);
    await service.clear();
    await service.clear();
    expect(await service.isAcknowledged(policy)).toBe(false);
  });

  it("rejects unsafe configuration rather than weakening limits", () => {
    expect(
      () =>
        new SessionAcknowledgementService({
          sessionIdentifier: "short",
          currentKey,
          challengeLifetimeSeconds: 601,
          maximumClockSkewSeconds: 0,
          state: new InMemoryAcknowledgementState(),
        }),
    ).toThrow(/session identifier/u);
    expect(
      () =>
        new SessionAcknowledgementService({
          sessionIdentifier: "oms_session_fixture_0000000000000001",
          currentKey,
          challengeLifetimeSeconds: 601,
          maximumClockSkewSeconds: 0,
          state: new InMemoryAcknowledgementState(),
        }),
    ).toThrow(/Challenge lifetime/u);
  });
});

async function expectCommitReason(
  service: SessionAcknowledgementService,
  token: string,
  challenge: {
    readonly policyVersion: string;
    readonly disclaimerDigest: string;
  },
  reason: string,
  expectedPolicy = policy,
): Promise<void> {
  await expect(
    service.commit(
      {
        affirmed: true,
        policyVersion: challenge.policyVersion,
        disclaimerDigest: challenge.disclaimerDigest,
        challengeToken: token,
      },
      expectedPolicy,
    ),
  ).resolves.toEqual({ status: "REJECTED", reason });
}
