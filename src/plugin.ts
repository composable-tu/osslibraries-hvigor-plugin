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
import { scanProject, serializeResult } from "./scanner.js";

/** Options for the OSS Libraries scan plugin. */
export interface OssScanPluginOptions {
  /**
   * Module names that belong to the host project and must NOT appear in the
   * generated license list. Defaults to the OSSLibraries own modules plus
   * 'entry'. Add your own module names here.
   */
  selfModules?: string[];
  /**
   * Relative path (from the entry module path) to the output JSON file.
   * Defaults to 'src/main/resources/rawfile/osslibraries.json'.
   */
  outputFile?: string;
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
      const nodeName = node.getNodeName();
      // Only register on the entry module node.
      if (nodeName !== "entry") {
        return;
      }

      const modulePath = node.getNodePath();
      const projectRoot = path.resolve(modulePath, "..");

      const rawfileDir = path.join(modulePath, "src", "main", "resources", "rawfile");
      const outputFile = options?.outputFile
        ? path.resolve(modulePath, options.outputFile)
        : path.join(rawfileDir, "osslibraries.json");

      const selfModules = options?.selfModules ? new Set<string>(options.selfModules) : undefined;

      node.registerTask({
        name: TASK_NAME,
        run: () => {
          console.log(`[osslibraries] scanning OHPM dependencies at ${projectRoot}`);
          const result = scanProject(projectRoot, { selfModules });
          const json = serializeResult(result);

          const outDir = path.dirname(outputFile);
          if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
          }
          fs.writeFileSync(outputFile, json, "utf-8");
          console.log(`[osslibraries] wrote ${result.libraries.length} libraries to ${outputFile}`);
        },
        // No dependencies — this task runs first.
        dependencies: [],
        // CompileArkTS must run AFTER our scan, so list it as a post-dependency.
        postDependencies: ["default@CompileArkTS"],
      });
    },
  };
}
