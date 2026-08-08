import { Link, useRouterState } from "@tanstack/react-router";
import { ScanFace, LayoutDashboard, UserPlus, Users, ClipboardList } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/kiosk", label: "Face Terminal", icon: ScanFace },
  { to: "/register", label: "Register", icon: UserPlus },
  { to: "/employees", label: "Employees", icon: Users },
  { to: "/records", label: "Records", icon: ClipboardList },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 grid-backdrop opacity-[0.35]" />
      <div className="relative flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-border bg-sidebar/80 backdrop-blur lg:h-screen lg:w-64 lg:shrink-0 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-signal">
              <ScanFace className="size-5 text-primary-foreground" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <p className="font-display text-base font-semibold">Veridian</p>
              <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Attendance
              </p>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon
                    className={cn("size-4", active && "text-primary")}
                    strokeWidth={2}
                  />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border px-5 py-6 sm:px-8">
            <div>
              <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {actions}
          </header>
          <div className="px-5 py-6 sm:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
