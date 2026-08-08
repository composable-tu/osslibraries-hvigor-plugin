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
 * `osslibraries.json` (or protobuf equivalent) into the entry module's rawfile
 * directory, so it gets packaged into the HAP and read at runtime by the
 * OSSLibraries OHPM library.
 *
 * Usage (in entry/hvigorfile.ts):
 *   import { ossScanPlugin } from 'osslibraries-hvigor-plugin';
 *   export default {
 *     system: hapTasks,
 *     plugins: [ossScanPlugin()]
 *   }
 *
 * To emit protobuf instead of JSON:
 *   plugins: [ossScanPlugin({ format: 'proto' })]
 *
 * To omit the .proto schema in production (when the runtime uses a
 * pre-compiled schema):
 *   plugins: [ossScanPlugin({ format: 'proto', emitSchema: false })]
 */
"use strict";

import * as path from "path";
import * as fs from "fs";
import type { HvigorNode, HvigorPlugin } from "@ohos/hvigor";
import { scanProject, serializeResult } from "./scanner.js";
import { serializeProto } from "./proto.js";

/** Output format for the generated license metadata. */
export type OutputFormat = "json" | "proto";

/** Options for the OSS Libraries scan plugin. */
export interface OssScanPluginOptions {
  /**
   * Module names that belong to the host project and must NOT appear in the
   * generated license list. The module the plugin is registered on is always
   * excluded automatically; add your other module names here.
   */
  selfModules?: string[];
  /**
   * Relative path (from the module path) to the output file.
   *
   * - `format: 'json'` (default): the path is used as-is and defaults to
   *   `src/main/resources/rawfile/osslibraries.json`.
   * - `format: 'proto'`: the path is treated as a base name; the binary
   *   payload is written to `<base>.pb` and the `.proto` schema to
   *   `<base>.proto`. Defaults to
   *   `src/main/resources/rawfile/osslibraries`.
   */
  outputFile?: string;
  /**
   * Output format. `'json'` (default) emits the JSON consumed by the
   * OSSLibraries runtime. `'proto'` emits a protobuf binary payload plus the
   * `.proto` schema the runtime needs to decode it.
   */
  format?: OutputFormat;
  /**
   * Whether to emit the `.proto` schema file alongside the binary payload.
   *
   * Only meaningful with `format: 'proto'`. Defaults to `true` so a fresh
   * project works out of the box. Set to `false` in production builds when the
   * runtime decodes with a pre-compiled schema (e.g. `pbjs`-generated static
   * code) or an embedded schema string rather than `protobuf.load('.proto')`
   * — this avoids shipping the schema file in the HAP.
   */
  emitSchema?: boolean;
}

const PLUGIN_ID = "osslibraries_scan_plugin";
const TASK_NAME = "ossScanLicenses";

const DEFAULT_JSON_OUTPUT = path.join("src", "main", "resources", "rawfile", "osslibraries.json");
const DEFAULT_PROTO_BASE = path.join("src", "main", "resources", "rawfile", "osslibraries");

/** Resolved on-disk targets for the chosen format. */
interface ResolvedOutput {
  /** Directory that must exist before writing. */
  dir: string;
  /** JSON output file (set when `format === 'json'`). */
  json?: string;
  /** Protobuf binary file (set when `format === 'proto'`). */
  protoBinary?: string;
  /** Protobuf schema file, or `undefined` when `emitSchema === false`. */
  protoSchema?: string;
}

/**
 * Resolve the user-facing `outputFile` option into concrete on-disk paths for
 * the chosen format. Centralized here so the task body stays declarative.
 */
function resolveOutputPaths(
  modulePath: string,
  format: OutputFormat,
  outputFile: string | undefined,
  emitSchema: boolean,
): ResolvedOutput {
  if (format === "proto") {
    const base = path.resolve(modulePath, outputFile ?? DEFAULT_PROTO_BASE);
    return {
      dir: path.dirname(base),
      protoBinary: `${base}.pb`,
      protoSchema: emitSchema ? `${base}.proto` : undefined,
    };
  }
  const file = path.resolve(modulePath, outputFile ?? DEFAULT_JSON_OUTPUT);
  return { dir: path.dirname(file), json: file };
}

/**
 * Create the OSS Libraries scan hvigor plugin.
 *
 * Registers a task that runs before the entry module's CompileArkTS task,
 * scanning oh_modules and writing the generated metadata into rawfile so it is
 * packaged into the HAP.
 */
export function ossScanPlugin(options?: OssScanPluginOptions): HvigorPlugin {
  return {
    pluginId: PLUGIN_ID,
    apply: (node: HvigorNode) => {
      const modulePath = node.getNodePath();
      const moduleName = node.getNodeName();
      const projectRoot = path.resolve(modulePath, "..");

      const format: OutputFormat = options?.format ?? "json";
      // emitSchema only affects the proto format; default to true so a fresh
      // project decodes out of the box.
      const emitSchema = options?.emitSchema ?? true;
      const out = resolveOutputPaths(modulePath, format, options?.outputFile, emitSchema);

      // Always exclude the module the plugin is registered on.
      const selfModules = new Set<string>(options?.selfModules ?? []);
      selfModules.add(moduleName);

      node.registerTask({
        name: TASK_NAME,
        run: () => {
          console.log(`[osslibraries] scanning OHPM dependencies at ${projectRoot}`);
          const result = scanProject(projectRoot, { selfModules });

          if (!fs.existsSync(out.dir)) {
            fs.mkdirSync(out.dir, { recursive: true });
          }

          if (format === "proto") {
            const { binary, schema } = serializeProto(result);
            fs.writeFileSync(out.protoBinary!, Buffer.from(binary));
            if (out.protoSchema) {
              fs.writeFileSync(out.protoSchema, schema, "utf-8");
              console.log(
                `[osslibraries] wrote ${result.libraries.length} libraries (proto) to ${out.protoBinary} + ${out.protoSchema}`,
              );
            } else {
              console.log(
                `[osslibraries] wrote ${result.libraries.length} libraries (proto) to ${out.protoBinary}`,
              );
            }
          } else {
            fs.writeFileSync(out.json!, serializeResult(result), "utf-8");
            console.log(
              `[osslibraries] wrote ${result.libraries.length} libraries (json) to ${out.json}`,
            );
          }
        },
        dependencies: [],
        postDependencies: ["default@CompileArkTS"],
      });
    },
  };
}
