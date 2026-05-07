# packages/core

跨平台共享的纯计算模块。

## 契约(必读)

放进 `packages/core/` 的任何代码,都**必须**满足:

- 纯 ES module(`export` 语法),不依赖任何打包工具
- **不**访问 `window` / `document` / `localStorage` / DOM
- **不** `import` 任何 UI 框架(React、Vue 等)
- 输入输出都是普通对象 / 数组 / 数字 / 字符串
- 优先使用纯函数(无副作用)

满足以上,这些模块就可以被同时使用于:

| 目标 | 加载方式 |
|---|---|
| Web 工具 (`tools/<name>/index.html`) | `<script type="module">` + `import` |
| 微信小程序 (Taro / 原生) | npm 包 / 路径 import |
| Node.js (测试 / 后端预算) | `node --experimental-vm-modules` |

## 当前模块

| 路径 | 用途 |
|---|---|
| `bounty/index.js` | PKO + 神秘赏金跟注计算 |

## 添加新模块的步骤

1. 在 `packages/core/<topic>/` 下创建 `index.js`,导出 `export function ...`
2. 在 `tools/<name>/index.html` 中:
   - 把 `<script>` 改为 `<script type="module">`
   - 用 `import { ... } from '../../packages/core/<topic>/index.js';` 导入
3. **注意**:这意味着该工具不再能用 `file://` 直接打开,必须用 HTTP 服务器(`python3 -m http.server 8000`)

## 测试

目前还没有测试框架。短期可以写裸 Node 测试:

```bash
node --input-type=module -e "
import { calcPKO } from './packages/core/bounty/index.js';
console.log(calcPKO({ ... }));
"
```

后续如果模块多了再上 vitest 或 node:test。
