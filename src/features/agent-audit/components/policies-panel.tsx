"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Shield } from "lucide-react";
import { toast } from "sonner";
import type { PolicyRuleDTO } from "@workspace/shared";
import { Badge, EmptyState } from "@/components/design";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Policies — the rules the engine checks against every incoming agent
 * decision. Self-contained so it serves both the top-level /policies page
 * and the Policies tab inside the audit shell from one source of truth.
 */
export function PoliciesPanel({ workspaceId }: { workspaceId: string }) {
  const [rules, setRules] = useState<PolicyRuleDTO[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/policy-rules`);
    if (!res.ok) return;
    const data = (await res.json()) as { rules: PolicyRuleDTO[] };
    setRules(data.rules);
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    if (draft.trim().length < 8) {
      toast.error("Rule needs at least 8 characters");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/policy-rules`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rule_text: draft.trim() }),
      });
      if (!res.ok) throw new Error("Could not create");
      setDraft("");
      setAdding(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
    } finally {
      setCreating(false);
    }
  }

  async function toggle(ruleId: string, next: boolean) {
    const prev = rules;
    setRules((rs) =>
      rs ? rs.map((r) => (r.id === ruleId ? { ...r, isActive: next } : r)) : rs,
    );
    try {
      const res = await fetch(`/api/policy-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      if (!res.ok) throw new Error("Could not update");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
      setRules(prev);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="type-display text-ink">Policies</h1>
          <p className="mt-1 type-body text-ink-secondary">
            Rules the engine checks against every incoming decision
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAdding((a) => !a)}
          className="gap-1.5"
          style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
        >
          <Plus className="h-3.5 w-3.5" />
          Add policy rule
        </Button>
      </div>

      {adding && (
        <div className="mb-6 rounded-card border border-hairline-subtle bg-surface p-4 animate-fade-in">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Describe the rule in plain English… e.g. Never approve transactions over $10,000 without human review"
            className="w-full resize-none rounded-field border border-hairline-subtle bg-surface-base px-3 py-2 type-body text-ink placeholder:text-ink-tertiary focus:border-amber-border focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={create}
              disabled={creating || draft.trim().length < 8}
              style={{ backgroundColor: "var(--accent-amber)", color: "var(--bg-base)" }}
            >
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add rule"}
            </Button>
          </div>
        </div>
      )}

      {rules === null ? (
        <div className="flex items-center gap-2 py-12 type-small text-ink-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading rules
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Shield}
          heading="No policy rules yet"
          body="Add your first rule above. Plain English works — the engine handles semantic matching against every incoming decision."
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <PolicyCard key={rule.id} rule={rule} onToggle={toggle} />
          ))}
        </div>
      )}
    </div>
  );
}

function PolicyCard({
  rule,
  onToggle,
}: {
  rule: PolicyRuleDTO;
  onToggle: (id: string, next: boolean) => void;
}) {
  const caught = rule.violationCount ?? 0;
  return (
    <div className="rounded-card border border-hairline-subtle bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "type-body text-ink",
              !rule.isActive && "text-ink-tertiary line-through",
            )}
          >
            {rule.ruleText}
          </p>
          <div className="mt-2 flex items-center gap-3">
            {caught > 0 ? (
              <Badge variant="danger" size="sm">
                {caught} caught
              </Badge>
            ) : (
              <span className="type-micro text-ink-tertiary">0 caught</span>
            )}
            <span className="type-micro text-ink-tertiary">
              Created {timeAgo(rule.createdAt)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(rule.id, !rule.isActive)}
          className={cn(
            "shrink-0 rounded-pill px-2.5 py-1 type-micro transition-colors",
            rule.isActive
              ? "text-ink"
              : "text-ink-tertiary hover:text-ink-secondary",
          )}
          style={rule.isActive ? { backgroundColor: "var(--accent-amber-subtle)", color: "var(--accent-amber)" } : undefined}
        >
          {rule.isActive ? "Active" : "Inactive"}
        </button>
      </div>
    </div>
  );
}
