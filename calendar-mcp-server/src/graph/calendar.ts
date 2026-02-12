import { getGraphClient } from "./client.js";

export interface ScheduleInfo {
  scheduleId: string;
  availabilityView: string;
  scheduleItems: Array<Record<string, unknown>>;
  workingHours?: Record<string, unknown>;
}

export async function getSchedule(params: {
  emails: string[];
  startDateTime: string;
  endDateTime: string;
  intervalMinutes: number;
  timeZone: string;
}): Promise<ScheduleInfo[]> {
  const { emails, startDateTime, endDateTime, intervalMinutes, timeZone } =
    params;

  if (!emails.length) {
    throw new Error("emails must include at least one address");
  }

  const client = getGraphClient();
  const anchorUser = emails[0];

  const requestBody = {
    schedules: emails,
    startTime: {
      dateTime: startDateTime,
      timeZone,
    },
    endTime: {
      dateTime: endDateTime,
      timeZone,
    },
    availabilityViewInterval: intervalMinutes,
  };

  const response = await client
    .api(`/users/${encodeURIComponent(anchorUser)}/calendar/getSchedule`)
    .post(requestBody);

  return response?.value ?? [];
}

export async function createEvent(params: {
  subject: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
  body?: string;
  isOnlineMeeting: boolean;
  location?: string;
  timeZone: string;
}): Promise<Record<string, unknown>> {
  const {
    subject,
    startDateTime,
    endDateTime,
    attendees,
    body,
    isOnlineMeeting,
    location,
    timeZone,
  } = params;

  if (!attendees.length) {
    throw new Error("attendees must include at least one address");
  }

  const client = getGraphClient();
  const organizer = attendees[0];
  const uniqueAttendees = Array.from(new Set(attendees));

  const event = {
    subject,
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
    attendees: uniqueAttendees.map((address) => ({
      emailAddress: { address },
      type: "required",
    })),
    body: {
      contentType: "HTML",
      content: body ?? "",
    },
    isOnlineMeeting,
    onlineMeetingProvider: isOnlineMeeting ? "teamsForBusiness" : undefined,
    location: location ? { displayName: location } : undefined,
  };

  const created = await client
    .api(`/users/${encodeURIComponent(organizer)}/events`)
    .post(event);

  return {
    id: created?.id ?? null,
    subject: created?.subject ?? subject,
    joinUrl: created?.onlineMeeting?.joinUrl ?? null,
    attendees: created?.attendees ?? [],
  };
}
