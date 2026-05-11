# 架构与性能设计

聚焦两个核心问题:
1. **启动会不会太慢?** —— 多工具集成怎么避免首屏拖累
2. **蒙特卡洛会不会卡住?** —— 长计算如何不冻结 UI

---

## 一、当前仓库结构

```
hongshao-poker-tools/
├── index.html              # 静态门户（10KB 量级，永远秒开）
├── tools/                  # 各工具的最终产物（部署/访问入口）
│   ├── mtt-staking/        # Vite React → 192KB gzip
│   ├── staking-solver/     # 原生 HTML/JS（轻）
│   ├── squid-game/         # 原生 HTML/JS + DP（轻）
│   ├── bounty/             # 原生 HTML/JS，导入 packages/core/bounty
│   └── equity/          # WASM (Rust 编译) + Web Worker
├── apps/                   # 需要 npm/Vite 构建的 React 工具源码
│   └── mtt-staking/        # → 构建到 tools/mtt-staking/
├── packages/
│   └── core/               # 跨平台纯计算模块（无 DOM/React，可被小程序复用）
│       └── bounty/         # PKO + 神秘赏金计算
├── engines/                # 高性能引擎源码
│   └── equity/          # Rust 工作区
│       └── crates/
│           ├── equity-core/   # 核心库
│           ├── equity-api/    # axum HTTP API
│           └── equity-wasm/   # wasm-bindgen 包装
├── desktop/                # 桌面遗留版（参考）
└── docs/ARCHITECTURE.md    # 本文件
```

**`tools/` vs `apps/` vs `engines/` 的责任划分**:

- `tools/<name>/` 永远是**部署即可工作的静态产物**,门户直接链接进去
- `apps/<name>/` 是 Vite/打包工具的源码,`npm run build` 写到 `tools/<name>/`
- `engines/<name>/` 是 Rust/重计算的源码,`wasm-pack build` 或 `cargo build` 写到对应 `tools/<name>/pkg/`

这种职责分离让"部署只看 tools/"成为永真规则,新增工具只需要决定它属于"轻"(直接写到 `tools/`)还是"重"(在 `apps/` 或 `engines/` 写源码 + 构建到 `tools/`)。

---

## 二、启动速度策略:门户即门户,工具各管各的

### 反例(不要做)

把所有工具打成一个 SPA bundle。10 个工具一起加载 → 首屏几 MB → 卡顿。

### 当前做法(已经在做)

- **门户 `index.html` 是纯静态 HTML**,只列卡片、不引任何 JS 框架
- 每个 `tools/<name>/index.html` 是一个独立页面,**点进去才加载**
- 用户从不为没用的工具付出加载成本

### 当前已解决/待解决

| 问题 | 状态 | 现状 |
|---|---|---|
| ~~MTT staking 用浏览器 Babel 编译 JSX,首次 ~600ms~~ | ✅ 已解决 | Vite 构建 → 192KB gzip,加载 <100ms |
| 多个 React 工具会各自打包 React | 待定 | 当前只有一个 React 工具,暂不优化;以后 3+ 个再共享 vendor |
| 字体走 Google CDN,中国大陆可能慢 | 待定 | 后续切换为本地字体或国内 CDN |

**原则**:先有,再快。除非具体工具体感差,否则不预优化。

### 集成判断标准(下次新工具加进来怎么决定)

1. 工具不超过 1000 行 + 计算量小 → 原生 HTML/JS,放 `tools/<name>/index.html`
2. 工具有复杂 UI(多 tab、表单、图表)→ React,但用 Vite 预编译,**不要再用浏览器 Babel**
3. 工具核心是高强度计算(范围胜率、模拟器)→ 引擎放 `engines/`,UI 放 `tools/`,中间用 WASM 桥接

---

## 三、蒙特卡洛 / 长计算策略:四层算力分级

按计算量从轻到重,放在四个不同的"算力层":

### Tier 1 · 主线程纯 JS(<50ms)

- **场景**:ICM 计算、简单 EV、DP(状态空间小)
- **代表**:MTT staking 的 ICM、Staking Solver、Squid Game DP
- **写法**:直接写函数,响应输入即时返回
- **不用做特殊处理**

### Tier 2 · Web Worker(50ms ~ 30s)

- **场景**:中等规模蒙特卡洛、中等 DP、组合枚举
- **代表**:MTT staking 的多场次 MC、轻量 equity
- **关键模式**:

```js
// main thread
const worker = new Worker('./mc-worker.js');
worker.onmessage = (e) => {
  if (e.data.type === 'progress') updateProgressBar(e.data.done, e.data.total);
  else if (e.data.type === 'done') showResult(e.data.result);
};
worker.postMessage({ type: 'start', params });
stopBtn.onclick = () => worker.postMessage({ type: 'cancel' });

// worker.js
let cancelled = false;
self.onmessage = (e) => {
  if (e.data.type === 'cancel') { cancelled = true; return; }
  const { params } = e.data;
  const N = params.iterations;
  const CHUNK = 10000;          // 每 1 万次报一次进度
  let wins = 0;
  for (let i = 0; i < N; i += CHUNK) {
    if (cancelled) return;
    for (let j = 0; j < CHUNK && i + j < N; j++) {
      wins += simulateOne(params);
    }
    self.postMessage({ type: 'progress', done: i + CHUNK, total: N });
  }
  self.postMessage({ type: 'done', result: { equity: wins / N } });
};
```

**要点**:
- UI 永远不阻塞,主线程只画进度条
- "Stop" 按钮零延迟生效(下一个 chunk 边界退出)
- chunk 大小取决于单次模拟耗时:目标每秒 30~60 次进度更新

### Tier 3 · WASM in Worker(>30s 的 JS 计算)

- **场景**:范围对范围胜率、大规模模拟、查找表评估
- **代表**:Equity Engine 的 equity 计算(JS 实现可能 50 万 sims/sec,Rust 编译 WASM 后 600 万 sims/sec,12x 提速)
- **方案**:`engines/equity` 用 `wasm-pack` 编译,worker 里 `import init from './equity.wasm'`
- **加载策略**:
  - **不要**在门户首页加载 WASM
  - **只在用户点开 Equity Engine 工具后**懒加载
  - WASM 模块 ~200KB(gzip),首次加载 <200ms
- **运行策略**:WASM 还是放在 Worker 里,因为单次大模拟仍然是数十秒级

### Tier 4 · HTTP API 后端(只在小程序环境 / 极重计算)

- **场景**:微信小程序(不支持 WASM)、需要服务端缓存的查询
- **代表**:Equity Engine 的 axum API,已经做好了
- **何时启用**:
  - Web 版:**不需要**,WASM 在浏览器里跑就够
  - 小程序版:**必须**,因为微信小程序运行时不支持 WebAssembly 也不能跑 Rust

### 决策表

```
你的计算预计需要多久?
├── <50ms      → Tier 1 主线程
├── 50ms~30s   → Tier 2 Web Worker（纯 JS）
├── >30s       → Tier 3 WASM in Worker
└── 小程序里跑 → Tier 4 后端 API（绕过 WASM 限制）
```

---

## 四、跨平台移植路径(到小程序)

### 复用层级(从最易到最难)

| 层 | 内容 | 复用难度 | 备注 |
|---|---|---|---|
| 纯计算函数 | ICM、DP、EV 公式 | ★ 直接复用 | 必须是无 DOM/无 React 的纯 ES module |
| 数据结构 | 范围、牌、玩家、场次 | ★ 直接复用 | TypeScript 接口最理想 |
| UI 组件(React) | 表格、图表、表单 | ★★ 用 Taro | Taro 4 React 模式可编出微信/支付宝 |
| 浏览器 API | localStorage、Worker | ★★★ 需适配 | 小程序有 wx.setStorage、`wx.createWorker` |
| WASM | equity 引擎 | ★★★★ 不可用 | 退化到 Tier 4 API 后端 |

### 推荐路径

**Phase 1** — 先把所有 web 工具的**计算逻辑**抽到 `packages/core/`(纯 JS 模块,无 DOM 依赖):

```
packages/core/
├── icm/
├── staking/
├── squid/
└── range/   # 这里只放 JS 实现的轻量版（fallback），重的 WASM 在 engines/
```

**Phase 2** — Web 端继续用现有 `tools/<name>/index.html`,但开始 `import { calcICM } from '../../packages/core/icm'`。

**Phase 3** — 小程序项目独立建仓 `hongshao-miniapp/`,通过 npm/git submodule 引用 `packages/core`。UI 用 Taro React 重写;遇到要 WASM 的地方,改成调 `engines/equity-api`(Rust 后端)。

**关键纪律**:
- **`packages/core/` 永远不能 `import 'react'` 或访问 `window`/`document`**
- **`tools/` 和小程序代码各自做 UI 适配,不互相依赖**

---

## 五、给 Equity Engine 的具体上线方案

这是仓库里最重的计算资产,值得单独说。

```
                  ┌────────────────────────────┐
                  │  engines/equity/        │
                  │  (Rust 单一源)             │
                  └─────┬─────────┬────────────┘
                        │         │
              wasm-pack │         │ cargo build --release
                        ▼         ▼
              ┌─────────────┐  ┌────────────────────┐
              │ equity.  │  │ equity-api      │
              │   wasm      │  │ (二进制部署到云)   │
              └──────┬──────┘  └─────────┬──────────┘
                     │                   │
                     ▼                   ▼
            tools/equity/        小程序 wx.request
            (Worker 加载 WASM)      (HTTPS 调用)
```

**Web 端(浏览器)**:
1. 在 `engines/equity/Cargo.toml` 加 `[lib] crate-type = ["cdylib"]` 配置
2. 用 `wasm-pack build --target web` 输出 `pkg/equity.{js,wasm}`
3. 在 `tools/equity/` 写 UI,Worker 里 `import init from '/pkg/equity.js'`
4. 用户打开工具 → 加载 WASM(~200KB)→ 跑 6M sims/sec

**小程序端**:
1. 把 `crates/equity-api` 部署到云服务器,域名 + HTTPS
2. 在微信公众平台配置 request 域名白名单
3. Taro 项目里 `wx.request({ url: 'https://api.../equity' })`
4. 单次 10 万次 MC ≈ 16ms,体验和 Web 端基本无差

---

## 六、当前阶段的 TODO 优先级

按收益/成本排序:

1. **(P0,已完成)** 重组目录,把工具按 `tools/<name>/` 隔离,门户秒开
2. **(P1,已完成)** Squid Game 的 web 版接入
3. **(P2,已完成)** Equity Engine WASM 化:`wasm-pack` 编译,Web Worker 加载,92KB WASM
4. **(P3,已完成)** Bounty Calculator web 化:1047 行 tkinter → 单文件 HTML
5. **(P4,已完成)** `packages/core/bounty` 抽出,服务于未来小程序项目
6. **(P6,已完成)** Vite 化 mtt-staking,替代浏览器端 Babel(192KB gzip)
7. **(P5,已完成)** 把其它工具的纯逻辑抽到 `packages/core/`:
   - `squid/index.js` — DP 求解
   - `staking/solver.js` + `simulator.js` — 代数求解 + MC 模拟
   - `staking/mtt-model.js` — Felix 校准的方差/ROI 模型
8. **(P7)** 启动小程序仓库,通过 npm/git submodule 引用 `packages/core`,WASM 改用 `engines/equity-api` 后端
9. **(P8)** 抽 mtt-staking 的剩余仿真代码(`generateGGPayout`、`simulatePath`、`runSimulation` ~700 行)到 `packages/core/staking/mtt-simulation.js`,P7 真要小程序化时再做

每完成一个工具的迁移再决策下一个,不要一口气铺太多并行工作。
