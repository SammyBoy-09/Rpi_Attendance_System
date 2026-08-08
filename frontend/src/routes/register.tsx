import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Camera, Check, Loader2, RefreshCw, ScanFace, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { CameraFrame } from "@/components/CameraFrame";
import { DEPARTMENTS } from "@/lib/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { captureFaceMultiple, createEmployee, getApiBaseUrl } from "@/lib/api";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Register an Employee — Veridian Attendance" },
      {
        name: "description",
        content:
          "Enroll a new employee: capture their details and a face signature used for automatic attendance recognition.",
      },
      { property: "og:title", content: "Register an Employee — Veridian" },
      {
        property: "og:description",
        content: "Capture employee details and a face signature for attendance.",
      },
    ],
  }),
  component: RegisterPage,
});

const EMPTY = {
  full_name: "",
  employee_code: "",
  email: "",
  phone: "",
  department: "Engineering",
  job_title: "",
};

function RegisterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [cameraOn, setCameraOn] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0); // 0-5
  const [saving, setSaving] = useState(false);
  const [capture, setCapture] = useState<{ photo: string; descriptor: number[] } | null>(
    null,
  );
  const cameraStreamUrl = `${getApiBaseUrl()}/api/camera/stream`;

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleCapture() {
    setCapturing(true);
    setCaptureProgress(0);
    try {
      // Simulate progress updates for better UX
      const progressInterval = setInterval(() => {
        setCaptureProgress((p) => (p < 5 ? p + 1 : p));
      }, 250);

      const result = await captureFaceMultiple();
      clearInterval(progressInterval);
      setCaptureProgress(5);
      
      setCapture({ photo: result.photo, descriptor: result.descriptor });
      toast.success(`Face signature captured (${result.frames_captured} frames averaged)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const helpText = message.includes("not detected") 
        ? "Make sure your face is clearly visible to the camera." 
        : message.includes("Multiple faces")
        ? "Please ensure only one person is in frame."
        : "Please try again.";
      toast.error("Capture failed", {
        description: helpText,
      });
    } finally {
      setCapturing(false);
      setCaptureProgress(0);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.employee_code.trim()) {
      toast.error("Name and employee ID are required.");
      return;
    }
    if (!capture) {
      toast.error("Capture a face signature before saving.");
      return;
    }

    setSaving(true);
    try {
      await createEmployee({
      full_name: form.full_name.trim(),
      employee_code: form.employee_code.trim().toUpperCase(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      department: form.department,
      job_title: form.job_title.trim() || null,
      photo_url: capture.photo,
      face_descriptor: capture.descriptor,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(message.includes("exists") ? "That employee ID is already registered." : "Could not save the employee.", {
        description: message,
      });
      setSaving(false);
      return;
    }

    setSaving(false);

    await queryClient.invalidateQueries();
    toast.success(`${form.full_name} enrolled successfully`);
    setForm(EMPTY);
    setCapture(null);
    navigate({ to: "/employees" });
  }

  return (
    <AppShell
      title="Register employee"
      subtitle="Capture the person's details and a face signature used for recognition."
    >
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <ScanFace className="size-4 text-primary" />
            <h2 className="text-base font-semibold">Face enrollment</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {cameraOn ? "The Pi camera stream is live. Click 'Capture face (5x)' to capture 5 frames for better accuracy." : "Camera is off"}
          </p>

          <div className="mt-4">
            {capture ? (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-primary/40 bg-secondary">
                <img
                  src={capture.photo}
                  alt="Captured face"
                  className="size-full object-contain"
                />
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
                  <Check className="size-3" /> Signature saved
                </div>
              </div>
            ) : (
              <CameraFrame
                streamUrl={cameraStreamUrl}
                active={cameraOn}
                scanning={capturing}
              />
            )}
          </div>

          <div className="mt-4 flex gap-2">
            {capture ? (
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setCapture(null);
                  setCameraOn(true);
                }}
              >
                <RefreshCw className="size-4" /> Retake
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={!cameraOn || capturing}
                  onClick={handleCapture}
                >
                  {capturing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Capturing {captureProgress}/5
                    </>
                  ) : (
                    <>
                      <Camera className="size-4" />
                      Capture face (5x)
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCameraOn((v) => !v)}
                >
                  {cameraOn ? "Stop" : "Start"}
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="text-base font-semibold">Employee details</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                value={form.full_name}
                onChange={(e) => {
                  set("full_name", e.target.value);
                  const initialsPart = e.target.value
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]!.toUpperCase())
                    .join("");
                  if (!form.employee_code.trim()) {
                    set("employee_code", initialsPart ? `EMP-${initialsPart}` : "");
                  }
                }}
                placeholder="Amara Okafor"
              />
            </Field>
            <Field label="Employee ID" required>
              <Input
                value={form.employee_code}
                onChange={(e) => {
                  set("employee_code", e.target.value);
                }}
                placeholder="EMP-1042"
                className="font-mono"
              />
            </Field>
            <Field label="Department">
              <Select
                value={form.department}
                onValueChange={(v) => set("department", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Job title">
              <Input
                value={form.job_title}
                onChange={(e) => set("job_title", e.target.value)}
                placeholder="Systems Engineer"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="amara@company.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 555 0184"
              />
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
            <p className="text-xs text-muted-foreground">
              The face signature is a numeric template — no video is stored.
            </p>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Save employee
            </Button>
          </div>
        </section>
      </form>
    </AppShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
