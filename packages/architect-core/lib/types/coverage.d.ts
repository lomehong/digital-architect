/**
 * dsh-architect 覆盖检查核心（纯函数，零依赖）——可执行技术方案的六维度+五问确定性检查器。
 *
 * 方法论出处：dsh-memory 条目 mem_1788978083156_yycfzp 图 8（六维度覆盖 95%+ 主要工程问题）；
 * 模板：digital-architect/templates/executable-design.md。
 * 设计纪律：解析失败/结构缺失一律产出 issue 与低分，**绝不抛错**——检查器自身不得成为设计流程的阻断点。
 *
 * @module @dsh-extra/dsh-architect/coverage
 */
export type DimensionKey = 'requirement' | 'system' | 'evidence' | 'risk' | 'validation' | 'uncertainty';
/** 六维度定义（数组顺序即评分表顺序）。 */
export declare const DIMENSIONS: ReadonlyArray<{
    key: DimensionKey;
    title: string;
}>;
export interface DimensionCheck {
    key: DimensionKey;
    title: string;
    /** 章节是否找到 */
    found: boolean;
    /** 0-10：找到章节 4 分 + 无空单元格 3 分 + 无未填占位符 3 分 */
    score: number;
    maxScore: 10;
    emptyCells: number;
    unfilledPlaceholders: number;
    issues: string[];
}
export interface FiveQuestionsCheck {
    found: boolean;
    /** 五问中回答非空的数量（满分 5） */
    answered: number;
    issues: string[];
}
export interface CoverageResult {
    /** 总分 0-60 */
    total: number;
    max: 60;
    /** total >= 50 且无维度 <= 5 且五问作答 >= 4 */
    pass: boolean;
    fiveQuestions: FiveQuestionsCheck;
    dimensions: DimensionCheck[];
    issues: string[];
}
/** 抽取某标题（`## …标题…`）到下一个同级或更高级标题之间的区段；找不到返回 undefined。 */
export declare function sectionOf(md: string, title: string): string | undefined;
/** 统计 markdown 表格中的空数据单元格（`| |` 空隙；表头分隔行 `|---|---|` 不算）。 */
export declare function countEmptyCells(text: string): number;
/** 统计未填写占位符 `<...>`（模板遗留；排除代码块/行内代码/无内容尖括号/闭合标签/泛型等代码形态）。 */
export declare function countUnfilledPlaceholders(text: string): number;
/** 检查五问速答表。 */
export declare function checkFiveQuestions(md: string): FiveQuestionsCheck;
/** 六维度+五问完整检查。纯函数：同输入同输出，不落盘、不联网。 */
export declare function checkDesign(md: string): CoverageResult;
/** 生成评审骨架（architect_review 工具产出的固定格式文本，交评审者补评语后落盘）。 */
export declare function renderReviewSkeleton(title: string, result: CoverageResult): string;
