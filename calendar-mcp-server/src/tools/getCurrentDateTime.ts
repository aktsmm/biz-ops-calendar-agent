import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGetCurrentDateTimeTool(server: McpServer) {
  server.tool(
    "GetCurrentDateTime",
    "Returns the current date and time in UTC and JST (Asia/Tokyo). Call this FIRST before any calendar operation to determine today's date.",
    {},
    async () => {
      const now = new Date();
      const utc = now.toISOString();
      const jst = now.toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      // Also provide ISO format in JST for easy use
      const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const jstISO = jstDate.toISOString().replace("Z", "+09:00");

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                utc: utc,
                jst: jst,
                jstISO: jstISO,
                jstDate: jstISO.split("T")[0],
                dayOfWeek: now.toLocaleDateString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  weekday: "long",
                }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
