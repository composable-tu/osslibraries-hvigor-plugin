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
  stripJson5,
  parseJson5,
} from "./scanner.js";
export type { ScanResult, ScanOptions, LibraryEntry, LicenseEntry } from "./scanner.js";
