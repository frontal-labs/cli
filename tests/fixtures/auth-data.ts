export const mockUserData = {
  id: "user_123",
  email: "test@example.com",
  name: "Test User",
  avatar: "https://example.com/avatar.jpg",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

export const mockAuthToken = {
  accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token",
  refreshToken: "refresh_token_123",
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  tokenType: "Bearer",
};

export const mockLoginResponse = {
  user: mockUserData,
  token: mockAuthToken,
};

export const mockCredentials = {
  email: "test@example.com",
  password: "password123",
};

export const mockApiKeys = [
  {
    id: "key_1",
    name: "Test Key 1",
    key: "fr_test_1234567890abcdef",
    permissions: ["read", "write"],
    createdAt: "2024-01-01T00:00:00Z",
    lastUsed: "2024-01-15T10:30:00Z",
  },
  {
    id: "key_2",
    name: "Test Key 2",
    key: "fr_test_0987654321fedcba",
    permissions: ["read"],
    createdAt: "2024-01-02T00:00:00Z",
    lastUsed: null,
  },
];
