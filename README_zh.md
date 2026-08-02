# OSSLibraries Hvigor Plugin

一个 Hvigor 插件，用于扫描 HarmonyOS 项目的 OHPM 依赖项，并为 OSSLibraries 库生成许可证元数据。

[English](README.md)

使用 npm 安装：

```zsh
npm install osslibraries-hvigor-plugin --save-dev
```

也可以使用 Yarn、pnpm、Vite+、vlt、Bun 等包管理器/构建工具安装：

```zsh
yarn add osslibraries-hvigor-plugin --dev
pnpm add osslibraries-hvigor-plugin -D
vp add osslibraries-hvigor-plugin -D
vlt install osslibraries-hvigor-plugin -D
bun add osslibraries-hvigor-plugin -D
```

然后编辑 `entry/hvigorfile.ts` 以注册插件:

```TS
import { hapTasks } from '@ohos/hvigor-ohos-plugin';
import { ossScanPlugin } from 'osslibraries-hvigor-plugin';

export default {
  system: hapTasks,
  plugins: [ossScanPlugin()]
}
```

> [!TIP]
> 如果你的项目有不想出现在 License 列表中的模块，可以将依赖名传入 `selfModules`:
>
> ```ts
> plugins: [ossScanPlugin({ selfModules: ['mylibrary', '3rdlibrary'] })]
> ```

每次构建时，插件会扫描 `oh_modules/` 并生成 `entry/src/main/resources/rawfile/osslibraries.json`。