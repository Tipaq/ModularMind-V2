"use client";

function ProgressBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 overflow-hidden bg-primary/10">
      <div className="h-full w-1/3 bg-primary rounded-full animate-[progress_1.5s_ease-in-out_infinite]" />
    </div>
  );
}

function SkeletonLine({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${className}`} />;
}

export function RouteLoader() {
  return (
    <div className="flex h-full w-full flex-col">
      <ProgressBar />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md space-y-4 px-6">
          <SkeletonLine className="h-5 w-2/5" />
          <SkeletonLine className="h-3 w-4/5" />
          <SkeletonLine className="h-3 w-3/5" />
          <div className="pt-4 space-y-3">
            <SkeletonLine className="h-10 w-full rounded-xl" />
            <SkeletonLine className="h-10 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex-1 flex flex-col">
      <ProgressBar />
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm space-y-3 px-6">
          <SkeletonLine className="h-4 w-3/5 mx-auto" />
          <SkeletonLine className="h-3 w-2/5 mx-auto" />
        </div>
      </div>
    </div>
  );
}
