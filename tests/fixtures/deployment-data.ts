export const mockDeployments = [
  {
    id: "deploy_123",
    name: "web-app-v1.0.0",
    version: "1.0.0",
    status: "running",
    environment: "production",
    workspaceId: "ws_123",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    deployedAt: "2024-01-01T01:00:00Z",
    url: "https://web-app.example.com",
    config: {
      replicas: 3,
      memory: "512Mi",
      cpu: "250m",
    },
  },
  {
    id: "deploy_456",
    name: "api-v2.1.0",
    version: "2.1.0",
    status: "failed",
    environment: "staging",
    workspaceId: "ws_456",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    deployedAt: null,
    url: null,
    config: {
      replicas: 1,
      memory: "256Mi",
      cpu: "100m",
    },
  },
];

export const mockContainers = [
  {
    id: "container_123",
    name: "web-server",
    image: "nginx:latest",
    status: "running",
    deploymentId: "deploy_123",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    resources: {
      memory: "512Mi",
      cpu: "250m",
    },
    ports: [
      {
        containerPort: 80,
        protocol: "TCP",
      },
    ],
  },
  {
    id: "container_456",
    name: "api-server",
    image: "node:18-alpine",
    status: "stopped",
    deploymentId: "deploy_456",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    resources: {
      memory: "256Mi",
      cpu: "100m",
    },
    ports: [
      {
        containerPort: 3000,
        protocol: "TCP",
      },
    ],
  },
];

export const mockFunctions = [
  {
    id: "func_123",
    name: "process-webhook",
    runtime: "nodejs18",
    handler: "handler.process",
    status: "active",
    workspaceId: "ws_123",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    config: {
      memory: "256Mi",
      timeout: 30,
      environment: {},
    },
  },
  {
    id: "func_456",
    name: "generate-report",
    runtime: "python3.9",
    handler: "main.generate",
    status: "inactive",
    workspaceId: "ws_123",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    config: {
      memory: "512Mi",
      timeout: 60,
      environment: {
        REPORT_TYPE: "daily",
      },
    },
  },
];
