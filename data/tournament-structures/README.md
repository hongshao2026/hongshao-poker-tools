# 赛事结构与模板数据

这个目录存放 Pro 工作流未来会用到的赛事模板、payout 曲线、PKO/Mystery 参数和来源记录。

原则:

- 只保存结构化参数，不保存整份外部 PDF、图片或网页内容。
- 每条模板都要有 `source_type`、`source_note`、`collected_at`。
- 官方资料会变，模板必须标注适用日期。
- 无法确认来源的模板只能标记为 `generic`，不要写成某个品牌/赛事的官方结构。

## 推荐字段

```json
{
  "id": "generic_mtt_15pct_itm",
  "name": "Generic MTT 15% ITM",
  "kind": "mtt",
  "source_type": "generic",
  "source_note": "Manually calibrated generic curve for research tools.",
  "collected_at": "2026-05-27",
  "params": {
    "itm_percent": 15,
    "field_size": 1000,
    "rake_percent": 10
  },
  "payouts": [
    { "place": 1, "percent": 18.0 }
  ]
}
```

## 数据优先级

P0 先做通用模板:

- `generic_mtt_15pct_itm`
- `generic_mtt_12pct_itm`
- `generic_pko_50pct_bounty`
- `generic_mystery_bounty`
- `generic_ft_deal`

P1 再补公开赛事:

- 官方公开 event PDF 中的 buy-in、rake、starting stack、blind level、payout 范围。
- 线上平台公开帮助页中的 payout 规则。
- 用户手动录入并明确标注来源的现场赛结构。

不要把外部赛事数据硬编码进计算模块。计算模块只接受普通对象，模板读取由 UI / Pro 工作流处理。
