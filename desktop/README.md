# Desktop tools (legacy)

Python/tkinter 桌面工具,作为参考保留。它们当前**未集成**进 web 门户。

## 内容

| 目录 | 来源 | 状态 | 备注 |
|---|---|---|---|
| `bounty-calculator/` | `BountyCalculator.py` (1047 行) | tkinter 桌面应用 | 待 web 化 |
| `squid-game/` | `cake_calculator.py` (1124 行) + `pay.xlsx` | tkinter 桌面应用 | web 版已在 `tools/squid-game/`,Python 原版保留作参考(含蒙特卡洛) |

## 为什么保留

1. **算法参考**:Python 版包含完整业务逻辑、参数范围、边界处理,后续 web 化时直接对照
2. **数据参考**:`pay.xlsx` 是鱿鱼游戏支付表,web 版可能需要导入

## 后续计划

每个工具的 web 化路径见 `docs/ARCHITECTURE.md`。一般做法:

1. 把纯计算函数从 tkinter 代码里抽出,翻译成 JS(放到 `packages/core/`)
2. 用 React/原生 HTML 重写 UI(放到 `tools/<name>/`)
3. 在门户 `index.html` 添加卡片
4. 此目录中的 Python 文件可以删除或继续保留作 baseline 测试用
