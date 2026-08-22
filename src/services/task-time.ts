import { invariant } from "../model/errors.js";

const TASK_DURATION_PATTERN = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/u;
const TASK_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export function taskTimestampMilliseconds(value: string): number | undefined {
  const match = TASK_TIMESTAMP_PATTERN.exec(value);
  if (match === null) return undefined;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const calendarProbe = new Date(0);
  calendarProbe.setUTCFullYear(year, month - 1, day);
  calendarProbe.setUTCHours(hour, minute, second, 0);
  if (
    calendarProbe.getUTCFullYear() !== year
    || calendarProbe.getUTCMonth() !== month - 1
    || calendarProbe.getUTCDate() !== day
    || calendarProbe.getUTCHours() !== hour
    || calendarProbe.getUTCMinutes() !== minute
    || calendarProbe.getUTCSeconds() !== second
  ) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

export function parseTaskTimestamp(value: string, label: string): number {
  const milliseconds = taskTimestampMilliseconds(value);
  invariant(milliseconds !== undefined, "INVALID_ARGUMENT", `${label} must be a valid timestamp`);
  return milliseconds;
}

export function compareTaskTimestamps(left: string, right: string): number {
  return parseTaskTimestamp(left, "Left timestamp") - parseTaskTimestamp(right, "Right timestamp");
}

export function taskDurationMilliseconds(value: string): number | undefined {
  const match = TASK_DURATION_PATTERN.exec(value);
  if (match === null || !match.slice(1).some((part) => part !== undefined)) return undefined;
  const milliseconds = ((Number(match[1] ?? 0) * 24 + Number(match[2] ?? 0)) * 3600
    + Number(match[3] ?? 0) * 60
    + Number(match[4] ?? 0)) * 1000;
  return Number.isFinite(milliseconds) ? milliseconds : undefined;
}

export function parseTaskDuration(value: string): number {
  const milliseconds = taskDurationMilliseconds(value);
  invariant(
    milliseconds !== undefined,
    "INVALID_ARGUMENT",
    "Reminder duration must be a supported ISO 8601 duration",
  );
  return milliseconds;
}
