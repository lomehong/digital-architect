import { type KnowledgeSnapshot, type LintIssue, type LintIndex, type LintQueueRow, type LintResult } from './lint.ts';
export declare const KNOWLEDGE_DIRS: readonly ["meta", "principle", "scenario", "practice", "reference"];
export interface CollectResult {
    root: string;
    snapshot: KnowledgeSnapshot;
    /** 采集/解析类问题（R8），调用方需合并进 errors（非空即不应 pass）。 */
    issues: LintIssue[];
}
/** ── 条目 frontmatter 解析（受限格式：缩进 0 的 `key: value` + 单层嵌套 `key:` 下两空格 `sub: value`）── */
export declare function parseEntry(content: string, relPath: string, issues: LintIssue[]): Record<string, string> | null;
/** ── review-queue.yaml 解析：行组 `- file:` + 缩进续行；其余内容行 = R8 ── */
export declare function parseQueue(content: string, issues: LintIssue[]): LintQueueRow[];
/** ── index.md 解析：表格行 `| [file](file) | 定位 | 状态 |` ── */
export declare function parseIndex(content: string, relPath: string, issues: LintIssue[]): LintIndex['rows'];
/** 采集知识库快照（root 为绝对或相对路径；相对路径按 cwd 解析）。 */
export declare function collectKnowledgeSnapshot(rootArg: string, cwd?: string): CollectResult;
/** R7 存在性核查：候选相对【知识库根 / 仓库根 / 条目所在目录】三个基准解析。 */
export declare function makeRefExists(root: string): (entryPath: string, ref: string) => boolean | undefined;
/** 采集 + 校验一体（CLI 与两宿主工具的唯一入口）：返回 lintKnowledge 结果 + 根 + 采集类问题合并后的 pass。 */
export declare function lintKnowledgeAt(rootArg: string, cwd?: string): LintResultAt;
export interface LintResultAt extends LintResult {
    root: string;
}
