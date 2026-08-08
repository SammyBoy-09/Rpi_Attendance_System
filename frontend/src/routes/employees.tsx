import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Avatar } from "./index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/lib/attendance";
import { deleteEmployee, fetchEmployees } from "@/lib/api";
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

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [
      { title: "Employee Directory — Veridian Attendance" },
      {
        name: "description",
        content:
          "Browse every enrolled employee, their department, contact details and face enrollment status.",
      },
      { property: "og:title", content: "Employee Directory — Veridian" },
      {
        property: "og:description",
        content: "Every enrolled employee with department, contact details and face status.",
      },
    ],
  }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: fetchEmployees,
  });

  const filtered = employees.filter((e) =>
    `${e.full_name} ${e.employee_code} ${e.department} ${e.job_title ?? ""}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );

  async function remove(emp: Employee) {
    try {
      await deleteEmployee(emp.id);
    } catch (error) {
      toast.error("Could not remove employee", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      return;
    }
    await queryClient.invalidateQueries();
    toast.success(`${emp.full_name} removed`);
  }

  return (
    <AppShell
      title="Employees"
      subtitle={`${employees.length} enrolled ${employees.length === 1 ? "profile" : "profiles"}`}
      actions={
        <Button asChild size="lg">
          <Link to="/register">
            <UserPlus className="size-4" /> Register employee
          </Link>
        </Button>
      }
    >
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, ID or department"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading directory…</p>
      ) : filtered.length === 0 ? (
        <div className="panel px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {employees.length === 0
              ? "No employees enrolled yet."
              : "No employees match that search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <article key={e.id} className="panel p-5">
              <div className="flex items-start gap-4">
                {e.photo_url ? (
                  <img
                    src={e.photo_url}
                    alt={e.full_name}
                    className="size-16 rounded-xl border border-border object-cover"
                  />
                ) : (
                  <Avatar src={null} name={e.full_name} />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-display text-lg font-semibold">
                    {e.full_name}
                  </h2>
                  <p className="truncate text-sm text-muted-foreground">
                    {e.job_title || "—"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {e.employee_code}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="secondary">{e.department}</Badge>
                {Array.isArray(e.face_descriptor) ? (
                  <Badge variant="outline" className="border-primary/40 text-primary">
                    Face enrolled
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/40 text-warning">
                    No face signature
                  </Badge>
                )}
              </div>

              <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="truncate">{e.email || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd className="truncate">{e.phone || "—"}</dd>
                </div>
              </dl>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="mt-3 text-destructive">
                    <Trash2 className="size-4" /> Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove {e.full_name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This deletes their profile, face signature and all attendance
                      history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove(e)}>
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </article>
          ))}
        </div>
      )}
    </AppShell>
  );
}
