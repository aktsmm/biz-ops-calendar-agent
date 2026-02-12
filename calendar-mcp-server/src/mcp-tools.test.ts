import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

/**
 * Integration tests for MCP tool registration and execution.
 * Uses MCP Client + InMemoryTransport for proper protocol-level testing.
 * Graph API calls are mocked.
 */

// Mock the Graph client module to prevent actual API calls
vi.mock("./graph/client.js", () => ({
  getGraphClient: vi.fn(() => ({
    api: vi.fn(() => ({
      post: vi.fn(),
    })),
  })),
}));

// Mock getSchedule and createEvent
vi.mock("./graph/calendar.js", () => ({
  getSchedule: vi.fn(async () => [
    {
      scheduleId: "user@example.com",
      availabilityView: "0000000000000000",
      scheduleItems: [],
    },
  ]),
  createEvent: vi.fn(async () => ({
    id: "mock-event-id",
    subject: "Test Meeting",
    joinUrl: "https://teams.microsoft.com/l/meetup-join/mock",
    attendees: [],
  })),
}));

import { registerGetScheduleTool } from "./tools/getSchedule.js";
import { registerFindSlotsTool } from "./tools/findSlots.js";
import { registerCreateEventTool } from "./tools/createEvent.js";
import { getSchedule } from "./graph/calendar.js";
import { createEvent } from "./graph/calendar.js";

/** Helper: create a connected MCP client+server pair */
async function createTestPair() {
  const server = new McpServer({ name: "test-server", version: "1.0.0" });
  registerGetScheduleTool(server);
  registerFindSlotsTool(server);
  registerCreateEventTool(server);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return { server, client };
}

describe("MCP Tool Registration", () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test-server", version: "1.0.0" });
  });

  it("registers get_schedule tool without error", () => {
    expect(() => registerGetScheduleTool(server)).not.toThrow();
  });

  it("registers find_available_slots tool without error", () => {
    expect(() => registerFindSlotsTool(server)).not.toThrow();
  });

  it("registers create_event tool without error", () => {
    expect(() => registerCreateEventTool(server)).not.toThrow();
  });

  it("registers all three tools simultaneously", () => {
    expect(() => {
      registerGetScheduleTool(server);
      registerFindSlotsTool(server);
      registerCreateEventTool(server);
    }).not.toThrow();
  });
});

describe("MCP Tool Discovery via Client", () => {
  it("lists all 3 registered tools", async () => {
    const { client } = await createTestPair();
    const { tools } = await client.listTools();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("get_schedule");
    expect(toolNames).toContain("find_available_slots");
    expect(toolNames).toContain("create_event");
    expect(tools).toHaveLength(3);
  });

  it("get_schedule has correct input schema", async () => {
    const { client } = await createTestPair();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_schedule");

    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties).toHaveProperty("emails");
    expect(tool!.inputSchema.properties).toHaveProperty("startDateTime");
    expect(tool!.inputSchema.properties).toHaveProperty("endDateTime");
  });
});

describe("MCP Tool Execution via Client (mocked Graph)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("get_schedule calls Graph and returns result", async () => {
    const { client } = await createTestPair();

    const result = await client.callTool({
      name: "get_schedule",
      arguments: {
        emails: ["user@example.com"],
        startDateTime: "2026-02-16T09:00:00",
        endDateTime: "2026-02-16T18:00:00",
        intervalMinutes: 30,
      },
    });

    expect(getSchedule).toHaveBeenCalledWith({
      emails: ["user@example.com"],
      startDateTime: "2026-02-16T09:00:00",
      endDateTime: "2026-02-16T18:00:00",
      intervalMinutes: 30,
      timeZone: "UTC",
    });

    expect(result.content).toBeDefined();
    const textContent = (
      result.content as Array<{ type: string; text: string }>
    )[0];
    const parsed = JSON.parse(textContent.text);
    expect(parsed).toEqual([
      expect.objectContaining({ scheduleId: "user@example.com" }),
    ]);
  });

  it("find_available_slots returns structured data + Adaptive Card", async () => {
    const { client } = await createTestPair();

    const result = await client.callTool({
      name: "find_available_slots",
      arguments: {
        emails: ["user@example.com"],
        startDate: "2026-02-16",
        endDate: "2026-02-16",
        durationMinutes: 60,
        workingHoursOnly: true,
        maxCandidates: 5,
        includeTentative: true,
      },
    });

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBe(2);

    // First: structured JSON
    const structured = JSON.parse(content[0].text);
    expect(structured).toHaveProperty("candidates");
    expect(structured).toHaveProperty("totalCandidatesFound");

    // Second: Adaptive Card
    expect(content[1].text).toContain("AdaptiveCard");
  });

  it("create_event calls Graph and returns Adaptive Card confirmation", async () => {
    const { client } = await createTestPair();

    const result = await client.callTool({
      name: "create_event",
      arguments: {
        subject: "Test Meeting",
        startDateTime: "2026-02-16T10:00:00",
        endDateTime: "2026-02-16T11:00:00",
        attendees: ["user@example.com"],
        body: "",
        isOnlineMeeting: true,
        location: "",
      },
    });

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Test Meeting",
        startDateTime: "2026-02-16T10:00:00",
        endDateTime: "2026-02-16T11:00:00",
        attendees: ["user@example.com"],
        isOnlineMeeting: true,
      }),
    );

    const content = result.content as Array<{ type: string; text: string }>;
    expect(content.length).toBe(2);
    expect(content[1].text).toContain("AdaptiveCard");
    expect(content[1].text).toContain("会議が作成されました");
  });
});

describe("Graph Calendar Module (mocked)", () => {
  it("getSchedule is callable with mock", async () => {
    const result = await getSchedule({
      emails: ["test@example.com"],
      startDateTime: "2026-02-16T09:00:00",
      endDateTime: "2026-02-16T18:00:00",
      intervalMinutes: 30,
      timeZone: "Asia/Tokyo",
    });

    expect(result).toEqual([
      {
        scheduleId: "user@example.com",
        availabilityView: "0000000000000000",
        scheduleItems: [],
      },
    ]);
  });

  it("createEvent is callable with mock", async () => {
    const result = await createEvent({
      subject: "Test",
      startDateTime: "2026-02-16T10:00:00",
      endDateTime: "2026-02-16T11:00:00",
      attendees: ["test@example.com"],
      isOnlineMeeing: true,
      timeZone: "Asia/Tokyo",
    } as any);

    expect(result).toEqual({
      id: "mock-event-id",
      subject: "Test Meeting",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/mock",
      attendees: [],
    });
  });
});
