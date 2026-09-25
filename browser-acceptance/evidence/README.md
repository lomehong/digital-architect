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

## 已知环境限制（2026-09-25 晚登记）

当日晚些时候主机**内存提交电荷耗尽**（Committed 118.1GB / 上限 119.9GB，大户为两个非本能力的 bun 进程各约 27GB），
verify.py / systemone 服务加载权重会触发 `DefaultCPUAllocator: not enough memory` / os error 1455。
**处置**：不杀非本能力进程；deploy.sh 的 verify.py 门禁与 stack 复跑**待内存窗口**（关闭重负载应用或重启后）执行，
结果回填本目录。这是环境限制，不是能力缺陷——同配置在同日早些时候已全绿。
