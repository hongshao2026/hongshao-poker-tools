# 微信小程序开发计划

## 架构

```
用户手机                              服务器
┌──────────────────┐    HTTPS    ┌──────────────────────┐
│   微信小程序      │ ─────────→ │  equity-api        │
│                  │            │  (Rust, axum)         │
│  · 范围选择器     │            │                      │
│  · 公共牌选择器   │ ←───────── │  POST /api/equity    │
│  · 胜率展示      │            │  POST /api/analysis  │
│  · 牌面命中率    │            │  GET  /api/health    │
└──────────────────┘            └──────────────────────┘
```

## 后端 API (已完成)

| 接口 | 功能 | 延迟 |
|------|------|:----:|
| `POST /api/equity` | 范围对范围胜率计算 | 16ms (10万次MC) |
| `POST /api/analysis` | 翻牌面命中率分析 (Flopzilla 式) | 0.03ms |
| `GET /api/health` | 健康检查 | <1ms |

详细接口文档见 [README.md](../README.md#api-接口文档)

## 开发步骤

### Phase 1: 后端部署

- [ ] 服务器环境准备 (腾讯云/阿里云, Linux)
- [ ] 编译部署 equity-api (交叉编译或服务器上编译)
- [ ] 配置 systemd 服务保持运行
- [ ] 配置域名 + HTTPS (小程序强制要求 HTTPS)
- [ ] 配置 nginx 反向代理 (可选, 直接暴露 axum 也可以)
- [ ] 在微信公众平台配置服务器域名白名单

### Phase 2: 小程序基础框架

- [ ] 注册微信小程序账号 (如未注册)
- [ ] 初始化小程序项目 (微信开发者工具)
- [ ] 选择技术方案:
  - 原生 WXML/WXSS/JS (最轻量)
  - 或 Taro/uni-app (跨平台, 用 React/Vue 语法)
- [ ] 封装 API 调用模块 (`wx.request` 调用后端)
- [ ] 实现基础页面路由

### Phase 3: 核心 UI 组件

#### 3.1 范围选择器 (核心组件)

13×13 手牌矩阵, 这是最重要的交互组件:

```
     A    K    Q    J    T    9  ...  2
A  [AA ] [AKs] [AQs] [AJs] [ATs] ...
K  [AKo] [KK ] [KQs] [KJs] ...
Q  [AQo] [KQo] [QQ ] [QJs] ...
J  [AJo] [KJo] [QJo] [JJ ] ...
...
```

功能要求:
- 点击单个格子选中/取消
- 拖拽批量选择
- 预设范围按钮 (前5%, 前10%, 前15%, 前20%, 前30%, 前50%)
- 显示已选 combo 数量和占比
- 颜色区分: 对子(对角线) / 同花(上三角) / 不同花(下三角)
- 支持两个玩家各自独立的范围选择器

#### 3.2 公共牌选择器

- 52 张牌的可视化网格 (4行×13列)
- 点击选牌, 已选变灰, 最多选 5 张
- 区分 Flop(3) / Turn(4) / River(5)
- 已选为范围的牌自动排除 (或提示冲突)

#### 3.3 胜率结果展示

- 胜率进度条 (Player 1 vs Player 2)
- 数字显示: Equity% / Win% / Tie%
- 计算耗时显示

#### 3.4 翻牌面命中率分析页面 (调用 /api/analysis)

- 选择一个范围 + 3-5 张公共牌
- 展示牌力分布柱状图 (顶对 31%, 空气 15% ...)
- 成牌 vs 听牌分组展示
- 中文标签 (三条/葫芦/顶对/两头顺听/卡顺听...)
- 每个类别可展开查看具体 combo 列表

### Phase 4: 体验优化

- [ ] 加载动画 (计算中 spinner)
- [ ] 错误提示 (网络错误, 范围冲突等)
- [ ] 预设范围库 (UTG, MP, CO, BTN, SB 标准范围)
- [ ] 范围文本输入模式 (高级用户直接输入 "AA,AKs,QQ-TT")
- [ ] 深色模式
- [ ] 计算历史记录

### Phase 5: 上线

- [ ] 小程序审核提交
- [ ] 性能监控 (API 响应时间)
- [ ] 用户反馈收集

---

## 后端部署参考

### systemd 服务配置

```ini
# /etc/systemd/system/equity-api.service
[Unit]
Description=Equity Engine Poker Equity API
After=network.target

[Service]
Type=simple
ExecStart=/opt/equity/equity-api
Restart=always
RestartSec=5
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

### nginx 反向代理 (HTTPS)

```nginx
server {
    listen 443 ssl;
    server_name api.your-domain.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 小程序端 API 调用示例

```javascript
// utils/api.js
const BASE_URL = 'https://api.your-domain.com'

function request(url, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          reject(res.data.error || 'Unknown error')
        }
      },
      fail: (err) => reject(err)
    })
  })
}

// 范围对范围胜率计算
export function calculateEquity(ranges, board = '', simulations = 100000) {
  return request('/api/equity', { ranges, board, simulations })
}

// 翻牌面命中率分析
export function analyzeBoard(range, board) {
  return request('/api/analysis', { range, board })
}
```

#### 调用示例

```javascript
// 胜率计算
const result = await calculateEquity(['AA,AKs', 'QQ-TT'], '', 100000)
// result.players[0].equity = 0.64  →  显示 "64%"

// 翻牌面分析
const analysis = await analyzeBoard('66+,A5s+,KTs+,ATo+,KJo+', 'AhKd7c')
// analysis.categories = [{name_cn: "顶对", percentage: 30.97}, ...]
```

---

## 服务器资源需求

| 项目 | 需求 |
|------|------|
| CPU | 1 核即可 (单次计算 <100ms) |
| 内存 | 最低 512MB (API 本身只占 2MB) |
| 磁盘 | <10MB (二进制 + 配置) |
| 带宽 | 极低 (每次请求 <1KB) |
| 推荐 | 腾讯云轻量 2C2G (~50元/月) 或学生机 |

**最低成本方案**: 腾讯云轻量应用服务器 1C1G, 约 30-50 元/月, 足够支撑数千日活用户。
