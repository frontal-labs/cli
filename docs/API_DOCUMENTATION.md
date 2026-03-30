# API Documentation

This guide covers the Frontal API and how to interact with it programmatically using the CLI.

## Overview

The Frontal CLI is built on top of the Frontal REST API, which provides comprehensive access to all platform features. While the CLI abstracts most API interactions, understanding the underlying API can help with automation, integration, and troubleshooting.

## API Basics

### Base URL

The default API base URL is:

```
https://api.frontal.dev/v1
```

### Authentication

The API uses API key authentication. Include your API key in the Authorization header:

```bash
Authorization: Bearer frt_your_api_key_here
```

### Content Types

- **Request Content-Type**: `application/json`
- **Response Content-Type**: `application/json`

### HTTP Methods

- **GET**: Retrieve resources
- **POST**: Create resources
- **PUT**: Update resources (full replacement)
- **PATCH**: Update resources (partial update)
- **DELETE**: Remove resources

## API Endpoints

### Authentication

#### Validate API Key

```bash
GET /auth/validate
```

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "orgs": ["org-456", "org-789"]
}
```

### Organizations

#### List Organizations

```bash
GET /orgs
```

**Response:**
```json
{
  "organizations": [
    {
      "id": "org-123",
      "name": "Acme Corp",
      "description": "Main organization",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1
  }
}
```

#### Get Organization

```bash
GET /orgs/{orgId}
```

#### Create Organization

```bash
POST /orgs
```

**Request Body:**
```json
{
  "name": "New Organization",
  "description": "Organization description"
}
```

#### Update Organization

```bash
PUT /orgs/{orgId}
```

#### Delete Organization

```bash
DELETE /orgs/{orgId}
```

### Workspaces

#### List Workspaces

```bash
GET /orgs/{orgId}/workspaces
```

**Response:**
```json
{
  "workspaces": [
    {
      "id": "ws-123",
      "name": "Development",
      "description": "Development workspace",
      "orgId": "org-456",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Workspace

```bash
GET /workspaces/{workspaceId}
```

#### Create Workspace

```bash
POST /orgs/{orgId}/workspaces
```

#### Update Workspace

```bash
PUT /workspaces/{workspaceId}
```

#### Delete Workspace

```bash
DELETE /workspaces/{workspaceId}
```

### Functions

#### List Functions

```bash
GET /workspaces/{workspaceId}/functions
```

**Response:**
```json
{
  "functions": [
    {
      "id": "fn-123",
      "name": "my-function",
      "description": "Sample function",
      "runtime": "nodejs18",
      "memory": 256,
      "timeout": 30,
      "environment": {},
      "status": "active",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Function

```bash
GET /functions/{functionId}
```

#### Create Function

```bash
POST /workspaces/{workspaceId}/functions
```

**Request Body:**
```json
{
  "name": "new-function",
  "description": "Function description",
  "runtime": "nodejs18",
  "memory": 256,
  "timeout": 30,
  "code": "exports.handler = async (event) => { return 'Hello World'; };",
  "environment": {
    "API_KEY": "secret-key"
  }
}
```

#### Update Function

```bash
PUT /functions/{functionId}
```

#### Delete Function

```bash
DELETE /functions/{functionId}
```

#### Invoke Function

```bash
POST /functions/{functionId}/invoke
```

**Request Body:**
```json
{
  "data": {
    "message": "Hello"
  }
}
```

**Response:**
```json
{
  "statusCode": 200,
  "body": "Hello World",
  "logs": ["Log entry 1", "Log entry 2"],
  "executionTime": 150
}
```

### Containers

#### List Containers

```bash
GET /workspaces/{workspaceId}/containers
```

#### Get Container

```bash
GET /containers/{containerId}
```

#### Create Container

```bash
POST /workspaces/{workspaceId}/containers
```

**Request Body:**
```json
{
  "name": "my-container",
  "image": "nginx:latest",
  "port": 80,
  "replicas": 1,
  "environment": {
    "ENV": "production"
  },
  "resources": {
    "cpu": "100m",
    "memory": "256Mi"
  }
}
```

#### Update Container

```bash
PUT /containers/{containerId}
```

#### Delete Container

```bash
DELETE /containers/{containerId}
```

### Workflows

#### List Workflows

```bash
GET /workspaces/{workspaceId}/workflows
```

#### Get Workflow

```bash
GET /workflows/{workflowId}
```

#### Create Workflow

```bash
POST /workspaces/{workspaceId}/workflows
```

**Request Body:**
```json
{
  "name": "my-workflow",
  "description": "Workflow description",
  "definition": {
    "steps": [
      {
        "id": "step1",
        "type": "function",
        "functionId": "fn-123",
        "inputs": {}
      }
    ]
  }
}
```

#### Update Workflow

```bash
PUT /workflows/{workflowId}
```

#### Delete Workflow

```bash
DELETE /workflows/{workflowId}
```

#### Run Workflow

```bash
POST /workflows/{workflowId}/run
```

**Request Body:**
```json
{
  "input": {
    "data": "value"
  }
}
```

### Pipelines

#### List Pipelines

```bash
GET /workspaces/{workspaceId}/pipelines
```

#### Get Pipeline

```bash
GET /pipelines/{pipelineId}
```

#### Create Pipeline

```bash
POST /workspaces/{workspaceId}/pipelines
```

#### Update Pipeline

```bash
PUT /pipelines/{pipelineId}
```

#### Delete Pipeline

```bash
DELETE /pipelines/{pipelineId}
```

#### Run Pipeline

```bash
POST /pipelines/{pipelineId}/run
```

### Metrics

#### Get Metrics

```bash
GET /metrics/{resourceType}/{resourceId}
```

**Query Parameters:**
- `metric`: Metric name
- `from`: Start time (ISO 8601)
- `to`: End time (ISO 8601)
- `granularity`: Data granularity (1m, 5m, 1h, 1d)

**Response:**
```json
{
  "metrics": [
    {
      "name": "invocations",
      "values": [
        {
          "timestamp": "2024-01-15T10:00:00Z",
          "value": 100
        }
      ]
    }
  ]
}
```

#### List Available Metrics

```bash
GET /metrics/{resourceType}
```

### Logs

#### List Logs

```bash
GET /logs
```

**Query Parameters:**
- `resource`: Resource type and ID (e.g., "function:fn-123")
- `from`: Start time (ISO 8601)
- `to`: End time (ISO 8601)
- `level`: Log level (error, warn, info, debug)
- `limit`: Maximum number of logs

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "level": "info",
      "message": "Function executed successfully",
      "resource": {
        "type": "function",
        "id": "fn-123"
      },
      "metadata": {}
    }
  ]
}
```

### Teams

#### List Teams

```bash
GET /orgs/{orgId}/teams
```

#### Get Team

```bash
GET /teams/{teamId}
```

#### Create Team

```bash
POST /orgs/{orgId}/teams
```

#### Update Team

```bash
PUT /teams/{teamId}
```

#### Delete Team

```bash
DELETE /teams/{teamId}
```

#### Add Team Member

```bash
POST /teams/{teamId}/members
```

#### Remove Team Member

```bash
DELETE /teams/{teamId}/members/{userId}
```

### Roles

#### List Roles

```bash
GET /orgs/{orgId}/roles
```

#### Get Role

```bash
GET /roles/{roleId}
```

#### Create Role

```bash
POST /orgs/{orgId}/roles
```

#### Update Role

```bash
PUT /roles/{roleId}
```

#### Delete Role

```bash
DELETE /roles/{roleId}
```

### API Keys

#### List API Keys

```bash
GET /orgs/{orgId}/api-keys
```

#### Get API Key

```bash
GET /api-keys/{keyId}
```

#### Create API Key

```bash
POST /orgs/{orgId}/api-keys
```

**Request Body:**
```json
{
  "name": "Production API Key",
  "permissions": ["read", "write"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

#### Revoke API Key

```bash
DELETE /api-keys/{keyId}
```

### Billing

#### Get Billing Info

```bash
GET /orgs/{orgId}/billing
```

**Response:**
```json
{
  "plan": "pro",
  "status": "active",
  "currentPeriod": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "usage": {
    "compute": 1000,
    "storage": 500,
    "requests": 10000
  },
  "limits": {
    "compute": 5000,
    "storage": 1000,
    "requests": 50000
  }
}
```

#### Get Usage Statistics

```bash
GET /orgs/{orgId}/billing/usage
```

**Query Parameters:**
- `from`: Start date (YYYY-MM-DD)
- `to`: End date (YYYY-MM-DD)
- `granularity`: Daily or monthly

#### List Invoices

```bash
GET /orgs/{orgId}/billing/invoices
```

#### Get Invoice

```bash
GET /billing/invoices/{invoiceId}
```

## Error Handling

### Error Response Format

All API errors follow this format:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found",
    "details": {
      "resourceId": "fn-123",
      "resourceType": "function"
    },
    "requestId": "req-456789"
  }
}
```

### Common Error Codes

- `UNAUTHORIZED`: Invalid or missing API key
- `FORBIDDEN`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Resource does not exist
- `VALIDATION_ERROR`: Invalid request data
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

### HTTP Status Codes

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `204 No Content`: Successful deletion
- `400 Bad Request`: Invalid request
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource conflict
- `422 Unprocessable Entity`: Validation error
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Rate Limiting

The API implements rate limiting to ensure fair usage:

- **Default Limit**: 1000 requests per hour per API key
- **Burst Limit**: 100 requests per minute
- **Headers**: Rate limit information is included in response headers

```bash
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642694400
```

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)

**Response:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Filtering and Sorting

### Filtering

Most list endpoints support filtering:

```bash
GET /functions?status=active&runtime=nodejs18
```

### Sorting

Sort results using the `sort` parameter:

```bash
GET /functions?sort=createdAt:desc
GET /functions?sort=name:asc
```

## Using the CLI for API Testing

The CLI can be used to test API endpoints:

```bash
# Enable debug mode to see API calls
frontal orgs list --debug

# Use JSON output for programmatic processing
frontal functions list --output json

# Test specific endpoints
frontal functions info fn-123 --verbose
```

## SDK Integration

While the CLI doesn't provide an SDK, you can use the API with any HTTP client:

### Node.js Example

```javascript
const https = require('https');

const apiKey = 'frt_your_api_key';
const baseUrl = 'https://api.frontal.dev/v1';

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Usage
makeRequest('/orgs').then(response => {
  console.log(response.data);
});
```

### Python Example

```python
import requests
import json

API_KEY = 'frt_your_api_key'
BASE_URL = 'https://api.frontal.dev/v1'

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

def make_request(path, method='GET', data=None):
    url = f'{BASE_URL}{path}'
    
    if method == 'GET':
        response = requests.get(url, headers=headers)
    elif method == 'POST':
        response = requests.post(url, headers=headers, json=data)
    elif method == 'PUT':
        response = requests.put(url, headers=headers, json=data)
    elif method == 'DELETE':
        response = requests.delete(url, headers=headers)
    
    response.raise_for_status()
    return response.json()

# Usage
orgs = make_request('/orgs')
print(json.dumps(orgs, indent=2))
```

## Webhooks

### Webhook Events

The API can send webhook notifications for various events:

- `function.created`: Function created
- `function.updated`: Function updated
- `function.deleted`: Function deleted
- `deployment.started`: Deployment started
- `deployment.completed`: Deployment completed
- `workflow.started`: Workflow execution started
- `workflow.completed`: Workflow execution completed

### Webhook Payload

```json
{
  "event": "function.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "function": {
      "id": "fn-123",
      "name": "my-function",
      "workspaceId": "ws-456"
    }
  },
  "organization": {
    "id": "org-789"
  }
}
```

## Next Steps

- [Explore the command reference](./command_reference.md)
- [Check the troubleshooting guide](./troubleshooting_guide.md)
- [Learn about authentication](./authentication.md)
