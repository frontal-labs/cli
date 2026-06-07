# Frontal CLI Architecture

This document describes the architectural design, patterns, and principles of the Frontal CLI.

## Overview

The Frontal CLI is a modern command-line interface built with TypeScript, designed to provide comprehensive access to Frontal. The architecture emphasizes modularity, extensibility, and maintainability.

## Architectural Principles

### Core Principles

1. **Modularity**: Each feature is implemented as an independent module
2. **Extensibility**: Plugin system allows for third-party extensions
3. **Type Safety**: Comprehensive TypeScript usage throughout
4. **Performance**: Lazy loading and efficient resource management
5. **User Experience**: Consistent interfaces and helpful error messages
6. **Security**: Secure credential management and input validation

### Design Patterns

- **Command Pattern**: Each CLI command implements the command pattern
- **Repository Pattern**: Data access abstracted through repositories
- **Factory Pattern**: Client and output formatters created via factories
- **Observer Pattern**: Event-driven architecture for logging and monitoring
- **Strategy Pattern**: Multiple output formatting strategies

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Interface                        │
├─────────────────────────────────────────────────────────────┤
│  Command Parser  │  Global Options  │  Command Router       │
├─────────────────────────────────────────────────────────────┤
│                      Command Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Auth      │  │   Config    │  │   Resource Commands  │   │
│  │ Commands    │  │ Commands    │  │   (Orgs, Funcs, etc) │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                      Service Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Config    │  │   HTTP      │  │    Output           │   │
│  │  Manager    │  │   Client    │  │   Formatter         │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                    Infrastructure                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   Logger    │  │   Storage   │  │    Validation        │   │
│  │   System    │  │   System    │  │    System           │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Relationships

```
CLI Entry Point (bin/frontal.ts)
        ↓
Main Program (src/index.ts)
        ↓
Command Registration
        ↓
Command Execution
    ┌───────┴───────┐
    ↓               ↓
Config Manager   HTTP Client
    ↓               ↓
Storage System   API Requests
    ↓               ↓
Profile Config    Response Data
    ↓               ↓
Command Options   Output Formatter
    ↓               ↓
Command Logic     Formatted Output
    ↓               ↓
User Display   Terminal/UI
```

## Core Components

### 1. CLI Entry Point

**File**: `bin/frontal.ts`

The main executable that sets up the Node.js environment and launches the CLI.

```typescript
#!/usr/bin/env node
import { run } from "../dist/index.js";

run(process.argv).catch(err => {
  console.error("CLI Error:", err);
  process.exit(1);
});
```

### 2. Command Parser & Router

**File**: `src/index.ts`

Uses Commander.js to parse command-line arguments and route to appropriate handlers.

```typescript
export async function run(argv: string[]): Promise<void> {
  const program = new Command()
    .name("frontal")
    .description("Frontal CLI")
    .version(VERSION)
    .option("-p, --profile <name>", "Config profile", "default")
    .option("-o, --org <id>", "Organization context")
    .option("-w, --workspace <id>", "Workspace context")
    .option("--api-key <key>", "Override API key")
    .option("--api-url <url>", "Override API base URL")
    .option("-j, --json", "Output as JSON")
    .option("--yaml", "Output as YAML")
    .option("-q, --quiet", "Suppress non-essential output")
    .option("-v, --verbose", "Verbose logging")
    .option("--debug", "Debug mode")
    .option("--no-color", "Disable colors");

  // Register command modules
  registerAuthCommands(program);
  registerConfigCommands(program);
  registerOrgsCommands(program);
  // ... other command registrations

  await program.parseAsync(argv);
}
```

### 3. Command Layer

Each command group is implemented as a separate module:

```typescript
// src/commands/auth.ts
export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authentication commands");

  auth
    .command("login")
    .description("Authenticate with the Frontal API")
    .option("--profile <name>", "Save to specific profile")
    .action(async (opts, cmd) => {
      const config = cmd.optsWithGlobals();
      await handleLogin(opts, config);
    });
}
```

### 4. Configuration System

**Files**: `src/config/`

Hierarchical configuration system with multiple sources:

```typescript
// src/config/manager.ts
export class ConfigManager {
  private config: Config;
  private profile: string;

  constructor(profile = "default") {
    this.profile = profile;
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    // 1. Load global defaults
    // 2. Load profile-specific config
    // 3. Apply environment variable overrides
    // 4. Validate configuration schema
  }

  get(key: string): unknown {
    return this.getNestedValue(this.config, key);
  }

  set(key: string, value: unknown): void {
    this.setNestedValue(this.config, key, value);
    this.saveConfig();
  }
}
```

**Configuration Precedence** (highest to lowest):
1. Command-line flags
2. Environment variables
3. Profile configuration
4. Global configuration
5. Default values

### 5. HTTP Client

**File**: `src/http/client.ts`

Handles all API communication with retry logic, error handling, and authentication.

```typescript
export class ApiClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private retries: number;

  constructor(config: Config) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeout = config.http.timeout;
    this.retries = config.http.retries;
  }

  async request<T>(
    method: string,
    path: string,
    data?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.getHeaders(),
          body: data ? JSON.stringify(data) : undefined,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          throw new ApiError(response.status, await response.text());
        }

        return response.json();
      } catch (error) {
        if (attempt === this.retries) throw error;
        await this.delay(this.getRetryDelay(attempt));
      }
    }
  }
}
```

### 6. Output Formatting System

**Files**: `src/output/`

Strategy pattern for multiple output formats:

```typescript
// src/output/formatter.ts
export interface OutputFormatter {
  format(data: unknown): string;
}

export class TableFormatter implements OutputFormatter {
  format(data: unknown): string {
    // Format as ASCII table
  }
}

export class JsonFormatter implements OutputFormatter {
  format(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }
}

export class YamlFormatter implements OutputFormatter {
  format(data: unknown): string {
    return yaml.stringify(data);
  }
}

// Factory
export class FormatterFactory {
  static create(format: string): OutputFormatter {
    switch (format) {
      case "table": return new TableFormatter();
      case "json": return new JsonFormatter();
      case "yaml": return new YamlFormatter();
      default: return new TableFormatter();
    }
  }
}
```

## Data Flow

### Request Flow

```
User Input → CLI Parser → Command Router → Command Handler
    ↓
Config Manager → HTTP Client → API Server
    ↓
Response → Output Formatter → User Display
```

### Error Handling Flow

```
Error Occurs → Error Handler → Error Classification
    ↓
User-Friendly Message → Logging → Exit Code
```

## Security Architecture

### Credential Management

```typescript
// src/config/secure-storage.ts
export class SecureStorage {
  private static readonly CONFIG_DIR = path.join(os.homedir(), ".frontal");
  private static readonly PROFILES_DIR = path.join(this.CONFIG_DIR, "profiles");

  static async storeApiKey(key: string, profile = "default"): Promise<void> {
    await fs.ensureDir(this.PROFILES_DIR);
    
    const configPath = path.join(this.PROFILES_DIR, `${profile}.json`);
    const config = { apiKey: key, updatedAt: new Date().toISOString() };
    
    // Write with restricted permissions
    await fs.writeJson(configPath, config, { mode: 0o600 });
  }

  static async getApiKey(profile = "default"): Promise<string | null> {
    const configPath = path.join(this.PROFILES_DIR, `${profile}.json`);
    
    try {
      const config = await fs.readJson(configPath);
      return config.apiKey;
    } catch {
      return null;
    }
  }
}
```

### Input Validation

```typescript
// src/utils/validation.ts
export class InputValidator {
  static validateApiKey(key: string): boolean {
    return /^frt_[a-zA-Z0-9]{32,}$/.test(key);
  }

  static validateResourceId(id: string): boolean {
    return /^[a-z]{2}-[a-zA-Z0-9-]+$/.test(id);
  }

  static sanitizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\.\./g, "");
  }
}
```

## Plugin Architecture

### Plugin Interface

```typescript
// src/plugins/types.ts
export interface Plugin {
  name: string;
  version: string;
  description: string;
  register(program: Command): void;
  unregister?(program: Command): void;
}

export interface PluginContext {
  config: Config;
  httpClient: ApiClient;
  logger: Logger;
}
```

### Plugin Manager

```typescript
// src/plugins/manager.ts
export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();

  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      const pluginModule = await import(pluginPath);
      const plugin: Plugin = pluginModule.default || pluginModule;
      
      this.validatePlugin(plugin);
      this.plugins.set(plugin.name, plugin);
      
      logger.info(`Loaded plugin: ${plugin.name} v${plugin.version}`);
    } catch (error) {
      logger.error(`Failed to load plugin from ${pluginPath}:`, error);
    }
  }

  registerPlugins(program: Command): void {
    for (const plugin of this.plugins.values()) {
      plugin.register(program);
    }
  }

  private validatePlugin(plugin: unknown): asserts plugin is Plugin {
    if (!plugin || typeof plugin !== "object") {
      throw new Error("Invalid plugin: must be an object");
    }
    
    const required = ["name", "version", "register"];
    for (const prop of required) {
      if (!(prop in plugin)) {
        throw new Error(`Invalid plugin: missing required property '${prop}'`);
      }
    }
  }
}
```

## Performance Optimizations

### Lazy Loading

```typescript
// src/utils/lazy-loader.ts
export class LazyLoader<T> {
  private loaded = false;
  private value: T | null = null;
  private loader: () => Promise<T>;

  constructor(loader: () => Promise<T>) {
    this.loader = loader;
  }

  async get(): Promise<T> {
    if (!this.loaded) {
      this.value = await this.loader();
      this.loaded = true;
    }
    return this.value!;
  }
}

// Usage
const heavyModuleLoader = new LazyLoader(() => import("./heavy-module.js"));
```

### Caching Strategy

```typescript
// src/utils/cache.ts
export class Cache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private ttl: number;

  constructor(ttl = 300000) { // 5 minutes default
    this.ttl = ttl;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl,
    });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item || Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  clear(): void {
    this.cache.clear();
  }
}
```

### Memory Management

```typescript
// src/utils/resource-manager.ts
export class ResourceManager {
  private resources: Set<Disposable> = new Set();

  register<T extends Disposable>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  dispose(): void {
    for (const resource of this.resources) {
      try {
        resource.dispose();
      } catch (error) {
        logger.warn("Error disposing resource:", error);
      }
    }
    this.resources.clear();
  }
}
```

## Error Handling Architecture

### Error Classification

```typescript
// src/errors/types.ts
export enum ErrorType {
  AUTHENTICATION = "AUTHENTICATION",
  AUTHORIZATION = "AUTHORIZATION",
  NETWORK = "NETWORK",
  VALIDATION = "VALIDATION",
  CONFIGURATION = "CONFIGURATION",
  API = "API",
  UNKNOWN = "UNKNOWN",
}

export class FrontalError extends Error {
  constructor(
    message: string,
    public readonly type: ErrorType,
    public readonly cause?: Error,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FrontalError";
  }
}
```

### Error Handler

```typescript
// src/errors/handler.ts
export class ErrorHandler {
  static handle(error: Error, config: Config): void {
    const frontalError = this.classifyError(error);
    
    this.logError(frontalError, config);
    this.displayError(frontalError, config);
    
    process.exit(this.getExitCode(frontalError));
  }

  private static classifyError(error: Error): FrontalError {
    if (error instanceof FrontalError) {
      return error;
    }

    // Classify based on error properties
    if (error.message.includes("401")) {
      return new FrontalError(error.message, ErrorType.AUTHENTICATION, error);
    }
    
    if (error.message.includes("403")) {
      return new FrontalError(error.message, ErrorType.AUTHORIZATION, error);
    }
    
    // ... other classifications
    
    return new FrontalError(error.message, ErrorType.UNKNOWN, error);
  }

  private static displayError(error: FrontalError, config: Config): void {
    if (config.debug) {
      console.error(error.stack);
    } else {
      console.error(`Error: ${error.message}`);
      
      if (error.type === ErrorType.AUTHENTICATION) {
        console.error("Try running 'frontal auth login' to authenticate.");
      }
    }
  }
}
```

## Logging Architecture

### Logger Interface

```typescript
// src/utils/logger.ts
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

export class ConsoleLogger implements Logger {
  constructor(private level: LogLevel = LogLevel.INFO) {}

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(`[DEBUG] ${message}`, meta || "");
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(`[INFO] ${message}`, meta || "");
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[WARN] ${message}`, meta || "");
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`[ERROR] ${message}`, error || "", meta || "");
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }
}
```

## Testing Architecture

### Test Structure

```
tests/
├── unit/                 # Unit tests
│   ├── commands/        # Command tests
│   ├── config/          # Configuration tests
│   ├── http/            # HTTP client tests
│   └── utils/           # Utility tests
├── integration/          # Integration tests
│   ├── auth.test.ts     # Authentication flows
│   ├── deployment.test.ts # Deployment workflows
│   └── api.test.ts      # API integration
├── fixtures/             # Test data
│   ├── responses/       # Mock API responses
│   └── configs/         # Test configurations
└── helpers/              # Test utilities
    ├── mock-client.ts   # Mock HTTP client
    └── test-utils.ts    # Common test utilities
```

### Mock Strategy

```typescript
// tests/helpers/mock-client.ts
export class MockApiClient implements ApiClient {
  private responses: Map<string, unknown> = new Map();

  setResponse(path: string, response: unknown): void {
    this.responses.set(path, response);
  }

  async request<T>(method: string, path: string, data?: unknown): Promise<ApiResponse<T>> {
    const response = this.responses.get(path);
    if (!response) {
      throw new Error(`No mock response for ${path}`);
    }
    return response as ApiResponse<T>;
  }
}
```

## Deployment Architecture

### Build Process

```typescript
// scripts/build.ts
export class Builder {
  async build(): Promise<void> {
    // 1. Clean previous build
    await this.clean();

    // 2. Compile TypeScript
    await this.compile();

    // 3. Bundle dependencies
    await this.bundle();

    // 4. Add executable shebang
    await this.addShebang();

    // 5. Generate package files
    await this.generatePackageFiles();
  }

  private async compile(): Promise<void> {
    await exec("bun run build");
  }

  private async bundle(): Promise<void> {
    // Bundle with external dependencies
  }

  private async addShebang(): Promise<void> {
    const execPath = path.join("dist", "bin", "frontal.js");
    let content = await fs.readFile(execPath, "utf8");
    content = "#!/usr/bin/env node\n" + content;
    await fs.writeFile(execPath, content);
  }
}
```

### Package Structure

```
frontal-0.1.0.tgz
├── package.json
├── README.md
├── LICENSE
├── bin/
│   └── frontal.js        # Executable with shebang
├── dist/                 # Compiled JavaScript
│   ├── commands/         # Command modules
│   ├── config/          # Configuration modules
│   ├── errors/          # Error handling
│   ├── http/            # HTTP client
│   ├── output/          # Output formatters
│   ├── utils/           # Utilities
│   ├── index.js         # Main entry point
│   └── version.js       # Version info
└── docs/                 # Documentation
```

## Future Enhancements

### Planned Architecture Improvements

1. **Plugin System**: Full plugin architecture for third-party extensions
2. **Caching Layer**: Intelligent caching for API responses
3. **Streaming**: Support for streaming large datasets
4. **Parallel Processing**: Concurrent API requests for better performance
5. **Configuration Validation**: JSON Schema validation for configuration
6. **Telemetry**: Anonymous usage analytics for improvement

### Scalability Considerations

- **Horizontal Scaling**: Support for multiple API endpoints
- **Load Balancing**: Automatic retry with different endpoints
- **Rate Limiting**: Intelligent rate limiting across commands
- **Connection Pooling**: Reuse HTTP connections for better performance

## Conclusion

The Frontal CLI architecture is designed to be modular, extensible, and maintainable. The separation of concerns, use of design patterns, and comprehensive testing strategy ensure a robust and reliable tool for Frontal users.

The architecture supports future growth and evolution while maintaining backward compatibility and providing a consistent user experience.