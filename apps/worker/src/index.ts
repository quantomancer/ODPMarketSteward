import { routeEdgeRequest } from "./routing/edge-router";
import { OdpMarketStewardAgent } from "./transport/agent";

export { OdpMarketStewardAgent };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return await routeEdgeRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
