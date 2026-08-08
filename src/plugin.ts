/**
 * Copyright (c) 2026 composable-tu
 * OSSLibraries Hvigor Plugin is licensed under Mulan PSL v2.
 * You can use this software according to the terms and conditions of the Mulan PSL v2.
 * You may obtain a copy of Mulan PSL v2 at:
 *          http://license.coscl.org.cn/MulanPSL2
 * THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
 * EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
 * MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
 * See the Mulan PSL v2 for more details.
 */

/**
 * A Hvigor plugin that scans OHPM dependencies at build time and generates an
 * `osslibraries.json` into the entry module's rawfile directory, so it gets
 * packaged into the HAP and read at runtime by the OSSLibraries OHPM library.
 *
 * Usage (in entry/hvigorfile.ts):
 *   import { ossScanPlugin } from 'osslibraries-hvigor-plugin';
 *   export default {
 *     system: hapTasks,
 *     plugins: [ossScanPlugin()]
 *   }
 */
"use strict";

import * as path from "path";
import * as fs from "fs";
import type { HvigorNode, HvigorPlugin } from "@ohos/hvigor";
import { scanProject } from "./scanner.js";
import { getSerializer, type OutputFormat } from "./format.js";

/** Options for the OSS Libraries scan plugin. */
export interface OssScanPluginOptions {
  /**
   * Module names that belong to the host project and must NOT appear in the
   * generated license list. The module the plugin is registered on is always
   * excluded automatically; add your other module names here.
   */
  selfModules?: string[];
  /**
   * Relative path (from the module path) to the output file. When omitted,
   * defaults to 'src/main/resources/rawfile/osslibraries.<ext>', where
   * <ext> follows `format` ("json" or "msgpack").
   */
  outputFile?: string;
  /**
   * Output format for the generated license metadata. Defaults to
   * `OutputFormat.JSON`.
   *
   * Prefer the `OutputFormat` enum members (e.g. `OutputFormat.MessagePack`)
   * over raw strings for safe renames and autocompletion.
   */
  format?: OutputFormat;
}

const PLUGIN_ID = "osslibraries_scan_plugin";
const TASK_NAME = "ossScanLicenses";

/**
 * Create the OSS Libraries scan hvigor plugin.
 *
 * Registers a task that runs before the entry module's CompileArkTS task,
 * scanning oh_modules and writing the generated JSON into rawfile so it is
 * packaged into the HAP.
 */
export function ossScanPlugin(options?: OssScanPluginOptions): HvigorPlugin {
  return {
    pluginId: PLUGIN_ID,
    apply: (node: HvigorNode) => {
      const modulePath = node.getNodePath();
      const moduleName = node.getNodeName();
      const projectRoot = path.resolve(modulePath, "..");

      const format = options?.format ?? "json";
      const serializer = getSerializer(format);

      const rawfileDir = path.join(modulePath, "src", "main", "resources", "rawfile");
      // An explicit outputFile wins as-is; otherwise the extension follows
      // the chosen format ("json" or "msgpack").
      const outputFile = options?.outputFile
        ? path.resolve(modulePath, options.outputFile)
        : path.join(rawfileDir, `osslibraries.${serializer.extension}`);

      // Always exclude the module the plugin is registered on.
      const selfModules = new Set<string>(options?.selfModules ?? []);
      selfModules.add(moduleName);

      node.registerTask({
        name: TASK_NAME,
        run: () => {
          console.log(`[osslibraries] scanning OHPM dependencies at ${projectRoot}`);
          const result = scanProject(projectRoot, { selfModules });
          const bytes = serializer.encode(result);

          const outDir = path.dirname(outputFile);
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          fs.writeFileSync(outputFile, bytes);
          console.log(
            `[osslibraries] wrote ${result.libraries.length} libraries to ${outputFile} (${serializer.name})`,
          );
        },
        dependencies: [],
        postDependencies: ["default@CompileArkTS"],
      });
    },
  };
}
