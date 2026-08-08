import type { AttendanceRecord, AttendanceWithEmployee, Employee } from "@/lib/attendance";

const API_BASE =
  import.meta.env["VITE_API_BASE_URL"] || process.env["VITE_API_BASE_URL"] || "http://localhost:5000";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = null;
    }
    throw new Error(payload?.error || payload?.message || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getApiBaseUrl(): string {
  return API_BASE;
}

export async function fetchEmployees(): Promise<Employee[]> {
  return requestJson<Employee[]>("/api/employees");
}

export async function createEmployee(payload: Omit<Employee, "id" | "active" | "created_at" | "updated_at"> & {
  active?: boolean;
}): Promise<Employee> {
  return requestJson<Employee>("/api/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployee(employeeId: string): Promise<void> {
  await requestJson<{ ok: boolean }>(`/api/employees/${employeeId}`, {
    method: "DELETE",
  });
}

export async function captureFace(): Promise<{ descriptor: number[]; photo: string; box: { x: number; y: number; width: number; height: number } }> {
  return requestJson<{ descriptor: number[]; photo: string; box: { x: number; y: number; width: number; height: number } }>(
    "/api/employees/capture-face",
  );
}

export async function captureFaceMultiple(): Promise<{ descriptor: number[]; photo: string; box: { x: number; y: number; width: number; height: number }; frames_captured: number }> {
  return requestJson<{ descriptor: number[]; photo: string; box: { x: number; y: number; width: number; height: number }; frames_captured: number }>(
    "/api/employees/capture-face-5",
  );
}

export async function fetchAttendance(date: string): Promise<AttendanceWithEmployee[]> {
  return requestJson<AttendanceWithEmployee[]>(`/api/attendance?date=${encodeURIComponent(date)}`);
}

export async function scanAttendance(): Promise<{
  kind: "in" | "out" | "done" | "unknown";
  employee?: Employee;
  record?: AttendanceRecord;
  distance?: number;
  faces_detected?: number;
}> {
  return requestJson<{
    kind: "in" | "out" | "done" | "unknown";
    employee?: Employee;
    record?: AttendanceRecord;
    distance?: number;
    faces_detected?: number;
  }>("/api/attendance/scan", {
    method: "POST",
  });
}
