import { getAgentByName } from "agents";
import { OdpMarketStewardAgent } from "./transport/agent";

export { OdpMarketStewardAgent };

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz" && request.method === "GET") {
      return json({
        service: "ODP Market Steward",
        classification: "MARKET DATA DEMO",
        status: "UP",
        timeBasis: "UTC",
        checkedAtUtc: new Date().toISOString(),
        marketDataChecked: false,
      });
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        service: "ODP Market Steward",
        classification: "MARKET DATA DEMO",
        mcpEndpoint: "/mcp",
        healthEndpoint: "/healthz",
      });
    }

    if (url.pathname === "/mcp") {
      const sessionId =
        request.headers.get("mcp-session-id") ?? crypto.randomUUID();
      const agent = await getAgentByName(env.MCP_SESSION_AGENT, sessionId);
      return await agent.fetch(request);
    }

    return json(
      {
        error: "NOT_FOUND",
        classification: "MARKET DATA DEMO",
      },
      404,
    );
  },
} satisfies ExportedHandler<Env>;
