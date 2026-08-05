# OSSLibraries Hvigor Plugin

一个 Hvigor 插件，用于扫描 HarmonyOS 项目的 OHPM 依赖项，并为 [OSSLibraries](https://github.com/composable-tu/osslibraries) 库生成许可证元数据。

![](./readme-assets/banner.png)

[English](README.md)

## 特性

- **规范的 SPDX 表达式解析** — 诸如 `Apache-2.0 OR MIT` 或 `GPL-2.0-only WITH Classpath-exception-2.0` 的声明会通过 `spdx-expression-parse` 解析，表达式中的每个许可证都会被列出；常见拼写错误会通过 `spdx-correct` 自动纠正。
- **列出每个版本** — 当依赖以多个版本安装时，每个版本都会成为独立的条目，而不是静默地只保留第一个。
- **完整的许可证文本** — 优先读取 HAR 包内自带的 `LICENSE` 文件；没有该文件时，回退使用 `spdx-license-list` 中的 SPDX 规范文本。

## 使用

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
> plugins: [ossScanPlugin({ selfModules: ["mylibrary", "3rdlibrary"] })];
> ```

每次构建时，插件会扫描 `oh_modules/` 并生成 `entry/src/main/resources/rawfile/osslibraries.json`。
