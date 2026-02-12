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

## DLP Challenge & Solution

> **Enterprise environments impose DLP (Data Loss Prevention) policies** that restrict which connectors can be used in Power Platform. This project encountered and solved a real-world DLP constraint.

| What We Tried                                           | Result         | Root Cause                                                       |
| ------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| Custom MCP endpoint (Dev Tunnel / Azure Container Apps) | ❌ Blocked     | DLP policy blocks custom MCP endpoints                           |
| Microsoft MCP Servers (Agent 365 Outlook Calendar MCP)  | ❌ Blocked     | Premium connector, blocked by `Personal Developer (default)` DLP |
| HTTP connector (Premium)                                | ❌ Blocked     | Premium connector, same DLP policy                               |
| **Office 365 Outlook connector (Standard)**             | **✅ Allowed** | Standard connector in Business data group                        |

**Solution: Power Automate Bridge Pattern** — Wrap Graph API calls inside a Power Automate agent flow using the Office 365 Outlook connector's "Send an HTTP request" action (standard connector, **OAuth 2.0 delegated auth**). This provides the same functionality as the custom MCP server without triggering DLP restrictions.

## Copilot Studio Components

| Component               | Type                      | Description                                           |
| ------------------------ | ------------------------- | ----------------------------------------------------- |
| Biz-Ops Calendar Agent   | Parent Agent (Router)     | Routes requests to Calendar or Email Sub-Agent        |
| Calendar Sub-Agent       | Connected Agent           | Schedule lookup, availability check, meeting creation |
| Email Sub-Agent          | Connected Agent           | Email send, reply, forward, list, flag                |
| GetSchedule Flow         | Power Automate Agent Flow | Graph API `getSchedule` bridge (delegated auth)       |
| 会議管理 MCP サーバー    | O365 Outlook Connector    | GetCalendarView, CreateMeeting (9 tools)              |
| メール管理 MCP サーバー  | O365 Outlook Connector    | SendEmail, ListEmails (6 tools)                       |

## Connected Agents — Multi-Agent Orchestration

The core of this project is the **Connected Agents** pattern in Copilot Studio — a parent agent (Orchestrator) that automatically delegates tasks to specialized sub-agents.

### How Orchestrator Routing Works

The Orchestrator uses **Instruction-based routing** to decide which sub-agent handles each request:

```
Orchestrator Instructions (excerpt):
"Automatically use the Calendar Sub-Agent for scheduling, meetings,
and availability requests. Use the Email Sub-Agent for email-related tasks.
Choose the right sub-agent without asking the user."
```

No manual topic routing or keyword matching needed — the LLM understands intent and delegates automatically.

### Calendar Sub-Agent — Multi-Step Reasoning

The Calendar Sub-Agent performs complex multi-step workflows via Instructions:

1. **GetCurrentDateTime** (mandatory first step) — Anchors date calculations to prevent hallucination
2. **GetSchedule Flow** — Calls Power Automate → Graph API to fetch attendee `availabilityView`
3. **Parse availabilityView** — Decodes 30-min interval string (`"000022220000"`) into Free/Busy/Tentative
4. **Cross-reference** — Compares with own calendar via `GetCalendarViewOfMeetings`
5. **Present candidates** — Shows 3 time slots with ✅ Free / ⚠️ Tentative indicators
6. **User confirmation** — Waits for user to pick a slot (never creates meetings without explicit approval)
7. **CreateMeeting** — Creates Teams meeting with online link (`isOnlineMeeting=true`)

### Email Sub-Agent

Handles email operations via Office 365 Outlook connector — send, reply, forward, list, and flag emails.

### Instruction Engineering Highlights

| Challenge | Solution in Instructions |
|---|---|
| Sub-agent asks "Which calendar ID?" | Force `calendar_id="Calendar"` always |
| Date hallucination (wrong "next week") | Mandatory `GetCurrentDateTime` first + calculation examples |
| JSON metadata leaking to user | "Never output raw JSON or tool call explanations" |
| Accidental meeting creation | 3-step mandatory workflow: check → propose → confirm |
| Content moderation false positives | Natural language style instead of `## RULE` / `Do NOT` patterns |

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

## Business Value

- **Universal Pain Point** — Meeting scheduling across time zones and calendars is a daily challenge for every knowledge worker
- **Cross-User Availability** — Goes beyond basic self-calendar tools; checks other users' Free/Busy status via Graph API
- **Real Graph API Integration** — Not a mock; actually calls `getSchedule` and `createEvent` against live M365 data
- **Enterprise-Ready Architecture** — DLP-compliant design pattern reusable across any enterprise tenant
- **Instruction Engineering** — Mandatory 3-step meeting creation workflow (check → propose → confirm) prevents accidental meeting creation

## Custom MCP Server (calendar-mcp-server/)

Built from scratch in TypeScript — demonstrates MCP protocol implementation with Read + Write tools:

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

# Create .env with your Entra ID App credentials
# (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, MCP_API_KEY)

npm run dev
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
- **Power Automate Bridge** — DLP-safe Graph API access via Office 365 Outlook connector (OAuth 2.0 delegated auth)
- **Custom MCP Server** — TypeScript, MCP SDK v1.26, Streamable HTTP, Zod v4 schemas, Read + Write tools
- **OAuth 2.0 Security** — Delegated auth for Graph API via Power Automate; API Key auth (`crypto.timingSafeEqual`) for MCP server
- **Tentative Handling** — Graph `availabilityView` "1" treated as potential slots with confidence scoring
- **Microsoft Graph API** — `getSchedule`, `createEvent` with delegated + app-only auth
- **Instruction Engineering** — Mandatory 3-step meeting creation workflow (check → propose → confirm)

## Evaluation Criteria (Track 3: Enterprise Agents)

| Criteria                     | Weight | Implementation                                                                                 |
| ---------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| **Technical Implementation** | 33%    | Connected Agents, Copilot Studio agent, Custom MCP Server, OAuth delegated auth                |
| **Business Value**           | 33%    | Universal scheduling pain point, cross-user availability, real Graph API integration           |
| **Innovation & Creativity**  | 34%    | DLP bridge pattern, multi-agent orchestration, instruction engineering for mandatory workflows |

| Technical Item          | Points    | Status                                                                                             |
| ----------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| M365 Copilot Chat Agent | Pass/Fail | ✅ Copilot Studio → M365 Copilot Chat (Teams)                                                     |
| Connected Agents        | 15 pts    | ✅ Calendar Sub-Agent + Email Sub-Agent (multi-agent orchestration)                                |
| External MCP Server     | 8 pts     | ✅ Read + Write tools in repo (+ Power Automate bridge for DLP-restricted environments)            |
| OAuth Security          | 5 pts     | ✅ OAuth 2.0 delegated auth via Power Automate + API Key auth in MCP server                        |

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
