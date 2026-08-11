import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock,
  LogOut,
  ScanFace,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteAttendance, fetchAttendance, fetchEmployees } from "@/lib/api";
import {
  durationLabel,
  formatTime,
  initials,
  localDateKey,
  type AttendanceWithEmployee,
} from "@/lib/attendance";

function formatDateForDisplay(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();
  const year = date.getFullYear();
  return `${dayName}, ${monthName} ${dayNum}, ${year}`;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Veridian — Face Recognition Attendance Dashboard" },
      {
        name: "description",
        content:
          "Live attendance dashboard with face recognition check-in and check-out, headcount, late arrivals and daily activity.",
      },
      { property: "og:title", content: "Veridian — Face Recognition Attendance" },
      {
        property: "og:description",
        content:
          "Track check-ins, check-outs and workforce presence in real time with face recognition.",
      },
    ],
  }),
  component: Dashboard,
});

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ElementType;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">
          {label}
        </p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-4 font-display text-4xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Dashboard() {
  const today = localDateKey();
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-count"],
    queryFn: fetchEmployees,
  });

  const { data: records = [] } = useQuery({
    queryKey: ["attendance", today],
    queryFn: () => fetchAttendance(today),
    refetchInterval: 15000,
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => deleteAttendance(recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Attendance entry deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete entry");
    },
  });

  const handleDelete = (recordId: string, name: string) => {
    if (confirm(`Are you sure you want to delete the attendance entry for ${name}?`)) {
      deleteMutation.mutate(recordId);
    }
  };

  const present = records.length;
  const onSite = records.filter((r) => !r.check_out).length;
  const late = records.filter((r) => r.status === "late").length;
  const rate = employees.length
    ? Math.round((present / employees.length) * 100)
    : 0;

  return (
    <AppShell
      title="Today at a glance"
      subtitle={formatDateForDisplay(new Date())}
      actions={
        <Button asChild size="lg">
          <Link to="/kiosk">
            <ScanFace className="size-4" />
            Open face terminal
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered"
          value={employees.length}
          hint="Enrolled staff profiles"
          icon={Users}
        />
        <StatCard
          label="Present today"
          value={present}
          hint={`${rate}% of workforce checked in`}
          icon={UserCheck}
        />
        <StatCard
          label="Currently on site"
          value={onSite}
          hint="Checked in, not yet out"
          icon={Clock}
        />
        <StatCard
          label="Late arrivals"
          value={late}
          hint="Checked in after 09:15"
          icon={TrendingUp}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="panel lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold">Today's activity</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/records">
                All records <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {records.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <ScanFace className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                No check-ins recorded yet today.
              </p>
              <Button asChild className="mt-4" variant="secondary">
                <Link to="/kiosk">Start the terminal</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {records.map((r) => (
                <li key={r.id} className="group flex items-center gap-4 px-5 py-3.5">
                  <Avatar
                    src={r.employees?.photo_url ?? null}
                    name={r.employees?.full_name ?? "?"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {r.employees?.full_name ?? "Unknown"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.employees?.department} · {r.employees?.employee_code}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="font-mono text-sm tabular-nums">
                      {formatTime(r.check_in)} → {formatTime(r.check_out)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {durationLabel(r.check_in, r.check_out)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge record={r} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive opacity-80 hover:opacity-100"
                      title="Delete entry"
                      onClick={() => handleDelete(r.id, r.employees?.full_name ?? "this entry")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="text-base font-semibold">By department</h2>
          <p className="mt-1 text-xs text-muted-foreground">Present vs registered</p>
          <div className="mt-5 space-y-4">
            {Object.entries(
              employees.reduce<Record<string, number>>((acc, e) => {
                acc[e.department] = (acc[e.department] ?? 0) + 1;
                return acc;
              }, {}),
            ).map(([dept, total]) => {
              const here = records.filter(
                (r) => r.employees?.department === dept,
              ).length;
              const pct = total ? Math.round((here / total) * 100) : 0;
              return (
                <div key={dept}>
                  <div className="flex justify-between text-sm">
                    <span>{dept}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">
                      {here}/{total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-gradient-signal"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {employees.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No employees registered yet.{" "}
                <Link to="/register" className="text-primary underline">
                  Register the first one
                </Link>
                .
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export function Avatar({ src, name }: { src: string | null; name: string }) {
  return src ? (
    <img
      src={src}
      alt={name}
      className="size-10 shrink-0 rounded-lg border border-border object-cover"
    />
  ) : (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary font-display text-xs font-semibold text-muted-foreground">
      {initials(name)}
    </div>
  );
}

export function StatusBadge({ record }: { record: { status: string; check_out: string | null } }) {
  if (record.check_out) {
    return (
      <Badge variant="outline" className="gap-1 border-border text-muted-foreground">
        <LogOut className="size-3" /> Out
      </Badge>
    );
  }
  if (record.status === "late") {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning">
        Late
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/40 text-primary">
      On site
    </Badge>
  );
}
