export type Instance = {
  name: string;
  module: string;
  navigable: boolean;
};

export type ModuleEntry = {
  svg: string;
  json: string;
  instances: Instance[];
};

export type Manifest = {
  generatedAt: string;
  top: string;
  sources: string[];
  modules: Record<string, ModuleEntry>;
};
