import { evaluateOhlcHardValidity } from "@odp-market-steward/domain";
import type {
  ArtifactPointer,
  DisclosureRequiredOutput,
  Disclaimer,
  GovernanceValidation,
  MarketBoardInput,
  MarketBoardSuccessOutput,
} from "@odp-market-steward/mcp-contracts";
import type {
  GovernedSnapshotAcquirer,
  GovernedSnapshotResult,
} from "./governed-snapshot-acquirer";

export interface MarketBoardProfileSource {
  readonly productId: "fxlive-market-data-demo-fx35";
  readonly productVersion: string;
  readonly bundleVersion: string;
  readonly odpsVersion: 4.1;
  readonly artifacts: readonly ArtifactPointer[];
  readonly disclaimer: Disclaimer;
  validation(evaluatedAtUtc: string): GovernanceValidation;
}

export interface MarketBoardContext {
  readonly profile: MarketBoardProfileSource;
  readonly instruments: readonly string[];
  readonly ohlcRulesArtifact: ArtifactPointer;
  readonly acquirer: GovernedSnapshotAcquirer;
  readonly requestedAtUtc: string;
  readonly completedAtUtc: () => string;
}

export function disclosureRequired(
  disclaimer: Disclaimer,
  attemptedAtUtc: string,
): DisclosureRequiredOutput {
  return Object.freeze({
    status: "DISCLOSURE_REQUIRED",
    summary:
      "Explicit acknowledgement is required before market-data retrieval.",
    nextAction:
      "Review the disclaimer in the component and activate Acknowledge and continue.",
    evidence: Object.freeze({
      evidenceMode: "NONE",
      attemptedAtUtc,
      calendarEvaluatedAtUtc: null,
      cacheAgeSeconds: null,
      displayLabel: "No market evidence available.",
      liveBadgePermitted: false,
      reason: "MARKET_DATA_DEMO_ACKNOWLEDGEMENT_REQUIRED",
    }),
    disclaimer,
  });
}

export async function getMarketBoard(
  input: MarketBoardInput,
  context: MarketBoardContext,
): Promise<MarketBoardSuccessOutput> {
  const acquisition = await context.acquirer.acquire(context.instruments);
  const completedAtUtc = context.completedAtUtc();
  const validation = context.profile.validation(completedAtUtc);
  const hasEvidence = acquisition.bars.length > 0;
  const currentBarEndUtc = coherentBarEnd(acquisition);
  const ruleResults = acquisition.bars.map((bar) => {
    const validity = evaluateOhlcHardValidity(bar);
    return {
      ruleId: "hard-ohlc-validity",
      state: validity.state === "PASS" ? "PASS" : "FAIL",
      artifact: context.ohlcRulesArtifact,
      pointer: "/spec/hardRules",
      evidence: { instrument: bar.currency, state: validity.state },
    };
  });
  const passed = ruleResults.filter((result) => result.state === "PASS").length;
  const failed = ruleResults.length - passed;
  const snapshot = snapshotEvidence(acquisition);
  const bars = acquisition.bars.map((bar) => ({
    Currency: bar.currency,
    Epoch: bar.epoch,
    BarStart: bar.barStartUtc,
    BarEnd: bar.barEndUtc,
    Granularity: "1m",
    Open: bar.open,
    High: bar.high,
    Low: bar.low,
    Close: bar.close,
  }));
  const limitations = [
    "Market session state, calendar, freshness and purpose fitness are not assessed by this result.",
    "Plausibility is not evaluated because this call retrieves no governed reference history.",
  ];
  if (input.evidenceMode === "ALLOW_RECORDED_FALLBACK") {
    limitations.push(
      "Recorded fallback is not enabled; honest live partial or unavailable evidence is returned.",
    );
  }
  if (acquisition.availabilityState !== "AVAILABLE") {
    limitations.push(
      `Acquisition outcome ${acquisition.reason}; ${acquisition.coverage.successfulCount} of ${acquisition.coverage.requestedCount} requested instruments returned usable evidence.`,
    );
  }
  return Object.freeze({
    productId: context.profile.productId,
    bundleVersion: context.profile.bundleVersion,
    summary: summary(acquisition),
    governance: Object.freeze({
      productId: context.profile.productId,
      productVersion: context.profile.productVersion,
      bundleVersion: context.profile.bundleVersion,
      odpsVersion: context.profile.odpsVersion,
      artifacts: context.profile.artifacts,
      validation,
    }),
    evidence: hasEvidence
      ? Object.freeze({
          evidenceMode: "LIVE",
          fetchedAtUtc: completedAtUtc,
          calendarEvaluatedAtUtc: null,
          cacheAgeSeconds: 0,
          displayLabel: "LIVE",
          liveBadgePermitted: false,
          sourceDescription:
            "retrieved_from_fixed_origin_during_current_tool_call",
        })
      : Object.freeze({
          evidenceMode: "NONE",
          attemptedAtUtc: completedAtUtc,
          calendarEvaluatedAtUtc: null,
          cacheAgeSeconds: null,
          displayLabel: "No market evidence available.",
          liveBadgePermitted: false,
          reason: acquisition.reason,
        }),
    availabilityState: acquisition.availabilityState,
    serviceState: serviceState(acquisition),
    snapshot,
    bars: Object.freeze(bars),
    quality: Object.freeze({
      passed,
      failed,
      warnings: 0,
      notApplicable: 0,
      unknown: 0,
      notEvaluated: 0,
      results: Object.freeze(ruleResults),
    }),
    plausibility: Object.freeze({
      state: "NOT_EVALUATED",
      method: "rolling_median_and_median_absolute_deviation",
      configurationStatus: "CONFIGURED",
      artifact: context.ohlcRulesArtifact,
      pointer: "/spec/contextualRules/contextual-ohlc-plausibility",
      evidence: { referenceSampleCount: 0 },
      limitations: [
        "No governed reference history was retrieved during this invocation.",
      ],
    }),
    refresh: refreshResult(
      input.previousBarEndUtc ?? null,
      currentBarEndUtc,
      context.requestedAtUtc,
      completedAtUtc,
    ),
    limitations: Object.freeze(limitations),
    disclaimer: context.profile.disclaimer,
  });
}

function snapshotEvidence(
  acquisition: GovernedSnapshotResult,
): Readonly<Record<string, unknown>> | null {
  const metadata = acquisition.metadataAfter ?? acquisition.metadataBefore;
  if (
    acquisition.coherenceState !== "COHERENT" ||
    metadata?.barStartUtc === null ||
    metadata?.barStartUtc === undefined ||
    metadata.barEndUtc === null
  ) {
    return null;
  }
  return Object.freeze({
    createdAtUtc: metadata.createdAtUtc,
    barStartUtc: metadata.barStartUtc,
    barEndUtc: metadata.barEndUtc,
    granularity: "1m",
    expectedCount: 35,
    returnedCount: acquisition.bars.length,
  });
}

function coherentBarEnd(acquisition: GovernedSnapshotResult): string | null {
  const snapshot = snapshotEvidence(acquisition);
  const value = snapshot?.barEndUtc;
  return typeof value === "string" ? value : null;
}

function serviceState(
  acquisition: GovernedSnapshotResult,
): MarketBoardSuccessOutput["serviceState"] {
  if (acquisition.availabilityState === "UNAVAILABLE") return "UNAVAILABLE";
  if (
    acquisition.availabilityState === "PARTIAL" ||
    acquisition.availabilityState === "INCOHERENT"
  ) {
    return "DEGRADED";
  }
  return "UNKNOWN";
}

function summary(acquisition: GovernedSnapshotResult): string {
  return `FX-35 governed live acquisition: ${acquisition.availabilityState}; ${acquisition.coverage.successfulCount} of ${acquisition.coverage.requestedCount} requested instruments returned usable evidence. Fitness is not assessed by this result.`;
}

function refreshResult(
  previousBarEndUtc: string | null,
  currentBarEndUtc: string | null,
  requestedAtUtc: string,
  completedAtUtc: string,
): Readonly<Record<string, unknown>> {
  if (currentBarEndUtc === null) {
    return Object.freeze({
      outcome: "NOT_EVALUATED",
      requestedAtUtc,
      completedAtUtc,
      previousBarEndUtc,
      currentBarEndUtc: null,
      message:
        "Refresh identity cannot be evaluated without a coherent completed bar.",
    });
  }
  const outcome =
    previousBarEndUtc === null
      ? "INITIAL"
      : previousBarEndUtc === currentBarEndUtc
        ? "SAME_BAR"
        : "NEW_BAR";
  return Object.freeze({
    outcome,
    requestedAtUtc,
    completedAtUtc,
    previousBarEndUtc,
    currentBarEndUtc,
    message:
      outcome === "INITIAL"
        ? "Initial coherent completed-bar identity returned."
        : outcome === "SAME_BAR"
          ? "The latest coherent completed-bar identity is unchanged."
          : "A different coherent completed-bar identity is available.",
  });
}
