/**
 * knowledge-lint 核心（纯函数，零依赖零网络零 fs）——知识库结构校验器（母包 P1-1，规则 R1~R8）。
 *
 * 方法论出处：文章 §3 路线三（Agent-friendly Repo：CI 负责发现知识陈旧、链接失效和结构漂移）+
 * §5.4（自动化守结构底线，语义归人）；本函数只读不写，不是设计流程的阻断点（解析缺失产出 issue，绝不抛错）。
 *
 * 纪律（与 coverage.ts 同构）：
 * - 输入为调用方收集好的结构化快照（KnowledgeSnapshot）——本模块不做任何 IO；
 * - `pass = errors.length === 0`（warnings 仅提示不阻断；R7 路径不存在由调用方经 refExists 判 false 升 error）；
 * - 解析类问题由调用方以 R8 issue 形式塞进快照外的 errors？——不：调用方直接向 result 追加？
 *   本模块暴露 `lintIssue()` 帮助调用方构造同形 issue，保持报告结构单一。
 *
 * @module @dsh-extra/dsh-architect/lint
 */
/** 单个知识条目快照：path 为相对知识库根的 POSIX 风格路径；fields 为展平的 frontmatter（嵌套 source 记为 `source.origin`）。 */
export interface LintEntry {
    path: string;
    fields: Record<string, string>;
    /** 条目正文（R9 设备路径检出用；缺省时不检正文，向后兼容）。 */
    body?: string;
}
/** review-queue.yaml 的一行（`- file: <相对路径>`）。 */
export interface LintQueueRow {
    file: string;
}
/** 某目录 index.md 的一行（file 为该目录内文件名；status 为行内状态列，缺省=未写）。 */
export interface LintIndexRow {
    file: string;
    status?: string;
}
/** 一个目录的索引快照。 */
export interface LintIndex {
    dir: string;
    rows: LintIndexRow[];
}
/** 知识库结构快照（调用方收集；本模块只读）。 */
export interface KnowledgeSnapshot {
    entries: LintEntry[];
    reviewQueue: LintQueueRow[];
    indexes: LintIndex[];
}
export interface LintIssue {
    rule: string;
    path: string;
    message: string;
}
export interface LintStats {
    entries: number;
    confirmed: number;
    pending: number;
}
export interface LintResult {
    /** pass = errors.length === 0（warnings 不阻断）。 */
    pass: boolean;
    errors: LintIssue[];
    warnings: LintIssue[];
    stats: LintStats;
}
export interface LintOptions {
    /**
     * 相对路径形态 ref 的存在性核查（R7）：
     * 返回 true=存在（无事）、false=不存在（升 error）、undefined=无法判定（保持 warning）。
     * 缺省时本模块对相对路径 ref 一律出 warning（由 CLI 等调用方补核查）。
     */
    refExists?: (entryPath: string, ref: string) => boolean | undefined;
}
declare function normPath(p: string): string;
declare function baseName(p: string): string;
declare function dirName(p: string): string;
/**
 * 从 ref 中提取「仓内相对路径形态」的候选（含 / 或 \，且以已知扩展名结尾）；
 * URL（含 ://）与纯章节号（§…）不构成候选。lint.ts 与 CLI 共用，保持单一事实源。
 */
export declare function relativePathCandidates(ref: string): string[];
/** 供调用方（CLI/工具）追加解析类问题时构造同形 issue（R8）。 */
export declare function lintIssue(rule: string, path: string, message: string): LintIssue;
/**
 * R9：检出**设备特定路径**（禁止入库；依据 principle/host-neutral-core.md 执行细则 6）。
 * 命中即 error：同一条知识在不同设备上会因路径差异失效（实践案例：套件根/家目录/checkout 三处）。
 *
 * 检出形态（保守白名单式，避免误伤）：
 * - Windows 盘符路径：`X:\` 或 `X:/`（前后非字母数字，排除 URL 协议如 `https://`）
 * - Windows 设备前缀：`\\?\`、`\\.\`
 * - 含用户名的家目录形态：`X:\Users\<名>` / `X:\Documents and Settings\<名>`
 *
 * **不检**（有意放行，避免误报）：包含 `://` 的 URL/仓库地址、容器内 POSIX 路径（`/opt`、`/workspace`、
 * `/home/<user>` 等由镜像约定而非设备决定者）、环境变量名（`$DSH_HOME`）、仓内相对路径。
 */
export declare function devicePathHits(text: string): string[];
/** 知识库结构校验（R1~R8）。纯函数：同输入同输出，不落盘、不联网、绝不抛错。 */
export declare function lintKnowledge(snapshot: KnowledgeSnapshot, opts?: LintOptions): LintResult;
export { baseName, dirName, normPath };
