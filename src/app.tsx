import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Cpu } from "lucide-react";

import "./globals.css";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { InstanceList } from "@/components/InstanceList";
import { PathBreadcrumb } from "@/components/PathBreadcrumb";
import { Schematic } from "@/components/Schematic";
import type { Manifest } from "@/types";

const DATA = "/data";

function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => r.json() as Promise<Manifest>)
      .then((m) => {
        setManifest(m);
        setPath([m.top]);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const descend = useCallback((moduleName: string) => {
    setPath((prev) => [...prev, moduleName]);
  }, []);

  const trimTo = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index + 1));
  }, []);

  const current = useMemo(() => {
    if (!manifest || !path.length) return null;
    const name = path[path.length - 1]!;
    return { name, data: manifest.modules[name] };
  }, [manifest, path]);

  if (error) {
    return (
      <div className="p-8 text-destructive">Failed to load manifest: {error}</div>
    );
  }

  if (!manifest || !current || !current.data) {
    return (
      <div className="p-8 text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="flex h-14 items-center gap-4 border-b px-6 shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="size-5" />
          <span className="font-semibold text-sm">tt-tpu viewer</span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <PathBreadcrumb path={path} onNavigate={trimTo} />
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 border-r shrink-0 flex flex-col">
          <div className="p-4 shrink-0">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Instances
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {current.data.instances.length} in{" "}
              <span className="font-mono">{current.name}</span>
            </p>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-4">
              <InstanceList
                instances={current.data.instances}
                onNavigate={descend}
              />
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4 shrink-0">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Sources
            </h2>
            <ul className="flex flex-col gap-1">
              {manifest.sources.map((src) => (
                <li
                  key={src}
                  className="font-mono text-xs text-muted-foreground truncate"
                  title={src}
                >
                  {src}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="flex-1 overflow-hidden p-6 min-h-0">
          <Card className="h-full flex flex-col py-4 gap-4">
            <CardHeader className="shrink-0">
              <div className="flex items-center gap-2">
                <CardTitle className="font-mono">{current.name}</CardTitle>
                {current.name === manifest.top && (
                  <Badge variant="outline">top</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 min-h-0">
              <Schematic
                svgUrl={`${DATA}/${current.data.svg}`}
                instances={current.data.instances}
                onNavigate={descend}
              />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<App />);
