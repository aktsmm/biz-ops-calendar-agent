# Biz-Ops Calendar Agent — Smart Scheduling for M365 Copilot

> **Agents League @ TechConnect** — Track 3: Enterprise Agents (Copilot Studio)  
> Connected Agents + Instruction Engineering + Custom MCP Server

![Demo](demogif/2026-02-13_07h27_03.gif)

## Overview

Biz-Ops Calendar Agent is a **Copilot Studio agent** deployed to **M365 Copilot Chat (Teams)** that provides smart scheduling capabilities:

- 📅 **Smart Scheduling** — Check your schedule, propose meeting candidates, and create meetings
- 🗓️ **Meeting Creation** — Create Teams meetings with online meeting links, with mandatory confirmation flow
- 📧 **Email Management** — Send, reply, forward, list, and flag emails (via Email Sub-Agent)
- 🤖 **Connected Agents** — Orchestrator → Calendar Sub-Agent + Email Sub-Agent delegation
- 🔧 **Custom MCP Server** — Full-featured Calendar MCP Server (TypeScript) with Read + Write tools

## Architecture

### Copilot Studio Agent (Production — M365 Copilot Chat)

```
M365 Copilot Chat (Teams / Web)
  └── Copilot Studio Agent (Biz-Ops Calendar Agent) — Orchestrator/Router
        ├── Calendar Sub-Agent (Connected Agent)
        │     └── 会議管理 MCP サーバー (Office 365 Outlook Connector)
        │           └── GetCalendarView, CreateMeeting, UpdateMeeting, etc.
        └── Email Sub-Agent (Connected Agent)
              └── メール管理 MCP サーバー (Office 365 Outlook Connector)
                    └── SendEmail, ListEmails, ReplyToEmail, FlagEmail, etc.
```

## DLP Challenge & What We Learned

> **Enterprise environments impose DLP (Data Loss Prevention) policies** that restrict which connectors can be used in Power Platform. This project encountered real-world DLP constraints and documents the findings.

| What We Tried                                           | Result     | Root Cause                                                       |
| ------------------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| Custom MCP endpoint (Dev Tunnel / Azure Container Apps) | ❌ Blocked | DLP policy blocks custom MCP endpoints                           |
| Microsoft MCP Servers (Agent 365 Outlook Calendar MCP)  | ❌ Blocked | Premium connector, blocked by `Personal Developer (default)` DLP |
| HTTP connector (Premium)                                | ❌ Blocked | Premium connector, same DLP policy                               |
| Power Automate agent flow (Graph API getSchedule)       | ❌ Blocked | O365 Outlook "Send HTTP request" also restricted by DLP          |
| **Office 365 Outlook connector (Standard tools only)**  | **✅ OK**  | Standard connector in Business data group                        |

**What We Could Use**: Only the standard built-in tools of the Office 365 Outlook connector (GetCalendarView, CreateMeeting, etc.) — these are limited to the **current user's own calendar**.

**Workaround**: Since cross-user availability (`getSchedule`) was blocked, the agent proposes meeting candidates based on the user's own free time and lets attendees accept/decline via the Teams meeting invite. The Custom MCP Server in this repo implements the full cross-user scheduling flow and works in VS Code Copilot Chat.

## Copilot Studio Components

| Component               | Type                   | Description                                           |
| ------------------------ | ---------------------- | ----------------------------------------------------- |
| Biz-Ops Calendar Agent   | Parent Agent (Router)  | Routes requests to Calendar or Email Sub-Agent        |
| Calendar Sub-Agent       | Connected Agent        | Schedule lookup, meeting creation, candidate proposal |
| Email Sub-Agent          | Connected Agent        | Email send, reply, forward, list, flag                |
| 会議管理 MCP サーバー    | O365 Outlook Connector | GetCalendarView, CreateMeeting (9 tools)              |
| メール管理 MCP サーバー  | O365 Outlook Connector | SendEmail, ListEmails (6 tools)                       |

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
2. **GetCalendarViewOfMeetings** — Fetches the user's own schedule for the requested period
3. **Analyze free time** — Identifies available time slots from the calendar data
4. **Present candidates** — Shows 3 time slot candidates to the user
5. **User confirmation** — Waits for user to pick a slot (never creates meetings without explicit approval)
6. **CreateMeeting** — Creates Teams meeting with online link (`isOnlineMeeting=true`)

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

### 2. Schedule a Meeting ⭐

```
User: "来週30分のミーティングができる空き時間を教えて"

Step 1: GetCurrentDateTime → 今日の日付を確定
Step 2: GetCalendarViewOfMeetings → 自分の来週の予定を取得
Step 3: 空き時間を分析し候補を提示
        📅 候補1: 2/17 (月) 10:00 - 10:30 JST
        📅 候補2: 2/17 (月) 14:00 - 14:30 JST
        📅 候補3: 2/18 (火) 11:00 - 11:30 JST
Step 4: User: "1番で作成して。タイトルは「チームSync」"
Step 5: CreateMeeting (calendar_id="Calendar", isOnlineMeeting=true)
Step 6: ✅ 会議作成完了 + Teams リンク表示
```

### 3. Email Operations

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

- **Universal Pain Point** — Meeting scheduling is a daily challenge for every knowledge worker
- **Enterprise-Ready** — Built within real DLP constraints, not in an idealized environment
- **Instruction Engineering** — Mandatory 3-step meeting creation workflow (check → propose → confirm) prevents accidental meeting creation
- **DLP Documentation** — Documents real enterprise DLP challenges and workarounds that other teams can reference
- **Connected Agents Pattern** — Reusable multi-agent orchestration architecture for Copilot Studio

## Custom MCP Server (calendar-mcp-server/)

Built from scratch in TypeScript — a fully functional MCP server with Read + Write tools, including the cross-user scheduling that DLP blocked in Copilot Studio:

| Tool                    | Description                                   | Read/Write |
| ----------------------- | --------------------------------------------- | ---------- |
| `get_schedule`          | Fetch attendee availability via Graph API     | Read       |
| `find_available_slots`  | Find common free time slots (tentative-aware) | Read       |
| `create_event`          | Create a Teams meeting event                  | Write      |
| `get_current_date_time` | Get current date/time in UTC and JST          | Read       |

**Tech Stack**: MCP SDK v1.26, Express, Streamable HTTP, Zod v4, API Key auth (`crypto.timingSafeEqual`)

> ⚠️ **DLP Limitation**: This MCP server works in VS Code Copilot Chat for local development, but **cannot be connected to Copilot Studio** due to the tenant's DLP policy blocking custom MCP endpoints and premium connectors. In a DLP-unrestricted environment, this server would provide full cross-user scheduling capabilities directly in Copilot Studio.

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
5. Configure Instructions for Orchestrator, Calendar Sub-Agent, Email Sub-Agent
6. Publish → Channels → Teams and Microsoft 365 Copilot

> ⚠️ **DLP Note**: Custom MCP endpoints, Microsoft MCP Servers (Agent 365), and Power Automate HTTP actions may be blocked by your tenant's DLP policy. The standard Office 365 Outlook connector tools (GetCalendarView, CreateMeeting, etc.) work within DLP constraints.

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
- **Custom MCP Server** — TypeScript, MCP SDK v1.26, Streamable HTTP, Zod v4 schemas, Read + Write tools
- **API Key Auth** — `crypto.timingSafeEqual` timing-safe comparison middleware in MCP server
- **Tentative Handling** — Graph `availabilityView` "1" treated as potential slots with confidence scoring
- **Microsoft Graph API** — `getSchedule`, `createEvent` with app-only auth (in MCP server)
- **Instruction Engineering** — Mandatory 3-step meeting creation workflow (check → propose → confirm)
- **DLP Resilience** — Documented 5 approaches, built working agent within real enterprise constraints

## Evaluation Criteria (Track 3: Enterprise Agents)

| Criteria                     | Weight | Implementation                                                                                   |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| **Technical Implementation** | 33%    | Connected Agents, Copilot Studio agent, Custom MCP Server with Read + Write tools                |
| **Business Value**           | 33%    | Universal scheduling pain point, enterprise DLP documentation, reusable architecture             |
| **Innovation & Creativity**  | 34%    | DLP constraint navigation, multi-agent orchestration, instruction engineering for safe workflows |

| Technical Item          | Points    | Status                                                                                 |
| ----------------------- | --------- | -------------------------------------------------------------------------------------- |
| M365 Copilot Chat Agent | Pass/Fail | ✅ Copilot Studio → M365 Copilot Chat (Teams)                                         |
| Connected Agents        | 15 pts    | ✅ Calendar Sub-Agent + Email Sub-Agent (multi-agent orchestration)                    |
| External MCP Server     | 8 pts     | ✅ Read + Write tools in repo (works in VS Code; DLP blocks Copilot Studio connection) |
| OAuth Security          | 5 pts     | ✅ API Key auth in MCP server (`crypto.timingSafeEqual`)                               |

## Built With

- [Copilot Studio](https://copilotstudio.microsoft.com/) — M365 Copilot agent with Connected Agents
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) — Custom MCP server implementation
- [Microsoft Graph API](https://learn.microsoft.com/graph/) — Calendar operations (getSchedule, createEvent)
- [Office 365 Outlook Connector](https://learn.microsoft.com/connectors/office365/) — Standard connector (DLP-safe)
- TypeScript, Express, Zod, MCP SDK v1.26

## Disclaimer

See [DISCLAIMER.md](DISCLAIMER.md)

This project was created during the Agents League @ TechConnect hackathon.  
All data shown in demos uses fictional/dummy data (Contoso, Fabrikam, Northwind).  
No real customer data, PII, or Microsoft Confidential information is included.
