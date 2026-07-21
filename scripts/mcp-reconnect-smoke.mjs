import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 8790;
const baseUrl = `http://127.0.0.1:${port}`;
const wrangler = new URL(
  "../node_modules/wrangler/bin/wrangler.js",
  import.meta.url,
).pathname;

async function startWorker() {
  const child = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--port",
      String(port),
      "--ip",
      "127.0.0.1",
      "--persist-to",
      ".wrangler/state",
      "--log-level",
      "error",
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let diagnostics = "";
  child.stdout.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    diagnostics += chunk.toString();
  });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Local Worker stopped early.\n${diagnostics}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return { child, diagnostics: () => diagnostics };
    } catch {
      // The local runtime is still starting.
    }
    await delay(125);
  }
  child.kill("SIGTERM");
  throw new Error(`Local Worker did not become ready.\n${diagnostics}`);
}

async function stopWorker(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5_000).then(() => child.kill("SIGKILL")),
  ]);
}

async function mcp(body, sessionId) {
  const headers = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };
  if (sessionId !== undefined) headers["mcp-session-id"] = sessionId;
  return await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

let first;
let second;
try {
  first = await startWorker();
  const initialize = await mcp({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "workerd-reconnect-smoke", version: "0.1.0" },
    },
  });
  if (!initialize.ok) {
    throw new Error(
      `Initialize failed (${initialize.status}): ${await initialize.text()}`,
    );
  }
  const sessionId = initialize.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("Initialize returned no MCP session id.");
  await stopWorker(first.child);

  second = await startWorker();
  const tools = await mcp(
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    sessionId,
  );
  const toolsBody = await tools.json();
  if (
    !tools.ok ||
    toolsBody.result?.tools?.length !== 1 ||
    toolsBody.result.tools[0]?.name !== "get_fx_product_profile" ||
    toolsBody.result.tools[0]?.inputSchema?.$id !==
      "urn:odp-market-steward:mcp:get_fx_product_profile:input:v1.5.0" ||
    toolsBody.result.tools[0]?.outputSchema?.$id !==
      "urn:odp-market-steward:mcp:get_fx_product_profile:output:v1.5.0" ||
    toolsBody.result.tools[0]?.securitySchemes?.[0]?.type !== "noauth" ||
    toolsBody.result.tools[0]?._meta?.securitySchemes?.[0]?.type !== "noauth"
  ) {
    throw new Error(
      `Persisted tools/list failed (${tools.status}): ${JSON.stringify(toolsBody)}`,
    );
  }

  const toolResult = await mcp(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_fx_product_profile",
        arguments: { sections: ["identity"] },
      },
    },
    sessionId,
  );
  const toolBody = await toolResult.json();
  if (
    !toolResult.ok ||
    toolBody.result?.isError === true ||
    toolBody.result?.structuredContent?.productId !==
      "fxlive-market-data-demo-fx35" ||
    toolBody.result?.structuredContent?.disclaimer?.label !== "MARKET DATA DEMO"
  ) {
    throw new Error(
      `Persisted tools/call failed (${toolResult.status}): ${JSON.stringify(toolBody)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        runtime: "local workerd",
        restartPersistence: true,
        sessionIdReturned: true,
        toolDiscovered: "get_fx_product_profile",
        classification: "MARKET DATA DEMO",
      },
      null,
      2,
    ),
  );
} finally {
  if (first) await stopWorker(first.child);
  if (second) await stopWorker(second.child);
}
