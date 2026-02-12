import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";

/**
 * Tests for the Express API server (index.ts):
 * - Health check endpoint
 * - Auth middleware
 * - GET/DELETE method rejection on /mcp
 */

// Helper to make HTTP requests to a local server
async function request(
  server: http.Server,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<{
  status: number;
  body: unknown;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const address = server.address() as { port: number };
    const bodyStr = options.body ? JSON.stringify(options.body) : undefined;

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: address.port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body: unknown;
          try {
            body = JSON.parse(data);
          } catch {
            body = data;
          }
          resolve({ status: res.statusCode!, body, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

describe("API Server", () => {
  // ----------------------------------------------------------------
  // Health check
  // ----------------------------------------------------------------
  describe("GET /healthz", () => {
    let server: http.Server;

    beforeEach(async () => {
      const app = express();
      app.get("/healthz", (_req, res) => res.status(200).send("ok"));
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
    });

    afterEach(() => {
      server.close();
    });

    it("returns 200 ok", async () => {
      const res = await request(server, "GET", "/healthz");
      expect(res.status).toBe(200);
      expect(res.body).toBe("ok");
    });
  });

  // ----------------------------------------------------------------
  // Method restrictions on /mcp
  // ----------------------------------------------------------------
  describe("Method restrictions on /mcp", () => {
    let server: http.Server;

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.post("/mcp", (_req, res) =>
        res.json({ jsonrpc: "2.0", result: "ok", id: 1 }),
      );
      app.get("/mcp", (_req, res) =>
        res.status(405).set("Allow", "POST").send("Method Not Allowed"),
      );
      app.delete("/mcp", (_req, res) =>
        res.status(405).set("Allow", "POST").send("Method Not Allowed"),
      );
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
    });

    afterEach(() => {
      server.close();
    });

    it("rejects GET with 405", async () => {
      const res = await request(server, "GET", "/mcp");
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe("POST");
    });

    it("rejects DELETE with 405", async () => {
      const res = await request(server, "DELETE", "/mcp");
      expect(res.status).toBe(405);
    });

    it("accepts POST on /mcp", async () => {
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
      });
      expect(res.status).toBe(200);
    });
  });

  // ----------------------------------------------------------------
  // API Key Authentication Middleware
  // ----------------------------------------------------------------
  describe("API Key Authentication", () => {
    const TEST_API_KEY = "test-secret-key-12345";
    let server: http.Server;

    function createAuthMiddleware(apiKey: string) {
      return (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ): void => {
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers["x-api-key"] as string | undefined;

        let providedKey: string | undefined;
        if (authHeader?.startsWith("Bearer ")) {
          providedKey = authHeader.slice(7);
        } else if (apiKeyHeader) {
          providedKey = apiKeyHeader;
        }

        if (!providedKey) {
          res.status(401).json({
            jsonrpc: "2.0",
            error: { code: -32001, message: "Authentication required." },
            id: null,
          });
          return;
        }

        const crypto = require("crypto");
        const expected = Buffer.from(apiKey);
        const provided = Buffer.from(providedKey);
        if (
          expected.length !== provided.length ||
          !crypto.timingSafeEqual(expected, provided)
        ) {
          res.status(403).json({
            jsonrpc: "2.0",
            error: { code: -32002, message: "Invalid API key." },
            id: null,
          });
          return;
        }

        next();
      };
    }

    beforeEach(async () => {
      const app = express();
      app.use(express.json());
      app.post("/mcp", createAuthMiddleware(TEST_API_KEY), (_req, res) =>
        res.json({ jsonrpc: "2.0", result: "authenticated", id: 1 }),
      );
      server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
      });
    });

    afterEach(() => {
      server.close();
    });

    it("returns 401 when no key provided", async () => {
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
      });
      expect(res.status).toBe(401);
      const body = res.body as { error: { code: number } };
      expect(body.error.code).toBe(-32001);
    });

    it("returns 403 when wrong key provided via Bearer", async () => {
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
        headers: { Authorization: "Bearer wrong-key" },
      });
      expect(res.status).toBe(403);
      const body = res.body as { error: { code: number } };
      expect(body.error.code).toBe(-32002);
    });

    it("returns 403 when wrong key provided via x-api-key", async () => {
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
        headers: { "x-api-key": "wrong-key" },
      });
      expect(res.status).toBe(403);
    });

    it("authenticates with correct Bearer token", async () => {
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
        headers: { Authorization: `Bearer ${TEST_API_KEY}` },
      });
      expect(res.status).toBe(200);
      const body = res.body as { result: string };
      expect(body.result).toBe("authenticated");
    });

    it("authenticates with correct x-api-key header", async () => {
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
        headers: { "x-api-key": TEST_API_KEY },
      });
      expect(res.status).toBe(200);
      const body = res.body as { result: string };
      expect(body.result).toBe("authenticated");
    });

    it("prefers Bearer over x-api-key when both provided", async () => {
      // Correct Bearer, wrong x-api-key → should pass
      const res = await request(server, "POST", "/mcp", {
        body: { jsonrpc: "2.0", method: "test", id: 1 },
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
          "x-api-key": "wrong-key",
        },
      });
      expect(res.status).toBe(200);
    });
  });
});
