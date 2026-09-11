/**
 * dsh-architect 需求准入核心（纯函数，零依赖）——prd-digest 六项覆盖的确定性检查器。
 *
 * 方法论出处：dsh-memory 条目 mem_1788978083156_yycfzp §prd-digest 六项覆盖检查清单；
 * 准入语义：不足标「未知/待验证」**不编造**；阻断项存在即不通过。
 *
 * @module @dsh-extra/dsh-architect/digest
 */
export interface DigestInput {
    /** 需求原文（PRD 或主人口头描述的转写；非空） */
    requirement: string;
    /** 做（需求条目逐项归属） */
    doItems: string[];
    /** 不做（显式排除） */
    dontItems: string[];
    /** 待确认（问主人的问题清单；允许为空 = 显式无） */
    toConfirm: string[];
    /** 假设（每条应有依据） */
    assumptions: string[];
    /** 阻断项（不解除不得进入设计；非空即不通过） */
    blockers: string[];
    /** 涉及系统/仓库/上下游 */
    systems: string[];
    /** 关键结论与证据来源 */
    evidences: Array<{
        conclusion: string;
        source: string;
    }>;
    /** 风险检查是否逐类过（兼容/异常/缓存/MQ/状态机/安全） */
    risksChecked: boolean;
    /** 验证计划（如何算完成；非空） */
    validationPlan: string;
}
export interface DigestCoverageItem {
    item: string;
    ok: boolean;
    note: string;
}
export interface DigestResult {
    admission: '通过' | '不通过';
    /** 六项覆盖检查表（与 SKILL 六项一一对应） */
    coverage: DigestCoverageItem[];
    /** 不通过时的补齐清单 */
    missing: string[];
    /** 始终为真的提示：准入通过 ≠ 方案完成 */
    next: string;
}
/** 需求准入六项覆盖检查。纯函数：同输入同输出。 */
export declare function checkDigest(input: DigestInput): DigestResult;
