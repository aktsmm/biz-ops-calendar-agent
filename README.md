# Biz-Ops Calendar Agent — Smart Scheduling for M365 Copilot

> **Agents League @ TechConnect** — Track 3: Enterprise Agents (Copilot Studio)  
> Connected Agents + Power Automate Bridge + Custom MCP Server

![Demo](demogif/2026-02-13_07h27_03.gif)

## Overview

Biz-Ops Calendar Agent is a **Copilot Studio agent** deployed to **M365 Copilot Chat (Teams)** that provides smart scheduling capabilities:

- 📅 **Smart Scheduling** — Check your schedule, find other users' availability, and create meetings
- 🗓️ **Meeting Creation** — Create Teams meetings with online meeting links, with mandatory confirmation flow
- 📊 **Cross-User Availability** — Fetch any colleague's Free/Busy via Power Automate + Graph API bridge
- 📧 **Email Management** — Send, reply, forward, list, and flag emails (via Email Sub-Agent)
- 🤖 **Connected Agents** — Orchestrator → Calendar Sub-Agent + Email Sub-Agent delegation
- 🔧 **Custom MCP Server** — Full-featured Calendar MCP Server (TypeScript) for VS Code local development

## Architecture

### Copilot Studio Agent (Production — M365 Copilot Chat)

```
M365 Copilot Chat (Teams / Web)
  └── Copilot Studio Agent (Biz-Ops Calendar Agent) — Orchestrator/Router
        ├── Calendar Sub-Agent (Connected Agent)
        │     ├── 会議管理 MCP サーバー (Office 365 Outlook Connector)
        │     │     └── GetCalendarView, CreateMeeting, UpdateMeeting, etc.
        │     └── GetSchedule Flow (Power Automate エージェントフロー)
        │           └── Office 365 Outlook「HTTP 要求を送信します」(Delegated auth)
        │                 └── Graph API /me/calendar/getSchedule
        └── Email Sub-Agent (Connected Agent)
              └── メール管理 MCP サーバー (Office 365 Outlook Connector)
                    └── SendEmail, ListEmails, ReplyToEmail, FlagEmail, etc.
```

### VS Code Copilot Chat Agents (Local Development)

```
VS Code Copilot Chat
  └── @orchestrator (.agent.md)
        ├── @availability-finder → Calendar MCP Server (localhost:3001)
        │     └── Microsoft Graph API (App-only auth)
        │           └── get_schedule, find_available_slots, create_event
        ├── @task-manager → WorkIQ MCP
        └── @report-generator → WorkIQ MCP
```

## DLP Challenge & Solution

> **Enterprise environments impose DLP (Data Loss Prevention) policies** that restrict which connectors can be used in Power Platform. This project encountered and solved a real-world DLP constraint.

| What We Tried                                           | Result         | Root Cause                                                       |
| ------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| Custom MCP endpoint (Dev Tunnel / Azure Container Apps) | ❌ Blocked     | DLP policy blocks custom MCP endpoints                           |
| Microsoft MCP Servers (Agent 365 Outlook Calendar MCP)  | ❌ Blocked     | Premium connector, blocked by `Personal Developer (default)` DLP |
| HTTP connector (Premium)                                | ❌ Blocked     | Premium connector, same DLP policy                               |
| **Office 365 Outlook connector (Standard)**             | **✅ Allowed** | Standard connector in Business data group                        |

**Solution: Power Automate Bridge Pattern** — Wrap Graph API calls inside a Power Automate agent flow using the Office 365 Outlook connector's "Send an HTTP request" action (standard connector, delegated auth). This provides the same functionality as the custom MCP server without triggering DLP restrictions.

## Copilot Studio Components

| Component               | Type                      | Description                                           |
| ------------------------ | ------------------------- | ----------------------------------------------------- |
| Biz-Ops Calendar Agent   | Parent Agent (Router)     | Routes requests to Calendar or Email Sub-Agent        |
| Calendar Sub-Agent       | Connected Agent           | Schedule lookup, availability check, meeting creation |
| Email Sub-Agent          | Connected Agent           | Email send, reply, forward, list, flag                |
| GetSchedule Flow         | Power Automate Agent Flow | Graph API `getSchedule` bridge (delegated auth)       |
| 会議管理 MCP サーバー    | O365 Outlook Connector    | GetCalendarView, CreateMeeting (9 tools)              |
| メール管理 MCP サーバー  | O365 Outlook Connector    | SendEmail, ListEmails (6 tools)                       |

## Demo Scenarios

### 1. Check My Schedule

```
User: "今日の予定を教えて"

→ Orchestrator → Calendar Sub-Agent
→ GetCalendarViewOfMeetings (会議管理 MCP / O365)
→ Returns today's meetings with times, subjects in JST
```

### 2. Check Other User's Availability

```
User: "alice@contoso.com の明日の空き時間を確認して"

→ Orchestrator → Calendar Sub-Agent
→ GetSchedule Flow (Power Automate)
→ Graph API /me/calendar/getSchedule (delegated auth)
→ Returns availabilityView (0=Free ✅ / 1=Tentative ⚠️ / 2=Busy ❌)
```

### 3. E2E Multi-Person Scheduling ⭐

```
User: "alice@contoso.com と来週30分の打ち合わせを設定して"

Step 1: GetSchedule Flow → alice の空き時間を取得
Step 2: GetCalendarViewOfMeetings → 自分の予定を取得
Step 3: 共通の空き時間を計算し候補を提示
        📅 候補1: 2/17 (月) 10:00 - 10:30 JST
        📅 候補2: 2/17 (月) 14:00 - 14:30 JST
        📅 候補3: 2/18 (火) 11:00 - 11:30 JST
Step 4: User: "1番で"
Step 5: CreateMeeting (calendar_id="Calendar", isOnlineMeeting=true)
Step 6: ✅ 会議作成完了 + Teams リンク表示
```

### 4. Email Operations

```
User: "未読メールを5件表示して"

→ Orchestrator → Email Sub-Agent
→ メール管理 MCP (O365 Outlook)
→ Returns sender, subject, received date
```

## Screenshots

| Self Calendar | E2E Scheduling | Copilot Studio |
|:---:|:---:|:---:|
| ![Self Calendar](screenshots/e2e-test-self-calendar-success.png) | ![E2E](screenshots/e2e-test-multi-person-scheduling.png) | ![Studio](screenshots/e2e-test-copilot-studio.png) |

## Custom MCP Server (calendar-mcp-server/)

Built from scratch in TypeScript — available for VS Code local development and demonstrates MCP protocol implementation:

| Tool                    | Description                                   | Read/Write |
| ----------------------- | --------------------------------------------- | ---------- |
| `get_schedule`          | Fetch attendee availability via Graph API     | Read       |
| `find_available_slots`  | Find common free time slots (tentative-aware) | Read       |
| `create_event`          | Create a Teams meeting event                  | Write      |
| `get_current_date_time` | Get current date/time in UTC and JST          | Read       |

**Tech Stack**: MCP SDK v1.26, Express, Streamable HTTP, Zod v4, API Key auth (`crypto.timingSafeEqual`)

## Setup Guide

### Prerequisites

- M365 Copilot license (for Copilot Studio + M365 Copilot Chat)
- Node.js 20+ (for local MCP server)
- Entra ID App Registration with Graph API permissions (for local MCP server):
  - `Calendars.Read`, `Calendars.ReadWrite`, `User.Read.All` (Application)

### Quick Start (Local MCP Server)

```bash
cd calendar-mcp-server
npm install

# Register Entra ID App (creates .env automatically)
cd .. && pwsh -File scripts/setup-azure-app.ps1

# Start the server
cd calendar-mcp-server && npm run dev
# → http://localhost:3001/mcp
```

### Copilot Studio Setup

1. Go to [copilotstudio.microsoft.com](https://copilotstudio.microsoft.com)
2. Create agent "Biz-Ops Calendar Agent"
3. Add tools: 会議管理 MCP サーバー + メール管理 MCP サーバー (O365 Outlook)
4. Create Connected Agents: Calendar Sub-Agent, Email Sub-Agent
5. Create Power Automate agent flow for GetSchedule (see below)
6. Publish → Channels → Teams and Microsoft 365 Copilot

> ⚠️ **DLP Note**: Custom MCP endpoints and Microsoft MCP Servers (Agent 365) may be blocked by your tenant's DLP policy. Use the Power Automate bridge pattern (Office 365 Outlook connector → Graph API HTTP request) as a workaround.

### Power Automate GetSchedule Flow

```
Trigger: エージェントがフローを呼び出したとき (Skills)
  Input: emails (text), startDateTime (text), endDateTime (text)
    ↓
Action: HTTP 要求を送信します (Office 365 Outlook / delegated auth)
  URI: https://graph.microsoft.com/v1.0/me/calendar/getSchedule
  Method: POST
  Body: {"schedules":["<emails>"],"startTime":{"dateTime":"<startDateTime>",
         "timeZone":"Asia/Tokyo"},"endTime":{"dateTime":"<endDateTime>",
         "timeZone":"Asia/Tokyo"},"availabilityViewInterval":30}
    ↓
Action: エージェントに応答する (Skills)
  Output: scheduleData = body('HTTP_要求を送信します')
```

## Project Structure

```
├── calendar-mcp-server/                 # Custom MCP server (TypeScript)
│   ├── src/
│   │   ├── index.ts                     # Express + API Key Auth + Streamable HTTP
│   │   ├── graph/
│   │   │   ├── client.ts               # Entra ID app-only auth
│   │   │   └── calendar.ts             # getSchedule, createEvent
│   │   ├── tools/
│   │   │   ├── getSchedule.ts           # Schedule lookup tool
│   │   │   ├── findSlots.ts             # Tentative-aware slot finder
│   │   │   ├── createEvent.ts           # Meeting creation tool
│   │   │   └── getCurrentDateTime.ts    # Current date/time tool
│   │   └── utils/
│   │       └── slotCalculator.ts        # Slot calculation logic
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   └── setup-azure-app.ps1              # Entra ID App Registration
├── docs/
│   ├── copilot-studio-calendar-sub-agent-instructions.md
│   └── demo-script.md
├── screenshots/                         # Demo screenshots
├── demogif/                             # Demo GIF
├── DISCLAIMER.md
├── CODE_OF_CONDUCT.md
└── README.md
```

## Technical Highlights

- **Connected Agents** — Orchestrator → Calendar Sub-Agent + Email Sub-Agent delegation pattern
- **Power Automate Bridge** — DLP-safe Graph API access via Office 365 Outlook connector
- **Custom MCP Server** — TypeScript, MCP SDK v1.26, Streamable HTTP, Zod v4 schemas
- **Tentative Handling** — Graph `availabilityView` "1" treated as potential slots with confidence scoring
- **API Key Auth** — `crypto.timingSafeEqual` timing-safe comparison middleware
- **Microsoft Graph API** — `getSchedule`, `createEvent` with app-only + delegated auth
- **Instruction Engineering** — Mandatory 3-step meeting creation workflow (check → propose → confirm)

## Evaluation Criteria (Track 3: Enterprise Agents)

| Criteria                     | Weight | Implementation                                                                                 |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| **Technical Implementation** | 33%    | Connected Agents (15pts), Copilot Studio agent (Pass), Custom MCP Server in repo               |
| **Business Value**           | 33%    | Universal scheduling pain point, cross-user availability, real Graph API integration           |
| **Innovation & Creativity**  | 34%    | DLP bridge pattern, multi-agent orchestration, instruction engineering for mandatory workflows |

| Technical Item          | Points    | Status                                                                               |
| ----------------------- | --------- | ------------------------------------------------------------------------------------ |
| M365 Copilot Chat Agent | Pass/Fail | ✅ Copilot Studio → M365 Copilot Chat (Teams)                                       |
| Connected Agents        | 15 pts    | ✅ Calendar Sub-Agent + Email Sub-Agent                                              |
| External MCP Server     | 8 pts     | ✅ Built & in repo (DLP blocks direct connection — PA bridge as workaround)          |
| API Key Security        | 5 pts     | ✅ Implemented in MCP server (`MCP_API_KEY`, `crypto.timingSafeEqual`)               |

## Built With

- [Copilot Studio](https://copilotstudio.microsoft.com/) — M365 Copilot agent with Connected Agents
- [Power Automate](https://make.powerautomate.com/) — Agent flow for Graph API bridge
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — Custom MCP server implementation
- [Microsoft Graph API](https://learn.microsoft.com/graph/) — Calendar operations (getSchedule, createEvent)
- [Office 365 Outlook Connector](https://learn.microsoft.com/connectors/office365/) — Standard connector (DLP-safe)
- TypeScript, Express, Zod, MCP SDK v1.26

## Disclaimer

See [DISCLAIMER.md](DISCLAIMER.md)

This project was created during the Agents League @ TechConnect hackathon.  
All data shown in demos uses fictional/dummy data (Contoso, Fabrikam, Northwind).  
No real customer data, PII, or Microsoft Confidential information is included.
