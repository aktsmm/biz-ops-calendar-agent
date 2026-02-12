import { describe, it, expect } from "vitest";

/**
 * Tests for helper functions used in tool files (createEvent.ts, findSlots.ts).
 * Since formatJapaneseDateTime and calcDurationMinutes are module-private,
 * we replicate them here for isolated testing.
 */

// --- Replicated helper functions ---
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

function calcDurationMinutes(start: string, end: string): number {
  const s = new Date(start.replace("T", " "));
  const e = new Date(end.replace("T", " "));
  return Math.round((e.getTime() - s.getTime()) / 60000);
}

describe("formatJapaneseDateTime", () => {
  it("formats a Monday correctly", () => {
    // 2026-02-16 is Monday (月)
    const result = formatJapaneseDateTime("2026-02-16T09:00:00");
    expect(result).toBe("2/16 (月) 09:00");
  });

  it("formats a Friday correctly", () => {
    // 2026-02-13 is Friday (金)
    const result = formatJapaneseDateTime("2026-02-13T14:30:00");
    expect(result).toBe("2/13 (金) 14:30");
  });

  it("formats midnight correctly", () => {
    const result = formatJapaneseDateTime("2026-01-01T00:00:00");
    expect(result).toMatch(/1\/1 \(.\) 00:00/);
  });

  it("formats end of day correctly", () => {
    const result = formatJapaneseDateTime("2026-12-31T23:59:00");
    expect(result).toMatch(/12\/31 \(.\) 23:59/);
  });

  it("pads single digit hours and minutes", () => {
    const result = formatJapaneseDateTime("2026-03-01T08:05:00");
    expect(result).toMatch(/3\/1 \(.\) 08:05/);
  });
});

describe("calcDurationMinutes", () => {
  it("calculates 60 minutes for 1 hour", () => {
    expect(
      calcDurationMinutes("2026-02-16T09:00:00", "2026-02-16T10:00:00"),
    ).toBe(60);
  });

  it("calculates 30 minutes", () => {
    expect(
      calcDurationMinutes("2026-02-16T09:00:00", "2026-02-16T09:30:00"),
    ).toBe(30);
  });

  it("calculates 90 minutes", () => {
    expect(
      calcDurationMinutes("2026-02-16T09:00:00", "2026-02-16T10:30:00"),
    ).toBe(90);
  });

  it("handles cross-hour boundaries", () => {
    expect(
      calcDurationMinutes("2026-02-16T09:45:00", "2026-02-16T10:15:00"),
    ).toBe(30);
  });

  it("returns 0 for same start and end", () => {
    expect(
      calcDurationMinutes("2026-02-16T09:00:00", "2026-02-16T09:00:00"),
    ).toBe(0);
  });
});
