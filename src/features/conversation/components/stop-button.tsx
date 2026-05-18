"use client";

import { useState } from "react";
import { Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspace-store";

/**
 * "Stop generating" pill. Shows only while an AI run is active; clicking
 * POSTs to /api/ai/runs/[runId]/stop which flips a Redis flag the
 * orchestrator polls between token yields. Whatever the model has produced
 * so far is preserved (interrupt-safe by design — same path that protects
 * an actual mid-stream failure).
 */
export function StopButton() {
  const activeRun = useWorkspaceStore((s) => s.activeRun);
  const [pending, setPending] = useState(false);

  if (!activeRun) return null;

  async function stop(runId: string) {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/ai/runs/${runId}/stop`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Could not stop generating");
      }
      // Don't optimistically clear the run — wait for ai:run:completed via
      // the socket so the final partial message renders cleanly.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not stop");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex justify-center px-3 pb-1 pt-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => stop(activeRun.runId)}
        disabled={pending}
        className="gap-1.5 rounded-full text-xs"
      >
        <Square className="h-3 w-3 fill-current" />
        {pending ? "Stopping…" : "Stop generating"}
      </Button>
    </div>
  );
}
