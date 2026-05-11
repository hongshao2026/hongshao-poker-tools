# 红烧扑克工具集 · Hongshao Poker Tools

一组纯前端、可离线运行的扑克决策计算器，覆盖 MTT 卖股、现场赛程算账、Day 2 买股、现金桌资金升级、桌上 EV 与概率博弈五大场景。所有计算都在浏览器本地完成，不上传任何数据。

直接打开 [`index.html`](./index.html) 进入门户，或访问在线版：[hongshao2026.github.io/hongshao-poker-tools](https://hongshao2026.github.io/hongshao-poker-tools/)

---

## 工具一览

### Staking · 股权交易

| 工具 | 入口 | 功能 |
|---|---|---|
| MTT 卖股计算器 | `tools/mtt-staking/#calc` | 输入 buy-in / 场子人数 / ROI / bankroll，算最优卖股比例 + markup |
| 反推 BR | `tools/mtt-staking/#reverse` | 给定 markup 和目标增长率，反推所需 bankroll |
| 风格自测 | `tools/mtt-staking/#quiz` | 短问卷判定 BRM 风格（保守 / 平衡 / 激进） |
| 曲线模拟 | `tools/mtt-staking/#sim` | Monte Carlo 跑 N 子弹，看盈亏曲线与典型路径 |
| 升级测试 | `tools/mtt-staking/#ladder` | 阶梯式升 buy-in 的成功率、预期场次、降级回退 |
| 现场赛程股份计算 | `tools/staking-solver/` | 10 变量定点求解：净收入、ROI、卖出比例、所需总盘子 |
| Online Day2 合理股份计算 | `tools/staking-calc/` | Day 1 / Day 2 单注 + 批量，AdjS · ICM · 零和 ROI · 买家 ROI 预测 |

### Cash Game · 现金桌

| 工具 | 入口 | 功能 |
|---|---|---|
| 资金升级计划 | `tools/bankroll-plan/` | 5 档级别可编辑、自动算升降级阈值、多开时薪、升级时长，含 Monte Carlo 增长曲线 |

### 桌上决策

| 工具 | 入口 | 功能 |
|---|---|---|
| 赏金跟注 | `tools/bounty/` | PKO + 神秘赏金所需胜率，输出与纯底池的胜率差 |
| 权益计算器 | `tools/equity/` | Rust → WASM 范围对范围胜率，含 13×13 矩阵 + PostFlop 校准 |
| 鱿鱼博弈 | `tools/squid-game/` | 8 人桌动态规划解 EV，输入鱿鱼分布 + 规则范围 |

---

## 本地运行

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000/
```

`tools/equity/`、`tools/bounty/`、`tools/mtt-staking/` 用了 ES 模块 / WASM，必须通过 HTTP 服务器访问，不能 `file://` 直接打开。

## 重新构建 React 工具

```bash
cd apps/mtt-staking
npm install     # 第一次
npm run build   # → 输出到 tools/mtt-staking/
```

构建产物会提交到仓库，静态部署（GitHub Pages / Cloudflare Pages）不需要 CI 跑 npm。

## 重新构建 WASM 引擎

```bash
cd engines/equity/crates/equity-wasm
wasm-pack build --target web --release
cp pkg/equity_wasm* ../../../../tools/equity/pkg/
```

需要 Rust 工具链 + wasm-pack。

## 仓库结构

| 目录 | 用途 |
|---|---|
| `index.html` | 静态门户首页 |
| `tools/` | 各工具的最终静态产物，每个独立子目录 |
| `apps/` | 需要 Vite 构建的 React 工具源码 |
| `engines/` | Rust → WASM 高性能引擎源码 |
| `assets/` | 全局共享的 CSS 设计 token 与公共 JS 模块 |
| `desktop/` | 桌面端遗留版（tkinter），保留作算法/数据参考 |
| `docs/` | 架构与设计文档，见 [ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

## 仓库

[github.com/hongshao2026/hongshao-poker-tools](https://github.com/hongshao2026/hongshao-poker-tools)
