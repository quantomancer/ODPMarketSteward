import {
  DecimalValue,
  EpochLexeme,
  parseOneMinuteUtcInterval,
  UtcTimestamp,
  type CompletedBarLexemes,
  type OhlcStrings,
} from "@odp-market-steward/domain";
import { isLosslessNumber, parse } from "lossless-json";

export * from "./module-port";

export const FXLIVE_ORIGIN = "https://fxlive.qmvp.workers.dev" as const;

export type SourceErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_INSTRUMENT"
  | "TIMEOUT"
  | "ABORTED"
  | "NETWORK"
  | "REDIRECT"
  | "HTTP_STATUS"
  | "CONTENT_TYPE"
  | "EMPTY_BODY"
  | "RESPONSE_TOO_LARGE"
  | "MALFORMED_JSON"
  | "INVALID_RESPONSE";

export class SourceClientError extends Error {
  readonly code: SourceErrorCode;
  readonly status: number | null;

  constructor(
    code: SourceErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = "SourceClientError";
    this.code = code;
    this.status = status;
  }
}

export interface FxLiveClientConfig {
  readonly timeoutMilliseconds: number;
  readonly maximumResponseBytes: number;
  readonly fetcher?: typeof fetch;
}

export interface SourceHealth {
  readonly ok: true;
  readonly service: "FXLive";
}

export interface SourceSnapshotMetadata {
  readonly epoch: string | null;
  readonly createdAtUtc: string | null;
  readonly granularity: "1m";
  readonly instrumentCount: number;
  readonly barStartUtc: string | null;
  readonly barEndUtc: string | null;
  readonly available: readonly string[];
}

interface SourceBarShape {
  readonly open: unknown;
  readonly high: unknown;
  readonly low: unknown;
  readonly close: unknown;
}

const HEALTH_KEYS = new Set(["ok", "service"]);
const META_KEYS = new Set([
  "Epoch",
  "CreatedAt",
  "Granularity",
  "InstrumentCount",
  "BarStart",
  "BarEnd",
  "available",
]);
const BAR_KEYS = new Set([
  "Currency",
  "Epoch",
  "BarStart",
  "BarEnd",
  "Granularity",
  "Open",
  "High",
  "Low",
  "Close",
  "Debug",
]);

export class FxLiveClient {
  readonly #timeoutMilliseconds: number;
  readonly #maximumResponseBytes: number;
  readonly #fetcher: typeof fetch;

  constructor(config: FxLiveClientConfig) {
    if (
      !Number.isSafeInteger(config.timeoutMilliseconds) ||
      config.timeoutMilliseconds <= 0
    ) {
      throw new SourceClientError(
        "INVALID_CONFIGURATION",
        "Source timeout must be a positive safe integer.",
      );
    }
    if (
      !Number.isSafeInteger(config.maximumResponseBytes) ||
      config.maximumResponseBytes <= 0
    ) {
      throw new SourceClientError(
        "INVALID_CONFIGURATION",
        "Source response limit must be a positive safe integer.",
      );
    }
    this.#timeoutMilliseconds = config.timeoutMilliseconds;
    this.#maximumResponseBytes = config.maximumResponseBytes;
    this.#fetcher = config.fetcher ?? fetch;
  }

  async getHealth(signal?: AbortSignal): Promise<SourceHealth> {
    const value = await this.#getJson("/health", signal);
    const record = exactRecord(value, HEALTH_KEYS, "health");
    if (record.ok !== true || record.service !== "FXLive") {
      throw invalidResponse(
        "Health response does not match the OpenAPI contract.",
      );
    }
    return Object.freeze({ ok: true, service: "FXLive" });
  }

  async getSnapshotMetadata(
    signal?: AbortSignal,
  ): Promise<SourceSnapshotMetadata> {
    const value = await this.#getJson("/meta", signal);
    const record = exactRecord(value, META_KEYS, "metadata");
    if (record.Granularity !== "1m") {
      throw invalidResponse("Metadata granularity must be 1m.");
    }
    const instrumentCount = exactNonNegativeSafeInteger(
      record.InstrumentCount,
      "InstrumentCount",
    );
    if (
      !Array.isArray(record.available) ||
      !record.available.every(isCurrency)
    ) {
      throw invalidResponse(
        "Metadata available must contain six-letter uppercase instruments.",
      );
    }
    const available = record.available;
    if (new Set(available).size !== available.length) {
      throw invalidResponse("Metadata available instruments must be unique.");
    }
    const epoch = optionalEpoch(record.Epoch);
    const createdAtUtc = optionalUtc(record.CreatedAt, "CreatedAt");
    const barStartUtc = optionalUtc(record.BarStart, "BarStart");
    const barEndUtc = optionalUtc(record.BarEnd, "BarEnd");
    if ((barStartUtc === null) !== (barEndUtc === null)) {
      throw invalidResponse(
        "Metadata BarStart and BarEnd must be supplied together.",
      );
    }
    if (barStartUtc !== null && barEndUtc !== null) {
      exactOneMinuteInterval(barStartUtc, barEndUtc);
    }
    return Object.freeze({
      epoch,
      createdAtUtc,
      granularity: "1m",
      instrumentCount,
      barStartUtc,
      barEndUtc,
      available: Object.freeze([...available]),
    });
  }

  async getLatestObservation(
    instrument: string,
    signal?: AbortSignal,
  ): Promise<CompletedBarLexemes> {
    if (!isCurrency(instrument)) {
      throw new SourceClientError(
        "INVALID_INSTRUMENT",
        "Instrument must contain exactly six uppercase ASCII letters.",
      );
    }
    const value = await this.#getJson(`/latest?bar=${instrument}`, signal);
    const record = exactRecord(value, BAR_KEYS, "bar");
    if (record.Currency !== instrument) {
      throw invalidResponse(
        "Bar Currency does not match the requested instrument.",
      );
    }
    if (record.Granularity !== "1m") {
      throw invalidResponse("Bar Granularity must be 1m.");
    }
    const epoch = exactEpoch(record.Epoch);
    const barStartUtc = exactUtc(record.BarStart, "BarStart");
    const barEndUtc = exactUtc(record.BarEnd, "BarEnd");
    exactOneMinuteInterval(barStartUtc, barEndUtc);
    const ohlc = exactOhlc(record);
    return Object.freeze({
      currency: instrument,
      epoch,
      barStartUtc,
      barEndUtc,
      granularity: "1m",
      ...ohlc,
    });
  }

  async #getJson(
    pathAndQuery: string,
    callerSignal?: AbortSignal,
  ): Promise<unknown> {
    const expectedUrl = `${FXLIVE_ORIGIN}${pathAndQuery}`;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abortFromCaller();
    else
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMilliseconds);

    try {
      let response: Response;
      try {
        response = await this.#fetcher(expectedUrl, {
          method: "GET",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
      } catch {
        if (timedOut)
          throw new SourceClientError("TIMEOUT", "Source request timed out.");
        if (callerSignal?.aborted) {
          throw new SourceClientError("ABORTED", "Source request was aborted.");
        }
        throw new SourceClientError("NETWORK", "Source request failed.");
      }
      if (
        response.redirected ||
        (response.url !== "" && response.url !== expectedUrl)
      ) {
        throw new SourceClientError(
          "REDIRECT",
          "Source redirects are prohibited.",
        );
      }
      if (!response.ok) {
        throw new SourceClientError(
          "HTTP_STATUS",
          "Source returned a non-success status.",
          response.status,
        );
      }
      const contentType =
        response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("application/json")) {
        throw new SourceClientError(
          "CONTENT_TYPE",
          "Source response must be JSON.",
        );
      }
      const text = await readBoundedBody(response, this.#maximumResponseBytes);
      try {
        return parse(text);
      } catch {
        throw new SourceClientError(
          "MALFORMED_JSON",
          "Source returned malformed JSON.",
        );
      }
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<string> {
  if (response.body === null)
    throw new SourceClientError("EMPTY_BODY", "Source response is empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteCount = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteCount += chunk.value.byteLength;
      if (byteCount > maximumBytes) {
        await reader.cancel();
        throw new SourceClientError(
          "RESPONSE_TOO_LARGE",
          "Source response exceeded the configured byte limit.",
        );
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof SourceClientError) throw error;
    throw new SourceClientError(
      "INVALID_RESPONSE",
      "Source response body is invalid UTF-8.",
    );
  }
  if (byteCount === 0 || text.length === 0) {
    throw new SourceClientError("EMPTY_BODY", "Source response is empty.");
  }
  return text;
}

function exactRecord(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalidResponse(`Expected a ${label} object.`);
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    throw invalidResponse(`${label} response contains an undeclared field.`);
  }
  return record;
}

function exactNumberText(
  value: unknown,
  field: keyof SourceBarShape,
  mapDomainError = true,
): string {
  let lexeme: string;
  if (isLosslessNumber(value)) lexeme = value.toString();
  else if (typeof value === "string") lexeme = value;
  else throw invalidResponse(`Expected a lossless numeric token for ${field}.`);
  if (!mapDomainError) {
    DecimalValue.fromJsonNumberLexeme(lexeme);
    return lexeme;
  }
  try {
    DecimalValue.fromJsonNumberLexeme(lexeme);
  } catch {
    throw invalidResponse(`Source ${field} is not a valid finite decimal.`);
  }
  return lexeme;
}

function exactOhlc(record: Record<string, unknown>): OhlcStrings {
  return {
    open: exactNumberText(record.Open, "open"),
    high: exactNumberText(record.High, "high"),
    low: exactNumberText(record.Low, "low"),
    close: exactNumberText(record.Close, "close"),
  };
}

export function parseOhlcLosslessly(json: string): OhlcStrings {
  let value: unknown;
  try {
    value = parse(json);
  } catch {
    throw new SourceClientError(
      "MALFORMED_JSON",
      "Source returned malformed JSON.",
    );
  }
  const record = exactRecord(
    value,
    new Set(["open", "high", "low", "close"]),
    "OHLC",
  );
  return {
    open: exactNumberText(record.open, "open", false),
    high: exactNumberText(record.high, "high", false),
    low: exactNumberText(record.low, "low", false),
    close: exactNumberText(record.close, "close", false),
  };
}

function isCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{6}$/.test(value);
}

function exactEpoch(value: unknown): string {
  const lexeme = isLosslessNumber(value)
    ? value.toString()
    : typeof value === "string"
      ? value
      : null;
  if (lexeme === null)
    throw invalidResponse("Epoch must be a lossless non-negative integer.");
  try {
    return EpochLexeme.parse(lexeme).canonical;
  } catch {
    throw invalidResponse("Epoch must be a lossless non-negative integer.");
  }
}

function optionalEpoch(value: unknown): string | null {
  return value === undefined ? null : exactEpoch(value);
}

function exactNonNegativeSafeInteger(value: unknown, field: string): number {
  const lexeme = isLosslessNumber(value)
    ? value.toString()
    : typeof value === "number"
      ? String(value)
      : null;
  if (lexeme === null || !/^(0|[1-9][0-9]*)$/.test(lexeme)) {
    throw invalidResponse(`${field} must be a non-negative safe integer.`);
  }
  const parsed = Number(lexeme);
  if (!Number.isSafeInteger(parsed)) {
    throw invalidResponse(`${field} must be a non-negative safe integer.`);
  }
  return parsed;
}

function exactUtc(value: unknown, field: string): string {
  if (typeof value !== "string")
    throw invalidResponse(`${field} must be an RFC 3339 UTC string.`);
  try {
    return UtcTimestamp.parse(value).canonical;
  } catch {
    throw invalidResponse(`${field} must be an RFC 3339 UTC string.`);
  }
}

function optionalUtc(value: unknown, field: string): string | null {
  return value === undefined ? null : exactUtc(value, field);
}

function exactOneMinuteInterval(barStartUtc: string, barEndUtc: string): void {
  try {
    parseOneMinuteUtcInterval(barStartUtc, barEndUtc);
  } catch {
    throw invalidResponse(
      "BarStart and BarEnd must define one exact UTC minute.",
    );
  }
}

function invalidResponse(message: string): SourceClientError {
  return new SourceClientError("INVALID_RESPONSE", message);
}
