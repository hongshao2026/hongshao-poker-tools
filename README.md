# 红烧扑克工具集 · Hongshao Poker Tools

为 MTT / 现金桌玩家设计的离线计算工具集合。所有 web 工具均可在浏览器中直接运行,无需后端。

打开 [`index.html`](./index.html) 进入门户。

## 仓库结构

| 目录 | 用途 |
|---|---|
| `index.html` | 静态门户首页,列出所有可用工具 |
| `tools/` | 各 web 工具的**最终静态产物**,每个一个独立子目录,**点开才加载** |
| `apps/` | 需要构建的 React 工具源码(Vite),`npm run build` → 写入对应 `tools/<name>/` |
| `packages/core/` | 跨平台共享的纯计算模块(无 DOM、无 React),供 web 与未来小程序复用 |
| `engines/` | 高性能计算引擎源码(Rust → WASM) |
| `desktop/` | 桌面端遗留版(tkinter),保留作算法/数据参考 |
| `docs/` | 设计文档,见 [ARCHITECTURE.md](./docs/ARCHITECTURE.md) |

## 当前工具

- **MTT Staking Calculator** — `tools/mtt-staking/` — 基于 ICM/ChipEV 的多场次投资分析
- **Staking Solver** — `tools/staking-solver/` — 多方投资场景分配求解
- **鱿鱼博弈计算器** — `tools/squid-game/` — 8 人桌 11 鱿鱼场景 EV 计算
- **赏金跟注计算器** — `tools/bounty/` — PKO + 神秘赏金所需胜率
- **Equity Engine** — `tools/equity/` — Rust → WASM,范围对范围胜率(需本地 HTTP 服务器)

## 本地运行

```bash
python3 -m http.server 8000
# 访问 http://localhost:8000/
```

`tools/equity/`、`tools/bounty/`、`tools/mtt-staking/` 用了 ES 模块/WASM,**必须**通过 HTTP 服务器访问,不能 `file://` 直接打开。其余工具(`staking-solver`、`squid-game`)双击 HTML 也行,但走 HTTP 是最简单的统一方式。

## 重新构建 React 工具

`apps/<name>/` 目录下:

```bash
cd apps/mtt-staking
npm install     # 第一次
npm run build   # → 输出到 tools/mtt-staking/
```

构建产物会被提交到仓库,所以静态部署(GitHub Pages / Cloudflare Pages 等)不需要 CI 运行 npm。

## 设计哲学

- **门户即门户**:首页只是静态 HTML,从不为没用的工具付出加载成本
- **工具隔离**:每个工具独立子目录、独立加载,新增不影响其他
- **算力分级**:简单计算主线程跑,模拟用 Web Worker,重计算用 WASM,小程序退化到后端 API

详见 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)。

## 仓库

[github.com/hongshao2026/hongshao-poker-tools](https://github.com/hongshao2026/hongshao-poker-tools)
