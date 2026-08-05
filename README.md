# OSSLibraries Hvigor Plugin

A Hvigor plugin to scan OHPM dependencies in a HarmonyOS project and generate license metadata for the [OSSLibraries](https://github.com/composable-tu/osslibraries) library.

![](./readme-assets/banner.png)

[中文文档](README_zh.md)

## Features

- **Proper SPDX expression parsing** — declarations such as `Apache-2.0 OR MIT` or `GPL-2.0-only WITH Classpath-exception-2.0` are parsed with `spdx-expression-parse`, so every license in an expression is listed; common misspellings are corrected via `spdx-correct`.
- **Every version is listed** — when a dependency is installed at several versions, each version becomes its own entry instead of the first one silently winning.
- **Complete license text** — text is read from the `LICENSE` file bundled in each HAR package, and falls back to the canonical SPDX text from `spdx-license-list` when no file is present.

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

Then edit `entry/hvigorfile.ts` to register the plugin:

```TS
import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { ossScanPlugin } from 'osslibraries-hvigor-plugin';

export default {
  system: hapTasks,
  plugins: [ossScanPlugin()]
}
```

> [!TIP]
> If you have modules that should not appear in the license list, pass their dependency names to `selfModules`:
>
> ```ts
> plugins: [ossScanPlugin({ selfModules: ["mylibrary", "3rdlibrary"] })];
> ```

On each build, the plugin scans `oh_modules/` and generates `entry/src/main/resources/rawfile/osslibraries.json`.
