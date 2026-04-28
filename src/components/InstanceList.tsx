import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Instance } from "@/types";

type Props = {
  instances: Instance[];
  onNavigate: (moduleName: string) => void;
};

export function InstanceList({ instances, onNavigate }: Props) {
  if (!instances.length) {
    return (
      <p className="text-xs text-muted-foreground italic">
        No child instances.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {instances.map((inst) => (
        <li key={inst.name}>
          <button
            type="button"
            disabled={!inst.navigable}
            onClick={() => inst.navigable && onNavigate(inst.module)}
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
                  {inst.module}
                </Badge>
              </div>
            </div>
            {inst.navigable && (
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
