import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dialog } from "@radix-ui/react-dialog";
import { ChevronDown, RefreshCw } from "lucide-react";
import React, { useEffect, useState } from "react";

type SyncError = {
  error: string;
  stack: string;
  filename?: string;
  lineno?: number;
  colno?: number;
};

type AsyncError = {
  error: string;
  stack: string;
};

type GenericError = SyncError | AsyncError;

function ErrorDialog({
  error,
  setError,
}: {
  error: GenericError;
  setError: (error: GenericError | null) => void;
}) {
  return (
    <Dialog
      defaultOpen={true}
      onOpenChange={() => {
        setError(null);
      }}
    >
      <DialogContent className="bg-slate-900 text-white max-w-2xl border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-red-400">Application Error</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-slate-300">
          An unexpected error occurred in the client application:
        </p>
        <div className="mt-2 text-xs text-red-300 font-mono bg-slate-950 p-2 rounded border border-slate-800">
          {error.error}
        </div>
        <div className="mt-2">
          <Collapsible>
            <CollapsibleTrigger>
              <div className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer font-medium">
                Stack trace <ChevronDown className="size-3.5" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="max-w-full">
              <div className="mt-2 p-3 bg-slate-950 rounded text-slate-400 text-[11px] font-mono overflow-x-auto max-h-56">
                <pre className="whitespace-pre">{error.stack}</pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800"
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Reload App
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ErrorBoundaryState = {
  hasError: boolean;
  error: GenericError | null;
};

class ErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
  },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Uncaught application error:", error, info);
    this.setState({
      hasError: true,
      error: {
        error: error.message,
        stack: info.componentStack ?? error.stack ?? "",
      },
    });
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <ErrorDialog
          error={this.state.error}
          setError={() => this.setState({ hasError: false, error: null })}
        />
      );
    }

    return this.props.children;
  }
}

export function InstrumentationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [error, setError] = useState<GenericError | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("Window error event:", event);
      setError({
        error: event.message,
        stack: event.error?.stack || "",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event);
      const msg =
        event.reason instanceof Error
          ? event.reason.message
          : typeof event.reason === "string"
            ? event.reason
            : "Unhandled Promise Rejection";
      const stack = event.reason instanceof Error ? event.reason.stack || "" : "";
      setError({
        error: msg,
        stack,
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return (
    <>
      <ErrorBoundary>{children}</ErrorBoundary>
      {error && <ErrorDialog error={error} setError={setError} />}
    </>
  );
}
