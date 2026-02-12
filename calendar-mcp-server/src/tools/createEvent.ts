import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { createEvent } from "../graph/calendar.js";

const inputSchema = {
  subject: z.string().describe("Meeting subject"),
  startDateTime: z.string().describe("Start datetime (ISO 8601)"),
  endDateTime: z.string().describe("End datetime (ISO 8601)"),
  attendees: z.array(z.string()).describe("Attendee email addresses"),
  body: z.string().describe("Meeting body (HTML allowed)").default(""),
  isOnlineMeeting: z
    .boolean()
    .describe("Create a Teams online meeting")
    .default(true),
  location: z.string().describe("Optional location").default(""),
};

/** Format a datetime string to a human-friendly Japanese format */
function formatJapaneseDateTime(isoStr: string): string {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const d = new Date(isoStr.replace("T", " "));
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const day = days[d.getDay()];
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${date} (${day}) ${hour}:${min}`;
}

/** Calculate duration in minutes between two ISO datetime strings */
function calcDurationMinutes(start: string, end: string): number {
  const s = new Date(start.replace("T", " "));
  const e = new Date(end.replace("T", " "));
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

/** Build Adaptive Card JSON for meeting confirmation */
function buildMeetingConfirmationCard(
  result: Record<string, unknown>,
  params: {
    subject: string;
    startDateTime: string;
    endDateTime: string;
    attendees: string[];
    isOnlineMeeting: boolean;
  },
): Record<string, unknown> {
  const startStr = formatJapaneseDateTime(params.startDateTime);
  const endTime = params.endDateTime.split("T")[1]?.slice(0, 5) ?? "";
  const duration = calcDurationMinutes(
    params.startDateTime,
    params.endDateTime,
  );
  const joinUrl = (result.joinUrl as string) ?? "";

  const facts = [
    { title: "📋 件名", value: params.subject },
    { title: "📅 日時", value: `${startStr} - ${endTime}` },
    { title: "⏱ 所要時間", value: `${duration} 分` },
    { title: "👥 参加者", value: params.attendees.join(", ") },
  ];

  const actions: Array<Record<string, unknown>> = [];

  if (joinUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "📎 Teams 会議に参加",
      url: joinUrl,
      style: "positive",
    });
  }

  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.5",
    body: [
      {
        type: "Container",
        style: "emphasis",
        items: [
          {
            type: "TextBlock",
            text: "✅ 会議が作成されました",
            weight: "Bolder",
            size: "Large",
            color: "Good",
          },
        ],
      },
      {
        type: "Container",
        items: [{ type: "FactSet", facts }],
      },
      ...(actions.length > 0 ? [{ type: "ActionSet", actions }] : []),
    ],
  };
}

export function registerCreateEventTool(server: McpServer): void {
  server.registerTool(
    "create_event",
    {
      description:
        "Create a Teams meeting event. Returns both structured data and an Adaptive Card " +
        "for rich confirmation display.",
      inputSchema,
    },
    async (input) => {
      const timeZone = process.env.DEFAULT_TIMEZONE ?? "UTC";

      const result = await createEvent({
        subject: input.subject,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        attendees: input.attendees,
        body: input.body ?? "",
        isOnlineMeeting: input.isOnlineMeeting ?? true,
        location: input.location ?? "",
        timeZone,
      });

      const adaptiveCard = buildMeetingConfirmationCard(result, {
        subject: input.subject,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        attendees: input.attendees,
        isOnlineMeeting: input.isOnlineMeeting ?? true,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
          {
            type: "text" as const,
            text: `\n---\nAdaptive Card JSON (for Copilot Studio rendering):\n${JSON.stringify(adaptiveCard, null, 2)}`,
          },
        ],
      };
    },
  );
}
