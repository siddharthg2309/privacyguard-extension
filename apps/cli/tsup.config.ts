import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["cjs"],
  target: "node24",
  platform: "node",
  bundle: true,
  clean: true,
  dts: false,
  minify: false,
  sourcemap: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/.*/u],
  outExtension: () => ({ js: ".cjs" }),
});
