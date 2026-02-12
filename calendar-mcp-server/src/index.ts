import "dotenv/config";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerGetScheduleTool } from "./tools/getSchedule.js";
import { registerFindSlotsTool } from "./tools/findSlots.js";
import { registerCreateEventTool } from "./tools/createEvent.js";
import { registerGetCurrentDateTimeTool } from "./tools/getCurrentDateTime.js";

const createServer = () => {
  const server = new McpServer({
    name: "calendar-mcp-server",
    version: "1.0.0",
  });

  registerGetCurrentDateTimeTool(server);
  registerGetScheduleTool(server);
  registerFindSlotsTool(server);
  registerCreateEventTool(server);

  return server;
};

const app = express();
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method Not Allowed");
});

app.delete("/mcp", (_req, res) => {
  res.status(405).set("Allow", "POST").send("Method Not Allowed");
});

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

const port = Number(process.env.PORT ?? "3001");

app.listen(port, () => {
  console.log(`Calendar MCP Server running on http://localhost:${port}`);
});
