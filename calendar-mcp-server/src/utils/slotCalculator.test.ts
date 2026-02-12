import { describe, it, expect } from "vitest";
import {
  findAvailableSlots,
  AvailabilityStatus,
  type SlotCalculationInput,
} from "./slotCalculator.js";

// Helper to build availability view strings
const free = AvailabilityStatus.Free; // "0"
const tent = AvailabilityStatus.Tentative; // "1"
const busy = AvailabilityStatus.Busy; // "2"
const oof = AvailabilityStatus.OutOfOffice; // "3"

function makeInput(
  overrides: Partial<SlotCalculationInput> & {
    schedules: SlotCalculationInput["schedules"];
  },
): SlotCalculationInput {
  return {
    startDateTime: "2026-02-16T09:00:00",
    intervalMinutes: 30,
    durationMinutes: 60,
    workingHoursOnly: true,
    maxCandidates: 5,
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    includeTentative: true,
    ...overrides,
  };
}

describe("findAvailableSlots", () => {
  // ----------------------------------------------------------------
  // Basic scenarios
  // ----------------------------------------------------------------
  it("returns empty when no schedules provided", () => {
    const result = findAvailableSlots(makeInput({ schedules: [] }));
    expect(result.candidates).toHaveLength(0);
    expect(result.totalCandidatesFound).toBe(0);
  });

  it("finds all-free slots for a single attendee", () => {
    // 09:00-13:00 (8 intervals × 30min), all free
    const view = free.repeat(8);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        durationMinutes: 60,
      }),
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].confidence).toBe("high");
    expect(result.candidates[0].allAvailable).toBe(true);
    expect(result.candidates[0].tentativeCount).toBe(0);
  });

  it("finds no slots when all intervals are busy", () => {
    const view = busy.repeat(8);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        durationMinutes: 60,
      }),
    );
    expect(result.candidates).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // Tentative handling
  // ----------------------------------------------------------------
  it("includes tentative slots when includeTentative=true", () => {
    // 1 person: first 2 intervals tentative, rest free
    const view = tent + tent + free.repeat(6);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        durationMinutes: 60,
        includeTentative: true,
        maxCandidates: 10, // enough to include tentative slots after sort
      }),
    );
    // First slot (09:00-10:00) should be tentative-inclusive
    const firstSlot = result.candidates.find(
      (c) => c.start === "2026-02-16T09:00:00",
    );
    expect(firstSlot).toBeDefined();
    expect(firstSlot!.tentativeCount).toBeGreaterThan(0);
    expect(firstSlot!.confidence).not.toBe("high");
  });

  it("excludes tentative slots when includeTentative=false", () => {
    // 1 person: first 2 intervals tentative, rest free
    const view = tent + tent + free.repeat(6);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        durationMinutes: 60,
        includeTentative: false,
      }),
    );
    // 09:00-10:00 should NOT appear (tentative intervals)
    const firstSlot = result.candidates.find(
      (c) => c.start === "2026-02-16T09:00:00",
    );
    expect(firstSlot).toBeUndefined();
    // But 10:00-11:00 (all free) should appear
    const freeSlot = result.candidates.find(
      (c) => c.start === "2026-02-16T10:00:00",
    );
    expect(freeSlot).toBeDefined();
  });

  // ----------------------------------------------------------------
  // Multi-attendee scenarios
  // ----------------------------------------------------------------
  it("handles two attendees with overlapping free time", () => {
    // Person A: busy 09:00-10:00, free 10:00-13:00
    // Person B: free 09:00-13:00
    const viewA = busy + busy + free.repeat(6);
    const viewB = free.repeat(8);

    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: viewA }, { availabilityView: viewB }],
        durationMinutes: 60,
      }),
    );

    // 09:00-10:00 should NOT be available (A is busy)
    const busySlot = result.candidates.find(
      (c) => c.start === "2026-02-16T09:00:00",
    );
    expect(busySlot).toBeUndefined();

    // 10:00-11:00 should be available (both free)
    const freeSlot = result.candidates.find(
      (c) => c.start === "2026-02-16T10:00:00",
    );
    expect(freeSlot).toBeDefined();
    expect(freeSlot!.confidence).toBe("high");
  });

  it("correctly identifies tentative attendees in multi-attendee scenario", () => {
    // Person A: free 09:00-13:00
    // Person B: tentative 09:00-10:00, free 10:00-13:00
    const viewA = free.repeat(8);
    const viewB = tent + tent + free.repeat(6);

    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: viewA }, { availabilityView: viewB }],
        durationMinutes: 60,
        includeTentative: true,
        maxCandidates: 10, // enough to include tentative slots after sort
      }),
    );

    // 09:00-10:00 should exist with tentative info
    const tentSlot = result.candidates.find(
      (c) => c.start === "2026-02-16T09:00:00",
    );
    expect(tentSlot).toBeDefined();
    expect(tentSlot!.tentativeCount).toBe(1);
    expect(tentSlot!.tentativeAttendees).toContain(1); // Person B index
    expect(tentSlot!.confidence).toBe("medium");
  });

  // ----------------------------------------------------------------
  // Confidence levels
  // ----------------------------------------------------------------
  it("assigns 'high' confidence when all free, no tentative", () => {
    const view = free.repeat(8);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
      }),
    );
    expect(result.candidates[0].confidence).toBe("high");
  });

  it("assigns 'low' confidence when >50% attendees tentative", () => {
    // 3 people: 2 tentative, 1 free
    const viewFree = free.repeat(4);
    const viewTent = tent.repeat(4);

    const result = findAvailableSlots(
      makeInput({
        schedules: [
          { availabilityView: viewFree },
          { availabilityView: viewTent },
          { availabilityView: viewTent },
        ],
        durationMinutes: 60,
        workingHoursOnly: false,
      }),
    );
    const slot = result.candidates.find(
      (c) => c.start === "2026-02-16T09:00:00",
    );
    expect(slot).toBeDefined();
    expect(slot!.confidence).toBe("low");
  });

  // ----------------------------------------------------------------
  // Working hours filtering
  // ----------------------------------------------------------------
  it("filters out non-working-hours slots when workingHoursOnly=true", () => {
    // Start at 07:00, 8 intervals = 07:00-11:00
    const view = free.repeat(8);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        startDateTime: "2026-02-16T07:00:00",
        durationMinutes: 60,
        workingHoursOnly: true,
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
      }),
    );

    // 07:00-08:00 and 08:00-09:00 should be excluded
    for (const c of result.candidates) {
      const hour = parseInt(c.start.split("T")[1].split(":")[0], 10);
      expect(hour).toBeGreaterThanOrEqual(9);
    }
  });

  it("includes non-working-hours slots when workingHoursOnly=false", () => {
    const view = free.repeat(8);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        startDateTime: "2026-02-16T07:00:00",
        durationMinutes: 60,
        workingHoursOnly: false,
      }),
    );

    const earlySlot = result.candidates.find(
      (c) => c.start === "2026-02-16T07:00:00",
    );
    expect(earlySlot).toBeDefined();
  });

  // ----------------------------------------------------------------
  // maxCandidates
  // ----------------------------------------------------------------
  it("limits results to maxCandidates", () => {
    const view = free.repeat(18); // 9 hours, many possible 1h slots
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        maxCandidates: 3,
      }),
    );
    expect(result.candidates).toHaveLength(3);
    expect(result.totalCandidatesFound).toBeGreaterThan(3);
  });

  // ----------------------------------------------------------------
  // Sorting
  // ----------------------------------------------------------------
  it("sorts candidates by confidence (high first)", () => {
    // Create scenario with mixed confidence:
    // Intervals 0-1: tentative for person B → medium confidence
    // Intervals 2-3: free for both → high confidence
    const viewA = free.repeat(4);
    const viewB = tent + tent + free + free;

    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: viewA }, { availabilityView: viewB }],
        durationMinutes: 60,
        workingHoursOnly: false,
        maxCandidates: 10,
      }),
    );

    if (result.candidates.length > 1) {
      const confidenceOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < result.candidates.length; i++) {
        expect(
          confidenceOrder[result.candidates[i].confidence],
        ).toBeGreaterThanOrEqual(
          confidenceOrder[result.candidates[i - 1].confidence],
        );
      }
    }
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------
  it("handles mismatched view lengths gracefully", () => {
    // Shorter view for one attendee
    const viewLong = free.repeat(8);
    const viewShort = free.repeat(4);

    const result = findAvailableSlots(
      makeInput({
        schedules: [
          { availabilityView: viewLong },
          { availabilityView: viewShort },
        ],
        durationMinutes: 60,
      }),
    );
    // Should use min length, so max 4 intervals (4×30min = 2h)
    // With 60min needed = 2 intervals, max start index = 2
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it("handles OOF status same as busy", () => {
    const view = oof.repeat(4) + free.repeat(4);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        durationMinutes: 60,
      }),
    );
    const oofSlot = result.candidates.find(
      (c) => c.start === "2026-02-16T09:00:00",
    );
    expect(oofSlot).toBeUndefined();
  });

  it("handles duration requiring multiple intervals", () => {
    // Need 90 min = 3 intervals of 30 min
    const view = free.repeat(8);
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        durationMinutes: 90,
      }),
    );
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      const startTime = new Date(c.start.replace("T", " "));
      const endTime = new Date(c.end.replace("T", " "));
      const durationMs = endTime.getTime() - startTime.getTime();
      expect(durationMs).toBe(90 * 60000);
    }
  });

  it("returns correct searchRange", () => {
    const view = free.repeat(8); // 8×30min = 4h from 09:00 → 13:00
    const result = findAvailableSlots(
      makeInput({
        schedules: [{ availabilityView: view }],
        startDateTime: "2026-02-16T09:00:00",
      }),
    );
    expect(result.searchRange.start).toBe("2026-02-16T09:00:00");
    expect(result.searchRange.end).toBe("2026-02-16T13:00:00");
  });
});
