# OSSLibraries Hvigor Plugin

A Hvigor plugin to scan OHPM dependencies in a HarmonyOS project and generate license metadata for the [OSSLibraries](https://github.com/composable-tu/osslibraries) library.

![](./readme-assets/banner.png)

[中文文档](README_zh.md)

## Features

- **Zero config** — register the plugin once. Every build regenerates the license list from your current `oh_modules/`. The output never drifts from what you actually ship.
- **Build-time integration** — runs as a Hvigor task and writes `osslibraries.json` into the entry module's `rawfile/` directory. The metadata is packaged into the HAP, ready for runtime display.
- **Accurate license detection** — SPDX expressions like `Apache-2.0 OR MIT` are fully parsed, common misspellings are auto-corrected, and every license in an expression is listed.
- **Full license text** — reads the `LICENSE` file bundled in each package. Falls back to canonical SPDX text when none is present.
- **Multi-version aware** — when a dependency appears at several versions, each version gets its own entry with its own license.

## Use

Install via npm:

```zsh
npm install osslibraries-hvigor-plugin --save-dev
```

Other package managers also work:

```zsh
yarn add osslibraries-hvigor-plugin --dev
pnpm add osslibraries-hvigor-plugin -D
vp add osslibraries-hvigor-plugin -D
vlt install osslibraries-hvigor-plugin -D
bun add osslibraries-hvigor-plugin -D
```

Then edit `entry/hvigorfile.ts` to register the plugin (the target module can be customized; `entry` is used here as an example):

```TS
import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { ossScanPlugin } from 'osslibraries-hvigor-plugin';

export default {
  system: hapTasks,
  plugins: [ossScanPlugin()]
}
```

> [!TIP]
> If you have modules that should not appear in the license list, pass their names to `selfModules` (the module the plugin is registered on is always excluded automatically):
>
> ```ts
> plugins: [ossScanPlugin({ selfModules: ["mylibrary", "3rdlibrary"] })];
> ```

On each build, the plugin scans `oh_modules/` and generates `entry/src/main/resources/rawfile/osslibraries.json`.
