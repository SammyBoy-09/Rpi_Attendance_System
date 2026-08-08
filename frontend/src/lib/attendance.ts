export type Employee = {
  id: string;
  employee_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string;
  job_title: string | null;
  photo_url: string | null;
  face_descriptor: number[] | null;
  active: boolean;
  created_at: string;
};

export type AttendanceRecord = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  status: string;
  method: string;
  confidence: number | null;
  note: string | null;
};

export type AttendanceWithEmployee = AttendanceRecord & {
  employees: Pick<
    Employee,
    "full_name" | "employee_code" | "department" | "job_title" | "photo_url"
  > | null;
};

export const DEPARTMENTS = [
  "Engineering",
  "Operations",
  "Human Resources",
  "Finance",
  "Sales",
  "Support",
  "General",
] as const;

/** Shift start used to flag late arrivals. */
export const SHIFT_START_MINUTES = 9 * 60 + 15;

export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function durationLabel(inIso: string, outIso: string | null): string {
  if (!outIso) return "—";
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime();
  if (ms <= 0) return "0h 00m";
  const mins = Math.floor(ms / 60000);
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
