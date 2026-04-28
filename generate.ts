import { basename, extname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

type YosysCell = { type: string; [k: string]: unknown };

type YosysModule = {
  attributes?: Record<string, string>;
  cells?: Record<string, YosysCell>;
  [k: string]: unknown;
};

type YosysNetlist = {
  modules: Record<string, YosysModule>;
  [k: string]: unknown;
};

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

const viewDir = import.meta.dir;
const repoRoot = resolve(viewDir, "..");
const dataDir = join(viewDir, "data");
const designPath = join(dataDir, "design.json");
const manifestPath = join(dataDir, "manifest.json");

function fileStem(moduleName: string) {
  return moduleName.replace(/[^A-Za-z0-9_.-]/g, "_");
}

async function run(cmd: string[], label: string) {
  const proc = Bun.spawn(cmd, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (code !== 0) {
    throw new Error(`${label} failed (exit ${code})\n${stderr || stdout}`.trim());
  }
}

async function discoverVerilog(): Promise<string[]> {
  const files = await Array.fromAsync(
    new Bun.Glob("src/rtl/**/*.{v,sv}").scan({ cwd: repoRoot, absolute: true }),
  );
  return files.sort();
}

async function detectTop(files: string[]): Promise<string> {
  const config = Bun.file(join(repoRoot, "src/config_merged.json"));

  if (await config.exists()) {
    const { DESIGN_NAME } = (await config.json()) as { DESIGN_NAME?: string };
    if (DESIGN_NAME) return DESIGN_NAME;
  }

  const first = files[0];
  if (!first) throw new Error("No Verilog sources found under src/rtl and none supplied.");
  return basename(first, extname(first));
}

async function resetDataDir() {
  await Bun.$`rm -rf ${dataDir}`.quiet();
  await Bun.$`mkdir -p ${dataDir}`.quiet();
}

async function runYosys(files: string[], top: string) {
  const quote = (s: string) => JSON.stringify(relative(repoRoot, s));
  const script = [
    `read_verilog -sv ${files.map(quote).join(" ")}`,
    `prep -top ${top}`,
    `write_json ${quote(designPath)}`,
  ].join("; ");

  await run(["yosys", "-p", script], "yosys");
}

async function renderModule(name: string, mod: YosysModule) {
  const stem = fileStem(name);
  const jsonPath = join(dataDir, `${stem}.json`);
  const svgPath = join(dataDir, `${stem}.svg`);

  const slice = { modules: { [name]: mod } };

  await Bun.write(jsonPath, JSON.stringify(slice));
  await run(["netlistsvg", jsonPath, "-o", svgPath], `netlistsvg ${name}`);

  return { name, json: `${stem}.json`, svg: `${stem}.svg` };
}

function buildManifest(
  design: YosysNetlist,
  top: string,
  files: string[],
  rendered: { name: string; json: string; svg: string }[],
): Manifest {
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

  return {
    generatedAt: new Date().toISOString(),
    top,
    sources: files.map((f) => relative(repoRoot, f)),
    modules,
  };
}

export async function generate(options: { top?: string; files?: string[] } = {}) {
  await resetDataDir();

  const files = options.files?.length ? options.files : await discoverVerilog();
  if (!files.length) throw new Error("No Verilog input files.");

  const top = options.top ?? (await detectTop(files));
  await runYosys(files, top);

  const design = (await Bun.file(designPath).json()) as YosysNetlist;
  const rendered = await Promise.all(
    Object.entries(design.modules).map(([name, mod]) => renderModule(name, mod)),
  );

  const manifest = buildManifest(design, top, files, rendered);
  await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return manifest;
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: { top: { type: "string" } },
    allowPositionals: true,
  });

  const files = positionals.map((p) => resolve(repoRoot, p));
  const manifest = await generate({ top: values.top, files });
  console.log(
    `wrote manifest (${Object.keys(manifest.modules).length} modules, top=${manifest.top})`,
  );
}
