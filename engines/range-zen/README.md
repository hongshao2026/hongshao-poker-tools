# Range Zen

德州扑克范围对范围胜率计算器 + 翻牌面命中率分析器

Texas Hold'em Range vs Range Equity Calculator & Board Texture Analyzer

## 项目状态

**当前版本: v0.2.0 — 后端引擎 + API 已完成，待开发小程序前端**

### 已完成功能

| # | 功能 | 说明 | 状态 |
|---|------|------|:----:|
| 1 | 牌面数据结构 | Card/Rank/Suit/CardSet(u64 bitset)/Deck | done |
| 2 | 手牌评估器 | 查找表优化, 7-card 12.9ns/eval, 77.8M/sec | done |
| 3 | 范围解析器 | PokerStove 语法 (AA, AKs, QQ-TT, ATs+ 等) | done |
| 4 | 胜率计算引擎 | 蒙特卡洛 6.2M sims/sec + 穷举枚举 | done |
| 5 | 翻牌面命中率分析 | Flopzilla 式: 范围在牌面上的牌力分布 + 听牌检测 | done |
| 6 | CLI 工具 | 命令行交互, clap 参数解析 | done |
| 7 | HTTP API | axum, /api/equity + /api/analysis, CORS 已开启 | done |
| 8 | 正确性验证 | 7 个 baseline 与 PokerStove 一致, 10K 随机交叉验证 | done |

### 下一步: 微信小程序前端

见 [docs/miniprogram-plan.md](docs/miniprogram-plan.md)

---

## 项目结构

```
range-zen/
├── crates/
│   ├── range-zen-core/        # 核心计算库
│   │   ├── src/
│   │   │   ├── card.rs        # 牌面数据结构
│   │   │   ├── eval.rs        # 手牌评估器 (查找表优化)
│   │   │   ├── range.rs       # 范围解析器
│   │   │   ├── equity.rs      # 胜率计算引擎
│   │   │   ├── analysis.rs    # 翻牌面命中率分析
│   │   │   └── lib.rs
│   │   └── benches/           # 性能基准测试
│   └── range-zen-api/         # HTTP API 服务
│       └── src/main.rs
├── src/main.rs                # CLI 工具
└── docs/
    ├── benchmark-report.md    # 性能与正确性报告
    ├── equity-test-report.md  # 范围胜率测试报告
    └── miniprogram-plan.md    # 小程序开发计划
```

---

## 快速开始

### 编译

```bash
cargo build --release
```

### CLI 使用

```bash
# 范围对范围 (蒙特卡洛)
./target/release/range-zen-cli "AA,KK,AKs" "QQ-TT,AQo+" -n 500000

# 精确计算特定手牌
./target/release/range-zen-cli "AhAd" "KhKd" --exact

# 指定公共牌
./target/release/range-zen-cli "AKs" "QQ" -b "AsKd2c"
```

### 启动 API 服务

```bash
./target/release/range-zen-api
# Range Zen API listening on 0.0.0.0:3000
```

---

## API 接口文档

### GET /api/health

健康检查。

```bash
curl http://localhost:3000/api/health
# Range Zen API v0.1.0
```

### POST /api/equity — 范围对范围胜率计算

计算两个或多个范围之间的胜率。

**请求:**

```json
{
  "ranges": ["AA,AKs", "QQ-TT,AQo+"],
  "board": "AhKd2c",
  "simulations": 100000,
  "exact": false
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|--------|------|
| ranges | string[] | 是 | - | 2-10 个范围, PokerStove 语法 |
| board | string | 否 | "" | 公共牌, 空字符串=翻前 |
| simulations | number | 否 | 100000 | 蒙特卡洛模拟次数, 最大 10,000,000 |
| exact | boolean | 否 | false | 精确枚举 (仅限 2 个单一手牌) |

**响应:**

```json
{
  "players": [
    {"equity": 0.8264, "win_pct": 0.8236, "tie_pct": 0.0054},
    {"equity": 0.1736, "win_pct": 0.1709, "tie_pct": 0.0054}
  ],
  "total_samples": 100000,
  "time_ms": 15.3
}
```

| 字段 | 说明 |
|------|------|
| equity | 总权益 = win% + tie%/2, 范围 0-1 |
| win_pct | 纯胜率, 范围 0-1 |
| tie_pct | 平局率, 范围 0-1 |
| total_samples | 实际评估的对局数 |
| time_ms | 计算耗时 (毫秒) |

**示例:**

```bash
# AA vs KK 翻前
curl -X POST http://localhost:3000/api/equity \
  -H "Content-Type: application/json" \
  -d '{"ranges":["AA","KK"],"simulations":100000}'

# 15% vs 30% 带翻牌面
curl -X POST http://localhost:3000/api/equity \
  -H "Content-Type: application/json" \
  -d '{"ranges":["66+,A5s+,KTs+,QJs,ATo+,KJo+","22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo"],"board":"AhKd7c","simulations":500000}'

# 精确枚举
curl -X POST http://localhost:3000/api/equity \
  -H "Content-Type: application/json" \
  -d '{"ranges":["AhAd","KhKd"],"exact":true}'
```

### POST /api/analysis — 翻牌面命中率分析

分析一个范围在指定公共牌上的牌力分布 (Flopzilla 式)。

**请求:**

```json
{
  "range": "66+,A5s+,KTs+,QJs,ATo+,KJo+,QJo",
  "board": "AhKd7c"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| range | string | 是 | 范围, PokerStove 语法 |
| board | string | 是 | 公共牌, 必须 3-5 张 |

**响应:**

```json
{
  "total_combos": 155,
  "categories": [
    {"name": "Three of a Kind",  "name_cn": "三条",            "count": 9,  "percentage": 5.81},
    {"name": "Two Pair",         "name_cn": "两对",            "count": 11, "percentage": 7.1},
    {"name": "Top Pair",         "name_cn": "顶对",            "count": 48, "percentage": 30.97},
    {"name": "Second Pair",      "name_cn": "第二对",           "count": 27, "percentage": 17.42},
    {"name": "Middle Pair",      "name_cn": "中间对子",          "count": 30, "percentage": 19.35},
    {"name": "Low Pair / Underpair", "name_cn": "低对 / 口袋小对", "count": 6,  "percentage": 3.87},
    {"name": "Gutshot",          "name_cn": "卡顺听牌",         "count": 16, "percentage": 10.32},
    {"name": "High Card / Air",  "name_cn": "高牌 / 空气",      "count": 24, "percentage": 15.48}
  ],
  "board": "AhKd7c",
  "time_ms": 0.03
}
```

牌力分类 (从强到弱):

| 英文 | 中文 | 说明 |
|------|------|------|
| Straight Flush | 同花顺 | |
| Four of a Kind | 四条 | |
| Full House | 葫芦 | |
| Flush | 同花 | |
| Straight | 顺子 | |
| Three of a Kind | 三条 | |
| Two Pair | 两对 | |
| Overpair | 超对 | 口袋对子大于所有公共牌 |
| Top Pair | 顶对 | 与最大公共牌配对 |
| Second Pair | 第二对 | 与第二大公共牌配对 |
| Middle Pair | 中间对子 | 口袋对子在公共牌之间 |
| Third Pair / Bottom Pair | 第三对 / 底对 | 与较小公共牌配对 |
| Low Pair / Underpair | 低对 / 口袋小对 | 口袋对子小于所有公共牌 |
| Flush Draw | 同花听牌 | 4 张同花 |
| Open-Ended Straight Draw | 两头顺子听牌 | 8 outs |
| Gutshot | 卡顺听牌 | 4 outs |
| Overcards | 两高张 | 两张手牌都大于所有公共牌 |
| High Card / Air | 高牌 / 空气 | 未击中 |

> 注: 一个 combo 可以同时属于一个成牌类别 + 多个听牌类别 (如顶对+同花听牌),
> 因此听牌百分比可能与成牌百分比有重叠, 总和可能超过 100%。

**示例:**

```bash
# 15% 范围在 AhKd7c 上的分布
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{"range":"66+,A5s+,KTs+,QJs,T9s,98s,ATo+,KJo+,QJo","board":"AhKd7c"}'

# 30% 范围在湿润牌面 7h8h9h 上的分布
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{"range":"22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo","board":"7h8h9h"}'
```

---

## 性能指标

| 指标 | 数值 |
|------|------|
| 7-card 评估 | 12.9 ns, 77.8 M/sec |
| MC 50万次模拟 | 81 ms |
| Preflop 精确枚举 | 95 ms |
| MC 吞吐量 | 6.2 M sims/sec |
| 翻牌面分析 (200 combos) | 0.03 ms |
| 查找表大小 | 40 KB |
| API 运行内存 | 1.9 MB |

---

## 范围语法参考

| 语法 | 含义 | Combos |
|------|------|:------:|
| `AA` | 一对A | 6 |
| `AKs` | AK同花 | 4 |
| `AKo` | AK不同花 | 12 |
| `AK` | AK所有 | 16 |
| `TT+` | TT及以上对子 | 30 |
| `ATs+` | AT同花及以上 | 16 |
| `QQ-TT` | QQ到TT | 18 |
| `ATs-A8s` | AT同花到A8同花 | 12 |
| `AhKs` | 特定组合 | 1 |

逗号分隔组合多个: `AA,KK,AKs,QQ-TT,ATo+`

常用范围百分比参考:

| 标签 | 范围 | Combos | 占比 |
|------|------|:------:|:----:|
| 5% | `TT+,AJs+,AKo,AQo` | 66 | 5.0% |
| 10% | `88+,A9s+,KJs+,KQs,ATo+,KQo` | 130 | 9.8% |
| 15% | `66+,A5s+,KTs+,QJs,T9s,98s,ATo+,KJo+,QJo` | 198 | 14.9% |
| 20% | `44+,A2s+,K9s+,QTs+,J9s+,T9s,98s,87s,A9o+,KTo+,QJo` | 266 | 20.1% |
| 30% | `22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo` | 390 | 29.4% |

---

## 详细文档

- [性能与正确性报告](docs/benchmark-report.md) — Baseline 对比、延迟测试、与 OMPEval 性能对比
- [范围胜率测试报告](docs/equity-test-report.md) — 16 组范围对范围测试数据、牌面纹理影响分析
- [小程序开发计划](docs/miniprogram-plan.md) — 架构设计、分阶段任务清单、部署配置参考
