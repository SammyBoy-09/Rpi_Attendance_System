import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, Download, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Avatar, StatusBadge } from "./index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  durationLabel,
  formatTime,
  localDateKey,
  type AttendanceWithEmployee,
} from "@/lib/attendance";
import { deleteAttendance, fetchAttendance } from "@/lib/api";

export const Route = createFileRoute("/records")({
  head: () => ({
    meta: [
      { title: "Attendance Records — Veridian" },
      {
        name: "description",
        content:
          "Review daily attendance logs with check-in time, check-out time, hours worked and late-arrival status for every employee.",
      },
      { property: "og:title", content: "Attendance Records — Veridian" },
      {
        property: "og:description",
        content: "Daily check-in, check-out and hours-worked logs for every employee.",
      },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const [date, setDate] = useState(localDateKey());
  const queryClient = useQueryClient();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance", date],
    queryFn: () => fetchAttendance(date),
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => deleteAttendance(recordId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Attendance record deleted");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to delete record");
    },
  });

  function exportCsv() {
    const rows = [
      ["Employee", "ID", "Department", "Date", "Check in", "Check out", "Hours", "Status"],
      ...records.map((r) => [
        r.employees?.full_name ?? "",
        r.employees?.employee_code ?? "",
        r.employees?.department ?? "",
        r.work_date,
        formatTime(r.check_in),
        formatTime(r.check_out),
        durationLabel(r.check_in, r.check_out),
        r.check_out ? "Completed" : r.status,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalHours = records.reduce((acc, r) => {
    if (!r.check_out) return acc;
    return acc + (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 3600000;
  }, 0);

  return (
    <AppShell
      title="Attendance records"
      subtitle="Check-in and check-out logs with hours worked."
      actions={
        <div className="flex items-end gap-2">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={!records.length}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      }
    >
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Metric label="Entries" value={records.length} />
        <Metric label="Still on site" value={records.filter((r) => !r.check_out).length} />
        <Metric label="Hours logged" value={`${totalHours.toFixed(1)}h`} />
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : records.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            No attendance recorded for this date.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead>Check in</TableHead>
                <TableHead>Check out</TableHead>
                <TableHead className="hidden sm:table-cell">Hours</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={r.employees?.photo_url ?? null}
                        name={r.employees?.full_name ?? "?"}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.employees?.full_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {r.employees?.employee_code}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {r.employees?.department}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatTime(r.check_in)}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {formatTime(r.check_out)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono tabular-nums">
                    {durationLabel(r.check_in, r.check_out)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge record={r} />
                  </TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title="Delete record"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete attendance record?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently remove the attendance record for {r.employees?.full_name ?? "this entry"} on {r.work_date}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteMutation.mutate(r.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
