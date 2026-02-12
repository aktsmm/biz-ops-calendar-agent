/**
 * Availability status codes from Microsoft Graph availabilityView:
 *   "0" = Free, "1" = Tentative, "2" = Busy, "3" = OOF, "4" = WorkingElsewhere
 */
export const AvailabilityStatus = {
  Free: "0",
  Tentative: "1",
  Busy: "2",
  OutOfOffice: "3",
  WorkingElsewhere: "4",
} as const;

export interface CandidateSlot {
  start: string;
  end: string;
  confidence: "high" | "medium" | "low";
  allAvailable: boolean;
  /** Number of attendees with tentative (仮承諾) status in this slot */
  tentativeCount: number;
  /** Indices of attendees who have tentative status */
  tentativeAttendees: number[];
}

export interface SlotCalculationInput {
  schedules: Array<{ availabilityView: string; scheduleId?: string }>;
  startDateTime: string;
  intervalMinutes: number;
  durationMinutes: number;
  workingHoursOnly: boolean;
  maxCandidates: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  /** Include slots where some attendees have tentative (仮承諾) status */
  includeTentative?: boolean;
}

export interface SlotCalculationResult {
  candidates: CandidateSlot[];
  totalCandidatesFound: number;
  searchRange: { start: string; end: string };
}

export function findAvailableSlots(
  input: SlotCalculationInput,
): SlotCalculationResult {
  const {
    schedules,
    startDateTime,
    intervalMinutes,
    durationMinutes,
    workingHoursOnly,
    maxCandidates,
    workingHoursStart,
    workingHoursEnd,
    includeTentative = true,
  } = input;

  if (!schedules.length) {
    return {
      candidates: [],
      totalCandidatesFound: 0,
      searchRange: { start: startDateTime, end: startDateTime },
    };
  }

  const availabilityViews = schedules.map(
    (schedule) => schedule.availabilityView ?? "",
  );
  const viewLength = Math.min(...availabilityViews.map((view) => view.length));

  // Per-interval status: track free + tentative separately
  const slotStatus: Array<{
    free: boolean;
    tentativeCount: number;
    tentativeAttendees: number[];
  }> = new Array(viewLength)
    .fill(null)
    .map(() => ({ free: true, tentativeCount: 0, tentativeAttendees: [] }));

  for (
    let attendeeIdx = 0;
    attendeeIdx < availabilityViews.length;
    attendeeIdx++
  ) {
    const view = availabilityViews[attendeeIdx];
    for (let i = 0; i < viewLength; i += 1) {
      const status = view[i];
      if (status === AvailabilityStatus.Tentative) {
        // Tentative (仮承諾): still potentially available
        slotStatus[i].tentativeCount += 1;
        slotStatus[i].tentativeAttendees.push(attendeeIdx);
      } else if (status !== AvailabilityStatus.Free) {
        // Busy / OOF / WorkingElsewhere: not available
        slotStatus[i].free = false;
      }
    }
  }

  const requiredSlots = Math.ceil(durationMinutes / intervalMinutes);
  const baseDate = parseLocalDateTime(startDateTime);
  const candidates: CandidateSlot[] = [];

  for (let i = 0; i + requiredSlots <= viewLength; i += 1) {
    // Check if all required intervals are at least free or tentative
    const rangeInfo = getRangeAvailability(
      slotStatus,
      i,
      requiredSlots,
      includeTentative,
    );
    if (!rangeInfo.available) {
      continue;
    }

    const start = addMinutes(baseDate, i * intervalMinutes);
    const end = addMinutes(baseDate, i * intervalMinutes + durationMinutes);

    if (
      workingHoursOnly &&
      !isWithinWorkingHours(start, end, workingHoursStart, workingHoursEnd)
    ) {
      continue;
    }

    // Determine confidence:
    //   high   = all free, no tentative
    //   medium = some tentative but no hard conflicts
    //   low    = many tentative (>50% of attendees)
    const totalAttendees = availabilityViews.length;
    const maxTentative = rangeInfo.maxTentativeCount;
    let confidence: "high" | "medium" | "low";
    if (maxTentative === 0) {
      confidence = "high";
    } else if (maxTentative <= totalAttendees / 2) {
      confidence = "medium";
    } else {
      confidence = "low";
    }

    candidates.push({
      start: formatLocalDateTime(start),
      end: formatLocalDateTime(end),
      confidence,
      allAvailable: maxTentative === 0,
      tentativeCount: maxTentative,
      tentativeAttendees: rangeInfo.uniqueTentativeAttendees,
    });
  }

  // Sort: high confidence first, then medium, then low
  const confidenceOrder = { high: 0, medium: 1, low: 2 };
  candidates.sort(
    (a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence],
  );

  const totalCandidatesFound = candidates.length;

  return {
    candidates: candidates.slice(0, maxCandidates),
    totalCandidatesFound,
    searchRange: {
      start: formatLocalDateTime(baseDate),
      end: formatLocalDateTime(
        addMinutes(baseDate, viewLength * intervalMinutes),
      ),
    },
  };
}

/** Check if a range of intervals is available (free or tentative) */
function getRangeAvailability(
  slotStatus: Array<{
    free: boolean;
    tentativeCount: number;
    tentativeAttendees: number[];
  }>,
  startIndex: number,
  length: number,
  includeTentative: boolean,
): {
  available: boolean;
  maxTentativeCount: number;
  uniqueTentativeAttendees: number[];
} {
  let maxTentativeCount = 0;
  const tentativeSet = new Set<number>();

  for (let i = startIndex; i < startIndex + length; i += 1) {
    const status = slotStatus[i];
    if (!status.free) {
      return {
        available: false,
        maxTentativeCount: 0,
        uniqueTentativeAttendees: [],
      };
    }
    if (status.tentativeCount > 0) {
      if (!includeTentative) {
        return {
          available: false,
          maxTentativeCount: 0,
          uniqueTentativeAttendees: [],
        };
      }
      maxTentativeCount = Math.max(maxTentativeCount, status.tentativeCount);
      for (const idx of status.tentativeAttendees) {
        tentativeSet.add(idx);
      }
    }
  }

  return {
    available: true,
    maxTentativeCount,
    uniqueTentativeAttendees: Array.from(tentativeSet),
  };
}

function parseLocalDateTime(value: string): Date {
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const [datePart, timePart = "00:00:00"] = normalized.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute, second = "0"] = timePart.split(":");

  return new Date(
    year,
    month - 1,
    day,
    Number(hour),
    Number(minute),
    Number(second),
    0,
  );
}

function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join("T");
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function isWithinWorkingHours(
  start: Date,
  end: Date,
  workingHoursStart: string,
  workingHoursEnd: string,
): boolean {
  if (
    start.getFullYear() !== end.getFullYear() ||
    start.getMonth() !== end.getMonth() ||
    start.getDate() !== end.getDate()
  ) {
    return false;
  }

  const workStart = parseHourMinute(workingHoursStart);
  const workEnd = parseHourMinute(workingHoursEnd);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();

  return startMinutes >= workStart && endMinutes <= workEnd;
}

function parseHourMinute(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
