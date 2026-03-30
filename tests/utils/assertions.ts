import { expect } from "vitest";

// Custom assertion helpers
export function assertValidDate(date: string | Date) {
  const d = new Date(date);
  expect(d.toString()).not.toBe("Invalid Date");
  expect(d.getTime()).not.toBeNaN();
}

export function assertValidUuid(uuid: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  expect(uuid).toMatch(uuidRegex);
}

export function assertValidEmail(email: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  expect(email).toMatch(emailRegex);
}

export function assertValidUrl(url: string) {
  expect(() => new URL(url)).not.toThrow();
}

export function assertIsoTimestamp(timestamp: string) {
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  expect(timestamp).toMatch(isoRegex);
  assertValidDate(timestamp);
}

export function assertPaginatedResponse(response: any) {
  expect(response).toHaveProperty("items");
  expect(response).toHaveProperty("pagination");
  expect(response.pagination).toHaveProperty("page");
  expect(response.pagination).toHaveProperty("limit");
  expect(response.pagination).toHaveProperty("total");
  expect(response.pagination).toHaveProperty("totalPages");
  expect(typeof response.pagination.page).toBe("number");
  expect(typeof response.pagination.limit).toBe("number");
  expect(typeof response.pagination.total).toBe("number");
  expect(typeof response.pagination.totalPages).toBe("number");
}

export function assertApiResponse(response: any, expectedStatus = 200) {
  expect(response).toHaveProperty("status");
  expect(response.status).toBe(expectedStatus);

  if (expectedStatus >= 200 && expectedStatus < 300) {
    expect(response).toHaveProperty("data");
  } else {
    expect(response).toHaveProperty("error");
    expect(response.error).toHaveProperty("code");
    expect(response.error).toHaveProperty("message");
  }
}

export function assertError(
  error: any,
  expectedCode?: string,
  expectedMessage?: string
) {
  expect(error).toBeInstanceOf(Error);

  if (expectedCode) {
    expect(error).toHaveProperty("code");
    expect(error.code).toBe(expectedCode);
  }

  if (expectedMessage) {
    expect(error.message).toContain(expectedMessage);
  }
}

export function assertMockCalled(mock: any, times = 1) {
  expect(mock).toHaveBeenCalled();
  expect(mock).toHaveBeenCalledTimes(times);
}

export function assertMockCalledWith(mock: any, ...args: any[]) {
  expect(mock).toHaveBeenCalledWith(...args);
}

export function assertConsoleOutput(
  capture: { outputs: string[] },
  expectedContent: string | RegExp
) {
  const output = capture.outputs.join("");
  if (expectedContent instanceof RegExp) {
    expect(output).toMatch(expectedContent);
  } else {
    expect(output).toContain(expectedContent);
  }
}

export function assertProcessExit(mockProcess: any, code = 0) {
  expect(mockProcess.exit).toHaveBeenCalledWith(code);
}

export function assertEnvironmentVariables(
  env: Record<string, string | undefined>,
  expected: Record<string, string>
) {
  Object.entries(expected).forEach(([key, value]) => {
    expect(env[key]).toBe(value);
  });
}

export function assertFileExists(filePath: string) {
  expect(() => require("node:fs").accessSync(filePath)).not.toThrow();
}

export function assertJsonStructure(obj: any, structure: Record<string, any>) {
  Object.entries(structure).forEach(([key, type]) => {
    expect(obj).toHaveProperty(key);

    if (type === "string") {
      expect(typeof obj[key]).toBe("string");
    } else if (type === "number") {
      expect(typeof obj[key]).toBe("number");
    } else if (type === "boolean") {
      expect(typeof obj[key]).toBe("boolean");
    } else if (type === "object") {
      expect(typeof obj[key]).toBe("object");
      expect(obj[key]).not.toBeNull();
    } else if (type === "array") {
      expect(Array.isArray(obj[key])).toBe(true);
    } else if (typeof type === "object") {
      assertJsonStructure(obj[key], type);
    }
  });
}
