# 红烧扑克工具集 · Hongshao Poker Tools

为 MTT / 现金桌玩家设计的离线计算工具集合。所有 web 工具均可在浏览器中直接运行,无需后端。

打开 [`index.html`](./index.html) 进入门户。

## 仓库结构

| 目录 | 用途 |
|---|---|
| `index.html` | 静态门户首页,列出所有可用工具 |
| `tools/` | 各 web 工具,每个一个独立子目录,**点开才加载** |
| `engines/` | 高性能计算引擎源码(Rust → WASM) |
| `desktop/` | 桌面端遗留版(tkinter),保留作算法/数据参考 |
| `docs/` | 设计文档,见 [ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

## 当前工具

### 可用

- **MTT Staking Calculator** — `tools/mtt-staking/` — 基于 ICM/ChipEV 的多场次投资分析
- **Staking Solver** — `tools/staking-solver/` — 多方投资场景分配求解
- **鱿鱼博弈计算器** — `tools/squid-game/` — 8 人桌 11 鱿鱼场景 EV 计算

### 开发中

- **Range Zen** — `engines/range-zen/` — Rust 引擎,77M evals/sec,待编译为 WASM
- **Bounty Calculator** — `desktop/bounty-calculator/` — PKO 赏金 EV,待 web 化

## 设计哲学

- **门户即门户**:首页只是静态 HTML,从不为没用的工具付出加载成本
- **工具隔离**:每个工具独立子目录、独立加载,新增不影响其他
- **算力分级**:简单计算主线程跑,模拟用 Web Worker,重计算用 WASM,小程序退化到后端 API

详见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 仓库

[github.com/hongshao2026/hongshao-poker-tools](https://github.com/hongshao2026/hongshao-poker-tools)
