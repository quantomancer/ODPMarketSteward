import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type JsonObject = Record<string, unknown>;

interface Disclaimer {
  readonly label?: string;
  readonly statement?: string;
}

interface Bar {
  readonly Currency?: string;
  readonly BarEnd?: string;
  readonly Open?: string;
  readonly High?: string;
  readonly Low?: string;
  readonly Close?: string;
}

interface BoardResult extends JsonObject {
  readonly status?: string;
  readonly summary?: string;
  readonly availabilityState?: string;
  readonly serviceState?: string;
  readonly bundleVersion?: string;
  readonly evidence?: JsonObject;
  readonly snapshot?: JsonObject | null;
  readonly quality?: JsonObject;
  readonly plausibility?: JsonObject;
  readonly bars?: readonly Bar[];
  readonly limitations?: readonly string[];
  readonly disclaimer?: Disclaimer;
}

interface Challenge {
  readonly challengeToken: string;
  readonly policyVersion: "1.2.0";
  readonly disclaimerDigest: string;
}

const fallback: BoardResult = {
  status: "AWAITING_TOOL_RESULT",
  summary: "Ask ChatGPT to show the governed FX market board.",
  availabilityState: "WAITING",
  serviceState: "UNKNOWN",
  bars: [],
  disclaimer: {
    label: "MARKET DATA DEMO",
    statement:
      "Demonstration service only. Use at your own risk. No responsibility or guarantee is accepted for availability or data accuracy. Not investment advice and not intended for trade execution.",
  },
};

function asObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null
    ? (value as JsonObject)
    : undefined;
}

function challengeFrom(result: unknown): Challenge | undefined {
  const meta = asObject(asObject(result)?._meta);
  const candidate = asObject(
    meta?.["odpMarketSteward/acknowledgementChallenge"],
  );
  if (
    typeof candidate?.challengeToken === "string" &&
    candidate.policyVersion === "1.2.0" &&
    typeof candidate.disclaimerDigest === "string"
  ) {
    return candidate as unknown as Challenge;
  }
  return undefined;
}

function text(value: unknown, fallbackValue = "—"): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallbackValue;
}

function MarketBoardComponent() {
  const appRef = useRef<McpApp | undefined>(undefined);
  const [result, setResult] = useState<BoardResult>(fallback);
  const [challenge, setChallenge] = useState<Challenge>();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Connecting to ChatGPT…");

  const bars = result.bars ?? [];
  const sortedBars = useMemo(
    () =>
      [...bars].sort((left, right) =>
        text(left.Currency).localeCompare(text(right.Currency)),
      ),
    [bars],
  );
  const disclosureRequired = result.status === "DISCLOSURE_REQUIRED";

  useEffect(() => {
    const app = new McpApp(
      { name: "odp-market-steward-component", version: "0.2.0" },
      {},
      { autoResize: true, strict: true },
    );
    appRef.current = app;

    app.ontoolresult = (toolResult) => {
      const structured = asObject(toolResult.structuredContent);
      if (structured !== undefined) setResult(structured as BoardResult);
      setChallenge(challengeFrom(toolResult));
      setNotice(
        toolResult.isError === true
          ? "Request could not be completed."
          : "Governed result received.",
      );
    };

    void app
      .connect()
      .then(() => {
        setConnected(true);
        setNotice("Connected to ChatGPT");
      })
      .catch(() => setNotice("Standalone preview — waiting for ChatGPT host"));

    return () => {
      appRef.current = undefined;
      void app.close();
    };
  }, []);

  async function acknowledgeAndContinue() {
    const app = appRef.current;
    if (app === undefined || challenge === undefined) return;
    setBusy(true);
    setNotice("Recording acknowledgement…");
    try {
      const acknowledgement = await app.callServerTool({
        name: "acknowledge_market_data_demo",
        arguments: {
          affirmed: true,
          policyVersion: challenge.policyVersion,
          disclaimerDigest: challenge.disclaimerDigest,
          challengeToken: challenge.challengeToken,
        },
      });
      if (acknowledgement.isError === true)
        throw new Error("Acknowledgement rejected");
      setNotice("Loading current governed board…");
      const board = await app.callServerTool({
        name: "get_fx_market_board",
        arguments: { evidenceMode: "LIVE_ONLY" },
      });
      const structured = asObject(board.structuredContent);
      if (structured !== undefined) setResult(structured as BoardResult);
      setChallenge(challengeFrom(board));
      setNotice(
        board.isError === true
          ? "Market board unavailable."
          : "Current board loaded.",
      );
    } catch {
      setNotice(
        "Acknowledgement flow could not complete. Ask ChatGPT to retry the board.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const app = appRef.current;
    if (app === undefined) return;
    setBusy(true);
    setNotice("Refreshing current completed bars…");
    try {
      const previousBarEndUtc =
        typeof result.snapshot?.barEndUtc === "string"
          ? result.snapshot.barEndUtc
          : null;
      const refreshed = await app.callServerTool({
        name: "get_fx_market_board",
        arguments: { evidenceMode: "LIVE_ONLY", previousBarEndUtc },
      });
      const structured = asObject(refreshed.structuredContent);
      if (structured !== undefined) setResult(structured as BoardResult);
      setChallenge(challengeFrom(refreshed));
      setNotice(
        refreshed.isError === true
          ? "Refresh unavailable."
          : "Refresh complete.",
      );
    } catch {
      setNotice("Refresh could not complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const disclaimer = result.disclaimer ?? fallback.disclaimer;
  const returnedCount = result.snapshot?.returnedCount ?? bars.length;

  return (
    <main className="board-shell" aria-labelledby="board-title">
      <header className="hero">
        <div>
          <div className="brandline">
            <span className="demo">MARKET DATA DEMO</span>
            <span
              className={`state state-${text(result.availabilityState, "waiting").toLowerCase()}`}
            >
              {text(result.availabilityState, "WAITING")}
            </span>
          </div>
          <p className="eyebrow">ODP Market Steward</p>
          <h1 id="board-title">Governed FX-35 market board</h1>
          <p className="lead">
            Live completed-bar evidence, contract provenance and quality signals
            — directly inside ChatGPT.
          </p>
        </div>
        <button
          className="refresh"
          type="button"
          onClick={() => void refresh()}
          disabled={!connected || busy || disclosureRequired}
        >
          {busy ? "Working…" : "Refresh"}
        </button>
      </header>

      <section className="status-grid" aria-label="Market board status">
        <article>
          <span>Coverage</span>
          <strong>{text(returnedCount)} / 35</strong>
        </article>
        <article>
          <span>Bar end (UTC)</span>
          <strong>{text(result.snapshot?.barEndUtc, "Awaiting data")}</strong>
        </article>
        <article>
          <span>Evidence</span>
          <strong>{text(result.evidence?.evidenceMode, "NONE")}</strong>
        </article>
        <article>
          <span>OHLC validity</span>
          <strong>
            {text(result.quality?.passed, "0")} pass ·{" "}
            {text(result.quality?.failed, "0")} fail
          </strong>
        </article>
      </section>

      {disclosureRequired ? (
        <section className="consent" aria-labelledby="consent-title">
          <p className="consent-kicker">Before retrieving market data</p>
          <h2 id="consent-title">Acknowledge the demo conditions</h2>
          <p>{disclaimer?.statement}</p>
          <button
            type="button"
            onClick={() => void acknowledgeAndContinue()}
            disabled={!connected || busy || challenge === undefined}
          >
            {busy ? "Loading…" : "Acknowledge and show market board"}
          </button>
          {challenge === undefined && (
            <small>
              Ask ChatGPT to retry if the acknowledgement control is
              unavailable.
            </small>
          )}
        </section>
      ) : sortedBars.length > 0 ? (
        <section className="table-card" aria-labelledby="rates-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Current completed minute</p>
              <h2 id="rates-title">35 standard instruments</h2>
            </div>
            <span>{text(result.serviceState)}</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Open</th>
                  <th>High</th>
                  <th>Low</th>
                  <th>Close</th>
                  <th>Quality</th>
                </tr>
              </thead>
              <tbody>
                {sortedBars.map((bar) => (
                  <tr key={text(bar.Currency)}>
                    <th scope="row">{text(bar.Currency)}</th>
                    <td>{text(bar.Open)}</td>
                    <td>{text(bar.High)}</td>
                    <td>{text(bar.Low)}</td>
                    <td className="close">{text(bar.Close)}</td>
                    <td>
                      <span className="quality-pass">OHLC valid</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="empty">
          <h2>Ready for governed discovery</h2>
          <p>{result.summary}</p>
          <p>Ask: “Show me the current governed FX-35 market board.”</p>
        </section>
      )}

      <section className="governance" aria-label="Governance evidence">
        <div>
          <span>ODPS</span>
          <strong>4.1 product contract</strong>
        </div>
        <div>
          <span>Bundle</span>
          <strong>{text(result.bundleVersion, "Validated bundle")}</strong>
        </div>
        <div>
          <span>Plausibility</span>
          <strong>{text(result.plausibility?.state, "Not evaluated")}</strong>
        </div>
        <div>
          <span>Fitness</span>
          <strong>Not assessed</strong>
        </div>
      </section>

      <footer>
        <p>
          <strong>{disclaimer?.label ?? "MARKET DATA DEMO"}.</strong>{" "}
          {disclaimer?.statement}
        </p>
        <p className="bridge" aria-live="polite">
          {notice}
        </p>
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("Missing component root element.");
createRoot(root).render(
  <StrictMode>
    <MarketBoardComponent />
  </StrictMode>,
);
