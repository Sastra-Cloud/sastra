import { describe, expect, it } from "vitest";
import { isValidTimeZone, timezoneOptions } from "./timezone";
describe("portable timezone control", () => {
  it.each(["UTC", "Europe/Paris", "Pacific/Chatham", "America/Argentina/Buenos_Aires", "Asia/Kolkata", "US/Pacific"])("accepts %s without rewriting", zone => { expect(isValidTimeZone(zone)).toBe(true); expect(timezoneOptions(zone)).toContain(zone); });
  it.each(["", "Mars/Base", "+07:00", "UTC+7"])("rejects %s", zone => expect(isValidTimeZone(zone)).toBe(false));
});
