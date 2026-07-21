import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getProductProfile } from "@odp-market-steward/application";
import {
  BundleLoader,
  ContractRegistry,
} from "@odp-market-steward/contract-runtime";
import {
  MCP_TOOL_SCHEMAS,
  createMcpToolSchema,
  type ProductProfile,
  type ProductProfileInput,
} from "@odp-market-steward/mcp-contracts";
import { componentHtml } from "../../../../generated/component-resource";
import { governedBundle } from "../../../../generated/governed-bundle";
export {
  MCP_PROTOCOL_ERROR_POLICY,
  mapApplicationToolError,
} from "./safe-errors";

export const COMPONENT_URI =
  "ui://odp-market-steward/product-passport-v0.1.0.html";

let registryPromise: Promise<ContractRegistry> | undefined;

async function loadRegistry(): Promise<ContractRegistry> {
  registryPromise ??= new BundleLoader()
    .load(governedBundle)
    .then((bundle) => new ContractRegistry(bundle));
  return await registryPromise;
}

export async function createStewardMcpServer(): Promise<McpServer> {
  const registry = await loadRegistry();
  const profileSource = registry.productProfile();
  const profileTool = registry.mcpTool("get_fx_product_profile");
  assertDescriptorSchemaParity(profileTool.inputSchemaRef, "input");
  assertDescriptorSchemaParity(profileTool.outputSchemaRef, "output");
  const profileInputSchema = createMcpToolSchema<ProductProfileInput>(
    "get_fx_product_profile",
    "input",
  );
  const profileOutputSchema = createMcpToolSchema<ProductProfile>(
    "get_fx_product_profile",
    "output",
  );
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
    profileTool.name,
    {
      title: profileTool.title,
      description: profileTool.description,
      inputSchema: profileInputSchema,
      outputSchema: profileOutputSchema,
      annotations: profileTool.annotations,
      _meta: profileTool.meta,
    },
    (input: ProductProfileInput) => {
      const profile = getProductProfile(
        input,
        profileSource,
        new Date().toISOString(),
      );
      return {
        content: [
          {
            type: "text" as const,
            text: profile.summary,
          },
        ],
        structuredContent: profile as unknown as Record<string, unknown>,
      };
    },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: profileTool.name,
        title: profileTool.title,
        description: profileTool.description,
        inputSchema: MCP_TOOL_SCHEMAS.get_fx_product_profile.input,
        outputSchema: MCP_TOOL_SCHEMAS.get_fx_product_profile.output,
        annotations: profileTool.annotations,
        securitySchemes: profileTool.securitySchemes,
        _meta: profileTool.meta,
      },
    ],
  }));

  return server;
}

function assertDescriptorSchemaParity(
  declaredReference: string,
  direction: "input" | "output",
): void {
  const generatedReference =
    MCP_TOOL_SCHEMAS.get_fx_product_profile[direction].$ref;
  const expectedReference = generatedReference.replace(
    "#/$defs/",
    "#/schemas/",
  );
  if (declaredReference !== expectedReference) {
    throw new Error(
      `Generated ${direction} schema root ${generatedReference} does not match governed reference ${declaredReference}.`,
    );
  }
}
