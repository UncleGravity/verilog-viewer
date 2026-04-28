import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import index from "./index.html";
import { generate } from "./generate";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    rtl:        { type: "string", multiple: true },
    top:        { type: "string" },
    "data-dir": { type: "string" },
    port:       { type: "string", default: "3000" },
    cwd:        { type: "string" },
  },
  allowPositionals: true,
});

const cwd     = values.cwd ? resolve(values.cwd) : process.cwd();
const dataDir = values["data-dir"] ? resolve(values["data-dir"]) : join(cwd, ".verilog-viewer");
const rtl     = [...(values.rtl ?? []), ...positionals];

if (!rtl.length) {
  console.error("usage: verilog-viewer --rtl <glob|file>... [--top <name>] [--data-dir <path>] [--port N] [--cwd <path>]");
  process.exit(2);
}

await generate({ rtl, top: values.top, dataDir, cwd });

const server = Bun.serve({
  port: Number(values.port),
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/api/manifest": () => new Response(Bun.file(join(dataDir, "manifest.json"))),
    "/data/*": (req) => {
      const p = new URL(req.url).pathname.replace(/^\/data\//, "");
      return new Response(Bun.file(join(dataDir, p)));
    },
  },
});
console.log(`viewer running at ${server.url}`);
