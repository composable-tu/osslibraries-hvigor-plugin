# OSSLibraries Hvigor Plugin

A Hvigor plugin to scan OHPM dependencies in a HarmonyOS project and generate license metadata for the [OSSLibraries](https://github.com/composable-tu/osslibraries) library.

[中文文档](README_zh.md)

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
> plugins: [ossScanPlugin({ selfModules: ['mylibrary', '3rdlibrary'] })]
> ```

On each build, the plugin scans `oh_modules/` and generates `entry/src/main/resources/rawfile/osslibraries.json`.