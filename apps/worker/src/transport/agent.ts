import { Agent } from "agents";
import {
  createMcpHandler,
  type TransportState,
  WorkerTransport,
} from "agents/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createStewardMcpServer } from "../mcp/server";

const TRANSPORT_STATE_KEY = "mcp-transport-state";

export class OdpMarketStewardAgent extends Agent<Env> {
  private mcpServer: McpServer | undefined;
  private mcpTransport: WorkerTransport | undefined;

  override async onRequest(request: Request): Promise<Response> {
    this.mcpServer ??= createStewardMcpServer();
    this.mcpTransport ??= new WorkerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => this.name,
      storage: {
        get: async () =>
          await this.ctx.storage.get<TransportState>(TRANSPORT_STATE_KEY),
        set: async (state) => {
          await this.ctx.storage.put(TRANSPORT_STATE_KEY, state);
        },
      },
      corsOptions: {
        origin: "*",
        methods: "GET, POST, DELETE, OPTIONS",
        headers: "content-type, accept, mcp-protocol-version, mcp-session-id",
        exposeHeaders: "mcp-session-id",
      },
    });

    return await createMcpHandler(this.mcpServer, {
      route: "/mcp",
      transport: this.mcpTransport,
    })(request, this.env, this.ctx as unknown as ExecutionContext);
  }
}
