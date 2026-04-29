// Strip Yosys's parametrized-module wrapper and leading-backslash escape so
// names like "$paramod$<sha1>\w1a8_array" or "\w1a8_pe" render as "w1a8_array"
// / "w1a8_pe". Built-in cells ("$mux", "$add$src/...") are left alone.
export function prettyName(name: string): string {
  const paramod = name.match(/^\$paramod\$[^\\]+\\(.+)$/);
  if (paramod) return paramod[1]!;
  if (name.startsWith("\\")) return name.slice(1);
  return name;
}
