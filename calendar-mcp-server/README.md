# Calendar MCP Server

This server exposes MCP tools for scheduling and event creation using Microsoft Graph.

## Requirements

- Node.js 22+
- Azure AD App Registration with application permissions:
  - Calendars.ReadBasic
  - Calendars.ReadWrite
  - User.Read.All

Admin consent is required for all permissions.

## Setup

1. cd calendar-mcp-server
2. npm install
3. Copy .env.example to .env and fill in values
4. npm run dev

The server listens on http://localhost:3001/mcp

## MCP Tools

- get_schedule: Fetch free/busy information for attendees
- find_available_slots: Find common available slots
- create_event: Create a Teams meeting event

## Notes

- App-only auth cannot use /me. The server creates events in the first attendee's calendar.
- For accurate time handling, run the server in the same timezone as DEFAULT_TIMEZONE.

## Disclaimer

See docs/AgentsLeague_TechConnect_Info.md
