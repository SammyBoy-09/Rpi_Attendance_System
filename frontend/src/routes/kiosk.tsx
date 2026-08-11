import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  LogIn,
  LogOut,
  Pause,
  Play,
  ScanFace,
  ShieldAlert,
  Sparkles,
  Users,
  UserX,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CameraFrame } from "@/components/CameraFrame";
import {
  durationLabel,
  formatTime,
  localDateKey,
  type AttendanceRecord,
  type AttendanceWithEmployee,
  type Employee,
} from "@/lib/attendance";
import { Avatar } from "./index";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  deleteAttendance,
  fetchAttendance,
  fetchEmployees,
  getApiBaseUrl,
  scanAttendance,
  scanBatchAttendance,
  type BatchScanResponse,
} from "@/lib/api";

export const Route = createFileRoute("/kiosk")({
  head: () => ({
    meta: [
      { title: "Face Terminal — Attendance & Classroom Scan | Veridian" },
      {
        name: "description",
        content:
          "Attendance terminal with individual scanning and high-res multi-person classroom batch capture.",
      },
    ],
  }),
  component: KioskPage,
});

type Outcome = {
  kind: "in" | "out" | "done" | "unknown";
  employee?: Employee | undefined;
  record?: AttendanceRecord | undefined;
  distance?: number | undefined;
  at: number;
};

function KioskPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"single" | "classroom">("single");
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchScanResponse | null>(null);
  const [now, setNow] = useState(() => new Date());
  const busy = useRef(false);

  const today = localDateKey();
  const cameraStreamUrl = `${getApiBaseUrl()}/api/camera/stream`;

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-descriptors"],
    queryFn: fetchEmployees,
  });

  const { data: todayRecords = [] } = useQuery({
    queryKey: ["attendance", today],
    queryFn: () => fetchAttendance(today),
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleMatch = useCallback(async () => {
    const result = await scanAttendance();

    if (result.kind === "unknown" || !result.employee || !result.record) {
      setOutcome({ kind: "unknown", at: Date.now() });
      return result;
    }

    setOutcome({
      kind: result.kind,
      employee: result.employee,
      record: result.record,
      distance: result.distance,
      at: Date.now(),
    });

    queryClient.invalidateQueries({ queryKey: ["attendance", today] });
    return result;
  }, [queryClient, today]);

  useEffect(() => {
    if (mode !== "single" || !scanning) return;
    let stop = false;

    const tick = async () => {
      if (stop || busy.current) return;

      busy.current = true;
      try {
        const result = await handleMatch();
        if (!stop && result && result.kind !== "unknown") {
          setScanning(false);
        }
      } catch (error) {
        if (!stop) {
          toast.error("Could not scan attendance", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        busy.current = false;
      }
    };

    const interval = setInterval(tick, 800);
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, [mode, scanning, handleMatch]);

  const handleClassroomScan = async () => {
    setBatchLoading(true);
    try {
      const res = await scanBatchAttendance();
      setBatchResult(res);
      queryClient.invalidateQueries({ queryKey: ["attendance", today] });
      toast.success(
        `Captured ${res.total_faces} face${res.total_faces === 1 ? "" : "s"} — ${res.recognized_count} recognized`
      );
    } catch (err) {
      toast.error("Classroom multi-scan failed", {
        description: err instanceof Error ? err.message : "Camera or server error",
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const enrolled = employees.filter((e) => Array.isArray(e.face_descriptor)).length;

  return (
    <AppShell
      title="Face terminal"
      subtitle={
        mode === "single"
          ? "Individual hands-free kiosk scanner — automatic check-in & check-out."
          : "Classroom Multi-Scan Mode — IMX477 camera high-resolution batch capture."
      }
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <Button
              size="sm"
              variant={mode === "single" ? "default" : "ghost"}
              onClick={() => {
                setMode("single");
                setBatchResult(null);
              }}
              className="text-xs"
            >
              <ScanFace className="size-3.5" />
              Single Scanner
            </Button>
            <Button
              size="sm"
              variant={mode === "classroom" ? "default" : "ghost"}
              onClick={() => {
                setMode("classroom");
                setScanning(false);
              }}
              className="text-xs"
            >
              <Users className="size-3.5" />
              Classroom Multi-Scan
            </Button>
          </div>

          <div className="text-right hidden sm:block">
            <p className="font-mono text-xl leading-none font-semibold tabular-nums">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {enrolled} enrolled
            </p>
          </div>

          {mode === "single" ? (
            <Button
              size="lg"
              variant={scanning ? "secondary" : "default"}
              onClick={() => {
                setScanning((v) => !v);
                setOutcome(null);
              }}
            >
              {scanning ? <Pause className="size-4" /> : <Play className="size-4" />}
              {scanning ? "Pause" : "Start scanning"}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="default"
              disabled={batchLoading}
              onClick={handleClassroomScan}
            >
              {batchLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {batchLoading ? "Analysing Classroom…" : "Capture Classroom Shot"}
            </Button>
          )}
        </div>
      }
    >
      {mode === "single" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="panel p-5">
            <CameraFrame
              streamUrl={cameraStreamUrl}
              active={scanning}
              scanning={scanning}
              className="aspect-video"
              overlay={
                scanning ? (
                  <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full border border-primary/40 bg-background/85 px-3.5 py-1.5 text-xs font-medium backdrop-blur-md shadow-md">
                    <Loader2 className="size-3.5 animate-spin text-primary" />
                    Scanning face against local database…
                  </div>
                ) : null
              }
            />
            <ResultBanner outcome={outcome} />
          </div>

          <LiveLogSidebar todayRecords={todayRecords} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Classroom Multi-Person Capture
                </h2>
                <p className="text-xs text-muted-foreground">
                  Captures at high resolution (1280x960 IMX477) to identify all students simultaneously.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={batchLoading}
                onClick={handleClassroomScan}
              >
                {batchLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                Take Snapshot
              </Button>
            </div>

            {batchLoading ? (
              <div className="aspect-video flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/40 bg-primary/5 p-8 text-center">
                <Loader2 className="size-8 animate-spin text-primary mb-3" />
                <p className="font-semibold text-sm">Processing High-Resolution Snapshot…</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Analysing facial geometries against enrolled student signatures. Please wait a moment.
                </p>
              </div>
            ) : batchResult?.annotated_photo ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                <img
                  src={batchResult.annotated_photo}
                  alt="Classroom Multi-Scan Annotation"
                  className="w-full h-auto object-contain max-h-[520px]"
                />
              </div>
            ) : (
              <div className="aspect-video flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
                <Users className="size-10 text-muted-foreground/60 mb-3" />
                <p className="font-semibold text-sm">No Classroom Snapshot Taken Yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Point the camera towards the classroom and click "Capture Classroom Shot" to mark attendance for everyone in frame.
                </p>
                <Button className="mt-4" onClick={handleClassroomScan}>
                  <Camera className="size-4" />
                  Capture Classroom Shot
                </Button>
              </div>
            )}

            {batchResult && (
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="panel p-3.5 text-center">
                  <p className="text-xs text-muted-foreground">Total Faces</p>
                  <p className="font-display text-2xl font-bold mt-1">{batchResult.total_faces}</p>
                </div>
                <div className="panel p-3.5 text-center border-primary/40 bg-primary/5">
                  <p className="text-xs text-primary font-medium">Recognized</p>
                  <p className="font-display text-2xl font-bold text-primary mt-1">
                    {batchResult.recognized_count}
                  </p>
                </div>
                <div className="panel p-3.5 text-center border-destructive/40 bg-destructive/5">
                  <p className="text-xs text-destructive font-medium">Unknown</p>
                  <p className="font-display text-2xl font-bold text-destructive mt-1">
                    {batchResult.unknown_count}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="panel flex flex-col">
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Classroom Scan Results</h2>
                <p className="text-xs text-muted-foreground">
                  {batchResult ? `${batchResult.results.length} detection events` : "Awaiting snapshot"}
                </p>
              </div>
            </div>

            {!batchResult || batchResult.results.length === 0 ? (
              <p className="px-5 py-16 text-center text-sm text-muted-foreground flex-1">
                Take a classroom shot to view detected student matches.
              </p>
            ) : (
              <ul className="max-h-[500px] divide-y divide-border overflow-y-auto flex-1">
                {batchResult.results.map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                    {r.status === "recognized" && r.employee ? (
                      <>
                        <Avatar src={r.employee.photo_url ?? null} name={r.employee.full_name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{r.employee.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.employee.employee_code} · {r.employee.department}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            {r.kind === "in" ? "Check In" : r.kind === "out" ? "Check Out" : "Logged"}
                          </Badge>
                          {typeof r.confidence === "number" && (
                            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                              {(r.confidence * 100).toFixed(0)}% conf
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="size-9 rounded-full bg-destructive/10 text-destructive flex items-center justify-center font-bold text-xs">
                          ?
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-destructive">Unknown Person</p>
                          <p className="text-xs text-muted-foreground">Unrecognized face in frame</p>
                        </div>
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          Unknown
                        </Badge>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function LiveLogSidebar({ todayRecords }: { todayRecords: AttendanceWithEmployee[] }) {
  const queryClient = useQueryClient();

  const handleDelete = async (recordId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the attendance entry for ${name}?`)) return;
    try {
      await deleteAttendance(recordId);
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Attendance entry deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete entry");
    }
  };

  return (
    <div className="panel">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold">Live log</h2>
        <p className="text-xs text-muted-foreground">
          {todayRecords.length} entries today
        </p>
      </div>
      {todayRecords.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">
          Nobody has scanned in yet.
        </p>
      ) : (
        <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
          {todayRecords.map((r) => (
            <li key={r.id} className="group flex items-center gap-3 px-5 py-3">
              <Avatar
                src={r.employees?.photo_url ?? null}
                name={r.employees?.full_name ?? "?"}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.employees?.full_name}
                </p>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatTime(r.check_in)} → {formatTime(r.check_out)}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={
                    r.check_out
                      ? "border-border text-muted-foreground"
                      : "border-primary/40 text-primary"
                  }
                >
                  {r.check_out ? "Out" : "In"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive opacity-80 hover:opacity-100"
                  title="Delete entry"
                  onClick={() => handleDelete(r.id, r.employees?.full_name ?? "this entry")}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultBanner({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
        <ScanFace className="size-5" />
        Waiting for a face…
      </div>
    );
  }

  if (outcome.kind === "unknown") {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-5">
        <ShieldAlert className="size-5 text-destructive" />
        <div>
          <p className="text-sm font-semibold">Face not recognised</p>
          <p className="text-xs text-muted-foreground">
            This person isn't enrolled yet. Register them to enable attendance.
          </p>
        </div>
      </div>
    );
  }

  const { employee, record, kind, distance } = outcome;
  const accent =
    kind === "in"
      ? "border-primary/50 bg-primary/10"
      : kind === "out"
        ? "border-accent/50 bg-accent/10"
        : "border-warning/40 bg-warning/10";

  return (
    <div className={`mt-4 flex flex-wrap items-center gap-4 rounded-xl border px-4 py-4 ${accent}`}>
      <Avatar src={employee?.photo_url ?? null} name={employee?.full_name ?? "?"} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {kind === "in" ? (
            <LogIn className="size-4 text-primary" />
          ) : kind === "out" ? (
            <LogOut className="size-4 text-accent" />
          ) : (
            <ScanFace className="size-4 text-warning" />
          )}
          <p className="font-display text-lg font-semibold">{employee?.full_name}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {employee?.job_title ? `${employee.job_title} · ` : ""}
          {employee?.department} · {employee?.employee_code}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">
          {kind === "in"
            ? `Checked in at ${formatTime(record?.check_in ?? null)}`
            : kind === "out"
              ? `Checked out at ${formatTime(record?.check_out ?? null)}`
              : "Already completed for today"}
        </p>
        <p className="font-mono text-xs text-muted-foreground tabular-nums">
          {record ? durationLabel(record.check_in, record.check_out) : ""}
          {typeof distance === "number"
            ? ` · match ${(Math.max(0, 1 - distance) * 100).toFixed(0)}%`
            : ""}
        </p>
      </div>
    </div>
  );
}
