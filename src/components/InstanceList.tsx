import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { prettyName } from "@/lib/names";
import type { Instance } from "@/types";

type Props = {
  instances: Instance[];
  onNavigate: (moduleName: string) => void;
};

export function InstanceList({ instances, onNavigate }: Props) {
  const [filter, setFilter] = useState("");
  const [showPrimitives, setShowPrimitives] = useState(false);

  const { navigable, primitives } = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const match = (i: Instance) =>
      !f ||
      i.name.toLowerCase().includes(f) ||
      prettyName(i.module).toLowerCase().includes(f);
    const byName = (a: Instance, b: Instance) => a.name.localeCompare(b.name);
    return {
      navigable: instances.filter((i) => i.navigable && match(i)).sort(byName),
      primitives: instances.filter((i) => !i.navigable && match(i)).sort(byName),
    };
  }, [instances, filter]);

  if (!instances.length) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No child instances.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="w-full h-7 pl-7 pr-2 text-xs rounded-md border bg-background outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {navigable.length > 0 && (
        <ul className="flex flex-col gap-1">
          {navigable.map((inst) => (
            <InstanceRow
              key={inst.name}
              inst={inst}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}

      {primitives.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowPrimitives((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition w-fit"
          >
            {showPrimitives ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            <span>
              Primitives <span className="tabular-nums">({primitives.length})</span>
            </span>
          </button>
          {showPrimitives && (
            <ul className="flex flex-col gap-1">
              {primitives.map((inst) => (
                <InstanceRow
                  key={inst.name}
                  inst={inst}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {!navigable.length && !primitives.length && (
        <p className="text-xs text-muted-foreground italic">No matches.</p>
      )}
    </div>
  );
}

function InstanceRow({
  inst,
  onNavigate,
}: {
  inst: Instance;
  onNavigate: (moduleName: string) => void;
}) {
  const moduleLabel = prettyName(inst.module);
  return (
    <li>
      <button
        type="button"
        disabled={!inst.navigable}
        onClick={() => inst.navigable && onNavigate(inst.module)}
        title={`${inst.name} : ${inst.module}`}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-md border text-left transition",
          inst.navigable
            ? "hover:bg-accent hover:text-accent-foreground cursor-pointer"
            : "opacity-60 cursor-not-allowed",
        )}
      >
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs truncate">{inst.name}</div>
          <div className="mt-0.5">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {moduleLabel}
            </Badge>
          </div>
        </div>
        {inst.navigable && (
          <ChevronRight className="size-4 text-muted-foreground shrink-0" />
        )}
      </button>
    </li>
  );
}
