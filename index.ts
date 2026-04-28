import { join } from "node:path";
import index from "./index.html";
import { generate } from "./generate";

const viewDir = import.meta.dir;
const dataDir = join(viewDir, "data");
const manifestPath = join(dataDir, "manifest.json");

await generate();

const server = Bun.serve({
  port: 3000,
  development: { hmr: true, console: true },
  routes: {
    "/": index,

    "/api/manifest": () => new Response(Bun.file(manifestPath)),

    "/data/*": (req) => {
      const path = new URL(req.url).pathname.replace(/^\/data\//, "");
      return new Response(Bun.file(join(dataDir, path)));
    },
  },
});

console.log(`viewer running at ${server.url}`);
