// CLI Output Snapshots
// This file contains expected output snapshots for CLI commands

export const snapshots = {
  // Authentication snapshots
  auth: {
    loginSuccess: "✓ Successfully logged in as test@example.com",
    logoutSuccess: "✓ Successfully logged out",
    statusAuthenticated:
      "✓ Authenticated as test@example.com (test@example.com)",
    statusNotAuthenticated: "✗ Not authenticated",
    whoamiOutput: `User: test@example.com
Name: Test User
Organization: Test Organization
Workspace: Production`,
  },

  // Configuration snapshots
  config: {
    listOutput: `Available profiles:
  default  - https://api.frontal.ai
  dev      - https://dev-api.frontal.ai
  prod     - https://prod-api.frontal.ai`,
    getOutput: "apiUrl: https://api.frontal.ai",
    setSuccess: "✓ Configuration updated: apiUrl = https://new-api.frontal.ai",
    unsetSuccess: "✓ Configuration removed: apiUrl",
    profileCreateSuccess: "✓ Profile 'new-profile' created",
    profileDeleteSuccess: "✓ Profile 'old-profile' deleted",
    profileUseSuccess: "✓ Switched to profile 'dev'",
  },

  // Organization snapshots
  orgs: {
    listOutput: `Organizations:
  org_123  Test Organization  test-org  pro
  org_456  Another Org        another-org  free`,
    createSuccess: "✓ Organization 'New Org' created",
    deleteSuccess: "✓ Organization 'test-org' deleted",
  },

  // Workspace snapshots
  workspaces: {
    listOutput: `Workspaces:
  ws_123  Production  prod  production  org_123
  ws_456  Development  dev  development  org_123`,
    createSuccess: "✓ Workspace 'staging' created",
    deleteSuccess: "✓ Workspace 'test' deleted",
  },

  // Deployment snapshots
  deployments: {
    listOutput: `Deployments:
  deploy_123  web-app-v1.0.0  running    production  https://web-app.example.com
  deploy_456  api-v2.1.0      failed     staging     -`,
    createSuccess: "✓ Deployment 'web-app-v1.0.0' created",
    statusOutput: `Deployment: web-app-v1.0.0
Status: running
Environment: production
URL: https://web-app.example.com
Created: 2024-01-01T00:00:00Z
Updated: 2024-01-01T00:00:00Z`,
    deleteSuccess: "✓ Deployment 'web-app-v1.0.0' deleted",
  },

  // Container snapshots
  containers: {
    listOutput: `Containers:
  container_123  web-server  nginx:latest  running  512Mi  250m
  container_456  api-server  node:18      stopped  256Mi  100m`,
    scaleSuccess: "✓ Container 'web-server' scaled to 5 replicas",
    restartSuccess: "✓ Container 'web-server' restarted",
  },

  // Function snapshots
  functions: {
    listOutput: `Functions:
  func_123  process-webhook  nodejs18  active   256Mi  30s
  func_456  generate-report  python3.9  inactive  512Mi  60s`,
    createSuccess: "✓ Function 'process-webhook' created",
    updateSuccess: "✓ Function 'process-webhook' updated",
    deleteSuccess: "✓ Function 'process-webhook' deleted",
  },

  // API Key snapshots
  apiKeys: {
    listOutput: `API Keys:
  key_1  Test Key 1  fr_test_1234567890abcdef  read,write    2024-01-15T10:30:00Z
  key_2  Test Key 2  fr_test_0987654321fedcba  read         -`,
    createSuccess: "✓ API Key 'Test Key' created: fr_test_newkey123456",
    deleteSuccess: "✓ API Key 'test-key' deleted",
  },

  // Team snapshots
  teams: {
    listOutput: `Teams:
  team_123  Engineering  Engineering team  5 members
  team_456  Product      Product team      3 members`,
    createSuccess: "✓ Team 'New Team' created",
    deleteSuccess: "✓ Team 'old-team' deleted",
  },

  // Role snapshots
  roles: {
    listOutput: `Roles:
  role_123  admin      Administrator role  *
  role_456  developer  Developer role      read,write,deploy`,
    createSuccess: "✓ Role 'viewer' created",
    deleteSuccess: "✓ Role 'old-role' deleted",
  },

  // Policy snapshots
  policies: {
    listOutput: `Policies:
  policy_123  read-access  Read access policy  resources:read
  policy_456  admin-access Admin access policy  *`,
    createSuccess: "✓ Policy 'new-policy' created",
    deleteSuccess: "✓ Policy 'old-policy' deleted",
  },

  // Billing snapshots
  billing: {
    statusOutput: `Billing Status:
  Plan: Pro
  Status: Active
  Current Period: 2024-01-01 to 2024-02-01
  Usage: $45.67 of $100.00`,
    invoiceListOutput: `Invoices:
  inv_123  January 2024  $45.67  paid    2024-01-15
  inv_456  December 2023 $38.90  paid    2023-12-15`,
  },

  // Metrics snapshots
  metrics: {
    deploymentOutput: `Deployment Metrics:
  CPU Usage: 45.2% (100Mi / 250m)
  Memory Usage: 50.0% (256Mi / 512Mi)
  Requests: 1,250 total (1,240 success, 10 errors)
  Response Time: 120ms avg, 250ms p95, 450ms p99`,
    functionOutput: `Function Metrics:
  Invocations: 5,000 total
  Errors: 25 (0.5% error rate)
  Duration: 150ms avg, 500ms p95
  Cold Starts: 50 (1.0% cold start rate)`,
  },

  // Logs snapshots
  logs: {
    deploymentOutput: `[2024-01-01T10:00:00Z] INFO  Container started
[2024-01-01T10:01:00Z] INFO  Ready to serve requests
[2024-01-01T10:02:30Z] WARN  High memory usage detected
[2024-01-01T10:03:15Z] ERROR Request timeout`,
    functionOutput: `[2024-01-01T10:00:00Z] START RequestId: req_123
[2024-01-01T10:00:00.100Z] INFO  Processing webhook
[2024-01-01T10:00:00.250Z] INFO  Webhook processed successfully
[2024-01-01T10:00:00.300Z] END   RequestId: req_123 Duration: 300ms`,
  },

  // Webhook snapshots
  webhooks: {
    listOutput: `Webhooks:
  webhook_123  deploy-webhook  deployment.created  https://example.com/webhook  active
  webhook_456  error-webhook   deployment.failed   https://errors.example.com  inactive`,
    createSuccess: "✓ Webhook 'deploy-webhook' created",
    deleteSuccess: "✓ Webhook 'old-webhook' deleted",
  },

  // Feature flag snapshots
  flags: {
    listOutput: `Feature Flags:
  flag_123  new-ui      New user interface  75.0%  active
  flag_456  beta-api    Beta API access      25.0%  inactive`,
    createSuccess: "✓ Feature flag 'new-feature' created",
    updateSuccess: "✓ Feature flag 'new-feature' updated",
    deleteSuccess: "✓ Feature flag 'old-feature' deleted",
  },

  // Status snapshots
  status: {
    output: `Frontal CLI Status:
  Version: 0.1.0
  API: https://api.frontal.ai
  Organization: Test Organization (org_123)
  Workspace: Production (ws_123)
  Authentication: ✓ Authenticated as test@example.com
  Configuration: /test/home/.frontal/config.json`,
  },

  // Marketplace snapshots
  marketplace: {
    listOutput: `Marketplace Items:
  item_123  Redis Cache     Database     redis-cache     $10.00/month
  item_456  PostgreSQL     Database     postgresql       $25.00/month`,
    installSuccess: "✓ 'Redis Cache' installed successfully",
    uninstallSuccess: "✓ 'Redis Cache' uninstalled successfully",
  },

  // Support snapshots
  support: {
    ticketCreateSuccess: "✓ Support ticket created: #12345",
    ticketListOutput: `Support Tickets:
  #12345  API Issue     open      2024-01-01  High
  #12344  Billing Question  closed  2023-12-15  Medium`,
  },

  // Service snapshots
  services: {
    listOutput: `Services:
  service_123  web-app  web-app-v1.0.0  running  https://web-app.example.com
  service_456  api     api-v2.1.0      running  https://api.example.com`,
    startSuccess: "✓ Service 'web-app' started",
    stopSuccess: "✓ Service 'web-app' stopped",
    restartSuccess: "✓ Service 'web-app' restarted",
  },

  // Error snapshots
  errors: {
    unauthorized: "✗ Unauthorized: Invalid or missing API key",
    forbidden: "✗ Forbidden: Insufficient permissions",
    notFound: "✗ Not Found: Resource not found",
    rateLimited: "✗ Rate Limited: Too many requests. Try again in 60 seconds",
    serverError: "✗ Internal Server Error: Something went wrong",
    networkError: "✗ Network Error: Failed to connect to API",
    configError: "✗ Configuration Error: Invalid configuration format",
    validationError: "✗ Validation Error: Invalid input provided",
  },

  // Help snapshots
  help: {
    mainHelp: `Frontal CLI - command-line interface for Frontal

Usage: frontal [options] [command]

Options:
  -p, --profile <name>      Config profile (default: "default")
  -o, --org <id>           Organization context
  -w, --workspace <id>      Workspace context
  --api-key <key>          Override API key
  --api-url <url>          Override API base URL
  -j, --json               Output as JSON
  --yaml                   Output as YAML
  -q, --quiet              Suppress non-essential output
  -v, --verbose            Verbose logging
  --debug                  Debug mode
  --no-color               Disable colors
  -h, --help               Display help for command
  --version                Display version

Commands:
  auth                     Authentication commands
  config                   Configuration commands
  orgs                     Organization commands
  workspaces               Workspace commands
  teams                    Team commands
  roles                    Role commands
  policies                 Policy commands
  api-keys                 API key commands
  billing                  Billing commands
  deployments              Deployment commands
  containers               Container commands
  functions                Function commands
  metrics                  Metrics commands
  logs                     Log commands
  webhooks                 Webhook commands
  flags                    Feature flag commands
  status                   Status command
  marketplace              Marketplace commands
  support                  Support commands
  services                 Service commands
  completion               Shell completion commands`,
  },
};
