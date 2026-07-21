import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getProductProfile } from "@odp-market-steward/application";
import {
  productProfileInputSchema,
  productProfileOutputSchema,
} from "@odp-market-steward/mcp-contracts";
import { componentHtml } from "../../../../generated/component-resource";

export const COMPONENT_URI =
  "ui://odp-market-steward/product-passport-v0.1.0.html";

export function createStewardMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: "odp-market-steward",
      version: "0.1.0",
    },
    {
      instructions:
        "ODP Market Steward is a read-only MARKET DATA DEMO. Clearly distinguish declared product facts from observed runtime evidence and never present output as investment advice.",
    },
  );

  registerAppResource(
    server,
    "ODP Market Steward product passport",
    COMPONENT_URI,
    {
      description:
        "Professional governed-data passport for the FXLive Standard FX-35 MARKET DATA DEMO.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: {
            connectDomains: [],
            resourceDomains: [],
          },
        },
      },
    },
    () => ({
      contents: [
        {
          uri: COMPONENT_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: componentHtml,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
            },
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "get_fx_product_profile",
    {
      title: "Get governed FX product profile",
      description:
        "Returns the declared ODPS-centred profile for the 35-instrument MARKET DATA DEMO without making a market-data network call.",
      inputSchema: productProfileInputSchema,
      outputSchema: productProfileOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: {
        ui: {
          resourceUri: COMPONENT_URI,
        },
      },
    },
    () => {
      const profile = getProductProfile();
      return {
        content: [
          {
            type: "text",
            text: `${profile.product}: ${profile.instrumentCount} instruments, ${profile.timeBasis}, ${profile.classification}.`,
          },
        ],
        structuredContent: profile,
      };
    },
  );

  return server;
}
