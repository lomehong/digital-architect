---
title: 自包含安装器模式——单文件编译、原生件嵌入、状态隔离与分发兼容
domain: dsh-ecosystem
source:
  origin: oh-my-ops v0.7.0 自包含安装器实装 + logstash-124 真机安装与冲突路径演练（2026-09-14）
  ref: 外部试点仓 oh-my-ops（v0.7.0 起）——安装器与构建管线四脚本、探针报告与演练报告各一（R7 注：以上为外部仓相对路径，本库不可回源；持久实证以探针与演练两报告为准）
confirmed: 2026-09-14
status: 已确认
owner: 主人
---

# 自包含安装器模式

> **适用范围**：基于 bun 生态的 CLI 产品（omp/omo）向「无任何前置」机器的分发。以 oh-my-ops v0.7.0 实装为准；**核对路径：以 oh-my-ops 仓 v0.7.0+ 代码为准**（omp 升级后按 `omp-extension-contract-pitfalls.md` 复跑入口复验）。
> 背景：真实机（老 curl、无 omp/node/bun）安装三连失败——TLS 重置、版本透传 404、硬依赖系统 omp。v0.7.0 起改为自包含：omp 单文件运行时随包 + `~/.omo` 私有域 + bun 自动装（共享化）。

## 模式五件套（全部真机/模拟实证）

1. **单文件编译可行，但编译期不报原生件缺失**：`bun build --compile dist/cli.js` 对 `pi-natives` 原生件缺失时**编译成功**，运行才抛 `Unsupported platform`。→ 构建后必须跑 `--version` 冒烟。
2. **原生件嵌入契约**：`pi-natives/native/embedded-addon.js` 是上游自动生成占位（`embeddedAddon=null`；官方由其 `scripts/embed-native.ts` 替换）。自建管线复刻产物：`{platformTag, version, files:[{variant, filename, size, filePath(资产导入 `with {type:"file"}`)}]}`；loader 经 `fs.readFileSync(filePath)` 落盘后 require（`native/loader-state.js`）。`detectCompiledBinary` 认 `$bunfs`/`PI_COMPILED`/embeddedAddon 三者。
3. **状态隔离零改动**：omp 状态目录严格跟随 `$HOME` → 启动器 `export HOME=<私有根>/home` 即与原生 omp 完全隔离（fakehome 实证：全部状态随迁，真身目录零写入）。无需 fork 改 omp 代码。
4. **分发兼容（CN 网络）**：`--retry-all-errors` 需 curl ≥7.71，老 curl 遇未知选项**整条失败**→ 能力探测（`curl --help all` 探测后按需附加）；多源回退 + sha256/魔数校验保留；发布制品分发走镜像通道（gh-proxy 类）；bun 安装官方脚本 → npmmirror zip 回退（注意目标机可能无 unzip → 解压多后端：python3/bsdtar/7z）。
5. **零隐形前置**：自包含脚本禁止 `node -e` 等宿主工具依赖——`set -e` 下命令替换失败**静默退出**，真机才暴露（logstash-124 实测）；JSON 取值用 sed/grep 纯 bash。版本解析结果必须 semver 校验，否则 `"latest"` 透传成 `vlatest` 404。

## 打包清单断言（教训）

重构打包步骤时静默丢失 `cp -r scripts` → Release 包缺 `install.sh`，**测试全绿也拦不住**（包级缺陷不在测试面），独立评审亦未捕获。对策：打包后对关键文件清单逐项断言，缺失直接红（v0.7.0 首发失误 → 同 tag 重发实证拦截有效）。

## 体积与取舍

omp 单文件双 variant 全嵌（baseline+modern）≈471MB，仅 modern ≈290MB（老 CPU 兼容让步）。取舍为主人拍板项（oh-my-ops 当前=全嵌）。

## 与既有条目的关系

- `omp-extension-contract-pitfalls.md`：扩展开发期契约坑位（本条聚焦**分发/安装期**，互补）；
- 状态隔离机制与套件联邦「显式降级三要素（安全收敛）」一致：外部增强缺席只收窄能力，绝不污染宿主环境。
