export const mockOrganizations = [
  {
    id: "org_123",
    name: "Test Organization",
    slug: "test-org",
    description: "A test organization",
    plan: "pro",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "org_456",
    name: "Another Organization",
    slug: "another-org",
    description: "Another test organization",
    plan: "free",
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
  },
];

export const mockWorkspaces = [
  {
    id: "ws_123",
    name: "Production",
    slug: "prod",
    description: "Production workspace",
    orgId: "org_123",
    environment: "production",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "ws_456",
    name: "Development",
    slug: "dev",
    description: "Development workspace",
    orgId: "org_123",
    environment: "development",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

export const mockTeams = [
  {
    id: "team_123",
    name: "Engineering",
    description: "Engineering team",
    orgId: "org_123",
    memberCount: 5,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "team_456",
    name: "Product",
    description: "Product team",
    orgId: "org_123",
    memberCount: 3,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];

export const mockRoles = [
  {
    id: "role_123",
    name: "admin",
    description: "Administrator role",
    permissions: ["*"],
    orgId: "org_123",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "role_456",
    name: "developer",
    description: "Developer role",
    permissions: ["read", "write", "deploy"],
    orgId: "org_123",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  },
];
