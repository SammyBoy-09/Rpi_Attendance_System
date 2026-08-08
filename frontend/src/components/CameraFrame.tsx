import { CameraOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function CameraFrame({
  streamUrl,
  active,
  scanning,
  className,
  overlay,
}: {
  streamUrl: string;
  active: boolean;
  scanning?: boolean;
  className?: string;
  overlay?: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [streamUrl, active]);

  return (
    <div
      className={cn(
        "relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-secondary",
        scanning && "shadow-glow",
        className,
      )}
    >
      {active ? (
        <img
          src={streamUrl}
          alt="Camera preview"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn(
            "size-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}

      {loaded && !errored ? (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-[12%] rounded-[28%_28%_32%_32%] border border-primary/40" />
          {scanning ? (
            <div className="absolute inset-x-0 top-0 h-1/3 scan-line bg-gradient-to-b from-transparent via-primary/25 to-transparent" />
          ) : null}
          <span className="absolute top-3 left-3 size-5 border-t-2 border-l-2 border-primary/70" />
          <span className="absolute top-3 right-3 size-5 border-t-2 border-r-2 border-primary/70" />
          <span className="absolute bottom-3 left-3 size-5 border-b-2 border-l-2 border-primary/70" />
          <span className="absolute right-3 bottom-3 size-5 border-r-2 border-b-2 border-primary/70" />
        </div>
      ) : null}

      {!active ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <>
            <CameraOff className="size-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Camera is off</p>
          </>
        </div>
      ) : errored ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <CameraOff className="size-7 text-destructive" />
          <p className="max-w-xs text-sm text-muted-foreground">
            Could not load the Pi camera stream. Check that the backend is running.
          </p>
        </div>
      ) : !loaded ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          {active ? (
            <>
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Connecting to camera…</p>
            </>
          ) : (
            <>
              <CameraOff className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Camera is off</p>
            </>
          )}
        </div>
      ) : null}

      {overlay}
    </div>
  );
}
