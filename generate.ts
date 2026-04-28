import { basename, extname, join, relative, resolve } from "node:path";

type YosysCell = { type: string; [k: string]: unknown };
type YosysModule = { cells?: Record<string, YosysCell>; [k: string]: unknown };
type YosysNetlist = { modules: Record<string, YosysModule> };
type ModuleEntry = {
  svg: string;
  json: string;
  instances: { name: string; module: string; navigable: boolean }[];
};

export type Manifest = {
  generatedAt: string;
  top: string;
  sources: string[];
  modules: Record<string, ModuleEntry>;
};

export type GenerateOptions = {
  rtl: string[];     // file paths or globs, resolved against `cwd`
  top?: string;      // defaults to basename of first file
  dataDir: string;   // where artifacts get written
  cwd: string;       // base for relative paths + yosys/netlistsvg invocation
};

const fileStem = (n: string) => n.replace(/[^A-Za-z0-9_.-]/g, "_");

async function run(cmd: string[], label: string, cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`${label} failed (exit ${code})\n${stderr || stdout}`.trim());
  }
}

async function expandGlobs(patterns: string[], cwd: string): Promise<string[]> {
  const out: string[] = [];
  for (const p of patterns) {
    if (/[*?[]/.test(p)) {
      out.push(...await Array.fromAsync(new Bun.Glob(p).scan({ cwd, absolute: true })));
    } else {
      out.push(resolve(cwd, p));
    }
  }
  return [...new Set(out)].sort();
}

async function runYosys(files: string[], top: string, cwd: string, designPath: string) {
  const q = (s: string) => JSON.stringify(relative(cwd, s));
  const script = [
    `read_verilog -sv ${files.map(q).join(" ")}`,
    `prep -top ${top}`,
    `write_json ${q(designPath)}`,
  ].join("; ");
  await run(["yosys", "-p", script], "yosys", cwd);
}

async function renderModule(name: string, mod: YosysModule, dataDir: string, cwd: string) {
  const stem = fileStem(name);
  const jsonPath = join(dataDir, `${stem}.json`);
  const svgPath = join(dataDir, `${stem}.svg`);
  await Bun.write(jsonPath, JSON.stringify({ modules: { [name]: mod } }));
  await run(["netlistsvg", jsonPath, "-o", svgPath], `netlistsvg ${name}`, cwd);
  return { name, json: `${stem}.json`, svg: `${stem}.svg` };
}

export async function generate(opts: GenerateOptions): Promise<Manifest> {
  const files = await expandGlobs(opts.rtl, opts.cwd);
  if (!files.length) throw new Error(`No Verilog files matched: ${opts.rtl.join(", ")}`);

  const top = opts.top ?? basename(files[0], extname(files[0]));

  await Bun.$`rm -rf ${opts.dataDir}`.quiet();
  await Bun.$`mkdir -p ${opts.dataDir}`.quiet();

  const designPath = join(opts.dataDir, "design.json");
  await runYosys(files, top, opts.cwd, designPath);

  const design = (await Bun.file(designPath).json()) as YosysNetlist;
  const rendered = await Promise.all(
    Object.entries(design.modules).map(([n, m]) => renderModule(n, m, opts.dataDir, opts.cwd)),
  );

  const known = new Set(Object.keys(design.modules));
  const modules: Record<string, ModuleEntry> = {};
  for (const { name, json, svg } of rendered) {
    const cells = design.modules[name]?.cells ?? {};
    modules[name] = {
      svg,
      json,
      instances: Object.entries(cells).map(([instName, cell]) => ({
        name: instName,
        module: cell.type,
        navigable: known.has(cell.type),
      })),
    };
  }

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    top,
    sources: files.map((f) => relative(opts.cwd, f)),
    modules,
  };
  await Bun.write(join(opts.dataDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
