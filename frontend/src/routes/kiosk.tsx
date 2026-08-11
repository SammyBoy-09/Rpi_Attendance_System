import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, LogIn, LogOut, Pause, Play, ScanFace, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CameraFrame } from "@/components/CameraFrame";
import {
  durationLabel,
  formatTime,
  localDateKey,
  type AttendanceRecord,
  type Employee,
} from "@/lib/attendance";
import { Avatar } from "./index";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchAttendance, fetchEmployees, getApiBaseUrl, scanAttendance } from "@/lib/api";

export const Route = createFileRoute("/kiosk")({
  head: () => ({
    meta: [
      { title: "Face Terminal — Check In & Check Out | Veridian" },
      {
        name: "description",
        content:
          "Hands-free attendance terminal: recognises registered employees and logs their check-in and check-out times automatically.",
      },
      { property: "og:title", content: "Face Terminal — Veridian Attendance" },
      {
        property: "og:description",
        content: "Recognise employees and log check-in and check-out times automatically.",
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

const COOLDOWN_MS = 6000;

function KioskPage() {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
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

  const handleMatch = useCallback(
    async () => {
      const result = await scanAttendance();

      if (result.kind === "unknown") {
        setOutcome({ kind: "unknown", at: Date.now() });
        return result;
      }

      if (!result.employee || !result.record) {
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
    if (!scanning) return;
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
  }, [scanning, handleMatch]);

  const enrolled = employees.filter((e) => Array.isArray(e.face_descriptor)).length;

  return (
    <AppShell
      title="Face terminal"
      subtitle="Stand in front of the camera — the first scan checks you in, the next checks you out."
      actions={
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-mono text-2xl leading-none font-semibold tabular-nums">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {enrolled} face {enrolled === 1 ? "signature" : "signatures"} enrolled
            </p>
          </div>
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
        </div>
      }
    >
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
                <li key={r.id} className="flex items-center gap-3 px-5 py-3">
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
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
