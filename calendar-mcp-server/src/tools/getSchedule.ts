import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getSchedule } from "../graph/calendar.js";

const inputSchema = {
  emails: z.array(z.string()).describe("Target email addresses"),
  startDateTime: z.string().describe("Start datetime (ISO 8601)"),
  endDateTime: z.string().describe("End datetime (ISO 8601)"),
  intervalMinutes: z.number().describe("Interval minutes").default(30),
};

export function registerGetScheduleTool(server: McpServer): void {
  server.registerTool(
    "get_schedule",
    {
      description: "Fetch attendee availability via Microsoft Graph",
      inputSchema,
    },
    async (input) => {
      const intervalMinutes = input.intervalMinutes ?? 30;
      const timeZone = process.env.DEFAULT_TIMEZONE ?? "UTC";

      const result = await getSchedule({
        emails: input.emails,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        intervalMinutes,
        timeZone,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
