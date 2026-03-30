import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../src/http/client.js";
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from "../../../src/http/errors.js";
import { mockAbortController, mockFetchGlobal } from "../../utils/mocks.js";

describe("ApiClient", () => {
  let client: ApiClient;
  let mockFetch: any;
  let _mockController: any;

  beforeEach(() => {
    mockFetch = mockFetchGlobal();
    const abortMock = mockAbortController();
    _mockController = abortMock.mockController;

    client = new ApiClient({
      apiKey: "test-api-key",
      baseUrl: "https://api.test.com",
      timeout: 5000,
      debug: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with provided config", () => {
      expect(client).toBeInstanceOf(ApiClient);
    });

    it("should use default timeout when not provided", () => {
      const clientWithoutTimeout = new ApiClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
      });
      expect(clientWithoutTimeout).toBeInstanceOf(ApiClient);
    });

    it("should normalize baseUrl by removing trailing slashes", () => {
      const clientWithTrailingSlash = new ApiClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com/",
      });
      expect(clientWithTrailingSlash).toBeInstanceOf(ApiClient);
    });
  });

  describe("get", () => {
    it("should make GET request with query parameters", async () => {
      const mockResponse = { data: "test" };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.get("/test", { param1: "value1" });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test?param1=value1",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
            "Content-Type": "application/json",
          }),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should handle GET request without parameters", async () => {
      const mockResponse = { data: "test" };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      await client.get("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({ method: "GET" })
      );
    });
  });

  describe("post", () => {
    it("should make POST request with body", async () => {
      const mockResponse = { id: "123" };
      const requestBody = { name: "test" };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.post("/test", requestBody);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(requestBody),
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should make POST request without body", async () => {
      const mockResponse = { success: true };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      await client.post("/test");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test",
        expect.objectContaining({
          method: "POST",
          body: undefined,
        })
      );
    });
  });

  describe("put", () => {
    it("should make PUT request with body", async () => {
      const mockResponse = { id: "123" };
      const requestBody = { name: "updated" };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.put("/test/123", requestBody);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test/123",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(requestBody),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("patch", () => {
    it("should make PATCH request with body", async () => {
      const mockResponse = { id: "123" };
      const requestBody = { name: "patched" };

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.patch("/test/123", requestBody);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test/123",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify(requestBody),
        })
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("delete", () => {
    it("should make DELETE request", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      await client.delete("/test/123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/test/123",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  describe("error handling", () => {
    it("should throw ApiError for non-2xx responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      });

      await expect(client.get("/not-found")).rejects.toThrow(ApiError);
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new TypeError("Network error"));

      await expect(client.get("/test")).rejects.toThrow(NetworkError);
    });

    it("should handle timeout errors", async () => {
      mockFetch.mockRejectedValue(
        new DOMException("Request timeout", "AbortError")
      );

      await expect(client.get("/test")).rejects.toThrow(TimeoutError);
    });

    it("should retry on rate limit errors", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          json: () => Promise.resolve({ error: "Rate limited", retryAfter: 1 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "success" }),
        });

      const result = await client.get("/test");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "success" });
    });

    it("should retry on server errors", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Server error" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "success" }),
        });

      const result = await client.get("/test");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: "success" });
    });
  });

  describe("upload", () => {
    it("should upload file data", async () => {
      const fileData = Buffer.from("test file content");
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      });

      await client.upload("/upload", fileData, "text/plain");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/upload",
        expect.objectContaining({
          method: "PUT",
          body: fileData,
          headers: expect.objectContaining({
            "Content-Type": "text/plain",
          }),
        })
      );
    });
  });

  describe("download", () => {
    it("should download file as blob", async () => {
      const mockBlob = new Blob(["test content"]);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      });

      const result = await client.download("/download");

      expect(result).toBe(mockBlob);
    });
  });

  describe("stream", () => {
    it("should handle server-sent events", async () => {
      const _mockEvents = [
        { id: "1", event: "message", data: "Hello" },
        { id: "2", event: "message", data: "World" },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: () =>
              Promise.resolve({
                done: false,
                value: new TextEncoder().encode("data: Hello\n\n"),
              }),
          }),
        },
      });

      const events = [];
      for await (const event of client.stream("/events")) {
        events.push(event);
        if (events.length >= 2) {
          break;
        }
      }

      expect(events).toHaveLength(2);
    });
  });

  describe("debug mode", () => {
    it("should log debug information when enabled", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: "test" }),
      });

      await client.get("/test");

      expect(consoleSpy).toHaveBeenCalledWith(
        "[debug]",
        "GET",
        "https://api.test.com/test"
      );
      expect(consoleSpy).toHaveBeenCalledWith("[debug]", "200", "OK");

      consoleSpy.mockRestore();
    });
  });
});
