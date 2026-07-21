/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-is-pure",
      severity: "error",
      from: { path: "^packages/domain" },
      to: {
        path: "^(apps|packages/(adapter-|application|contract-runtime|mcp-contracts))",
      },
    },
    {
      name: "component-cannot-import-server",
      severity: "error",
      from: { path: "^apps/component" },
      to: { path: "^(apps/worker|packages/adapter-|packages/application)" },
    },
    {
      name: "application-cannot-import-concrete-adapters",
      severity: "error",
      from: { path: "^packages/application" },
      to: { path: "^packages/adapter-" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot:
          "(^|/)(vite|vitest)\\.config\\.ts$|^packages/telemetry/src/index\\.ts$|^apps/worker/src/security/session-id-codec\\.ts$",
      },
      to: {},
    },
  ],
  options: {
    exclude: { path: "(^|/)dist/" },
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: { exportsFields: ["exports"] },
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]+" } },
  },
};
