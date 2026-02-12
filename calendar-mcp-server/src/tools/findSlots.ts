import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { getSchedule } from "../graph/calendar.js";
import {
  findAvailableSlots,
  type CandidateSlot,
  type SlotCalculationResult,
} from "../utils/slotCalculator.js";

const inputSchema = {
  emails: z.array(z.string()).describe("Attendee email addresses"),
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  durationMinutes: z
    .number()
    .describe("Meeting duration in minutes")
    .default(60),
  workingHoursOnly: z
    .boolean()
    .describe("Limit to working hours")
    .default(true),
  maxCandidates: z
    .number()
    .describe("Maximum number of candidates to return")
    .default(5),
  includeTentative: z
    .boolean()
    .describe(
      "Include time slots where some attendees have tentative (仮承諾) status",
    )
    .default(true),
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

/** Build Adaptive Card JSON for slot candidates */
function buildSlotCandidatesCard(
  result: SlotCalculationResult,
  emails: string[],
  durationMinutes: number,
): Record<string, unknown> {
  const candidateRows = result.candidates.map(
    (slot: CandidateSlot, idx: number) => {
      const startStr = formatJapaneseDateTime(slot.start);
      const endTime = slot.end.split("T")[1]?.slice(0, 5) ?? "";

      let statusIcon: string;
      let statusText: string;
      if (slot.confidence === "high") {
        statusIcon = "✅";
        statusText = "全員空き";
      } else if (slot.confidence === "medium") {
        statusIcon = "⚠️";
        statusText = `仮承諾 ${slot.tentativeCount}名`;
      } else {
        statusIcon = "🔶";
        statusText = `仮承諾 ${slot.tentativeCount}名`;
      }

      return {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [
              { type: "TextBlock", text: `**${idx + 1}.**`, weight: "Bolder" },
            ],
          },
          {
            type: "Column",
            width: "stretch",
            items: [
              {
                type: "TextBlock",
                text: `${startStr} - ${endTime}`,
                weight: "Bolder",
              },
              ...(slot.tentativeCount > 0
                ? [
                    {
                      type: "TextBlock",
                      text: `仮承諾: ${slot.tentativeAttendees.map((i: number) => emails[i] ?? `参加者${i + 1}`).join(", ")}`,
                      size: "Small",
                      color: "Warning",
                      wrap: true,
                    },
                  ]
                : []),
            ],
          },
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "TextBlock",
                text: `${statusIcon} ${statusText}`,
                color: slot.confidence === "high" ? "Good" : "Warning",
              },
            ],
          },
        ],
      };
    },
  );

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
            text: "📅 空き時間候補",
            weight: "Bolder",
            size: "Large",
          },
          {
            type: "TextBlock",
            text: `${emails.length}名 ・ ${durationMinutes}分 ・ ${result.totalCandidatesFound}件中 上位${result.candidates.length}件`,
            size: "Small",
            isSubtle: true,
          },
        ],
      },
      ...candidateRows,
      {
        type: "Container",
        items: [
          {
            type: "TextBlock",
            text: "→ 番号を選んで会議を作成できます",
            weight: "Bolder",
            size: "Small",
            isSubtle: true,
          },
        ],
      },
    ],
  };
}

export function registerFindSlotsTool(server: McpServer): void {
  server.registerTool(
    "find_available_slots",
    {
      description:
        "Find common available time slots for attendees. " +
        "Supports tentative (仮承諾) status — slots where attendees have tentative meetings " +
        "are included with lower confidence. Returns both structured data and an Adaptive Card.",
      inputSchema,
    },
    async (input) => {
      const durationMinutes = input.durationMinutes ?? 60;
      const workingHoursOnly = input.workingHoursOnly ?? true;
      const maxCandidates = input.maxCandidates ?? 5;
      const includeTentative = input.includeTentative ?? true;
      const intervalMinutes = 30;
      const timeZone = process.env.DEFAULT_TIMEZONE ?? "UTC";
      const startDateTime = `${input.startDate}T00:00:00`;
      const endDateTime = `${input.endDate}T23:59:59`;

      const schedules = await getSchedule({
        emails: input.emails,
        startDateTime,
        endDateTime,
        intervalMinutes,
        timeZone,
      });

      const workingHoursStart = process.env.WORKING_HOURS_START ?? "09:00";
      const workingHoursEnd = process.env.WORKING_HOURS_END ?? "18:00";

      const result = findAvailableSlots({
        schedules,
        startDateTime,
        intervalMinutes,
        durationMinutes,
        workingHoursOnly,
        maxCandidates,
        workingHoursStart,
        workingHoursEnd,
        includeTentative,
      });

      const adaptiveCard = buildSlotCandidatesCard(
        result,
        input.emails,
        durationMinutes,
      );

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
