import "ace-builds/src-noconflict/mode-c_cpp";
import "ace-builds/src-noconflict/mode-java";
import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-python";
import "ace-builds/src-noconflict/mode-text";
import "ace-builds/src-noconflict/mode-typescript";
import "ace-builds/src-noconflict/theme-github";

export const LAB_EDITOR_THEME = "github";

export const LANGUAGE_MODES: Record<string, string> = {
  c: "c_cpp",
  cpp: "c_cpp",
  java: "java",
  python: "python",
  python3: "python",
  javascript: "javascript",
  typescript: "typescript",
};

export const SUBMISSION_UPLOAD_ACCEPT =
  ".c,.cc,.cpp,.cxx,.java,.py,.js,.ts,.zip,application/zip,application/x-zip-compressed";

export function getEditorMode(language: string | null | undefined): string {
  return LANGUAGE_MODES[`${language ?? ""}`.trim().toLowerCase()] ?? "text";
}

export function isZipFileName(fileName: string | null | undefined): boolean {
  return `${fileName ?? ""}`.trim().toLowerCase().endsWith(".zip");
}

export function getCodeViewerHeight(
  sourceCode: string | null | undefined,
): string {
  const lineCount = Math.max(1, `${sourceCode ?? ""}`.split("\n").length);
  const height = Math.min(Math.max(240, lineCount * 22 + 28), 560);
  return `${height}px`;
}
