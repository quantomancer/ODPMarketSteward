import { getAgentByName } from "agents";

function json(payload: unknown, status = 200): Response {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function routeEdgeRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/healthz") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return json({
      service: "ODP Market Steward",
      classification: "MARKET DATA DEMO",
      status: "UP",
      timeBasis: "UTC",
      checkedAtUtc: new Date().toISOString(),
      marketDataChecked: false,
    });
  }

  if (url.pathname === "/") {
    if (request.method !== "GET") return methodNotAllowed("GET");
    return json({
      service: "ODP Market Steward",
      classification: "MARKET DATA DEMO",
      mcpEndpoint: "/mcp",
      healthEndpoint: "/healthz",
    });
  }

  if (url.pathname === "/mcp") {
    if (!["GET", "POST", "DELETE", "OPTIONS"].includes(request.method)) {
      return methodNotAllowed("GET, POST, DELETE, OPTIONS");
    }
    const sessionId =
      request.headers.get("mcp-session-id") ?? crypto.randomUUID();
    const agent = await getAgentByName(env.MCP_SESSION_AGENT, sessionId);
    return await agent.fetch(request);
  }

  return json({ error: "NOT_FOUND", classification: "MARKET DATA DEMO" }, 404);
}

function methodNotAllowed(allow: string): Response {
  return Response.json(
    { error: "METHOD_NOT_ALLOWED", classification: "MARKET DATA DEMO" },
    { status: 405, headers: { allow, "cache-control": "no-store" } },
  );
}
