# evidence/ —— 基线证据留档

> 纪律：本目录只放**可复跑的实测输出**（committed 脚本的真实执行结果），每条注明出处命令与环境。
> 截图/单次观测不单独作为结论（evidence-strength-vs-conclusion）。

## 2026-09-25 基线（CPU，Windows 11，Chrome 153）

| 证据 | 出处命令（当时工作目录为本目录上级） | 脚本版本 | 结果 |
|---|---|---|---|
| `suite-2026-09-25.json` | `REPEATS=3 python suite.py`（BA_ROOT 指向当日 Spike 运行时，stack 由 `start-stack.sh` 启动） | `dc81bd0` 的 suite.py（提交后未再改动） | **SUITE PASS**：nav 15/15 + fixture-click 3/3；fixture-composite 3/3 正确 blocked；known-limit 0/6 符合基线 |

同日组件门禁（终端实录，未单独留档文件）：

- `bash deploy.sh`（幂等路径）：权重 sha256 校验一致 + `uv run pytest` **31 passed**；
- `python contract_test.py`：**CONTRACT PASS**（systemone 应答满足 jev validate_choice；畸形请求被拒）；
- `verify.py v10s`：**OK**（TYPE_TEXT 决策 conf 0.92，目标元素正确）。

## 已知环境限制（2026-09-25 晚登记 → 同日夜解除）

当晚主机一度**内存提交电荷耗尽**（Committed 118.1GB / 上限 119.9GB，大户为两个非本能力的 bun 进程各约 27GB），
verify.py / systemone 服务加载权重会触发 `DefaultCPUAllocator: not enough memory` / os error 1455。
处置：不杀非本能力进程，待内存窗口补跑——主人重启机器后已于**同日夜补跑完成**（见下节），限制解除。

## 2026-09-25 夜补跑（重启后内存窗口，新版脚本实测）

环境：BA_ROOT 指向当日 Spike 运行时（`venv`/`jev-ultrafast`@pin+补丁/`laya-browser` 权重复用，
权重 sha256 与 `pins.yaml` 逐字一致）；工作目录为本目录上级。

- `bash deploy.sh`（幂等路径）：步骤 1–4 全部「已存在/hash 一致」跳过；步骤 5 `uv run pytest` **31 passed**（0.28s）；
  步骤 6 verify.py **OK**——`TYPE_TEXT (conf 0.92, expected TYPE_TEXT) target: 2 -> [2] Search Wikipedia (searchbox)`，
  CPU 2784.8 ms/步（65 选项 2534 tokens）；
- `python contract_test.py`：**CONTRACT PASS**——systemone 应答满足 jev validate_choice 约束、畸形请求被拒、
  运行器三条拒绝路径（无白名单/主机越界/无独立校验）全部拦截（exit 2）；
- 启停闭环 `start-stack.sh` → `stop-stack.sh`：systemone 健康端点 `{"ok":true,"variant":"…/v10s"}`、
  停栈后 **8791/8901/9222 三端口全下**、`stack.pids` 登记文件清理。

补跑中新发现并已修复的缺陷（当轮实施评审漏测项）：

1. `stop-stack.sh` 原整树终止把 Git Bash `$!`（**MSYS pid**）直接喂 `taskkill`（只认 Windows pid）→
   报 not found 被 `|| true` 吞掉，栈静默泄漏；经 `ps -W` 换算 WINPID 后修复；
2. chrome.exe 启动后会**重生成主进程**（原 pid 链在 `ps -W` 消失），pid 换算仍救不了 Chrome——
   增加按本栈专属标记（`remote-debugging-port` + `chrome-profile`）的命令行清扫兜底。
   两处均已在修复后完整启停闭环复测通过；教训同步沉淀 practice 条目「环境坑」第 10 条。
