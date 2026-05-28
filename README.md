# 红烧扑克 Pro · MTT 卖股和 Day2 报价工作台

给经常卖股、买份额、看 Day2 报价的人用。基础计算免费开放，Pro 工作台负责报告、批量估值、赛事模板和本地档案。

在线版：[hongshao2026.github.io/hongshao-poker-tools](https://hongshao2026.github.io/hongshao-poker-tools/)

## Pro 工作台

| 能力 | 用途 |
|---|---|
| 卖股报告生成器 | 生成 Markdown、HTML 和可打印 PDF 报告 |
| Day2 批量估值 | 粘贴名单、筹码和报价，输出排序表和 CSV |
| 赛事模板库 | 保存常用 MTT / PKO / Mystery / FT Deal 参数 |
| 本地研究档案 | 集中管理报告、批量记录和模板，可导出备份 |

早鸟版：`¥99`，前 100 份。正式版预计 `¥168-199`。

工具只做计算、复盘和导出，不处理资金，也不撮合交易。

## 免费工具

| 工具 | 入口 | 功能 |
|---|---|---|
| MTT 卖股计算器 | `tools/mtt-staking/#calc` | 输入 buy-in / 参赛人数 / ROI / bankroll，算卖股比例和 markup |
| 反推 BR | `tools/mtt-staking/#reverse` | 给定目标，反推所需 bankroll |
| 风格自测 | `tools/mtt-staking/#quiz` | 短问卷判断 BRM 风格 |
| 曲线模拟 | `tools/mtt-staking/#sim` | 跑 N 子弹后的 bankroll 分布 |
| 锦标赛升级模拟 | `tools/mtt-staking/#ladder` | 阶梯式升 buy-in 的成功率和预期场次 |
| 现场赛程股份计算 | `tools/staking-solver/` | 合约算账，已知条件反推未知项 |
| Online Day2 合理股份计算 | `tools/staking-calc/` | Day 1 / Day 2 单注和批量估值 |
| 常规桌升级模拟 | `tools/bankroll-plan/` | 现金桌 bankroll 升级路径 |
| 决赛桌 Deal 计算器 | `tools/deal-calc/` | ICM / chip chop 分账参考 |
| 手牌记录器 | `tools/hand-recorder/` | 现场手牌顺序录入和复制分享 |
| 赏金跟注 | `tools/bounty/` | PKO / Mystery Bounty 所需胜率 |
| 胜率计算器 | `tools/equity/` | 范围对范围胜率，WASM 加速 |
| 鱿鱼博弈 | `tools/squid-game/` | 8 人桌鱿鱼游戏 EV |
| 翻牌子集 | `tools/flop-subsets/` | GTO Wizard 代表性翻牌子集 |

## 本地运行

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000/
```

`tools/equity/`、`tools/bounty/`、`tools/mtt-staking/` 用了 ES 模块 / WASM，必须通过 HTTP 服务器访问。

## 重新构建 React 工具

```bash
cd apps/mtt-staking
npm install
npm run build
```

构建产物会输出到 `tools/mtt-staking/`，静态部署不需要服务器。

## 仓库结构

| 目录 | 用途 |
|---|---|
| `index.html` | 产品主页和工具入口 |
| `tools/` | 各工具的最终静态产物 |
| `apps/` | 需要 Vite 构建的 React 工具源码 |
| `engines/` | Rust / WASM 引擎源码 |
| `packages/` | 可复用核心计算模块 |
| `assets/` | 全局样式和公共 JS |
| `docs/` | 架构、产品化和数据说明 |

## 相关文档

- 产品化计划：[docs/PRODUCTIZATION_PLAN.md](./docs/PRODUCTIZATION_PLAN.md)
- 架构说明：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 赛事结构模板：[data/tournament-structures/](./data/tournament-structures/)
