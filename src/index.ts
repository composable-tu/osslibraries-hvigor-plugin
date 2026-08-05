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
 * OSSLibraries Hvigor Plugin
 *
 * Build-time OHPM dependency scanner that generates
 * license metadata for the OSSLibraries UI library.
 */
export { ossScanPlugin } from "./plugin.js";
export type { OssScanPluginOptions } from "./plugin.js";
export {
  scanProject,
  serializeResult,
  resolveLicense,
  buildLibrary,
  parseJson5,
} from "./scanner.js";
export type { ScanResult, ScanOptions, LibraryEntry, LicenseEntry } from "./scanner.js";
