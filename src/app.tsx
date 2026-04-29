import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, Cpu } from "lucide-react";

import "./globals.css";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { InstanceList } from "@/components/InstanceList";
import { PathBreadcrumb } from "@/components/PathBreadcrumb";
import { Schematic } from "@/components/Schematic";
import { prettyName } from "@/lib/names";
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
        setPath(initialPath(m));
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Read external hash changes (browser back/forward, manual edits).
  useEffect(() => {
    if (!manifest) return;
    const onHash = () => {
      const next = parseHash(window.location.hash, manifest);
      if (next.length) setPath(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [manifest]);

  // Keep hash in sync with current path.
  useEffect(() => {
    if (!manifest || !path.length) return;
    const next = `#${path.map(encodeURIComponent).join("/")}`;
    if (next !== window.location.hash) {
      history.replaceState(null, "", next);
    }
  }, [path, manifest]);

  const descend = useCallback((moduleName: string) => {
    setPath((prev) => [...prev, moduleName]);
  }, []);

  const trimTo = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index + 1));
  }, []);

  const goBack = useCallback(() => {
    setPath((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
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
    return <div className="p-8 text-muted-foreground">Loading…</div>;
  }

  const canGoBack = path.length > 1;
  const prettyCurrent = prettyName(current.name);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex h-14 items-center gap-3 border-b px-6 shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <Cpu className="size-5" />
          <span className="font-semibold text-sm">tt-tpu viewer</span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <Button
          size="icon-sm"
          variant="outline"
          onClick={goBack}
          disabled={!canGoBack}
          title="Back"
          className="shrink-0"
        >
          <ArrowLeft />
        </Button>
        <div className="flex-1 min-w-0 overflow-hidden">
          <PathBreadcrumb path={path} onNavigate={trimTo} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 border-r shrink-0 flex flex-col min-h-0">
          <div className="p-4 shrink-0">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Instances
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {current.data.instances.length} in{" "}
              <span className="font-mono" title={current.name}>
                {prettyCurrent}
              </span>
            </p>
          </div>
          <Separator />
          <ScrollArea className="flex-1 min-h-0">
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
              <div className="flex items-center gap-2 min-w-0">
                <CardTitle
                  className="font-mono truncate"
                  title={current.name}
                >
                  {prettyCurrent}
                </CardTitle>
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

function parseHash(hash: string, manifest: Manifest): string[] {
  if (!hash || hash === "#") return [];
  const segments = hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  // Validate: every segment must be a known module.
  const valid = segments.every((s) => s in manifest.modules);
  return valid ? segments : [];
}

function initialPath(manifest: Manifest): string[] {
  const fromHash = parseHash(window.location.hash, manifest);
  return fromHash.length ? fromHash : [manifest.top];
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");
createRoot(root).render(<App />);
