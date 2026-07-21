import { Agent } from "agents";
import {
  createMcpHandler,
  type TransportState,
  WorkerTransport,
} from "agents/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SessionAcknowledgementService,
  type AcknowledgementState,
  type AcknowledgementStatePort,
} from "@odp-market-steward/application";
import { createStewardMcpServer } from "../mcp/server";

const TRANSPORT_STATE_KEY = "mcp-transport-state";
const ACKNOWLEDGEMENT_STATE_KEY = "acknowledgement-state";

export class OdpMarketStewardAgent extends Agent<Env> {
  private mcpServer: McpServer | undefined;
  private mcpTransport: WorkerTransport | undefined;

  override async onRequest(request: Request): Promise<Response> {
    const acknowledgementService = this.#acknowledgementService();
    this.mcpServer ??= await createStewardMcpServer(
      acknowledgementService === undefined ? {} : { acknowledgementService },
    );
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

  #acknowledgementService(): SessionAcknowledgementService | undefined {
    const bindings = this.env as Env & {
      readonly ACK_CHALLENGE_CURRENT_KEY_ID?: string;
      readonly ACK_CHALLENGE_CURRENT_KEY?: string;
      readonly ACK_CHALLENGE_PREVIOUS_KEY_ID?: string;
      readonly ACK_CHALLENGE_PREVIOUS_KEY?: string;
      readonly ACK_CHALLENGE_LIFETIME_SECONDS?: string;
      readonly ACK_MAX_CLOCK_SKEW_SECONDS?: string;
    };
    const currentId = bindings.ACK_CHALLENGE_CURRENT_KEY_ID;
    const currentSecret = bindings.ACK_CHALLENGE_CURRENT_KEY;
    const lifetime = positiveInteger(bindings.ACK_CHALLENGE_LIFETIME_SECONDS);
    const skew = nonNegativeInteger(bindings.ACK_MAX_CLOCK_SKEW_SECONDS);
    if (
      currentId === undefined ||
      currentSecret === undefined ||
      lifetime === null ||
      skew === null
    ) {
      return undefined;
    }
    const previousId = bindings.ACK_CHALLENGE_PREVIOUS_KEY_ID;
    const previousSecret = bindings.ACK_CHALLENGE_PREVIOUS_KEY;
    if ((previousId === undefined) !== (previousSecret === undefined)) {
      return undefined;
    }
    const storage = this.ctx.storage;
    const state: AcknowledgementStatePort = {
      read: async () =>
        (await storage.get<AcknowledgementState>(ACKNOWLEDGEMENT_STATE_KEY)) ??
        null,
      transition: async <T>(
        operation: (current: AcknowledgementState | null) => {
          readonly next: AcknowledgementState | null;
          readonly result: T;
        },
      ) =>
        await storage.transaction(async (transaction) => {
          const current =
            (await transaction.get<AcknowledgementState>(
              ACKNOWLEDGEMENT_STATE_KEY,
            )) ?? null;
          const transition = operation(current);
          if (transition.next === null) {
            await transaction.delete(ACKNOWLEDGEMENT_STATE_KEY);
          } else {
            await transaction.put(ACKNOWLEDGEMENT_STATE_KEY, transition.next);
          }
          return transition.result;
        }),
      clear: async () => {
        await storage.delete(ACKNOWLEDGEMENT_STATE_KEY);
      },
    };
    return new SessionAcknowledgementService({
      sessionIdentifier: this.name,
      currentKey: {
        id: currentId,
        secret: new TextEncoder().encode(currentSecret),
      },
      ...(previousId === undefined || previousSecret === undefined
        ? {}
        : {
            previousKeys: [
              {
                id: previousId,
                secret: new TextEncoder().encode(previousSecret),
              },
            ],
          }),
      challengeLifetimeSeconds: lifetime,
      maximumClockSkewSeconds: skew,
      state,
    });
  }
}

function positiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function nonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
