import {
  evaluatePlausibility,
  type PlausibilityConfiguration,
  type PlausibilityInput,
} from "../../packages/domain/src";
import { describe, expect, it } from "vitest";

const configured: PlausibilityConfiguration = {
  status: "CONFIGURED",
  utcLookbackWindowSeconds: 600,
  minimumSampleSize: 5,
  alertThresholdMAD: "3",
  thresholdComparison: "GREATER_THAN_OR_EQUAL",
};

const unconfigured: PlausibilityConfiguration = {
  status: "UNCONFIGURED",
  utcLookbackWindowSeconds: null,
  minimumSampleSize: null,
  alertThresholdMAD: null,
  thresholdComparison: null,
};

const approvedConfiguration: PlausibilityConfiguration = {
  status: "CONFIGURED",
  utcLookbackWindowSeconds: 3600,
  minimumSampleSize: 30,
  alertThresholdMAD: "6",
  thresholdComparison: "GREATER_THAN_OR_EQUAL",
};

function observation(minute: number, value: string) {
  return {
    observedAtUtc: `2026-07-20T12:${minute.toString().padStart(2, "0")}:00Z`,
    value,
  };
}

function input(value: string): PlausibilityInput {
  return {
    evaluationTimeUtc: "2026-07-20T12:10:00Z",
    observation: observation(10, value),
    referenceSample: [
      observation(0, "9"),
      observation(2, "10"),
      observation(4, "10"),
      observation(6, "11"),
      observation(8, "12"),
    ],
  };
}

describe("contextual OHLC plausibility", () => {
  it.each([
    ["15.999", "NORMAL"],
    ["16", "UNUSUAL"],
  ] as const)(
    "applies the approved 60-minute, 30-bar, inclusive 6-MAD baseline to %s",
    (value, state) => {
      const referenceValues = ["9", "10", "10", "11", "12"];
      const referenceSample = Array.from({ length: 30 }, (_, index) => ({
        observedAtUtc: `2026-07-20T11:${(11 + index).toString().padStart(2, "0")}:00Z`,
        value: referenceValues[index % referenceValues.length]!,
      }));
      const result = evaluatePlausibility(
        {
          evaluationTimeUtc: "2026-07-20T12:10:00Z",
          observation: observation(10, value),
          referenceSample,
        },
        approvedConfiguration,
      );
      expect(result).toMatchObject({
        state,
        configurationStatus: "CONFIGURED",
        evidence: {
          eligibleSampleSize: 30,
          median: "10",
          medianAbsoluteDeviation: "1",
          alertThresholdMAD: "6",
          thresholdComparison: "GREATER_THAN_OR_EQUAL",
          utcLookbackWindowSeconds: 3600,
        },
        hardValidityEffect: "NONE",
        tradingSignalEffect: "PROHIBITED",
      });
    },
  );

  it("fails closed as NOT_EVALUATED while production parameters are unconfigured", () => {
    expect(
      evaluatePlausibility(
        {
          evaluationTimeUtc: "not inspected",
          observation: { observedAtUtc: "not inspected", value: "NaN" },
          referenceSample: [],
        },
        unconfigured,
      ),
    ).toEqual({
      state: "NOT_EVALUATED",
      method: "rolling_median_and_median_absolute_deviation",
      configurationStatus: "UNCONFIGURED",
      reason: "UNCONFIGURED",
      evidence: null,
      hardValidityEffect: "NONE",
      tradingSignalEffect: "PROHIBITED",
    });
  });

  it.each([
    { ...configured, utcLookbackWindowSeconds: 0 },
    { ...configured, minimumSampleSize: 2 },
    { ...configured, alertThresholdMAD: "0" },
    { ...configured, alertThresholdMAD: "NaN" },
    { ...configured, thresholdComparison: "GREATER_THAN" },
  ])("rejects invalid runtime configuration %#", (invalidConfiguration) => {
    expect(
      evaluatePlausibility(
        input("11"),
        invalidConfiguration as PlausibilityConfiguration,
      ),
    ).toMatchObject({
      state: "NOT_EVALUATED",
      configurationStatus: "CONFIGURED",
      reason: "INVALID_CONFIGURATION",
    });
  });

  it("returns NORMAL with deterministic median and MAD evidence", () => {
    expect(evaluatePlausibility(input("11"), configured)).toEqual({
      state: "NORMAL",
      method: "rolling_median_and_median_absolute_deviation",
      configurationStatus: "CONFIGURED",
      reason: "EVALUATED",
      evidence: {
        eligibleSampleSize: 5,
        median: "10",
        medianAbsoluteDeviation: "1",
        absoluteDeviation: "1",
        madScore: "1",
        alertThresholdMAD: "3",
        thresholdComparison: "GREATER_THAN_OR_EQUAL",
        utcLookbackWindowSeconds: 600,
        evaluationTimeUtc: "2026-07-20T12:10:00Z",
      },
      hardValidityEffect: "NONE",
      tradingSignalEffect: "PROHIBITED",
    });
  });

  it.each([
    ["14", "4"],
    ["13", "3"],
  ])(
    "returns UNUSUAL when MAD score %s reaches the inclusive threshold",
    (value, expectedScore) => {
      const result = evaluatePlausibility(input(value), configured);
      expect(result).toMatchObject({
        state: "UNUSUAL",
        reason: "EVALUATED",
        evidence: { madScore: expectedScore },
        hardValidityEffect: "NONE",
        tradingSignalEffect: "PROHIBITED",
      });
    },
  );

  it("uses the inclusive UTC lookback boundary and reports insufficient samples", () => {
    const result = evaluatePlausibility(
      {
        ...input("11"),
        referenceSample: [observation(0, "9"), observation(0, "10")],
      },
      configured,
    );
    expect(result).toMatchObject({
      state: "NOT_EVALUATED",
      reason: "INSUFFICIENT_SAMPLE",
      evidence: { eligibleSampleSize: 2, requiredSampleSize: 5 },
    });
  });

  it("ignores evidence older than the configured UTC window", () => {
    const result = evaluatePlausibility(
      {
        ...input("11"),
        referenceSample: [
          { observedAtUtc: "2026-07-20T11:59:59Z", value: "100" },
          ...input("11").referenceSample,
        ],
      },
      configured,
    );
    expect(result).toMatchObject({
      state: "NORMAL",
      evidence: { eligibleSampleSize: 5, median: "10" },
    });
  });

  it.each([
    {
      ...input("11"),
      observation: observation(11, "11"),
    },
    {
      ...input("11"),
      referenceSample: [observation(11, "10")],
    },
    {
      ...input("11"),
      referenceSample: [{ observedAtUtc: "invalid", value: "10" }],
    },
    {
      ...input("11"),
      observation: observation(10, "Infinity"),
    },
  ])("rejects invalid or future evidence %#", (invalidInput) => {
    expect(evaluatePlausibility(invalidInput, configured)).toMatchObject({
      state: "NOT_EVALUATED",
      reason: "INVALID_EVIDENCE",
    });
  });

  it("does not classify a zero-MAD reference sample", () => {
    const result = evaluatePlausibility(
      {
        ...input("11"),
        referenceSample: [0, 2, 4, 6, 8].map((minute) =>
          observation(minute, "10"),
        ),
      },
      configured,
    );
    expect(result).toMatchObject({
      state: "NOT_EVALUATED",
      reason: "ZERO_MAD",
      evidence: { eligibleSampleSize: 5, requiredSampleSize: 5 },
    });
  });

  it("uses exact even-sample medians", () => {
    const result = evaluatePlausibility(
      {
        evaluationTimeUtc: "2026-07-20T12:10:00Z",
        observation: observation(10, "15"),
        referenceSample: [
          observation(2, "8"),
          observation(4, "10"),
          observation(6, "12"),
          observation(8, "14"),
        ],
      },
      { ...configured, minimumSampleSize: 4 },
    );
    expect(result).toMatchObject({
      state: "NORMAL",
      evidence: {
        median: "11",
        medianAbsoluteDeviation: "2",
        absoluteDeviation: "4",
        madScore: "2",
      },
    });
  });
});
