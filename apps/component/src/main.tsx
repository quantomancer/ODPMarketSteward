import { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface ProfileView {
  readonly application?: string;
  readonly classification?: string;
  readonly evidenceMode?: string;
  readonly instrumentCount?: number;
  readonly product?: string;
  readonly standards?: readonly string[];
  readonly timeBasis?: string;
}

const fallback: ProfileView = {
  application: "ODP Market Steward",
  classification: "MARKET DATA DEMO",
  evidenceMode: "AWAITING_TOOL_RESULT",
  instrumentCount: 35,
  product: "FXLive Standard FX-35",
  standards: ["ODPS 4.1", "OpenAPI 3.1.2", "MCP Apps"],
  timeBasis: "UTC",
};

function MarketStewardPassport() {
  const [profile, setProfile] = useState<ProfileView>(fallback);
  const [bridgeState, setBridgeState] = useState("Connecting to host…");

  useEffect(() => {
    const app = new McpApp(
      { name: "odp-market-steward-component", version: "0.1.0" },
      {},
      { autoResize: true, strict: true },
    );

    app.ontoolresult = (result) => {
      if (
        typeof result.structuredContent === "object" &&
        result.structuredContent !== null
      ) {
        setProfile(result.structuredContent);
      }
    };

    void app
      .connect()
      .then(() => setBridgeState("MCP Apps host connected"))
      .catch(() => setBridgeState("Standalone preview — host not connected"));

    return () => {
      void app.close();
    };
  }, []);

  return (
    <main className="passport" aria-labelledby="passport-title">
      <div className="topline">
        <span className="demo">{profile.classification}</span>
        <span className="bridge">{bridgeState}</span>
      </div>
      <p className="eyebrow">Governed data product passport</p>
      <h1 id="passport-title">{profile.product}</h1>
      <p className="lead">
        {profile.application} makes the product contract, runtime evidence, and
        professional-use limitations inspectable inside ChatGPT.
      </p>
      <section className="metrics" aria-label="Product facts">
        <article>
          <span>Declared universe</span>
          <strong>{profile.instrumentCount} FX pairs</strong>
        </article>
        <article>
          <span>Time basis</span>
          <strong>{profile.timeBasis}</strong>
        </article>
        <article>
          <span>Evidence mode</span>
          <strong>{profile.evidenceMode}</strong>
        </article>
      </section>
      <section className="standards" aria-label="Governing contracts">
        <h2>Governing contracts</h2>
        <ul>
          {profile.standards?.map((standard) => (
            <li key={standard}>{standard}</li>
          ))}
        </ul>
      </section>
      <p className="disclaimer">
        MARKET DATA DEMO. Not investment advice and not intended for trade
        execution.
      </p>
    </main>
  );
}

const root = document.getElementById("root");
if (root === null) throw new Error("Missing component root element.");
createRoot(root).render(
  <StrictMode>
    <MarketStewardPassport />
  </StrictMode>,
);
