import { useState, useMemo, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Area, Bar, ScatterChart, Scatter, ZAxis } from "recharts";
import {
  MODEL, refROI, calcSigma, recommendMarkup, adjustSigmaForShape,
  calibratedModel, theoreticalModel, FELIX_TABLE,
} from "../../../packages/core/staking/mtt-model.js";
import { readProAccess } from "../../../assets/pro-access.js";

// ============================================================
// 模型参数说明 (实际定义已迁移到 packages/core/staking/mtt-model.js):
//
// - 核心公式 g ≈ μ²/(2σ²) 来自 Kelly 标准与 Felix 文章
// - markup_slope 来自 Felix 表精确拟合(双方对半分 ROI 的均衡点)
// - sigma / top1 用 9 个真实 GG 锦标赛数据点校准 (R² > 0.99):
//     σ_BI = 0.908 × N^0.286
//     top1_BI = 0.813 × N^0.738
// - GG 奖励结构特征:
//   * 钱圈率约 14% (小场子 11-17% 略有波动)
//   * 大场子(>200人)前 9 名固定等比 1.297
//   * 小场子更陡: 137人 1.188 / 59人 1.420 / 18人 1.980
//   * min cash 约 2 BI
// - type_mult 用业界共识 (无真实 PKO/Mystery 数据)
//
// calcTop1BI 因依赖本文件内的 generateGGPayout，未抽出。
// ============================================================


// 冠军赔率(直接从 generateGGPayout 取真实赔率,跟 12 个数据点拟合)
const calcTop1BI = (field, type) => {
  // generateGGPayout 已经精确拟合了 12 个真实数据点,误差 < 5%
  // 这里调用它获取真实冠军赔率
  const payouts = generateGGPayout(field, type);
  return payouts[0] || (MODEL.top1_constant * Math.pow(field, MODEL.top1_exp));
};

// ============================================================
// 颜色与样式系统
// ============================================================
// Aligned with the portal-wide palette (assets/shared.css).
const C = {
  bg: "#0a0a0c",
  panel: "#131318",
  panelLight: "#1a1a21",
  border: "#2a2a35",
  borderBright: "#3d3d4d",
  accent: "#d4ff3a",      // lime
  accentDim: "#8aa820",
  good: "#3affb0",
  bad: "#ff6b4a",
  blue: "#4ac8ff",
  purple: "#a78bfa",
  text: "#ececf2",
  textDim: "#a0a0b0",
  textFaint: "#6f6f7c",
};

// ============================================================
// 主组件
// ============================================================
const VALID_TABS = ["calc", "reverse", "quiz", "sim", "ladder"];

// Each hash deep-links to a standalone sub-tool with its own header.
const TAB_META = {
  calc:    { title: "MTT 卖股计算器", subtitle: "该卖多少 · Markup 收多少 · 最优增长" },
  reverse: { title: "反推 BR",         subtitle: "给定目标 → 反推所需 bankroll" },
  quiz:    { title: "风格自测",        subtitle: "几分钟问卷 → 推荐 BRM 风格" },
  sim:     { title: "曲线模拟",        subtitle: "Monte Carlo · 盈亏曲线" },
  ladder:  { title: "锦标赛升级模拟",  subtitle: "MTT 阶梯式升级 · 成功率 / 时间" },
};

function readHashTab() {
  if (typeof window === "undefined") return "calc";
  const h = window.location.hash.replace(/^#/, "");
  return VALID_TABS.includes(h) ? h : "calc";
}

export default function Calculator() {
  const [tab, setTab] = useState(readHashTab);

  useEffect(() => {
    const onHash = () => setTab(readHashTab());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
      padding: "24px",
    }}>
      <Header tab={tab} />
      {tab === "calc" && <CalculatorTab />}
      {tab === "reverse" && <ReverseTab />}
      {tab === "sim" && <MonteCarloTab availableModes={["fixed", "continuous"]} defaultMode="fixed" tabKey="sim" />}
      {tab === "ladder" && <MonteCarloTab availableModes={["ladder"]} defaultMode="ladder" tabKey="ladder" />}
      {tab === "quiz" && <QuizTab />}
      <Footer />
    </div>
  );
}

function Header({ tab }) {
  const meta = TAB_META[tab] || TAB_META.calc;
  return (
    <div style={{
      maxWidth: 1400, margin: "0 auto",
      marginBottom: 24, paddingBottom: 18,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{
          margin: 0,
          fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
          fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px",
          color: C.text,
        }}>
          {meta.title}
        </h1>
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 12, color: C.textFaint, letterSpacing: "0.04em",
        }}>
          {meta.subtitle}
        </span>
        <ProStatusBadge />
      </div>
    </div>
  );
}

function ProStatusBadge() {
  const [access, setAccess] = useState(readProAccess());

  useEffect(() => {
    const refresh = () => setAccess(readProAccess());
    window.addEventListener("hongshao:pro-access-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("hongshao:pro-access-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      border: `1px solid ${access ? "rgba(58,255,176,0.42)" : "rgba(255,210,58,0.38)"}`,
      color: access ? C.good : C.solved,
      background: access ? "rgba(58,255,176,0.08)" : "rgba(255,210,58,0.08)",
      borderRadius: 999,
      padding: "5px 9px",
      fontSize: 10,
      letterSpacing: "0.08em",
    }}>
      {access ? `PRO ACTIVE · ${access.plan}` : "PRO PREVIEW"}
    </span>
  );
}

function Footer() {
  return (
    <div style={{ maxWidth: 1400, margin: "32px auto 0", paddingTop: 24, borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.textFaint, lineHeight: 1.7 }}>
      <div>核心模型基于 FelixD 文章《The Roman Extraction》《Flaws in Monte Carlo Simulations》的数学论证 · 类型方差系数采用扑克社区/GTO Wizard 业界共识 · 仅供学习参考,不替代个人 BRM 决策</div>
      <div>核心公式:g ≈ m/BR − v/(2·BR²)  ·  s* = 1 − BR·BI·(ROI − (MU−1)) / σ²  ·  Kelly: f* = μ/(σ²+μ²)</div>
    </div>
  );
}

// ============================================================
// 计算器标签页
// ============================================================
function CalculatorTab() {
  const [buyin, setBuyin] = useState(109);
  const [field, setField] = useState(1000);
  const [type, setType] = useState("Standard");
  const [BR, setBR] = useState(20000);
  const [roi, setRoi] = useState(15);
  const [useRefROI, setUseRefROI] = useState(false);
  const [autoMarkup, setAutoMarkup] = useState(true);
  const [customMarkup, setCustomMarkup] = useState(1.07);
  const [shape, setShape] = useState(0.5);

  const effectiveROI = useRefROI ? refROI(field, buyin) : roi;
  const markup = autoMarkup ? recommendMarkup(effectiveROI / 100) : customMarkup;

  const calibrated = useMemo(() => calibratedModel({
    buyin, field, roi: effectiveROI, BR, type, markup, shape,
  }), [buyin, field, effectiveROI, BR, type, markup, shape]);

  const theoretical = useMemo(() => theoreticalModel({
    buyin, field, roi: effectiveROI, BR, type, markup, shape,
  }), [buyin, field, effectiveROI, BR, type, markup, shape]);

  // 卖股比例曲线数据
  const curveData = useMemo(() => {
    const points = [];
    const sigmaBI = adjustSigmaForShape(calcSigma(field, type), shape);
    const sigma_d = sigmaBI * buyin;
    const mu_d = (effectiveROI / 100) * buyin;
    for (let s = 0; s <= 1.001; s += 0.025) {
      const oneMinusS = 1 - s;
      const m = oneMinusS * mu_d + s * (markup - 1) * buyin;
      const v = oneMinusS * oneMinusS * sigma_d * sigma_d;
      const g = m / BR - v / (2 * BR * BR);
      points.push({
        s: +(s * 100).toFixed(0),
        ce: +(g * BR).toFixed(3),
      });
    }
    return points;
  }, [buyin, field, effectiveROI, BR, type, markup, shape]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 输入面板（横向 grid 由 CSS .mtt-input-panel 控制）*/}
      <div className="mtt-input-panel" style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
        <SectionTitle>输入参数</SectionTitle>

        <Field label="买入 (Buy-in, $)">
          <NumberInput value={buyin} onChange={setBuyin} style={inputStyle} min={1} />
        </Field>

        <Field label="参赛人数 (Field Size)">
          <NumberInput value={field} onChange={setField} style={inputStyle} min={1} />
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {[100, 200, 300, 500, 1000, 1500, 2000, 3000, 5000].map(f => (
              <button key={f} onClick={() => setField(f)} style={chipStyle(field === f)}>
                {f >= 1000 ? `${f/1000}K` : f}
              </button>
            ))}
          </div>
        </Field>

        <TypeSelector type={type} setType={setType} />

        <Field label="资金 BR ($)">
          <NumberInput value={BR} onChange={setBR} style={inputStyle} min={1} />
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {[5000, 10000, 20000, 50000, 100000].map(b => (
              <button key={b} onClick={() => setBR(b)} style={chipStyle(BR === b)}>
                ${b >= 1000 ? `${b/1000}K` : b}
              </button>
            ))}
          </div>
        </Field>

        <Field label={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>ROI (%)</span>
            <label style={{ fontSize: 11, color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={useRefROI} onChange={e => setUseRefROI(e.target.checked)} />
              用 Felix 参考值
            </label>
          </div>
        }>
          <NumberInput value={effectiveROI} onChange={v => { setRoi(v); setUseRefROI(false); }}
            disabled={useRefROI} decimals={1}
            style={{ ...inputStyle, opacity: useRefROI ? 0.6 : 1 }} />
          {useRefROI && (
            <div style={{ fontSize: 10, color: C.accent, marginTop: 4 }}>
              基于 field={field} BI=${buyin} 推算: {refROI(field, buyin).toFixed(1)}%
            </div>
          )}
        </Field>

        <PlayStyleSelector shape={shape} setShape={setShape} />

        <Field label={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Markup (溢价)</span>
            <label style={{ fontSize: 11, color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={autoMarkup} onChange={e => setAutoMarkup(e.target.checked)} />
              自动推荐
            </label>
          </div>
        }>
          <NumberInput value={markup} onChange={v => { setCustomMarkup(v); setAutoMarkup(false); }}
            disabled={autoMarkup} decimals={3}
            style={{ ...inputStyle, opacity: autoMarkup ? 0.6 : 1 }} />
          {autoMarkup && (
            <div style={{ fontSize: 10, color: C.accent, marginTop: 4 }}>
              ≈ 1 + 0.5 × ROI = {markup.toFixed(3)}
            </div>
          )}
        </Field>
      </div>

      {/* 右侧结果显示 */}
      <div>
        {/* 动态诊断面板 */}
        <DiagnosticPanel
          BR={BR} buyin={buyin} field={field} type={type}
          roi={effectiveROI} optSale={calibrated.optSale}
          sigmaBI={calibrated.sigmaBI}
        />

        {/* 关键指标卡片 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <BigStat
            label="最优卖出比例"
            value={`${(calibrated.optSale * 100).toFixed(1)}%`}
            sub={`自留 ${((1 - calibrated.optSale) * 100).toFixed(1)}%`}
            color={C.accent}
            big
          />
          <BigStat
            label="推荐 Markup"
            value={markup.toFixed(3)}
            sub={`溢价 ${((markup - 1) * 100).toFixed(1)}%`}
            color={C.blue}
          />
          <BigStat
            label="单子弹 CE 增长"
            value={`$${calibrated.ceGrowth.toFixed(2)}`}
            sub={`不卖股: $${calibrated.ceSelfOnly.toFixed(2)}`}
            color={calibrated.ceGrowth > 0 ? C.good : C.bad}
          />
          <BigStat
            label="单子弹自留方差"
            value={`${(calibrated.sigmaBI * (1 - calibrated.optSale)).toFixed(1)} BI`}
            sub={`不卖时 ${calibrated.sigmaBI.toFixed(1)} BI`}
            color={C.purple}
          />
        </div>

        {/* 详细数据表 */}
        <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <SectionTitle>详细数据</SectionTitle>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              <DataRow label="单子弹自留期望" value={"$" + calibrated.expectedSelf.toFixed(2)}
                hint={`其中 markup 现金: $${(calibrated.optSale * (markup - 1) * buyin).toFixed(2)}`} />
              <DataRow label="单子弹自留方差 (美元²)" value={"$" + (Math.pow((1 - calibrated.optSale) * calibrated.sigmaBI * buyin, 2)).toFixed(0).toLocaleString()}
                hint={`不卖时方差: $${Math.pow(calibrated.sigmaBI * buyin, 2).toFixed(0).toLocaleString()}`} />
              <DataRow label="资金倍数 BR/BI" value={(BR / buyin).toFixed(0) + " 个买入"}
                hint={(BR / buyin) < 50 ? "偏紧" : (BR / buyin) < 100 ? "正常" : (BR / buyin) < 200 ? "充裕" : "宽松"} />
              <DataRow label="Kelly 单注理论上限" value={"$" + theoretical.kellyBI.toFixed(0)}
                hint={`= ${(theoretical.kellyBI / buyin).toFixed(1)} 个 BI(纯打不卖时,资金允许的最大单次投注)`} />
              <DataRow label="预计单场时间" value={"~6 小时"}
                hint={`平均时薪 (期望): $${(calibrated.expectedSelf / 6).toFixed(2)}/h`} last />
            </tbody>
          </table>
        </div>

        {/* CE 增长曲线 */}
        <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
          <SectionTitle>CE 增长 vs 卖股比例</SectionTitle>
          <div style={{ height: 280, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curveData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
                <XAxis dataKey="s" stroke={C.textDim} fontSize={11}
                  label={{ value: "卖出比例 (%)", position: "insideBottom", offset: -10, fill: C.textDim, fontSize: 11 }} />
                <YAxis stroke={C.textDim} fontSize={11}
                  label={{ value: "CE 增长 ($/子弹)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: C.panelLight, border: `1px solid ${C.borderBright}`, borderRadius: 6, fontSize: 12 }}
                  labelFormatter={l => `卖出 ${l}%`}
                  formatter={v => [`$${v.toFixed(3)}`, "CE 增长"]} />
                <ReferenceLine y={0} stroke={C.borderBright} strokeDasharray="3 3" />
                <ReferenceLine x={Math.round(calibrated.optSale * 100 / 2.5) * 2.5} stroke={C.accent} strokeWidth={2}
                  label={{ value: "最优", position: "top", fill: C.accent, fontSize: 11 }} />
                <Line type="monotone" dataKey="ce" stroke={C.accent} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8, lineHeight: 1.6 }}>
            曲线峰值就是最优卖出比例。不卖(s=0)时 CE 可能为负——意味着资金会缩水;卖到峰值右边继续上升时,markup 收入主导;但卖光(s=1)激励就没了。
          </div>
        </div>

        {/* 健康度警告 */}
        <HealthCheck
          calibrated={calibrated}
          theoretical={theoretical}
          buyin={buyin}
          BR={BR}
          field={field}
          roi={effectiveROI}
        />

        <StakingReportPanel
          buyin={buyin}
          field={field}
          type={type}
          BR={BR}
          roi={effectiveROI}
          markup={markup}
          shape={shape}
          calibrated={calibrated}
          theoretical={theoretical}
        />
      </div>
    </div>
  );
}

// ============================================================
// Pro MVP:卖股报告生成器
// ============================================================
const REPORT_STORAGE_KEY = "hongshao_staking_reports_v1";

function StakingReportPanel({ buyin, field, type, BR, roi, markup, shape, calibrated, theoretical }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState(() => readReportHistory());
  const report = useMemo(() => {
    const salePct = calibrated.optSale * 100;
    const retainPct = 100 - salePct;
    const markupPremium = (markup - 1) * 100;
    const markupCash = calibrated.optSale * (markup - 1) * buyin;
    const selfEV = (1 - calibrated.optSale) * (roi / 100) * buyin;
    const brMultiple = BR / buyin;
    const riskTone =
      calibrated.ceGrowth < 0 ? "不建议按当前参数出赛" :
      calibrated.ceSelfOnly < 0 ? "建议必须卖股降方差" :
      salePct > 80 ? "资金偏紧,建议卖出大部分股份" :
      salePct > 50 ? "资金合理,卖股用于平滑方差" :
      "资金较充裕,卖股主要用于分散风险";
    const styleName =
      shape <= 0.2 ? "稳健入围型" :
      shape >= 0.8 ? "搏深跑型" :
      "均衡型";
    const generatedAt = new Date().toLocaleString("zh-CN", { hour12: false });

    return {
      salePct,
      retainPct,
      markupPremium,
      markupCash,
      selfEV,
      brMultiple,
      riskTone,
      styleName,
      generatedAt,
      summary: {
        buyin,
        field,
        type,
        BR,
        roi,
        markup,
        salePct,
        retainPct,
        ceGrowth: calibrated.ceGrowth,
      },
      markdown: [
        "# MTT 卖股研究报告",
        "",
        `生成时间: ${generatedAt}`,
        "",
        "## 结论",
        "",
        `- 推荐卖出比例: ${salePct.toFixed(1)}%`,
        `- 建议自留比例: ${retainPct.toFixed(1)}%`,
        `- 推荐 Markup: ${markup.toFixed(3)} (溢价 ${markupPremium.toFixed(1)}%)`,
        `- 单子弹 CE 增长: $${calibrated.ceGrowth.toFixed(2)}`,
        `- 风险判断: ${riskTone}`,
        "",
        "## 输入假设",
        "",
        `- Buy-in: $${fmtReportNumber(buyin)}`,
        `- Field size: ${fmtReportNumber(field)} 人`,
        `- 比赛类型: ${type}`,
        `- Bankroll: $${fmtReportNumber(BR)}`,
        `- ROI 假设: ${roi.toFixed(1)}%`,
        `- 玩家风格: ${styleName}`,
        `- BR/BI: ${brMultiple.toFixed(0)} 个买入`,
        "",
        "## 收益拆分",
        "",
        `- 自留打牌期望: $${selfEV.toFixed(2)}`,
        `- Markup 现金收入: $${markupCash.toFixed(2)}`,
        `- 单子弹自留总期望: $${calibrated.expectedSelf.toFixed(2)}`,
        `- 不卖股 CE: $${calibrated.ceSelfOnly.toFixed(2)}`,
        `- 卖股后自留标准差: ${(calibrated.sigmaBI * (1 - calibrated.optSale)).toFixed(1)} BI`,
        `- 不卖股标准差: ${calibrated.sigmaBI.toFixed(1)} BI`,
        "",
        "## 使用边界",
        "",
        "- 本报告仅用于概率研究、资金管理模拟和赛程估值复盘。",
        "- 结果依赖输入假设,不构成投资建议、交易撮合或收益承诺。",
        "- 实际执行前应重新确认赛事结构、奖池、rake、PKO/Mystery 规则和个人 bankroll。",
        "",
        "Generated by Hongshao Poker Tools."
      ].join("\n")
    };
  }, [buyin, field, type, BR, roi, markup, shape, calibrated, theoretical]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const downloadReport = () => {
    const blob = new Blob([report.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hongshao-staking-report-${field}-${buyin}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const htmlReport = useMemo(() => buildStakingHtmlReport(report, { buyin, field, type, BR, roi, markup, calibrated }), [report, buyin, field, type, BR, roi, markup, calibrated]);

  const openPrintReport = () => {
    const win = window.open("", "_blank", "noopener,noreferrer,width=980,height=1200");
    if (!win) return;
    win.document.open();
    win.document.write(htmlReport);
    win.document.close();
  };

  const downloadHtmlReport = () => {
    const blob = new Blob([htmlReport], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hongshao-staking-report-${field}-${buyin}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const saveReport = () => {
    const item = {
      id: `${Date.now()}-${field}-${buyin}`,
      title: `${type} $${buyin} / ${field}人 / 卖出 ${report.salePct.toFixed(1)}%`,
      createdAt: new Date().toISOString(),
      generatedAt: report.generatedAt,
      summary: report.summary,
      markdown: report.markdown,
    };
    const next = [item, ...history.filter(h => h.id !== item.id)].slice(0, 20);
    writeReportHistory(next);
    setHistory(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const exportHistory = () => {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "hongshao-staking-report-history.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const clearHistory = () => {
    writeReportHistory([]);
    setHistory([]);
  };

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.solved}55`, marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <SectionTitle>Pro 报告生成器 MVP</SectionTitle>
          <div style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.6 }}>
            把当前计算结果整理成可发送的 Markdown 报告。后续会扩展长图、PDF、模板和历史记录。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={copyReport} style={reportButtonStyle(C.solved)}>
            {copied ? "已复制" : "复制报告"}
          </button>
          <button onClick={downloadReport} style={reportButtonStyle(C.blue)}>
            下载 .md
          </button>
          <button onClick={openPrintReport} style={reportButtonStyle(C.solved)}>
            打印 / PDF
          </button>
          <button onClick={downloadHtmlReport} style={reportButtonStyle(C.purple)}>
            下载 HTML
          </button>
          <button onClick={saveReport} style={reportButtonStyle(C.good)}>
            {saved ? "已保存" : "保存到本机"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
        <ReportMetric label="推荐卖出" value={`${report.salePct.toFixed(1)}%`} />
        <ReportMetric label="建议自留" value={`${report.retainPct.toFixed(1)}%`} />
        <ReportMetric label="Markup" value={markup.toFixed(3)} />
        <ReportMetric label="风险判断" value={report.riskTone} compact />
      </div>

      <textarea
        readOnly
        value={report.markdown}
        style={{
          width: "100%",
          minHeight: 280,
          resize: "vertical",
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          color: C.textDim,
          padding: 14,
          fontSize: 12,
          lineHeight: 1.65,
          fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 16, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>打印版报告预览</div>
            <div style={{ fontSize: 11, color: C.textFaint, marginTop: 3 }}>适合浏览器打印为 PDF 或直接发送 HTML 文件。</div>
          </div>
          <div style={{ fontSize: 11, color: C.solved, fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace" }}>
            PDF READY
          </div>
        </div>
        <iframe
          title="staking-report-preview"
          srcDoc={htmlReport}
          style={{
            width: "100%",
            height: 520,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: "#ffffff",
          }}
        />
      </div>

      <div style={{ marginTop: 16, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>本地报告历史</div>
            <div style={{ fontSize: 11, color: C.textFaint, marginTop: 3 }}>最多保留最近 20 份,只存当前浏览器。</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={exportHistory} disabled={history.length === 0} style={reportButtonStyle(C.blue)}>
              导出 JSON
            </button>
            <button onClick={clearHistory} disabled={history.length === 0} style={reportButtonStyle(C.bad)}>
              清空
            </button>
          </div>
        </div>
        {history.length === 0 ? (
          <div style={{ color: C.textFaint, fontSize: 12, padding: "8px 0" }}>还没有保存的报告。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.slice(0, 5).map(item => (
              <div key={item.id} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
                background: C.panelLight,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: "10px 12px",
              }}>
                <div>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                  <div style={{ color: C.textFaint, fontSize: 10, marginTop: 2 }}>
                    {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(item.markdown)}
                  style={reportButtonStyle(C.textDim)}
                >
                  复制
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function readReportHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REPORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeReportHistory(history) {
  try {
    window.localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage may be unavailable in privacy modes; report generation still works.
  }
}

function buildStakingHtmlReport(report, ctx) {
  const rows = [
    ["Buy-in", `$${fmtReportNumber(ctx.buyin)}`],
    ["Field size", `${fmtReportNumber(ctx.field)} 人`],
    ["比赛类型", ctx.type],
    ["Bankroll", `$${fmtReportNumber(ctx.BR)}`],
    ["ROI 假设", `${ctx.roi.toFixed(1)}%`],
    ["Markup", `${ctx.markup.toFixed(3)} (${report.markupPremium.toFixed(1)}%)`],
    ["BR/BI", `${report.brMultiple.toFixed(0)} 个买入`],
  ];
  const economics = [
    ["自留打牌期望", `$${report.selfEV.toFixed(2)}`],
    ["Markup 现金收入", `$${report.markupCash.toFixed(2)}`],
    ["单子弹自留总期望", `$${ctx.calibrated.expectedSelf.toFixed(2)}`],
    ["单子弹 CE 增长", `$${ctx.calibrated.ceGrowth.toFixed(2)}`],
    ["不卖股 CE", `$${ctx.calibrated.ceSelfOnly.toFixed(2)}`],
    ["卖股后自留标准差", `${(ctx.calibrated.sigmaBI * (1 - ctx.calibrated.optSale)).toFixed(1)} BI`],
    ["不卖股标准差", `${ctx.calibrated.sigmaBI.toFixed(1)} BI`],
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>MTT 卖股研究报告</title>
<style>
  :root {
    color-scheme: light;
    --ink: #101014;
    --muted: #62626d;
    --line: #dedee6;
    --soft: #f5f5f7;
    --accent: #b6e51f;
    --accent2: #12b981;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #eeeeef;
    color: var(--ink);
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
    line-height: 1.55;
  }
  .page {
    width: 794px;
    min-height: 1123px;
    margin: 24px auto;
    background: #fff;
    padding: 48px;
    box-shadow: 0 20px 60px rgba(0,0,0,.12);
  }
  .topline {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: flex-start;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 18px;
  }
  .brand {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  h1 {
    margin: 10px 0 0;
    font-size: 34px;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .stamp {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    min-width: 190px;
    text-align: right;
    font-size: 12px;
    color: var(--muted);
  }
  .stamp strong {
    display: block;
    color: var(--ink);
    font-size: 16px;
    margin-bottom: 2px;
  }
  .hero-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin: 28px 0;
  }
  .metric {
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 14px;
    background: var(--soft);
    min-height: 106px;
  }
  .metric .label {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: .08em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .metric .value {
    font-size: 26px;
    font-weight: 800;
    line-height: 1.05;
  }
  .metric.accent {
    background: #f3ffd0;
    border-color: #d4f36c;
  }
  .section {
    margin-top: 26px;
  }
  .section h2 {
    font-size: 16px;
    margin: 0 0 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  td {
    padding: 9px 0;
    border-bottom: 1px solid var(--line);
  }
  td:first-child { color: var(--muted); }
  td:last-child { text-align: right; font-weight: 700; }
  .verdict {
    margin-top: 18px;
    border-left: 5px solid var(--accent2);
    background: #ecfdf5;
    padding: 14px 16px;
    border-radius: 0 8px 8px 0;
  }
  .verdict strong {
    display: block;
    font-size: 17px;
    margin-bottom: 4px;
  }
  .fineprint {
    margin-top: 28px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 11px;
  }
  .footer {
    margin-top: 20px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: var(--muted);
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 10px;
  }
  @media print {
    body { background: #fff; }
    .page { margin: 0; width: auto; min-height: auto; box-shadow: none; }
  }
</style>
</head>
<body>
  <main class="page">
    <div class="topline">
      <div>
        <div class="brand">Hongshao Poker Tools · Research Report</div>
        <h1>MTT 卖股研究报告</h1>
      </div>
      <div class="stamp">
        <strong>${escapeReportHtml(report.generatedAt)}</strong>
        仅供概率研究与复盘
      </div>
    </div>

    <section class="hero-grid">
      <div class="metric accent"><div class="label">推荐卖出</div><div class="value">${report.salePct.toFixed(1)}%</div></div>
      <div class="metric"><div class="label">建议自留</div><div class="value">${report.retainPct.toFixed(1)}%</div></div>
      <div class="metric"><div class="label">Markup</div><div class="value">${ctx.markup.toFixed(3)}</div></div>
      <div class="metric"><div class="label">CE 增长</div><div class="value">$${ctx.calibrated.ceGrowth.toFixed(2)}</div></div>
    </section>

    <div class="verdict">
      <strong>${escapeReportHtml(report.riskTone)}</strong>
      推荐参数基于当前 buy-in、field、ROI、bankroll、markup 与玩家风格假设。实际执行前应重新确认赛事结构和个人资金约束。
    </div>

    <section class="section">
      <h2>输入假设</h2>
      <table>${rows.map(([k, v]) => `<tr><td>${escapeReportHtml(k)}</td><td>${escapeReportHtml(v)}</td></tr>`).join("")}</table>
    </section>

    <section class="section">
      <h2>收益与风险拆分</h2>
      <table>${economics.map(([k, v]) => `<tr><td>${escapeReportHtml(k)}</td><td>${escapeReportHtml(v)}</td></tr>`).join("")}</table>
    </section>

    <section class="section">
      <h2>使用边界</h2>
      <p class="fineprint">
        本报告仅用于概率研究、资金管理模拟和赛程估值复盘。不提供赌博、下注、资金托管、交易撮合或赛事组织。
        计算结果依赖用户输入假设，不构成投资建议、交易建议或收益承诺。
      </p>
    </section>

    <div class="footer">
      <span>Generated by Hongshao Poker Tools</span>
      <span>Local-first · No data upload</span>
    </div>
  </main>
</body>
</html>`;
}

function escapeReportHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function ReportMetric({ label, value, compact }) {
  return (
    <div style={{ background: C.panelLight, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, minHeight: 72 }}>
      <div style={{ fontSize: 10, color: C.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: compact ? 12 : 20, color: C.text, fontWeight: 700, lineHeight: 1.35 }}>{value}</div>
    </div>
  );
}

function reportButtonStyle(color) {
  return {
    background: `${color}18`,
    border: `1px solid ${color}66`,
    color,
    padding: "9px 12px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "inherit",
  };
}

function fmtReportNumber(n) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

// ============================================================
// Felix 原表标签页
// ============================================================
// ============================================================
// 策略对比面板:展示不同卖出比例下的盈利组成、几何增长、翻倍所需子弹数
function StrategyComparison({ buyin, sigma_d_sq, roiFrac, markup, BR, targetRetain }) {
  // 自动选 3 个对比策略:全自打 / 用户目标 / 极端卖
  const targetSell = 1 - targetRetain / 100;
  const strategies = [
    { name: "全自打", subtitle: "s = 0", sell: 0, color: "#ef4444" },
    { 
      name: `你的目标`, 
      subtitle: `自留 ${targetRetain}%, 卖 ${(targetSell * 100).toFixed(0)}%`,
      sell: targetSell, 
      color: "#3b82f6",
      isTarget: true,
    },
    { name: "卖 90%", subtitle: "s = 0.9", sell: 0.9, color: "#10b981" },
  ];

  const calcOne = (s) => {
    const selfEV = (1 - s) * roiFrac * buyin;
    const markupCash = s * (markup - 1) * buyin;
    const totalEV = selfEV + markupCash;
    const variance = (1 - s) * (1 - s) * sigma_d_sq;
    const sd = Math.sqrt(variance);
    const g = totalEV / BR - variance / (2 * BR * BR);
    const bulletsToDouble = g > 0 ? Math.log(2) / g : Infinity;
    return { selfEV, markupCash, totalEV, sd, g, bulletsToDouble, riskFreeRatio: totalEV > 0 ? markupCash / totalEV : 0 };
  };

  const results = strategies.map(s => ({ ...s, ...calcOne(s.sell) }));

  return (
    <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
      <SectionTitle>策略对比 — markup 收入是无风险的吗?</SectionTitle>
      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 16, lineHeight: 1.6 }}>
        卖股带来两块东西:① 自留打牌的部分(有方差)② markup 现金(无风险,投资人付的溢价)。
        下表用 BR=${Math.round(BR).toLocaleString()} 算每颗子弹的盈利组成,以及资金翻倍所需子弹数。
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {results.map((r, i) => (
          <div key={i} style={{
            background: r.isTarget ? `${r.color}15` : C.panelLight,
            border: `1px solid ${r.isTarget ? r.color : C.border}`,
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: r.color, marginBottom: 2 }}>
              {r.name}
            </div>
            <div style={{ fontSize: 10, color: C.textFaint, marginBottom: 12 }}>
              {r.subtitle}
            </div>

            {/* 盈利组成 */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                单子弹盈利组成
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.textDim }}>打牌期望(有方差)</span>
                  <span style={{ fontFamily: "monospace", color: C.text }}>${r.selfEV.toFixed(2)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.good }}>markup 现金(无风险)</span>
                  <span style={{ fontFamily: "monospace", color: C.good, fontWeight: 600 }}>
                    ${r.markupCash.toFixed(2)}
                  </span>
                </div>
                <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>总期望</span>
                  <span style={{ fontFamily: "monospace", color: C.text, fontWeight: 600 }}>
                    ${r.totalEV.toFixed(2)}
                  </span>
                </div>
                {r.totalEV > 0 && (
                  <div style={{ fontSize: 10, color: C.good, textAlign: "right", marginTop: 2 }}>
                    无风险占比 {(r.riskFreeRatio * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            </div>

            {/* 风险与增长 */}
            <div>
              <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                风险与增长
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.textDim }}>每子弹标准差</span>
                  <span style={{ fontFamily: "monospace", color: C.purple }}>
                    ${r.sd.toFixed(0)}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.textDim }}>几何增长</span>
                  <span style={{ fontFamily: "monospace", color: r.g > 0 ? C.good : C.bad, fontWeight: 600 }}>
                    {r.g > 0 ? "+" : ""}{(r.g * 10000).toFixed(1)} bps
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: C.textDim }}>资金翻倍需要</span>
                  <span style={{ fontFamily: "monospace", color: r.g > 0 ? C.text : C.bad, fontWeight: 600 }}>
                    {r.bulletsToDouble === Infinity 
                      ? "永远不会 ✕" 
                      : `${Math.round(r.bulletsToDouble).toLocaleString()} 颗`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 结论说明 */}
      <div style={{ marginTop: 14, padding: 12, background: C.panelLight, borderRadius: 8, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
        <span style={{ color: C.accent, fontWeight: 600 }}>📐 关键观察</span>:
        markup 现金是<b style={{ color: C.good }}>无风险收入</b> —— 不管你打成什么样,投资人付的溢价就是溢价。
        卖得越多,这部分占比越高,等于把"靠运气赚钱"逐步换成"靠中介费赚钱"。
        如果"全自打"那一栏的几何增长是负数,意味着你的资金<b style={{ color: C.bad }}>不够厚</b>——
        不卖股你会越打越穷,而卖股能让你"借市场的力"复利。
      </div>
    </div>
  );
}

// 反推工具:给定赛事 + 目标自留,反推所需 BR
// ============================================================
function ReverseTab() {
  const [buyin, setBuyin] = useState(109);
  const [field, setField] = useState(1000);
  const [type, setType] = useState("Standard");
  const [roi, setRoi] = useState(15);
  const [useRefROI, setUseRefROI] = useState(false);
  const [shape, setShape] = useState(0.5);
  const [targetRetain, setTargetRetain] = useState(50); // 目标自留 %
  const [autoMarkup, setAutoMarkup] = useState(true);
  const [customMarkup, setCustomMarkup] = useState(1.07);
  const [mode, setMode] = useState("market"); // market | kelly

  const effectiveROI = useRefROI ? refROI(field, buyin) : roi;
  const roiFrac = effectiveROI / 100;
  const markup = autoMarkup ? recommendMarkup(roiFrac) : customMarkup;
  
  const sigmaBI = adjustSigmaForShape(calcSigma(field, type), shape);
  const sigma_d_sq = Math.pow(sigmaBI * buyin, 2);
  
  // 两种反推模式:
  // 
  // 1. 市场模式 (market):
  //    "在 markup 市场环境下,资金多大时模型推荐的最优卖出 = 我的目标自留"
  //    BR = 自留比例 × σ² / [BI × (ROI - 溢价)]
  //    跟 markup 有关。自留 100% 时表示"资金大到可以拒绝市场上的免费溢价"。
  //
  // 2. Kelly 模式 (kelly):
  //    "我自留这个比例打,资金多大时几何增长 ≥ 0(不会被方差吃掉)"
  //    自留 s_self 部分:期望 = s_self × ROI × BI,方差 = s_self² × σ²
  //    g ≥ 0 → BR ≥ s_self² × σ² / (2 × s_self × BI × ROI) = s_self × σ² / (2 × BI × ROI)
  //    跟 markup 无关。这是"安全自打的最低 BR"。
  
  const calcRequiredBR = (retainPct) => {
    const s_self = retainPct / 100;
    if (mode === "kelly") {
      // BR ≥ s_self × σ² / (2 × BI × ROI)
      const denom = 2 * buyin * roiFrac;
      return denom > 0 ? s_self * sigma_d_sq / denom : Infinity;
    } else {
      // 市场模式
      const denom = buyin * (roiFrac - (markup - 1));
      return denom > 0 ? s_self * sigma_d_sq / denom : Infinity;
    }
  };
  
  const requiredBR = calcRequiredBR(targetRetain);

  // 几个常见目标的对应 BR
  const targets = [
    { retain: 5, label: "5% (几乎纯卖)" },
    { retain: 12, label: "12% (罗曼大场风格)" },
    { retain: 25, label: "25% (常见 staking)" },
    { retain: 34, label: "34% (罗曼小场风格)" },
    { retain: 50, label: "50% (一半一半)" },
    { retain: 75, label: "75% (主要自打)" },
    { retain: 100, label: "100% (完全不卖)" },
  ];

  const targetTable = targets.map(t => {
    const br = calcRequiredBR(t.retain);
    return { ...t, br, BIperBR: br / buyin };
  });

  // 当前 BR 下能达到的自留比例,作为参照
  // 不需要,但放个图表更直观

  // 自留比例 vs 所需 BR 曲线
  const curve = useMemo(() => {
    const points = [];
    for (let r = 5; r <= 100; r += 2.5) {
      const br = calcRequiredBR(r);
      points.push({ retain: r, BR: Math.round(br) });
    }
    return points;
  }, [buyin, sigma_d_sq, roiFrac, markup, mode]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 输入面板（横向 grid 由 CSS .mtt-input-panel 控制）*/}
      <div className="mtt-input-panel" style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
        <SectionTitle>反推所需 BR</SectionTitle>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 16, lineHeight: 1.6, gridColumn: "1 / -1" }}>
          告诉我赛事参数和你想要的自留比例,我反推出你需要多大的资金。
        </div>

        {/* 模式切换 */}
        <div style={{ marginBottom: 20, padding: 12, background: C.panelLight, borderRadius: 8, border: `1px solid ${C.border}`, gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>反推视角</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setMode("market")}
              style={{
                flex: 1, padding: "8px 10px", fontSize: 11,
                background: mode === "market" ? C.accentDim : C.panel,
                border: `1px solid ${mode === "market" ? C.accent : C.border}`,
                borderRadius: 6, color: mode === "market" ? C.accent : C.textDim,
                cursor: "pointer", fontFamily: "inherit",
                fontWeight: mode === "market" ? 600 : 400,
              }}>
              市场视角
            </button>
            <button onClick={() => setMode("kelly")}
              style={{
                flex: 1, padding: "8px 10px", fontSize: 11,
                background: mode === "kelly" ? C.accentDim : C.panel,
                border: `1px solid ${mode === "kelly" ? C.accent : C.border}`,
                borderRadius: 6, color: mode === "kelly" ? C.accent : C.textDim,
                cursor: "pointer", fontFamily: "inherit",
                fontWeight: mode === "kelly" ? 600 : 400,
              }}>
              Kelly 视角
            </button>
          </div>
          <div style={{ fontSize: 10, color: C.textFaint, marginTop: 8, lineHeight: 1.6 }}>
            {mode === "market" 
              ? "市场存在 markup 溢价,资金多大时模型推荐的最优卖出 = 你的目标自留。markup 影响结果。"
              : "你就这么打,不管市场。资金多大时几何增长 ≥ 0(方差不会吃掉你)。markup 不影响结果。"}
          </div>
        </div>

        <Field label="买入 ($)">
          <NumberInput value={buyin} onChange={setBuyin} style={inputStyle} min={1} />
        </Field>

        <Field label="参赛人数">
          <NumberInput value={field} onChange={setField} style={inputStyle} min={1} />
          <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
            {[100, 200, 300, 500, 1000, 1500, 2000, 3000, 5000].map(f => (
              <button key={f} onClick={() => setField(f)} style={chipStyle(field === f)}>
                {f >= 1000 ? `${f/1000}K` : f}
              </button>
            ))}
          </div>
        </Field>

        <TypeSelector type={type} setType={setType} />

        <Field label={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>ROI (%)</span>
            <label style={{ fontSize: 11, color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={useRefROI} onChange={e => setUseRefROI(e.target.checked)} />
              用 Felix 参考值
            </label>
          </div>
        }>
          <NumberInput value={effectiveROI} onChange={v => { setRoi(v); setUseRefROI(false); }}
            disabled={useRefROI} decimals={1}
            style={{ ...inputStyle, opacity: useRefROI ? 0.6 : 1 }} />
          {useRefROI && (
            <div style={{ fontSize: 10, color: C.accent, marginTop: 4 }}>
              基于 field={field} BI=${buyin} 推算: {refROI(field, buyin).toFixed(1)}%
            </div>
          )}
        </Field>

        <PlayStyleSelector shape={shape} setShape={setShape} />

        <Field label={
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ opacity: mode === "kelly" ? 0.4 : 1 }}>Markup (溢价)</span>
            {mode === "kelly" ? (
              <span style={{ fontSize: 10, color: C.textFaint, fontStyle: "italic" }}>
                此模式下不影响结果
              </span>
            ) : (
              <label style={{ fontSize: 11, color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={autoMarkup} onChange={e => setAutoMarkup(e.target.checked)} />
                自动
              </label>
            )}
          </div>
        }>
          <NumberInput value={markup} onChange={v => { setCustomMarkup(v); setAutoMarkup(false); }}
            disabled={autoMarkup || mode === "kelly"} decimals={3}
            style={{ ...inputStyle, opacity: (autoMarkup || mode === "kelly") ? 0.4 : 1 }} />
        </Field>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
          <Field label={
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.accent, fontWeight: 600 }}>目标自留比例</span>
              <span style={{ fontSize: 14, color: C.accent, fontWeight: 700 }}>{targetRetain}%</span>
            </div>
          }>
            <input type="range" min="5" max="100" step="1" value={targetRetain}
              onChange={e => setTargetRetain(+e.target.value)}
              style={{ width: "100%", accentColor: C.accent }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.textFaint, marginTop: 4 }}>
              <span>5% 全卖</span>
              <span>50% 一半</span>
              <span>100% 不卖</span>
            </div>
          </Field>
        </div>
      </div>

      {/* 右侧:结果 */}
      <div>
        {/* 大数字展示 */}
        <div style={{
          background: `linear-gradient(135deg, ${C.accent}15, ${C.bg})`,
          border: `1px solid ${C.accent}40`,
          borderRadius: 12, padding: 32, marginBottom: 16, textAlign: "center",
        }}>
          <div style={{ fontSize: 12, color: C.textDim, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
            想自留 {targetRetain}% 你需要的资金
          </div>
          {requiredBR === Infinity || requiredBR < 0 || isNaN(requiredBR) ? (
            <div>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.bad, marginBottom: 8 }}>
                不可能
              </div>
              <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6, maxWidth: 500, margin: "0 auto" }}>
                ROI ({effectiveROI.toFixed(1)}%) ≤ markup 溢价 ({((markup - 1) * 100).toFixed(1)}%)。
                你期望从场子赚到的钱,还不如直接卖 markup 赚得多——这种情况下数学上你应该全卖。
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 56, fontWeight: 700, color: C.accent, lineHeight: 1, marginBottom: 8 }}>
                ${Math.round(requiredBR).toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: C.textDim }}>
                = {(requiredBR / buyin).toFixed(0)} 个 ${buyin} 买入
              </div>
            </>
          )}
        </div>

        {/* 策略对比面板 - 展示卖股的 markup 价值与几何增长 */}
        <StrategyComparison
          buyin={buyin}
          sigma_d_sq={sigma_d_sq}
          roiFrac={roiFrac}
          markup={markup}
          BR={requiredBR > 0 && requiredBR < Infinity ? requiredBR : 20000}
          targetRetain={targetRetain}
        />

        {/* 不同自留目标对应 BR */}
        <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <SectionTitle>常见自留目标 → 所需资金</SectionTitle>
          <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 12 }}>
            点任意一行可以把目标设为该值
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left", borderBottom: `1px solid ${C.borderBright}` }}>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>自留比例</th>
                <th style={{ padding: "10px 12px", fontWeight: 500 }}>说明</th>
                <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>所需 BR</th>
                <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>= 多少个 BI</th>
              </tr>
            </thead>
            <tbody>
              {targetTable.map(t => {
                const isSelected = Math.abs(t.retain - targetRetain) < 1;
                return (
                  <tr key={t.retain}
                    onClick={() => setTargetRetain(t.retain)}
                    style={{
                      borderBottom: `1px solid ${C.border}`,
                      cursor: "pointer",
                      background: isSelected ? `${C.accent}15` : "transparent",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.panelLight; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: isSelected ? C.accent : C.text }}>
                      {t.retain}%
                    </td>
                    <td style={{ padding: "10px 12px", color: C.textDim, fontSize: 12 }}>{t.label}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", color: C.good }}>
                      {t.br === Infinity || t.br < 0 ? "—" : "$" + Math.round(t.br).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: C.textDim, fontSize: 12 }}>
                      {t.br === Infinity || t.br < 0 ? "—" : `${t.BIperBR.toFixed(0)} 个`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 曲线图 */}
        <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <SectionTitle>所需 BR vs 自留比例</SectionTitle>
          <div style={{ height: 280, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
                <XAxis dataKey="retain" stroke={C.textDim} fontSize={11}
                  label={{ value: "目标自留 (%)", position: "insideBottom", offset: -10, fill: C.textDim, fontSize: 11 }} />
                <YAxis stroke={C.textDim} fontSize={11}
                  tickFormatter={v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}
                  label={{ value: "所需 BR", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: C.panelLight, border: `1px solid ${C.borderBright}`, borderRadius: 6, fontSize: 12 }}
                  labelFormatter={l => `自留 ${l}%`}
                  formatter={v => [`$${Math.round(v).toLocaleString()}`, "所需 BR"]} />
                <ReferenceLine x={targetRetain} stroke={C.accent} strokeWidth={2}
                  label={{ value: "你的目标", position: "top", fill: C.accent, fontSize: 11 }} />
                <Line type="monotone" dataKey="BR" stroke={C.accent} strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8, lineHeight: 1.6 }}>
            注意:这是<b>线性</b>关系——所需 BR 与自留比例成正比。想自留 100% 的资金 = 想自留 50% 的资金 × 2。
            这就是为什么"想自打"的成本这么高——每提升 1% 自留,所需 BR 都按比例增加。
          </div>
        </div>

        {/* 公式说明 */}
        <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
          <SectionTitle>{mode === "market" ? "市场视角公式" : "Kelly 视角公式"}</SectionTitle>
          <div style={{ background: C.panelLight, borderRadius: 8, padding: 16, fontFamily: "monospace", fontSize: 14, color: C.accent, textAlign: "center", marginBottom: 12 }}>
            {mode === "market" 
              ? "BR = 自留比例 × σ² / (BI × (ROI − markup溢价))"
              : "BR = 自留比例 × σ² / (2 × BI × ROI)"}
          </div>
          <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>
            <div>当前赛事:</div>
            <div style={{ marginLeft: 16, marginTop: 6, fontFamily: "monospace", fontSize: 11 }}>
              <div>σ_BI = {sigmaBI.toFixed(2)} 个买入(每子弹标准差)</div>
              <div>σ² = ${sigma_d_sq.toLocaleString(undefined, {maximumFractionDigits: 0})} 美元²(每子弹方差)</div>
              {mode === "market" ? (
                <>
                  <div>ROI − markup溢价 = {(roiFrac * 100).toFixed(1)}% − {((markup - 1) * 100).toFixed(1)}% = {((roiFrac - (markup - 1)) * 100).toFixed(1)}%</div>
                  <div>BI × (ROI − markup溢价) = ${(buyin * (roiFrac - (markup - 1))).toFixed(2)}</div>
                </>
              ) : (
                <>
                  <div>2 × BI × ROI = 2 × ${buyin} × {(roiFrac * 100).toFixed(1)}% = ${(2 * buyin * roiFrac).toFixed(2)}</div>
                  <div style={{ color: C.textFaint, marginTop: 4 }}>(此公式来源:几何增长 g ≥ 0 的资金下限)</div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Monte Carlo 资金曲线模拟
// ============================================================

// 生成单颗子弹回报(三段式分布,匹配给定的 mu 和 sigma)
// 大概率 0(出局),小概率小奖,极小概率大奖(对数正态尾)
// ============================================================
// 真实 GG payout 生成器
// 基于 9 个真实 GG 锦标赛数据点拟合的奖励结构
// 输入: N(参赛人数), type(比赛类型)
// 返回: payouts 数组(长度 N,payouts[i] 是排名 i+1 的奖金,以 BI 为单位)
// ============================================================
function generateGGPayout(N, type = "Standard") {
  const paid = Math.max(3, Math.round(N * 0.14));
  // 真实 GG: 总奖池 ≈ 92% × N (扣 8% rake,跟所有真实数据点匹配)
  const totalPool = N * 0.92;
  
  // 前 9 名相邻比例(随场子大小变化)
  const ratioPrefix = N >= 200 ? 1.297 :
                      N >= 100 ? 1.20  :
                      N >= 50  ? 1.42  :
                      N >= 20  ? 1.70  :
                                 1.98;
  // rank 9→10 跳跃,从 5 个真实数据点拟合: jumpRatio = 0.836 + 0.088 × log(N)
  const jumpRatio = N >= 200 ? Math.min(1.62, 0.836 + 0.088 * Math.log(N)) : 1.30;
  // 11+ 段奖金衰减比例,从真实数据拟合: postRatio = 0.919 + 0.044 × log(N)
  const ratioPost = N >= 200 ? Math.max(1.10, 0.919 + 0.044 * Math.log(N)) : 1.20;
  const segMult = 1.62;     // 11+ 段大小扩张(黄金比例)
  
  // 段定义
  const segments = [];
  for (let i = 0; i < 10; i++) {
    let weight;
    if (i < 9) weight = Math.pow(1/ratioPrefix, i);
    else weight = Math.pow(1/ratioPrefix, 8) / jumpRatio;
    segments.push({ size: 1, weight });
  }
  
  let lastSegEnd = 10;
  let segSize = 2;
  let lastWeight = segments[9].weight;
  
  while (lastSegEnd < paid) {
    const newWeight = lastWeight / ratioPost;
    const remaining = paid - lastSegEnd;
    const actualSize = Math.min(segSize, remaining);
    segments.push({ size: actualSize, weight: newWeight });
    lastSegEnd += actualSize;
    lastWeight = newWeight;
    segSize = Math.max(segSize + 1, Math.round(segSize * segMult));
  }
  
  // 归一化让总奖池 = 0.92×N (扣 rake)
  let totalWeight = 0;
  for (const seg of segments) totalWeight += seg.size * seg.weight;
  const scale = totalPool / totalWeight;
  
  const payouts = new Array(N).fill(0);
  let rank = 1;
  for (const seg of segments) {
    const prizeBI = seg.weight * scale;
    for (let i = 0; i < seg.size; i++) {
      if (rank <= paid) payouts[rank - 1] = prizeBI;
      rank++;
    }
  }
  
  // 比赛类型调整:Mystery 把更多奖金塞到顶部,PKO 更平
  if (type !== "Standard") {
    const typeMult = type === "Mystery" ? 1.4 : type === "PKO" ? 0.85 : 1.0;
    const splitIdx = Math.floor(paid / 3);
    let topSum = 0, bottomSum = 0;
    for (let i = 0; i < paid; i++) {
      if (i < splitIdx) topSum += payouts[i];
      else bottomSum += payouts[i];
    }
    const newTopSum = topSum * typeMult;
    const newBottomSum = totalPool - newTopSum;
    if (newBottomSum > 0 && bottomSum > 0) {
      const topScale = newTopSum / topSum;
      const bottomScale = newBottomSum / bottomSum;
      for (let i = 0; i < paid; i++) {
        if (i < splitIdx) payouts[i] *= topScale;
        else payouts[i] *= bottomScale;
      }
    }
  }
  
  // GG 平台规则:min cash 锁定 ≥ 2 BI(进钱了保证回本+1 BI)
  // 不动 final table (rank 1-10),只在钱圈中段(rank 11+)调整
  // 不足 2 BI 的提到 2 BI,差额从中段超出 2 BI 的奖金按比例扣
  const MIN_CASH = 2.0;
  if (paid > 10) {
    let deficit = 0;
    let surplus = 0;
    for (let i = 10; i < paid; i++) {
      if (payouts[i] < MIN_CASH) deficit += MIN_CASH - payouts[i];
      else if (payouts[i] > MIN_CASH) surplus += payouts[i] - MIN_CASH;
    }
    if (deficit > 0 && surplus >= deficit) {
      const reduceFactor = (surplus - deficit) / surplus;
      for (let i = 10; i < paid; i++) {
        if (payouts[i] < MIN_CASH) {
          payouts[i] = MIN_CASH;
        } else if (payouts[i] > MIN_CASH) {
          payouts[i] = MIN_CASH + (payouts[i] - MIN_CASH) * reduceFactor;
        }
      }
    }
  }
  
  return payouts;
}

// 缓存:同样的 N+type+mu 不要重复计算
// 包括 payout 表和"在该 mu 下的偏差"
const _payoutCache = new Map();
function getCachedPayout(N, type) {
  const key = `${N}_${type}`;
  if (!_payoutCache.has(key)) {
    _payoutCache.set(key, generateGGPayout(N, type));
  }
  return _payoutCache.get(key);
}

// 缓存 skill 校准结果
const _skillCache = new Map();

// 解析计算:对给定 skill,从 payouts 抽样的 E[X]
// E[X] = Σ payout[rank-1] × P(rank) - 1
// P(rank) = (rank/N)^(1/(1+s)) - ((rank-1)/N)^(1/(1+s))
function _expectedValue(payouts, skill) {
  const N = payouts.length;
  const exp = 1 / (1 + skill);
  let sum = 0;
  for (let rank = 1; rank <= N; rank++) {
    const p_rank = Math.pow(rank/N, exp) - Math.pow((rank-1)/N, exp);
    sum += (payouts[rank-1] || 0) * p_rank;
  }
  return sum - 1;
}

// 精确二分搜索 skill,让 E[X] = mu_BI(用解析公式,无蒙特卡罗噪声)
function getCalibratedSkill(payouts, mu_BI) {
  if (mu_BI <= 0) return 0;
  const key = `${payouts.length}_${mu_BI.toFixed(4)}`;
  if (_skillCache.has(key)) return _skillCache.get(key);
  
  let lo = 0, hi = 2;
  for (let it = 0; it < 50; it++) {
    const mid = (lo + hi) / 2;
    if (_expectedValue(payouts, mid) > mu_BI) hi = mid;
    else lo = mid;
  }
  const skill = (lo + hi) / 2;
  _skillCache.set(key, skill);
  return skill;
}

// 单颗子弹回报:从真实 GG payout 表抽签
// 几何偏移模型:rank = 1 + N × U^(1+skill)
// skill 大时偏向顶部排名(强 reg 各排名概率普遍提升,顶部提升最多)
function sampleBulletReturn(mu_BI, sigma_BI, shape, maxBI, payoutsArg = null) {
  if (!payoutsArg) {
    return sampleBulletReturnFallback(mu_BI, sigma_BI, shape, maxBI);
  }
  
  const N = payoutsArg.length;
  const skill = getCalibratedSkill(payoutsArg, mu_BI);
  
  const u = Math.random();
  const rank = Math.min(N, Math.max(1, 1 + Math.floor(N * Math.pow(u, 1 + skill))));
  
  const prizeBI = payoutsArg[rank - 1] || 0;
  return prizeBI - 1;
}

// 兼容旧接口
function getCalibratedParams(payouts, mu_BI) {
  return { alpha: getCalibratedSkill(payouts, mu_BI), beta: 0 };
}

// 备用三段抽样器(向后兼容,不传 payouts 时用)
function sampleBulletReturnFallback(mu_BI, sigma_BI, shape, maxBI = 250) {
  const p_zero = 0.84 + 0.04 * shape;
  const p_big = 0.005 + 0.025 * shape;
  const p_small = 1 - p_zero - p_big;
  let K = 6 + 25 * shape;
  let W_s = (mu_BI + p_zero) / (p_small + K * p_big);
  let W_b = K * W_s;
  if (W_b > maxBI * 0.6) {
    K = (maxBI * 0.6 * p_small) / Math.max(0.01, (mu_BI + p_zero) - maxBI * 0.6 * p_big);
    K = Math.max(2, K);
    W_s = (mu_BI + p_zero) / (p_small + K * p_big);
    W_b = K * W_s;
  }
  const E_X_sq = sigma_BI * sigma_BI + mu_BI * mu_BI;
  const E_Wb_sq = (E_X_sq - p_zero - p_small * 1.163 * W_s * W_s) / p_big;
  let s_log = 0;
  if (E_Wb_sq > W_b * W_b) s_log = Math.sqrt(Math.log(E_Wb_sq / (W_b * W_b)));
  s_log = Math.min(s_log, 1.5);
  const m_log = Math.log(Math.max(W_b, 0.1)) - 0.5 * s_log * s_log;
  const r = Math.random();
  if (r < p_zero) return -1;
  if (r < p_zero + p_small) return Math.max(0, W_s * (0.3 + 1.4 * Math.random()));
  let u1 = Math.random();
  if (u1 < 1e-10) u1 = 1e-10;
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
  return Math.min(maxBI, Math.max(W_s * 2, Math.exp(m_log + s_log * z)));
}

// 跑一条路径
// 档位定义:[BI, ROI%]——不同级别的预估 ROI
// 默认假设:BI 越高,鱼越少,ROI 越低
const DEFAULT_LEVELS = [
  { bi: 25,   roi: 18 },
  { bi: 50,   roi: 14 },
  { bi: 100,  roi: 11 },
  { bi: 200,  roi: 8 },
  { bi: 400,  roi: 5 },
  { bi: 1000, roi: 2 },
];

// 找当前 BR 最适合的级别索引(给定档位列表 + 升降级阈值)
// upMult: BR/BI ≥ upMult 才升级(默认 200)
// downMult: BR/BI < downMult 才降级(默认 80)
function findLevelIdx(BR, levels, currentIdx, upMult, downMult) {
  let idx = currentIdx;
  // 对称 banking rule:升降用同一个倍数 upMult
  // 升级:BR / 下一档 BI ≥ upMult → 升一档
  // 降级:BR / 上一档 BI < upMult → 降一档(意思是连「升回当前档」都不够格)
  // downMult 参数保留兼容但不再使用
  while (idx < levels.length - 1 && BR / levels[idx + 1].bi >= upMult) {
    idx++;
  }
  while (idx > 0 && BR / levels[idx - 1].bi < upMult) {
    idx--;
  }
  return idx;
}

// 找一个 BR 起步时应该从哪个级别开始(用 200 BI 作为标准)
function findStartLevel(BR, levels, upMult) {
  // 找最大的 BI,使 BR/BI ≥ upMult
  let idx = 0;
  for (let i = 0; i < levels.length; i++) {
    if (BR / levels[i].bi >= upMult) idx = i;
    else break;
  }
  return idx;
}

// 单条路径模拟
// mode: "fixed" | "continuous" | "ladder"
// fixed: 始终用 startBuyin
// continuous: BI = BR × kellyFraction(连续复利)
// ladder: 按档位升降级(离散复利)
function simulatePath({
  initialBR, mode, startBuyin, sigma_BI_baseline, shape, sellRatio, markup,
  numBullets, levels, upMult, downMult, kellyFraction,
  startROI,
  dynamicMarkup,
  top1Cap = 250,
  payouts = null,  // 真实 GG payout 数组(每排名对应的奖金 BI)
}) {
  let BR = initialBR;
  const path = [BR];
  const buyinHistory = [];
  const levelHistory = [];
  const sellHistory = [];   // 每颗子弹实际用的卖出比例(动态最优时会变)
  const bigWins = [];       // 大成绩事件(rank 1-9, X_BI >= 12)
  let busted = false;
  
  // 最大回撤跟踪
  let peak = BR;            // 历史最高 BR
  let maxDrawdown = 0;      // 最大回撤(绝对金额,正数)
  let maxDrawdownPct = 0;   // 最大回撤百分比(相对峰值)
  
  // 档位模式:找起点级别
  let currentLevelIdx = mode === "ladder" 
    ? findStartLevel(initialBR, levels, upMult)
    : 0;
  
  // sellRatio = -1 表示动态最优(每子弹根据当前 BR 重算)
  const isDynamicOptimal = sellRatio === -1;
  
  for (let i = 0; i < numBullets; i++) {
    // 决定本子弹用什么 BI 和 ROI
    let bi, roiFrac, currentMarkup;
    
    if (mode === "fixed") {
      bi = startBuyin;
      roiFrac = startROI / 100;
      currentMarkup = markup;
    } else if (mode === "continuous") {
      // 连续模式 BI 跟着 BR 等比缩,BR 走负时无意义,所以仍保留早停
      bi = Math.max(BR * kellyFraction, 0.01);
      roiFrac = startROI / 100;
      currentMarkup = markup;
      if (BR <= 0) {
        busted = true;
        for (let j = i; j < numBullets; j++) {
          path.push(BR);
          buyinHistory.push(bi);
          levelHistory.push(currentLevelIdx);
          sellHistory.push(0);
        }
        break;
      }
    } else { // ladder
      // ladder 模式:即使 BR 跌破最低级别,也按最低级别继续打(允许 BR 走负)
      // 这模拟"借钱继续打"或"如果不离场会怎样"的累积代价
      currentLevelIdx = findLevelIdx(BR, levels, currentLevelIdx, upMult, downMult);
      bi = levels[currentLevelIdx].bi;
      roiFrac = levels[currentLevelIdx].roi / 100;
      currentMarkup = dynamicMarkup !== false ? (1 + MODEL.markup_slope * roiFrac) : markup;
      // 标记"破产但继续打",但不打断
      if (BR < bi) busted = true;
    }
    
    // 决定本子弹的卖出比例
    let actualSell;
    if (isDynamicOptimal) {
      // 每子弹用当前 BR 重算最优卖出
      // BR 为负或极小时,oneMinusS 自然会被 clamp 到 0.001(几乎全卖)
      const sigma_d_sq = Math.pow(sigma_BI_baseline * bi, 2);
      const denom = sigma_d_sq;
      const numer = Math.max(BR, 0) * bi * (roiFrac - (currentMarkup - 1));
      let oneMinusS = numer / denom;
      oneMinusS = Math.max(0.001, Math.min(1.0, oneMinusS));
      actualSell = 1 - oneMinusS;
    } else {
      actualSell = sellRatio;
    }
    
    // 单颗子弹回报(以 BI 为单位)
    const X_BI = sampleBulletReturn(roiFrac, sigma_BI_baseline, shape, top1Cap, payouts);
    
    // 自留(1-s)部分 + markup 现金
    const selfReturn_BI = (1 - actualSell) * X_BI;
    const markupCash_BI = actualSell * (currentMarkup - 1);
    const netReturn_BI = selfReturn_BI + markupCash_BI;
    
    BR += netReturn_BI * bi;
    
    // 更新峰值和最大回撤
    if (BR > peak) {
      peak = BR;
    } else {
      const drawdown = peak - BR;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPct = peak > 0 ? drawdown / peak : 0;
      }
    }
    
    // 记录大成绩事件(rank 1-9 级别,X_BI ≥ 12 大致就是 final table)
    // 注意:用 X_BI(总赔率)而不是 netReturn_BI,因为我们要看"赢了多少 BI"
    if (X_BI >= 12) {
      bigWins.push({
        bullet: i,
        bi: bi,                      // 当时打的 BI
        roi: roiFrac,                // 当时的 ROI
        winBI: X_BI,                 // 赢了多少 BI(总赔率,不扣 markup)
        winDollars: X_BI * bi,       // 赢了多少美元(对自己,不扣卖股)
        selfDollars: selfReturn_BI * bi,  // 自留部分
        BRAfter: BR,                 // 该次后 BR
      });
    }
    
    path.push(BR);
    buyinHistory.push(bi);
    levelHistory.push(currentLevelIdx);
    sellHistory.push(actualSell);
  }
  
  // 计算平均卖出比例(对动态最优有意义)
  const avgSell = sellHistory.length > 0 
    ? sellHistory.reduce((a, b) => a + b, 0) / sellHistory.length 
    : sellRatio;
  
  return {
    path, buyinHistory, levelHistory, sellHistory,
    finalBR: BR, busted,
    finalLevelIdx: currentLevelIdx,
    avgSell,
    bigWins,
    maxDrawdown,
    maxDrawdownPct,
    peak,
  };
}

// 跑多条路径,返回统计结果
function runSimulation(params) {
  const allPaths = [];
  const allFinalLevels = [];
  const allAvgSells = [];
  const allAvgBIs = [];
  // 收集所有 (BR, sellRatio) 对,用于动态最优的散点图
  const allBRSellPairs = [];
  // 收集每个级别打了多少颗子弹(每条路径一组)
  const allLevelTimeSpent = [];  // [{ levelIdx -> count }, ...]
  // 收集每条路径的大成绩事件
  const allBigWins = [];  // [[event, ...], ...] 每条路径一个数组
  // 收集每条路径的最大回撤
  const allMaxDrawdowns = [];
  let bustCount = 0;
  
  for (let i = 0; i < params.numSims; i++) {
    const result = simulatePath(params);
    allPaths.push(result.path);
    allFinalLevels.push(result.finalLevelIdx);
    allAvgSells.push(result.avgSell);
    if (result.buyinHistory && result.buyinHistory.length > 0) {
      const avgBI = result.buyinHistory.reduce((a, b) => a + b, 0) / result.buyinHistory.length;
      allAvgBIs.push(avgBI);
    }
    // 统计这条路径在每个级别打了多少颗子弹
    if (result.levelHistory) {
      const timeAtLevel = {};
      for (const idx of result.levelHistory) {
        timeAtLevel[idx] = (timeAtLevel[idx] || 0) + 1;
      }
      allLevelTimeSpent.push(timeAtLevel);
    }
    if (result.sellHistory && result.path) {
      for (let j = 0; j < result.sellHistory.length; j++) {
        allBRSellPairs.push({ BR: result.path[j], sell: result.sellHistory[j] });
      }
    }
    allBigWins.push(result.bigWins || []);
    allMaxDrawdowns.push(result.maxDrawdown || 0);
    if (result.busted) bustCount++;
  }
  
  // 计算每个时间点的分位数
  const percentiles = [];
  for (let t = 0; t <= params.numBullets; t++) {
    const values = allPaths.map(p => p[t] !== undefined ? p[t] : p[p.length - 1]).sort((a, b) => a - b);
    percentiles.push({
      t,
      p00: values[0],  // 最差
      p05: values[Math.floor(values.length * 0.05)],
      p25: values[Math.floor(values.length * 0.25)],
      p50: values[Math.floor(values.length * 0.50)],
      p75: values[Math.floor(values.length * 0.75)],
      p95: values[Math.floor(values.length * 0.95)],
      p100: values[values.length - 1],  // 最好
    });
  }
  
  const finalBRs = allPaths.map(p => p[p.length - 1]);
  finalBRs.sort((a, b) => a - b);
  
  // 档位分布(只对 ladder 模式有意义)
  const levelDist = {};
  if (params.mode === "ladder") {
    allFinalLevels.forEach(idx => {
      levelDist[idx] = (levelDist[idx] || 0) + 1;
    });
  }
  
  // 终值 BR 区间分桶(绝对金额)
  const initialBR = params.initialBR;
  const brBuckets = [
    { label: "破产",          max: 0 },
    { label: "< $5K",         max: 5000 },
    { label: "$5K-10K",       max: 10000 },
    { label: "$10K-25K",      max: 25000 },
    { label: "$25K-50K",      max: 50000 },
    { label: "$50K-100K",     max: 100000 },
    { label: "$100K-250K",    max: 250000 },
    { label: "$250K-500K",    max: 500000 },
    { label: "$500K-1M",      max: 1000000 },
    { label: "$1M+",          max: Infinity },
  ];
  const brDist = brBuckets.map(b => ({ ...b, count: 0 }));
  finalBRs.forEach(br => {
    for (let i = 0; i < brDist.length; i++) {
      if (br < brDist[i].max) {
        brDist[i].count++;
        break;
      }
    }
  });
  
  // 最大回撤分桶
  const ddBuckets = [
    { label: "< $1K",        max: 1000 },
    { label: "$1K-2.5K",     max: 2500 },
    { label: "$2.5K-5K",     max: 5000 },
    { label: "$5K-10K",      max: 10000 },
    { label: "$10K-25K",     max: 25000 },
    { label: "$25K-50K",     max: 50000 },
    { label: "$50K-100K",    max: 100000 },
    { label: "$100K-250K",   max: 250000 },
    { label: "$250K-500K",   max: 500000 },
    { label: "$500K+",       max: Infinity },
  ];
  const ddDist = ddBuckets.map(b => ({ ...b, count: 0 }));
  allMaxDrawdowns.forEach(dd => {
    for (let i = 0; i < ddDist.length; i++) {
      if (dd < ddDist[i].max) {
        ddDist[i].count++;
        break;
      }
    }
  });
  
  // 最大回撤的分位统计
  const sortedDDs = [...allMaxDrawdowns].sort((a, b) => a - b);
  const ddStats = {
    median: sortedDDs[Math.floor(sortedDDs.length * 0.5)] || 0,
    p25: sortedDDs[Math.floor(sortedDDs.length * 0.25)] || 0,
    p75: sortedDDs[Math.floor(sortedDDs.length * 0.75)] || 0,
    p90: sortedDDs[Math.floor(sortedDDs.length * 0.9)] || 0,
    max: sortedDDs[sortedDDs.length - 1] || 0,
    mean: sortedDDs.reduce((a, b) => a + b, 0) / Math.max(1, sortedDDs.length),
  };
  
  // 每个级别的"打了多少颗子弹"统计(中位、平均、P25、P75)
  const levelTimeStats = {};
  if (params.mode === "ladder" && allLevelTimeSpent.length > 0) {
    const numLevels = params.levels?.length || 0;
    for (let idx = 0; idx < numLevels; idx++) {
      const counts = allLevelTimeSpent.map(t => t[idx] || 0).sort((a, b) => a - b);
      levelTimeStats[idx] = {
        median: counts[Math.floor(counts.length / 2)],
        mean: counts.reduce((a, b) => a + b, 0) / counts.length,
        p25: counts[Math.floor(counts.length * 0.25)],
        p75: counts[Math.floor(counts.length * 0.75)],
        max: counts[counts.length - 1],
        visitRate: counts.filter(c => c > 0).length / counts.length,
      };
    }
  }
  
  // 按"路径终值"对路径排序,取代表分位的路径,看它们在每个级别打了多少颗子弹
  // 这能展示"运气好的路径 vs 运气差的路径"的级别分布对比
  const levelTimeByQuantile = { worst: {}, p25: {}, median: {}, p75: {}, best: {} };
  // 按分位选取代表路径的大成绩事件
  const bigWinsByQuantile = { worst: [], p25: [], median: [], p75: [], best: [] };
  // 该分位代表路径的最终 BR(用于显示)
  const finalBRByQuantile = { worst: 0, p25: 0, median: 0, p75: 0, best: 0 };
  // 该分位代表路径的降采样 BR 曲线(给散点图下面的曲线用)
  const pathByQuantile = { worst: [], p25: [], median: [], p75: [], best: [] };
  if (params.mode === "ladder" && allLevelTimeSpent.length > 0) {
    // 按终值排序,带原索引
    const indexed = allPaths.map((p, i) => ({ idx: i, finalBR: p[p.length - 1] }));
    indexed.sort((a, b) => a.finalBR - b.finalBR);
    const n = indexed.length;
    const picks = {
      worst: indexed[0].idx,
      p25: indexed[Math.floor(n * 0.25)].idx,
      median: indexed[Math.floor(n * 0.5)].idx,
      p75: indexed[Math.floor(n * 0.75)].idx,
      best: indexed[n - 1].idx,
    };
    const finals = {
      worst: indexed[0].finalBR,
      p25: indexed[Math.floor(n * 0.25)].finalBR,
      median: indexed[Math.floor(n * 0.5)].finalBR,
      p75: indexed[Math.floor(n * 0.75)].finalBR,
      best: indexed[n - 1].finalBR,
    };
    // 降采样:从 numBullets+1 个点降到 ~200 个点
    const downsample = (path, target = 500) => {
      if (!path || path.length <= target) return path || [];
      const step = path.length / target;
      const result = [];
      for (let i = 0; i < target; i++) {
        result.push(path[Math.floor(i * step)]);
      }
      // 保证最后一个点是终值
      result.push(path[path.length - 1]);
      return result;
    };
    for (const [q, idx] of Object.entries(picks)) {
      levelTimeByQuantile[q] = allLevelTimeSpent[idx] || {};
      bigWinsByQuantile[q] = allBigWins[idx] || [];
      finalBRByQuantile[q] = finals[q];
      pathByQuantile[q] = downsample(allPaths[idx]);
    }
  }
  
  // 平均卖出比例的中位数(跨所有模拟)
  const sortedSells = [...allAvgSells].sort((a, b) => a - b);
  const medianAvgSell = sortedSells[Math.floor(sortedSells.length / 2)] || 0;
  
  // BR 分桶 → 平均卖出比例(对动态最优画图用)
  const sellByBR = computeSellByBR(allBRSellPairs, params.initialBR);
  
  return {
    percentiles,
    bustRate: bustCount / params.numSims,
    medianFinal: finalBRs[Math.floor(finalBRs.length * 0.5)],
    p25Final: finalBRs[Math.floor(finalBRs.length * 0.25)],
    p75Final: finalBRs[Math.floor(finalBRs.length * 0.75)],
    bestFinal: finalBRs[finalBRs.length - 1],
    worstFinal: finalBRs[0],
    geomGrowth: Math.pow(finalBRs[Math.floor(finalBRs.length * 0.5)] / params.initialBR, 1/params.numBullets) - 1,
    levelDist,
    brDist,
    ddDist,
    ddStats,
    levelTimeStats,
    levelTimeByQuantile,
    bigWinsByQuantile,
    finalBRByQuantile,
    pathByQuantile,
    medianAvgSell,
    avgBI: allAvgBIs.length > 0 ? allAvgBIs.reduce((a, b) => a + b, 0) / allAvgBIs.length : 0,
    sellByBR,
  };
}

// 把 (BR, sell) 对按 BR 分桶,每桶算平均卖出
function computeSellByBR(pairs, initialBR) {
  if (pairs.length === 0) return [];
  
  // 用对数空间分桶,跨度大时更直观
  // 找 BR 范围
  let minBR = Infinity, maxBR = -Infinity;
  for (const p of pairs) {
    if (p.BR < minBR) minBR = p.BR;
    if (p.BR > maxBR) maxBR = p.BR;
  }
  if (minBR <= 0) minBR = Math.max(initialBR * 0.1, 1);
  if (maxBR <= minBR) maxBR = minBR * 10;
  
  // 12 个对数桶
  const N_BUCKETS = 12;
  const logMin = Math.log10(minBR);
  const logMax = Math.log10(maxBR);
  const step = (logMax - logMin) / N_BUCKETS;
  
  const buckets = [];
  for (let i = 0; i < N_BUCKETS; i++) {
    const lo = Math.pow(10, logMin + i * step);
    const hi = Math.pow(10, logMin + (i + 1) * step);
    buckets.push({ lo, hi, mid: (lo + hi) / 2, sells: [] });
  }
  
  for (const p of pairs) {
    for (const b of buckets) {
      if (p.BR >= b.lo && p.BR < b.hi) {
        b.sells.push(p.sell);
        break;
      }
    }
    // 处理边界:最大值可能落在最后一个桶外
    if (p.BR >= buckets[N_BUCKETS - 1].hi) {
      buckets[N_BUCKETS - 1].sells.push(p.sell);
    }
  }
  
  return buckets
    .filter(b => b.sells.length >= 5)  // 至少 5 个样本才算
    .map(b => {
      const sorted = [...b.sells].sort((a, b) => a - b);
      return {
        BR: Math.round(b.mid),
        sellMed: sorted[Math.floor(sorted.length * 0.5)],
        sellP25: sorted[Math.floor(sorted.length * 0.25)],
        sellP75: sorted[Math.floor(sorted.length * 0.75)],
        n: b.sells.length,
      };
    });
}

function MonteCarloTab({ availableModes = ["fixed", "continuous", "ladder"], defaultMode = "fixed", tabKey = "monte" }) {
  // 赛事参数
  const [buyin, setBuyin] = useState(109);
  const [field, setField] = useState(1000);
  const [type, setType] = useState("Standard");
  const [roi, setRoi] = useState(15);
  const [shape, setShape] = useState(0.5);
  
  // 模拟参数
  // 模拟参数(两个标签默认值一致,但升级测试 BR 起始小一些)
  const isLadderTab = tabKey === "ladder";
  const [initialBR, setInitialBR] = useState(isLadderTab ? 5000 : 20000);
  const [numBullets, setNumBullets] = useState(isLadderTab ? 20000 : 5000);
  const [numSims, setNumSims] = useState(500);
  
  // 复利模式
  const [mode, setMode] = useState(defaultMode);
  
  // 档位定义(ladder 模式用)
  const [levels, setLevels] = useState([...DEFAULT_LEVELS]);
  const [upMult, setUpMult] = useState(300);
  const [downMult, setDownMult] = useState(300);
  const [kellyFraction, setKellyFraction] = useState(0.005); // 连续模式 BI/BR 比例
  
  // 路径配置
  const [paths, setPaths] = useState([
    { id: 1, name: "全自打", sellRatio: 0, color: "#ef4444" },
    { id: 2, name: "卖 50%", sellRatio: 0.5, color: "#3b82f6" },
    { id: 3, name: "动态最优", sellRatio: -1, color: "#10b981" },  // -1 = 每子弹重算
  ]);
  const [newSellRatio, setNewSellRatio] = useState(0.7);
  const [newPathName, setNewPathName] = useState("");
  
  // 结果
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  
  // 主图显示哪个分位:p25 (差时) / p50 (中位) / p75 (好时)
  const [mainQuantile, setMainQuantile] = useState("p50");
  
  // 三合一对比图:勾选哪些路径显示
  const [selectedPathIds, setSelectedPathIds] = useState(null); // null = 全选
  
  // 分位组:哪些分位线显示
  const [showQuantiles, setShowQuantiles] = useState({
    extremes: true,  // 最差/最好(P0/P100)
    middle: true,    // P25/P75
    median: true,    // 中位
  });
  
  // 各级别累计子弹数表的分位选择
  const [levelTimeQuantile, setLevelTimeQuantile] = useState("median");
  
  // 大成绩散点图放大模态框
  // null = 关闭, { quantileId, pathId } = 显示某条
  const [zoomedScatter, setZoomedScatter] = useState(null);

  const roiFrac = roi / 100;
  const markup = recommendMarkup(roiFrac);
  const sigmaBI = adjustSigmaForShape(calcSigma(field, type), shape);

  const colors = ["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#a78bfa", "#ec4899", "#06b6d4", "#84cc16"];

  const addPath = () => {
    const id = Date.now();
    const colorIdx = paths.length % colors.length;
    setPaths([...paths, {
      id,
      name: newPathName || `卖 ${(newSellRatio * 100).toFixed(0)}%`,
      sellRatio: newSellRatio,
      color: colors[colorIdx],
    }]);
    setNewPathName("");
  };

  const removePath = (id) => {
    setPaths(paths.filter(p => p.id !== id));
    if (results) {
      setResults({ ...results, paths: results.paths.filter(p => p.id !== id) });
    }
  };

  const runSim = () => {
    setRunning(true);
    setTimeout(() => {
      // 单次回报硬上限 = 当前场子的冠军赔率
      const top1Cap = calcTop1BI(field, type);
      // 真实 GG payout 表(基于参赛人数 + 比赛类型)
      const payouts = getCachedPayout(field, type);
      const pathResults = paths.map(p => {
        const sim = runSimulation({
          initialBR,
          mode,
          startBuyin: buyin,
          startROI: roi,
          sigma_BI_baseline: sigmaBI,
          shape,
          sellRatio: p.sellRatio,
          markup,
          numBullets,
          numSims,
          levels,
          upMult,
          downMult,
          kellyFraction,
          top1Cap,
          payouts,
        });
        const actualSellRatio = p.sellRatio === -1 ? sim.medianAvgSell : p.sellRatio;
        return { ...p, ...sim, actualSellRatio, isDynamic: p.sellRatio === -1 };
      });
      setResults({ paths: pathResults, ranAt: Date.now(), mode });
      setRunning(false);
    }, 50);
  };

  // 合并所有路径的盈亏曲线(P25/P50/P75 三档)
  const mergedChart = useMemo(() => {
    if (!results) return [];
    const data = [];
    for (let t = 0; t <= numBullets; t += Math.max(1, Math.floor(numBullets / 200))) {
      const point = { t };
      results.paths.forEach(p => {
        if (p.percentiles[t]) {
          point[`${p.id}_p50`] = Math.round(p.percentiles[t].p50 - initialBR);
          point[`${p.id}_p25`] = Math.round(p.percentiles[t].p25 - initialBR);
          point[`${p.id}_p75`] = Math.round(p.percentiles[t].p75 - initialBR);
          point[`${p.id}_p00`] = Math.round(p.percentiles[t].p00 - initialBR);
          point[`${p.id}_p100`] = Math.round(p.percentiles[t].p100 - initialBR);
        }
      });
      data.push(point);
    }
    return data;
  }, [results, numBullets, initialBR]);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* 输入区(panels 垂直堆叠;每个 panel 内部由 .mtt-input-panel 横向铺) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 赛事参数 */}
          <div className="mtt-input-panel" style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
            <SectionTitle>赛事参数</SectionTitle>

            {/* 买入:档位/连续模式下隐藏 */}
            {mode === "fixed" && (
              <Field label="买入 ($)">
                <NumberInput value={buyin} onChange={setBuyin} style={inputStyle} min={1} />
              </Field>
            )}

            <Field label="参赛人数">
              <NumberInput value={field} onChange={setField} style={inputStyle} min={1} />
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {[100, 200, 300, 500, 1000, 1500, 2000, 3000, 5000].map(f => (
                  <button key={f} onClick={() => setField(f)} style={chipStyle(field === f)}>
                    {f >= 1000 ? `${f/1000}K` : f}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
                决定每子弹方差 σ
              </div>
            </Field>

            <TypeSelector type={type} setType={setType} />

            {/* ROI:档位模式下隐藏 */}
            {mode !== "ladder" && (
              <Field label="ROI (%)">
                <NumberInput value={roi} onChange={setRoi} decimals={1} style={inputStyle} />
              </Field>
            )}

            <PlayStyleSelector shape={shape} setShape={setShape} />
          </div>

          {/* 模拟参数 */}
          <div className="mtt-input-panel" style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
            <SectionTitle>模拟参数</SectionTitle>

            <Field label="初始 BR ($)">
              <NumberInput value={initialBR} onChange={setInitialBR} style={inputStyle} min={1} />
              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                {[5000, 7500, 10000, 20000, 50000, 100000].map(b => (
                  <button key={b} onClick={() => setInitialBR(b)} style={chipStyle(initialBR === b)}>
                    ${b >= 1000 ? `${b/1000}K` : b}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="子弹数">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[1000, 2000, 3000, 5000, 10000, 20000, 50000].map(n => (
                  <button key={n} onClick={() => setNumBullets(n)}
                    style={{
                      ...chipStyle(numBullets === n),
                      flex: "1 0 auto", minWidth: 60,
                      padding: "8px 10px", fontSize: 12,
                    }}>
                    {n >= 1000 ? `${n/1000}K` : n}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textFaint, marginTop: 6, lineHeight: 1.5 }}>
                按全职 reg 30 颗/天计:{" "}
                <span style={{ color: C.textDim }}>
                  {numBullets <= 1000 ? `${(numBullets/30).toFixed(0)} 天` :
                   numBullets <= 7500 ? `${(numBullets/30/30).toFixed(1)} 个月` :
                   numBullets <= 30000 ? `${(numBullets/7500).toFixed(1)} 年` :
                   `${(numBullets/7500).toFixed(1)} 年`}
                </span>
                {numBullets >= 15000 && (
                  <span style={{ color: C.bad }}> · 长时间机械化打,容易高估"水平稳定+耐力"</span>
                )}
              </div>
            </Field>

            <Field label="模拟次数">
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { n: 200, label: "200 (快)" },
                  { n: 500, label: "500" },
                  { n: 1000, label: "1000 (准)" },
                ].map(opt => (
                  <button key={opt.n} onClick={() => setNumSims(opt.n)}
                    style={{
                      ...chipStyle(numSims === opt.n),
                      flex: 1, padding: "8px 10px", fontSize: 12,
                    }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {/* 复利模式面板 — 仅在多模式时显示切换器 */}
          <div className="mtt-input-panel" style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}` }}>
            {availableModes.length > 1 && (
              <>
                <SectionTitle>复利模式</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                  {[
                    { id: "fixed",      label: "固定 BI",   desc: "买入永不变,纯线性累积" },
                    { id: "continuous", label: "连续复利", desc: "BI = BR × Kelly,数学最纯" },
                    { id: "ladder",     label: "档位复利", desc: "按现实档位升降级,最贴近实战" },
                  ].filter(m => availableModes.includes(m.id)).map(m => {
                    const active = mode === m.id;
                    return (
                      <button key={m.id} onClick={() => setMode(m.id)}
                        style={{
                          padding: "10px 12px", fontSize: 12, textAlign: "left",
                          background: active ? C.accentDim : C.panelLight,
                          border: `1px solid ${active ? C.accent : C.border}`,
                          borderRadius: 6, color: active ? C.accent : C.textDim,
                          cursor: "pointer", fontFamily: "inherit",
                          fontWeight: active ? 600 : 400,
                        }}>
                        <div>{m.label}</div>
                        <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2, fontWeight: 400 }}>
                          {m.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* 连续复利:Kelly fraction */}
            {mode === "continuous" && (
              <Field label={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Kelly 比例 (BI/BR)</span>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 600 }}>
                    1/{Math.round(1/kellyFraction)}
                  </span>
                </div>
              }>
                <input type="range" min="0.001" max="0.02" step="0.001" value={kellyFraction}
                  onChange={e => setKellyFraction(+e.target.value)}
                  style={{ width: "100%", accentColor: C.accent }} />
                <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4, lineHeight: 1.5 }}>
                  每颗子弹的 BI = BR × {(kellyFraction*100).toFixed(2)}%。资金 ${initialBR.toLocaleString()} 时,
                  起步 BI = ${(initialBR * kellyFraction).toFixed(0)}。
                </div>
              </Field>
            )}

            {/* 档位复利:升降级阈值 + 档位编辑器 */}
            {mode === "ladder" && (
              <>
                {availableModes.length === 1 && <SectionTitle>升级测试参数</SectionTitle>}
                
                {/* 升降级阈值(对称 banking rule:升降同一倍数) */}
                <Field label={
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>升降级阈值</span>
                    <span style={{ fontSize: 10, color: C.accent }}>{upMult} BI</span>
                  </div>
                }>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[
                      { mult: 150, desc: "激进" },
                      { mult: 200, desc: "略激进" },
                      { mult: 300, desc: "标准" },
                      { mult: 400, desc: "稳健" },
                      { mult: 500, desc: "保守" },
                      { mult: 1000, desc: "极保守" },
                    ].map(opt => {
                      const active = upMult === opt.mult;
                      return (
                        <button key={opt.mult}
                          onClick={() => { setUpMult(opt.mult); setDownMult(opt.mult); }}
                          style={{
                            ...chipStyle(active),
                            flex: "1 0 auto", minWidth: 76,
                            padding: "8px 8px", fontSize: 11,
                            display: "flex", flexDirection: "column", gap: 2,
                          }}>
                          <span style={{ fontWeight: 600 }}>{opt.mult} BI</span>
                          <span style={{ fontSize: 9, opacity: 0.7 }}>{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* 自定义输入 */}
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: C.textDim }}>自定义:</span>
                    <NumberInput value={upMult} onChange={v => { setUpMult(v); setDownMult(v); }} 
                      style={{ ...inputStyle, width: 80, padding: "4px 8px", fontSize: 12 }} 
                      min={50} />
                    <span style={{ fontSize: 11, color: C.textFaint }}>BI</span>
                  </div>
                </Field>

                {/* 阈值含义提示 */}
                <div style={{ 
                  fontSize: 10, color: C.textFaint, lineHeight: 1.7, 
                  padding: "8px 12px", background: C.panelLight, borderRadius: 6,
                  marginBottom: 12,
                }}>
                  <div>
                    <span style={{ color: C.text }}>对称 banking rule</span>:升降级用同一倍数 {upMult} BI
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <span style={{ color: C.good }}>升级</span>:BR / 下一档 BI ≥ {upMult} → 升一档
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ color: C.bad }}>降级</span>:BR / 上一档 BI &lt; {upMult} → 降一档
                  </div>
                  <div style={{ marginTop: 6, color: C.textDim }}>
                    例:从 $150 升 $250 需要 BR ≥ ${(upMult * 250).toLocaleString()};
                    从 $250 降回 $150 需要 BR &lt; ${(upMult * 150).toLocaleString()}。
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                    <span>买入档位 / 预估 ROI</span>
                    <span style={{ fontSize: 10, color: C.textFaint }}>BI 越高 ROI 通常越低</span>
                  </div>
                  
                  {/* ROI 预设按钮 */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button onClick={() => setLevels([
                      { bi: 25,   roi: 18 },
                      { bi: 50,   roi: 14 },
                      { bi: 100,  roi: 11 },
                      { bi: 200,  roi: 8 },
                      { bi: 400,  roi: 5 },
                      { bi: 1000, roi: 2 },
                    ])} style={{
                      flex: 1, padding: "8px 10px", fontSize: 11,
                      background: C.panelLight, border: `1px solid ${C.border}`,
                      borderRadius: 4, color: C.textDim, cursor: "pointer",
                      fontFamily: "inherit",
                    }}>
                      <div style={{ fontWeight: 600, color: C.text, marginBottom: 2 }}>保守 ROI</div>
                      <div style={{ fontSize: 10, color: C.textFaint }}>更接近真实赛事</div>
                    </button>
                    <button onClick={() => setLevels([
                      { bi: 25,   roi: 25 },
                      { bi: 50,   roi: 20 },
                      { bi: 100,  roi: 16 },
                      { bi: 200,  roi: 12 },
                      { bi: 400,  roi: 8 },
                      { bi: 1000, roi: 4 },
                    ])} style={{
                      flex: 1, padding: "8px 10px", fontSize: 11,
                      background: C.panelLight, border: `1px solid ${C.border}`,
                      borderRadius: 4, color: C.textDim, cursor: "pointer",
                      fontFamily: "inherit",
                    }}>
                      <div style={{ fontWeight: 600, color: C.text, marginBottom: 2 }}>激进 ROI</div>
                      <div style={{ fontSize: 10, color: C.textFaint }}>假设鱼塘水平</div>
                    </button>
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
                    {levels.map((lv, idx) => {
                      const startIdx = findStartLevel(initialBR, levels, upMult);
                      const isStart = idx === startIdx;
                      return (
                        <div key={idx} style={{
                          display: "grid", gridTemplateColumns: "auto 1fr 1fr auto",
                          gap: 6, alignItems: "center", padding: "4px 8px",
                          background: isStart ? `${C.accent}15` : C.panelLight,
                          border: `1px solid ${isStart ? C.accent : "transparent"}`,
                          borderRadius: 4,
                        }}>
                          <span style={{ fontSize: 10, color: C.textFaint, minWidth: 18 }}>
                            {isStart ? "▶" : ""}
                          </span>
                          <input type="number" value={lv.bi} placeholder="BI"
                            onChange={e => {
                              const newLevels = [...levels];
                              newLevels[idx] = { ...lv, bi: +e.target.value };
                              setLevels(newLevels);
                            }}
                            style={{ ...inputStyle, fontSize: 11, padding: "4px 6px" }} />
                          <input type="number" value={lv.roi} placeholder="ROI %" step="0.5"
                            onChange={e => {
                              const newLevels = [...levels];
                              newLevels[idx] = { ...lv, roi: +e.target.value };
                              setLevels(newLevels);
                            }}
                            style={{ ...inputStyle, fontSize: 11, padding: "4px 6px" }} />
                          <button onClick={() => setLevels(levels.filter((_, i) => i !== idx))}
                            style={{
                              background: "none", border: `1px solid ${C.border}`,
                              color: C.textFaint, padding: "2px 6px", borderRadius: 3,
                              cursor: "pointer", fontSize: 10, fontFamily: "inherit",
                            }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => {
                    const lastBi = levels[levels.length - 1]?.bi || 100;
                    const lastRoi = levels[levels.length - 1]?.roi || 5;
                    setLevels([...levels, { bi: lastBi * 2, roi: Math.max(1, lastRoi - 1) }]);
                  }} style={{
                    width: "100%", marginTop: 6, padding: "6px",
                    background: C.panelLight, border: `1px dashed ${C.border}`,
                    borderRadius: 4, color: C.textDim, cursor: "pointer",
                    fontSize: 11, fontFamily: "inherit",
                  }}>+ 加档位</button>
                  <div style={{ fontSize: 10, color: C.textFaint, marginTop: 8, lineHeight: 1.5 }}>
                    ▶ = 起步级别(基于初始 BR ${initialBR.toLocaleString()} 和升级阈值 {upMult} 个 BI 自动判断)
                  </div>
                </div>
              </>
            )}

            {mode === "fixed" && (
              <div style={{ fontSize: 11, color: C.textFaint, lineHeight: 1.6, padding: "8px 12px", background: C.panelLight, borderRadius: 6 }}>
                每颗子弹都用左侧赛事参数指定的 BI(${buyin})和 ROI({roi}%),不升降级。
              </div>
            )}
          </div>

          {/* 路径配置 */}
          <div style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.accent}30`, marginBottom: 16 }}>
            <SectionTitle>对比路径</SectionTitle>
            
            <div style={{ marginBottom: 16 }}>
              {paths.map(p => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  background: C.panelLight, borderRadius: 6, marginBottom: 6, fontSize: 12,
                }}>
                  <div style={{ width: 12, height: 12, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, color: C.text }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: C.textFaint }}>
                      {p.sellRatio === -1 
                        ? `每子弹按当前 BR 动态重算最优`
                        : `卖 ${(p.sellRatio * 100).toFixed(0)}%`}
                    </div>
                  </div>
                  <button onClick={() => removePath(p.id)} style={{
                    background: "none", border: `1px solid ${C.border}`,
                    color: C.textDim, padding: "2px 6px", borderRadius: 4,
                    cursor: "pointer", fontSize: 11, fontFamily: "inherit",
                  }}>×</button>
                </div>
              ))}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>添加新路径</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                <input
                  type="text"
                  placeholder="路径名(可选)"
                  value={newPathName}
                  onChange={e => setNewPathName(e.target.value)}
                  style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                />
                <NumberInput value={newSellRatio} onChange={setNewSellRatio} decimals={2}
                  style={{ ...inputStyle, fontSize: 12, padding: "6px 10px" }}
                  min={0} max={1} />
              </div>
              <input type="range" min="0" max="1" step="0.05" value={newSellRatio}
                onChange={e => setNewSellRatio(+e.target.value)}
                style={{ width: "100%", accentColor: C.accent, marginBottom: 6 }} />
              <button onClick={addPath} style={{
                width: "100%", padding: "8px", background: C.accent, color: C.bg,
                border: "none", borderRadius: 6, fontWeight: 600, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}>
                + 添加路径(卖 {(newSellRatio * 100).toFixed(0)}%)
              </button>
            </div>
          </div>

          {/* 跑模拟按钮 */}
          <button onClick={runSim} disabled={running || paths.length === 0} style={{
            width: "100%", padding: "16px", 
            background: running ? C.borderBright : C.good, 
            color: running ? C.textDim : "#fff",
            border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: running ? "wait" : "pointer", fontFamily: "inherit",
            transition: "all 0.15s",
          }}>
            {running ? "模拟中…" : `▶ 跑模拟 (${paths.length} 路径 × ${numSims} 次)`}
          </button>
        </div>

        {/* 右侧:结果 */}
        <div>
          {!results && (
            <div style={{
              background: C.panel, borderRadius: 12, padding: 60, border: `1px solid ${C.border}`,
              textAlign: "center", color: C.textDim,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{tabKey === "ladder" ? "🪜" : "📈"}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                {tabKey === "ladder" ? "升级测试" : "盈亏曲线模拟"}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
                {tabKey === "ladder" ? (
                  <>按你定义的档位列表升降级模拟,看看不同卖股策略下,你能爬到哪个级别、多少概率被打回起点。配置左侧参数,点击"跑模拟"开始。</>
                ) : (
                  <>每条路径会跑 {numSims} 次,每次打 {numBullets} 颗子弹。对比不同卖股策略的盈亏曲线和最终中位数。配置左侧参数,点击"跑模拟"开始。</>
                )}
              </div>
            </div>
          )}

          {results && (
            <>
              {/* 关键指标对比 */}
              <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                <SectionTitle>结果汇总(净盈亏 = 终值 − 初始 BR)</SectionTitle>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left", borderBottom: `1px solid ${C.borderBright}` }}>
                        <th style={th}>路径</th>
                        <th style={{ ...th, textAlign: "right" }}>实际卖出</th>
                        <th style={{ ...th, textAlign: "right" }}>中位数</th>
                        <th style={{ ...th, textAlign: "right" }}>P25</th>
                        <th style={{ ...th, textAlign: "right" }}>P75</th>
                        <th style={{ ...th, textAlign: "right" }}>最差</th>
                        <th style={{ ...th, textAlign: "right" }}>最好</th>
                        <th style={{ ...th, textAlign: "right" }}>破产率</th>
                        <th style={{ ...th, textAlign: "right" }}>每子弹增长</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.paths.map(p => {
                        const fmtPnL = (v) => {
                          const pnl = v - initialBR;
                          const sign = pnl >= 0 ? "+" : "−";
                          return `${sign}$${Math.abs(Math.round(pnl)).toLocaleString()}`;
                        };
                        return (
                        <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                              <div style={{ fontWeight: 500 }}>{p.name}</div>
                            </div>
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: C.accent }}>
                            {p.isDynamic ? (
                              <span>~{(p.actualSellRatio * 100).toFixed(1)}% <span style={{ fontSize: 10, color: C.textFaint }}>动态</span></span>
                            ) : (
                              `${(p.actualSellRatio * 100).toFixed(1)}%`
                            )}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, 
                            color: p.medianFinal > initialBR ? C.good : C.bad }}>
                            {fmtPnL(p.medianFinal)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: p.p25Final > initialBR ? C.good : C.bad }}>
                            {fmtPnL(p.p25Final)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: p.p75Final > initialBR ? C.good : C.bad }}>
                            {fmtPnL(p.p75Final)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: C.bad, fontSize: 11 }}>
                            {fmtPnL(p.worstFinal)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: C.good, fontSize: 11 }}>
                            {fmtPnL(p.bestFinal)}
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right",
                            color: p.bustRate > 0.1 ? C.bad : p.bustRate > 0.02 ? C.accent : C.good }}>
                            {(p.bustRate * 100).toFixed(1)}%
                          </td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: C.purple, fontSize: 11 }}>
                            {(p.geomGrowth * 100).toFixed(3)}%
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 主对比图 */}
              <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <SectionTitle>
                    盈亏曲线对比 ({mainQuantile === "p25" ? "P25 差时" : mainQuantile === "p75" ? "P75 好时" : "中位数"})
                  </SectionTitle>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[
                      { id: "p25", label: "P25 差时" },
                      { id: "p50", label: "中位" },
                      { id: "p75", label: "P75 好时" },
                    ].map(q => (
                      <button key={q.id} onClick={() => setMainQuantile(q.id)}
                        style={{
                          padding: "6px 12px", fontSize: 11,
                          background: mainQuantile === q.id ? C.accentDim : C.panelLight,
                          border: `1px solid ${mainQuantile === q.id ? C.accent : C.border}`,
                          borderRadius: 4, color: mainQuantile === q.id ? C.accent : C.textDim,
                          cursor: "pointer", fontFamily: "inherit",
                          fontWeight: mainQuantile === q.id ? 600 : 400,
                        }}>
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ height: 360, marginTop: 12 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mergedChart} margin={{ top: 10, right: 20, left: 20, bottom: 20 }}>
                      <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
                      <XAxis dataKey="t" stroke={C.textDim} fontSize={11}
                        label={{ value: "子弹数", position: "insideBottom", offset: -10, fill: C.textDim, fontSize: 11 }} />
                      <YAxis stroke={C.textDim} fontSize={11}
                        tickFormatter={v => {
                          const sign = v < 0 ? "−" : v > 0 ? "+" : "";
                          const abs = Math.abs(v);
                          if (abs >= 1000000) return `${sign}$${(abs/1000000).toFixed(1)}M`;
                          if (abs >= 1000) return `${sign}$${(abs/1000).toFixed(0)}K`;
                          return `${sign}$${abs}`;
                        }}
                        label={{ value: "净盈亏 ($)", angle: -90, position: "insideLeft", fill: C.textDim, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: C.panelLight, border: `1px solid ${C.borderBright}`, borderRadius: 6, fontSize: 12 }}
                        labelFormatter={l => `第 ${l} 颗子弹`}
                        formatter={(v, name) => {
                          // name 形如 "1_p50",取 id
                          const id = name.split("_")[0];
                          const path = results.paths.find(p => p.id == id);
                          const sign = v >= 0 ? "+" : "−";
                          return [`${sign}$${Math.abs(Math.round(v)).toLocaleString()}`, path?.name || name];
                        }} />
                      <ReferenceLine y={0} stroke={C.borderBright} strokeDasharray="3 3"
                        label={{ value: "打平线", position: "right", fill: C.textDim, fontSize: 10 }} />
                      {results.paths.map(p => (
                        <Line key={p.id} type="monotone" dataKey={`${p.id}_${mainQuantile}`}
                          stroke={p.color} strokeWidth={2.5} dot={false} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 11, color: C.textFaint, marginTop: 8, lineHeight: 1.6 }}>
                  {mainQuantile === "p25" && (
                    <>显示 <b style={{ color: C.bad }}>P25 差时盈亏</b>:25% 概率你的实际盈亏比这条线还差。看这个能判断"扛得住下风期吗"——如果某条策略 P25 是负的,意味着 1/4 概率会亏钱。</>
                  )}
                  {mainQuantile === "p50" && (
                    <>显示<b style={{ color: C.text }}>中位数</b>:最有代表性的"典型路径"。一半路径比它好,一半比它差。</>
                  )}
                  {mainQuantile === "p75" && (
                    <>显示 <b style={{ color: C.good }}>P75 好时盈亏</b>:25% 概率你的实际盈亏比这条线还好。看这个能判断"运气好时上限多高"——但别用它来做决策,因为 75% 概率会比这低。</>
                  )}
                  <span style={{ color: C.textFaint }}> · 每条线基于 {numSims} 次模拟。</span>
                </div>
              </div>

              {/* 动态最优:卖出比例 vs BR 图 */}
              {results.paths.some(p => p.isDynamic && p.sellByBR && p.sellByBR.length > 0) && (
                <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                  <SectionTitle>动态最优:不同 BR 下的卖出比例</SectionTitle>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
                    动态最优策略每颗子弹根据当前 BR 重算最优卖出。下面显示资金涨到不同水平时,模型推荐你卖多少。
                    <b style={{ color: C.text }}>典型规律:BR 越大,卖出比例越低</b>(自留更多享受复利)。
                  </div>
                  {results.paths.filter(p => p.isDynamic && p.sellByBR && p.sellByBR.length > 0).map(p => (
                    <div key={p.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: C.textFaint }}>
                          整段平均 ~{(p.actualSellRatio * 100).toFixed(1)}%
                        </div>
                      </div>
                      
                      {/* 表格展示 */}
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left", borderBottom: `1px solid ${C.borderBright}` }}>
                              <th style={{ padding: "8px 12px", fontWeight: 500 }}>资金区间 BR</th>
                              <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>中位卖出</th>
                              <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>P25</th>
                              <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>P75</th>
                              <th style={{ padding: "8px 12px", fontWeight: 500, textAlign: "right" }}>样本数</th>
                              <th style={{ padding: "8px 12px", fontWeight: 500 }}>条形(中位)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.sellByBR.map((b, idx) => {
                              const fmtBR = v => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`;
                              return (
                                <tr key={idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                                  <td style={{ padding: "8px 12px", fontFamily: "monospace", color: C.text }}>
                                    {fmtBR(b.BR)}
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: p.color, fontWeight: 600 }}>
                                    {(b.sellMed * 100).toFixed(1)}%
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: C.textDim, fontSize: 11 }}>
                                    {(b.sellP25 * 100).toFixed(1)}%
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: C.textDim, fontSize: 11 }}>
                                    {(b.sellP75 * 100).toFixed(1)}%
                                  </td>
                                  <td style={{ padding: "8px 12px", textAlign: "right", color: C.textFaint, fontSize: 11 }}>
                                    {b.n}
                                  </td>
                                  <td style={{ padding: "8px 12px", width: "30%" }}>
                                    <div style={{ position: "relative", height: 14, background: C.panelLight, borderRadius: 3 }}>
                                      <div style={{
                                        position: "absolute", left: 0, top: 0, bottom: 0,
                                        width: `${b.sellMed * 100}%`,
                                        background: p.color,
                                        borderRadius: 3,
                                      }} />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ marginTop: 12, padding: 10, background: C.panelLight, borderRadius: 6, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
                    <span style={{ color: C.accent }}>📐 关键洞察</span>:
                    "动态最优"的本质是 <b style={{ color: C.text }}>自留比例随资金等比例增长</b>。
                    BR 翻倍,自留比例也大致翻倍(直到接近 100% 上限)。这就是为什么职业玩家说
                    "卖股是穷人的复利,自打是富人的复利"——
                    资金上来后,你会自然地从"高溢价小自留"转到"少卖大自留"模式。
                  </div>
                </div>
              )}

              {/* 最终 BR 区间分布(取代之前的级别分布,因为级别封顶在 $500 会误导) */}
              {results.mode === "ladder" && (
                <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                  <SectionTitle>最终 BR 区间分布</SectionTitle>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
                    {numSims} 次模拟跑完后,最终 BR 落在哪个金额区间。<b style={{ color: C.accent }}>比"最终在哪档"更直接</b> ——
                    因为档位封顶,会让"刚升到顶档"和"暴富"挤在同一柱造成视觉幻觉。
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {results.paths.map(p => {
                      const dist = p.brDist || [];
                      const total = numSims;
                      const maxCount = Math.max(...dist.map(d => d.count), 1);
                      
                      return (
                        <div key={p.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: C.textFaint }}>
                              {p.isDynamic 
                                ? `~${(p.actualSellRatio * 100).toFixed(0)}% 动态` 
                                : `卖 ${(p.actualSellRatio * 100).toFixed(0)}%`}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 90, paddingTop: 18 }}>
                            {dist.map((b, idx) => {
                              const pct = (b.count / total) * 100;
                              const heightPx = Math.max(2, (b.count / maxCount) * 60);
                              const isLoss = idx <= 2;  // 破产/<$5K/$5K-10K(对 $5K 起步是亏)
                              const isBigWin = idx >= 7;  // $250K+
                              
                              const tooltipText = `${b.label}\n` +
                                `${b.count} 条路径 (${pct.toFixed(1)}%)`;
                              return (
                                <div key={idx} title={tooltipText}
                                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 40, cursor: "help" }}>
                                  <div style={{ fontSize: 10, color: pct > 0 ? C.text : C.textFaint, fontWeight: 500 }}>
                                    {pct >= 1 ? `${pct.toFixed(0)}%` : pct > 0 ? `${pct.toFixed(1)}%` : ""}
                                  </div>
                                  <div style={{
                                    width: "100%", height: heightPx,
                                    background: b.count > 0 
                                      ? (isLoss ? C.bad : isBigWin ? C.good : p.color)
                                      : C.border,
                                    opacity: b.count > 0 ? 0.85 : 0.3,
                                    borderRadius: "3px 3px 0 0",
                                  }} />
                                  <div style={{ fontSize: 9, color: C.textFaint, textAlign: "center", lineHeight: 1.2, minHeight: 22 }}>
                                    {b.label}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12, padding: 10, background: C.panelLight, borderRadius: 6, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
                    <span style={{ color: C.accent }}>💡 阅读方法</span>:
                    <span style={{ color: C.bad }}> 红色 </span>= 亏损/低于 $10K 路径,
                    <span style={{ color: C.good }}> 绿色 </span>= 大赚路径($250K+)。
                    全自打通常"两极化",卖股分布更集中。
                  </div>
                </div>
              )}
              
              {/* 最大回撤分布表 */}
              {results.mode === "ladder" && results.paths.some(p => p.ddStats) && (
                <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                  <SectionTitle>最大回撤分布 — 过程多痛苦</SectionTitle>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
                    每条路径在生命周期内的<b style={{ color: C.text }}>最大回撤</b>(从历史最高点跌到后续最低点的金额)。
                    <span style={{ display: "block", marginTop: 4 }}>
                      <b style={{ color: C.accent }}>关键洞察</b>:终值 BR 一样的路径,过程可能完全不同——
                      全自打的"$50K 中位"可能经历过 $30K 回撤,卖股的"$45K 中位"只经历过 $5K 回撤。
                      <b style={{ color: C.text }}>这才是「卖股是稳健派,自打是赌博」的具体含义</b>。
                    </span>
                  </div>
                  
                  {/* 分位统计表 */}
                  <div style={{ overflowX: "auto", marginBottom: 16 }}>
                    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ color: C.textDim, fontSize: 10, borderBottom: `1px solid ${C.borderBright}` }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 500 }}>路径</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>中位回撤</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>P25(运气好)</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>P75(运气差)</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>P90(很惨)</th>
                          <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>最大(噩梦)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.paths.map(p => {
                          const s = p.ddStats || {};
                          const fmt = v => `$${Math.round(v).toLocaleString()}`;
                          return (
                            <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                                  <span style={{ color: C.text, fontWeight: 500 }}>{p.name}</span>
                                </div>
                              </td>
                              <td style={{ padding: "10px", textAlign: "right", color: C.text, fontWeight: 600 }}>
                                {fmt(s.median || 0)}
                              </td>
                              <td style={{ padding: "10px", textAlign: "right", color: C.textDim }}>
                                {fmt(s.p25 || 0)}
                              </td>
                              <td style={{ padding: "10px", textAlign: "right", color: C.textDim }}>
                                {fmt(s.p75 || 0)}
                              </td>
                              <td style={{ padding: "10px", textAlign: "right", color: "#f59e0b" }}>
                                {fmt(s.p90 || 0)}
                              </td>
                              <td style={{ padding: "10px", textAlign: "right", color: C.bad, fontWeight: 600 }}>
                                {fmt(s.max || 0)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* 回撤分布柱状图 */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {results.paths.map(p => {
                      const dist = p.ddDist || [];
                      const total = numSims;
                      const maxCount = Math.max(...dist.map(d => d.count), 1);
                      
                      return (
                        <div key={p.id}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.name}</span>
                            <span style={{ fontSize: 11, color: C.textFaint }}>
                              中位回撤 ${Math.round(p.ddStats?.median || 0).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 70, paddingTop: 14 }}>
                            {dist.map((b, idx) => {
                              const pct = (b.count / total) * 100;
                              const heightPx = Math.max(2, (b.count / maxCount) * 50);
                              const isMild = idx <= 3;     // <$10K
                              const isSevere = idx >= 7;   // $100K+
                              
                              const tooltipText = `回撤 ${b.label}\n${b.count} 条路径 (${pct.toFixed(1)}%)`;
                              return (
                                <div key={idx} title={tooltipText}
                                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 36, cursor: "help" }}>
                                  <div style={{ fontSize: 9, color: pct > 0 ? C.text : C.textFaint, fontWeight: 500 }}>
                                    {pct >= 1 ? `${pct.toFixed(0)}%` : pct > 0 ? `${pct.toFixed(1)}%` : ""}
                                  </div>
                                  <div style={{
                                    width: "100%", height: heightPx,
                                    background: b.count > 0 
                                      ? (isMild ? C.good : isSevere ? C.bad : p.color)
                                      : C.border,
                                    opacity: b.count > 0 ? 0.85 : 0.3,
                                    borderRadius: "3px 3px 0 0",
                                  }} />
                                  <div style={{ fontSize: 9, color: C.textFaint, textAlign: "center", lineHeight: 1.2, minHeight: 22 }}>
                                    {b.label}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div style={{ marginTop: 12, padding: 10, background: C.panelLight, borderRadius: 6, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
                    <span style={{ color: C.accent }}>📐 心理承受度参考</span>:
                    一般人能承受 ~30 BI 起步资金的回撤(就 $5K 起步 = $750)。
                    <b style={{ color: C.text }}> 全自打的中位回撤往往 $20K-$50K</b> ——
                    这意味着你要看着 BR 从最高点回落几万美元而不动摇心态,
                    现实中很多人这时已经停止打了或者 tilt 输得更多。
                  </div>
                </div>
              )}
              
              {/* 档位分布图(保留,作为补充) */}
              {results.mode === "ladder" && (
                <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                  <SectionTitle>最终所在级别分布(参考)</SectionTitle>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
                    {numSims} 次模拟跑完后,各路径最终停留在哪个级别。柱子越靠右 = 升级越多。
                    起步级别用虚线标记。<b>注意</b>:档位封顶会让"刚升上去"和"暴富"挤在最高一档,看 BR 区间图更直接。
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {results.paths.map(p => {
                      const startIdx = findStartLevel(initialBR, levels, upMult);
                      const dist = p.levelDist || {};
                      const maxIdx = Math.max(...Object.keys(dist).map(k => +k), startIdx);
                      const minIdx = Math.min(...Object.keys(dist).map(k => +k), startIdx);
                      const total = numSims;
                      const maxCount = Math.max(...Object.values(dist), 1);
                      
                      return (
                        <div key={p.id} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: C.textFaint }}>
                              {p.isDynamic 
                                ? `~${(p.actualSellRatio * 100).toFixed(0)}% 动态` 
                                : `卖 ${(p.actualSellRatio * 100).toFixed(0)}%`}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 90, paddingTop: 18 }}>
                            {levels.map((lv, idx) => {
                              if (idx < minIdx - 1 || idx > maxIdx + 1) return null;
                              const count = dist[idx] || 0;
                              const pct = (count / total) * 100;
                              const isStart = idx === startIdx;
                              const heightPx = Math.max(2, (count / maxCount) * 60);
                              const timeStat = p.levelTimeStats?.[idx];
                              const tooltipText = timeStat
                                ? `级别 $${lv.bi} (ROI ${lv.roi}%)\n` +
                                  `最终停留: ${pct.toFixed(1)}% 路径\n` +
                                  `访问率: ${(timeStat.visitRate * 100).toFixed(0)}% 路径曾经打过这级别\n` +
                                  `每路径平均打 ${timeStat.mean.toFixed(0)} 颗子弹\n` +
                                  `中位 ${timeStat.median} 颗 (P25=${timeStat.p25}, P75=${timeStat.p75})\n` +
                                  `最多 ${timeStat.max} 颗`
                                : `级别 $${lv.bi}: ${pct.toFixed(1)}% 路径最终在此`;
                              return (
                                <div key={idx} title={tooltipText}
                                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 40, cursor: "help" }}>
                                  <div style={{ fontSize: 10, color: pct > 0 ? C.text : C.textFaint, fontWeight: 500 }}>
                                    {pct > 0 ? `${pct.toFixed(0)}%` : ""}
                                  </div>
                                  <div style={{
                                    width: "100%", height: heightPx,
                                    background: count > 0 ? p.color : C.border,
                                    opacity: count > 0 ? (isStart ? 1 : 0.7) : 0.3,
                                    borderRadius: "3px 3px 0 0",
                                    border: isStart ? `2px dashed ${C.text}` : "none",
                                  }} />
                                  <div style={{ fontSize: 10, color: isStart ? C.accent : C.textFaint, fontWeight: isStart ? 600 : 400 }}>
                                    ${lv.bi}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
                            ROI({levels[Math.min(maxIdx, levels.length-1)]?.roi}%) → ROI({levels[Math.max(minIdx, 0)]?.roi}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 每级别打了多少颗子弹 — 现实感校验表 */}
              {results.mode === "ladder" && results.paths.some(p => p.levelTimeStats) && (
                <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
                    <SectionTitle>各级别累计子弹数(现实感校验)</SectionTitle>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { id: "worst",  label: "最差",  desc: "P0" },
                        { id: "p25",    label: "P25",   desc: "差时" },
                        { id: "median", label: "中位",  desc: "P50" },
                        { id: "p75",    label: "P75",   desc: "好时" },
                        { id: "best",   label: "最好",  desc: "P100" },
                      ].map(q => (
                        <button key={q.id} onClick={() => setLevelTimeQuantile(q.id)}
                          style={{
                            ...chipStyle(levelTimeQuantile === q.id),
                            padding: "6px 12px", fontSize: 11,
                            display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                          }}>
                          <span style={{ fontWeight: 600 }}>{q.label}</span>
                          <span style={{ fontSize: 9, opacity: 0.7 }}>{q.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
                    {levelTimeQuantile === "median" && <>展示「中位路径」(运气一般的那条)在每个级别打了多少颗子弹。</>}
                    {levelTimeQuantile === "best" && <>展示「最好路径」(运气最爆的那条)的级别分布——这就是档位分布图里冲到 $1000 的那种路径。</>}
                    {levelTimeQuantile === "worst" && <>展示「最差路径」(运气最背的那条)的级别分布——下风期没出来。</>}
                    {levelTimeQuantile === "p25" && <>展示「P25 路径」(差时的代表)——25% 路径不如这条。</>}
                    {levelTimeQuantile === "p75" && <>展示「P75 路径」(好时的代表)——75% 路径不如这条。</>}
                    <span style={{ display: "block", marginTop: 4 }}>
                      <b style={{ color: C.accent }}>切换分位看不同运气下的级别累积</b>。最好运气的路径会在高级别打很多场,但现实中$1000+ 大场每周才几场。
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ color: C.textDim, fontSize: 10, borderBottom: `1px solid ${C.borderBright}` }}>
                          <th style={{ padding: "8px 10px", textAlign: "left", fontWeight: 500 }}>路径</th>
                          {levels.map((lv, idx) => (
                            <th key={idx} style={{ padding: "8px 4px", textAlign: "center", fontWeight: 500, minWidth: 65 }}>
                              ${lv.bi}<br/>
                              <span style={{ fontSize: 9, color: C.textFaint }}>{lv.roi}%</span>
                            </th>
                          ))}
                          <th style={{ padding: "8px 10px", textAlign: "right", fontWeight: 500 }}>总计</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.paths.map(p => {
                          const total = numBullets;
                          // 根据选中的分位,取对应的路径
                          const quantileData = p.levelTimeByQuantile?.[levelTimeQuantile] || {};
                          // 计算该路径的总子弹数(用作百分比基数)
                          let pathTotal = 0;
                          for (const v of Object.values(quantileData)) pathTotal += v;
                          if (pathTotal === 0) pathTotal = total; // 兜底
                          
                          return (
                            <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                              <td style={{ padding: "8px 10px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                                  <span style={{ color: C.text, fontWeight: 500 }}>{p.name}</span>
                                </div>
                              </td>
                              {levels.map((lv, idx) => {
                                const count = quantileData[idx] || 0;
                                if (count === 0) {
                                  return (
                                    <td key={idx} style={{ padding: "8px 4px", textAlign: "center", color: C.textFaint, fontSize: 10 }}>
                                      —
                                    </td>
                                  );
                                }
                                const pct = count / total * 100;
                                const opacity = Math.min(0.6, count / total + 0.05);
                                const stat = p.levelTimeStats?.[idx];
                                const tooltipText = `级别 $${lv.bi} (ROI ${lv.roi}%)\n` +
                                  `${({worst:'最差',p25:'P25',median:'中位',p75:'P75',best:'最好'})[levelTimeQuantile]}路径在此打了 ${count} 颗子弹 (${pct.toFixed(1)}%)\n` +
                                  (stat ? `\n所有路径统计:\n  中位 ${stat.median}, P25=${stat.p25}, P75=${stat.p75}, 最多 ${stat.max}\n  ${(stat.visitRate*100).toFixed(0)}% 路径曾访问` : "");
                                return (
                                  <td key={idx} title={tooltipText}
                                    style={{ 
                                      padding: "6px 4px", textAlign: "center", cursor: "help",
                                      background: `${p.color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`,
                                    }}>
                                    <div style={{ color: C.text, fontWeight: 600 }}>{count}</div>
                                    <div style={{ fontSize: 9, color: C.textDim }}>{pct.toFixed(0)}%</div>
                                  </td>
                                );
                              })}
                              <td style={{ padding: "8px 10px", textAlign: "right", color: C.textDim, fontSize: 11 }}>
                                {total}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: 12, padding: 10, background: C.panelLight, borderRadius: 6, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
                    <span style={{ color: C.accent }}>📐 现实感参考</span>:
                    一个全职玩家每天打 30-60 颗子弹,一年约 10000-20000 颗。
                    模型不知道高级别场次稀少,所以可能高估"在 $1000+ 级别累计子弹数"。
                    切到 <b style={{ color: C.text }}>最好</b> 看运气爆棚路径——那些"$1000 打 5000 颗"的故事在现实中需要 5+ 年专门蹲守。
                  </div>
                </div>
              )}

              {/* 大成绩散点图:展示不同分位路径的"冠军/前列时间轴" */}
              <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
                <SectionTitle>大成绩时间轴 — 同样运气好坏,赚多少差天壤</SectionTitle>
                
                <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 14, lineHeight: 1.6 }}>
                  每个圆点 = 一次<b style={{ color: C.text }}>大成绩</b>(rank 1-9 / 进 final table)。
                  <span style={{ color: C.accent }}> 横轴 = 第几颗子弹</span>,<span style={{ color: C.accent }}>纵轴 = 这次赢的美元(对数)</span>,<span style={{ color: C.accent }}>颜色 = 当时打的级别</span>。
                  <span style={{ display: "block", marginTop: 4 }}>
                    <b style={{ color: C.text }}>关键发现</b>:每条路径的大成绩次数差不多(20-37 个),
                    但<b style={{ color: C.good }}>「最好」路径的圆点都在高级别($300-$500)</b>,
                    而<b style={{ color: C.bad }}>「中位」「最差」的圆点都在 $25</b>——这才是 BR 差几十倍的真正原因。
                  </span>
                  <span style={{ display: "block", marginTop: 6, color: C.textDim }}>
                    <b style={{ color: C.accent }}>⚠ 关于「大成绩奖金」</b>:这是 rank 1-9 的奖金<b>总收入</b>,
                    <b style={{ color: C.text }}>不扣买入费用</b>。中位路径"赢 $52 万"看似很多,但 20K 颗子弹的<b>买入支出也是 ~$60 万</b>,
                    再加上小成绩(钱圈下层)收入,<b>净盈亏只有几千美元</b>——这就是 MTT「亏小钱赚大成绩」的真实账本。
                    净盈亏看<b style={{ color: C.text }}>终值 BR</b>(扣完买入)。
                  </span>
                </div>
                
                {/* 路径勾选 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  {results.paths.map(p => {
                    const isShown = selectedPathIds === null ? true : selectedPathIds.includes(p.id);
                    return (
                      <label key={p.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        fontSize: 12, cursor: "pointer",
                        padding: "6px 10px",
                        background: isShown ? `${p.color}15` : C.panelLight,
                        border: `1px solid ${isShown ? p.color : C.border}`,
                        borderRadius: 6,
                        opacity: isShown ? 1 : 0.5,
                      }}>
                        <input type="checkbox" checked={isShown}
                          onChange={(e) => {
                            const cur = selectedPathIds === null 
                              ? results.paths.map(x => x.id) 
                              : [...selectedPathIds];
                            if (e.target.checked) {
                              if (!cur.includes(p.id)) cur.push(p.id);
                            } else {
                              const idx = cur.indexOf(p.id);
                              if (idx >= 0) cur.splice(idx, 1);
                            }
                            setSelectedPathIds(cur);
                          }}
                          style={{ accentColor: p.color, cursor: "pointer" }} />
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                        <span style={{ color: isShown ? C.text : C.textDim }}>{p.name}</span>
                      </label>
                    );
                  })}
                </div>
                
                {/* 5 行:每个分位一行,只展示选中的路径 */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { id: "worst", label: "最差路径 (P0)", desc: "运气最背的那条", color: C.bad },
                    { id: "p25", label: "P25 路径", desc: "差时", color: "#a78bfa" },
                    { id: "median", label: "中位路径 (P50)", desc: "运气一般", color: C.text },
                    { id: "p75", label: "P75 路径", desc: "好时", color: "#60a5fa" },
                    { id: "best", label: "最好路径 (P100)", desc: "运气爆棚", color: C.good },
                  ].map(q => {
                    return (
                      <div key={q.id} style={{ background: C.panelLight, borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {results.paths.map(p => {
                            const isShown = selectedPathIds === null ? true : selectedPathIds.includes(p.id);
                            if (!isShown) return null;
                            const wins = p.bigWinsByQuantile?.[q.id] || [];
                            const finalBR = p.finalBRByQuantile?.[q.id] || 0;
                            const pathBR = p.pathByQuantile?.[q.id] || [];
                            const champCount = wins.filter(w => w.winBI >= 100).length;
                            const ftCount = wins.filter(w => w.winBI >= 12 && w.winBI < 100).length;
                            const totalDollars = wins.reduce((sum, w) => sum + w.winDollars, 0);
                            
                            // 找最大金额做 Y 轴上限
                            const maxDollars = Math.max(...wins.map(w => w.winDollars), 1000);
                            const maxBullets = numBullets;
                            
                            // 不同 BI 级别的颜色映射(从 $25 浅蓝 到 $1000 深红)
                            const levelColors = {
                              25:   "#3b82f6",   // 蓝
                              50:   "#06b6d4",   // 青
                              100:  "#10b981",   // 绿
                              200:  "#eab308",   // 黄
                              400:  "#f59e0b",   // 橙
                              1000: "#ef4444",   // 红
                            };
                            
                            // SVG 尺寸
                            const W = 720;  // 内部 SVG 宽度(用 viewBox 自适应)
                            const H = 105;
                            const padL = 40, padR = 10, padT = 10, padB = 22;
                            const plotW = W - padL - padR;
                            const plotH = H - padT - padB;
                            
                            // log scale Y(避免小金额挤在底部)
                            const minLog = Math.log10(100);  // 至少 $100
                            const maxLog = Math.log10(Math.max(maxDollars, 10000));
                            
                            return (
                              <div key={`${q.id}_${p.id}`}>
                                {/* 标题行 */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: q.color }}>{q.label}</span>
                                    <span style={{ fontSize: 11, color: C.textDim }}>{p.name}</span>
                                    <button
                                      onClick={() => setZoomedScatter({ quantileId: q.id, pathId: p.id, qLabel: q.label, qColor: q.color })}
                                      style={{
                                        marginLeft: 4,
                                        padding: "2px 8px",
                                        fontSize: 10,
                                        background: C.panel,
                                        border: `1px solid ${C.borderBright}`,
                                        borderRadius: 4,
                                        color: C.textDim,
                                        cursor: "pointer",
                                      }}
                                      title="放大查看"
                                    >🔍 放大</button>
                                  </div>
                                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.textDim }}>
                                    <span>终值 BR: <b style={{ color: C.text }}>${finalBR >= 0 ? finalBR.toLocaleString(undefined, { maximumFractionDigits: 0 }) : finalBR.toFixed(0)}</b></span>
                                    <span>冠军 <b style={{ color: C.text }}>{champCount}</b></span>
                                    <span>FT <b style={{ color: C.text }}>{ftCount}</b></span>
                                    <span title="所有大成绩(rank 1-9)的奖金总和。注意:这只是收入端,不扣买入费用。净盈亏看终值 BR。">
                                      大成绩奖金 <b style={{ color: C.text }}>${Math.round(totalDollars).toLocaleString()}</b>
                                    </span>
                                  </div>
                                </div>
                                
                                {/* SVG 散点图 */}
                                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
                                  {/* 背景网格 */}
                                  <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={C.border} strokeWidth="1" />
                                  <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={C.border} strokeWidth="1" />
                                  
                                  {/* Y 轴刻度 */}
                                  {[100, 1000, 10000, 100000].map(v => {
                                    if (Math.log10(v) > maxLog) return null;
                                    const y = padT + plotH * (1 - (Math.log10(v) - minLog) / (maxLog - minLog));
                                    return (
                                      <g key={v}>
                                        <line x1={padL - 3} y1={y} x2={W - padR} y2={y} stroke={C.border} strokeDasharray="2 4" strokeWidth="0.5" opacity="0.5" />
                                        <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill={C.textFaint}>
                                          ${v >= 1000 ? `${v/1000}K` : v}
                                        </text>
                                      </g>
                                    );
                                  })}
                                  
                                  {/* X 轴刻度(每 2500 颗一个) */}
                                  {(() => {
                                    const ticks = [];
                                    const step = 2500;
                                    for (let t = 0; t <= maxBullets; t += step) {
                                      const x = padL + (t / maxBullets) * plotW;
                                      ticks.push(
                                        <g key={`xt_${t}`}>
                                          <line x1={x} y1={H - padB} x2={x} y2={H - padB + 3} stroke={C.textFaint} strokeWidth="0.5" />
                                          <text x={x} y={H - padB + 13} textAnchor="middle" fontSize="9" fill={C.textFaint}>
                                            {t === 0 ? "0" : t < 1000 ? t : `${t/1000}K`}
                                          </text>
                                        </g>
                                      );
                                    }
                                    // 最右边补一个(确保 maxBullets 不在 step 整数倍上时也显示)
                                    if (maxBullets % step !== 0) {
                                      const x = padL + plotW;
                                      ticks.push(
                                        <g key={`xt_end`}>
                                          <line x1={x} y1={H - padB} x2={x} y2={H - padB + 3} stroke={C.textFaint} strokeWidth="0.5" />
                                          <text x={x} y={H - padB + 13} textAnchor="middle" fontSize="9" fill={C.textFaint}>
                                            {maxBullets >= 1000 ? `${(maxBullets/1000).toFixed(maxBullets % 1000 === 0 ? 0 : 1)}K` : maxBullets}
                                          </text>
                                        </g>
                                      );
                                    }
                                    return ticks;
                                  })()}
                                  
                                  {/* 散点 */}
                                  {wins.map((w, idx) => {
                                    const x = padL + (w.bullet / maxBullets) * plotW;
                                    const yLog = Math.log10(Math.max(w.winDollars, 100));
                                    const y = padT + plotH * (1 - (yLog - minLog) / (maxLog - minLog));
                                    const r = w.winBI >= 100 ? 4.5 : w.winBI >= 50 ? 3.5 : 2.5;
                                    const color = levelColors[w.bi] || "#888";
                                    return (
                                      <circle key={idx} cx={x} cy={y} r={r} 
                                        fill={color} 
                                        opacity={0.8}
                                        stroke={C.bg}
                                        strokeWidth="0.5">
                                        <title>{`第 ${w.bullet} 颗 | 在 $${w.bi} 级别 | 赢 ${w.winBI.toFixed(0)} BI = $${Math.round(w.winDollars).toLocaleString()} | BR 涨到 $${Math.round(w.BRAfter).toLocaleString()}`}</title>
                                      </circle>
                                    );
                                  })}
                                  
                                  {/* 无数据提示 */}
                                  {wins.length === 0 && (
                                    <text x={W/2} y={H/2} textAnchor="middle" fontSize="11" fill={C.textFaint}>
                                      无大成绩(全程都在亏钱)
                                    </text>
                                  )}
                                </svg>
                                
                                {/* BR 净盈亏曲线(下方,跟散点共享 X 轴) */}
                                {pathBR.length > 1 && (() => {
                                  const curveH = 70;
                                  const curvePadL = padL, curvePadR = padR;
                                  const curvePadT = 8, curvePadB = 16;
                                  const curvePlotH = curveH - curvePadT - curvePadB;
                                  const curvePlotW = W - curvePadL - curvePadR;
                                  
                                  // 计算净盈亏(BR - 起始 BR)
                                  const startBR = pathBR[0];
                                  const netPnL = pathBR.map(br => br - startBR);
                                  const minPnL = Math.min(...netPnL, 0);
                                  const maxPnL = Math.max(...netPnL, 0);
                                  const range = maxPnL - minPnL || 1;
                                  
                                  // Y 轴归一化
                                  const yScale = pnl => curvePadT + curvePlotH * (1 - (pnl - minPnL) / range);
                                  const xScale = i => curvePadL + (i / (pathBR.length - 1)) * curvePlotW;
                                  
                                  // 生成路径 d 属性
                                  const linePoints = pathBR.map((_, i) => `${xScale(i)},${yScale(netPnL[i])}`).join(" L ");
                                  const linePath = `M ${linePoints}`;
                                  
                                  // 0 线位置
                                  const zeroY = yScale(0);
                                  
                                  // 区域填充(0 到曲线)
                                  const areaPoints = pathBR.map((_, i) => `${xScale(i)},${yScale(netPnL[i])}`).join(" L ");
                                  const areaPath = `M ${xScale(0)},${zeroY} L ${areaPoints} L ${xScale(pathBR.length - 1)},${zeroY} Z`;
                                  
                                  // 终值颜色
                                  const finalPnL = netPnL[netPnL.length - 1];
                                  const lineColor = finalPnL >= 0 ? C.good : C.bad;
                                  
                                  // Y 轴格式
                                  const fmtY = v => {
                                    const a = Math.abs(v);
                                    const sign = v < 0 ? "−" : v > 0 ? "+" : "";
                                    if (a >= 1e6) return `${sign}$${(a/1e6).toFixed(1)}M`;
                                    if (a >= 1000) return `${sign}$${(a/1000).toFixed(0)}K`;
                                    return `${sign}$${a.toFixed(0)}`;
                                  };
                                  
                                  return (
                                    <svg viewBox={`0 0 ${W} ${curveH}`} style={{ width: "100%", height: curveH, display: "block", marginTop: -2 }}>
                                      {/* 背景轴 */}
                                      <line x1={curvePadL} y1={curvePadT} x2={curvePadL} y2={curveH - curvePadB} stroke={C.border} strokeWidth="1" />
                                      <line x1={curvePadL} y1={curveH - curvePadB} x2={W - curvePadR} y2={curveH - curvePadB} stroke={C.border} strokeWidth="1" />
                                      
                                      {/* 0 参考线(打平线) */}
                                      <line x1={curvePadL} y1={zeroY} x2={W - curvePadR} y2={zeroY} 
                                        stroke={C.borderBright} strokeDasharray="3 3" strokeWidth="0.5" opacity="0.7" />
                                      <text x={W - curvePadR + 1} y={zeroY + 3} fontSize="8" fill={C.textFaint}>$0</text>
                                      
                                      {/* Y 轴刻度(顶/底) */}
                                      <text x={curvePadL - 4} y={curvePadT + 6} textAnchor="end" fontSize="8" fill={C.textFaint}>{fmtY(maxPnL)}</text>
                                      <text x={curvePadL - 4} y={curveH - curvePadB - 1} textAnchor="end" fontSize="8" fill={C.textFaint}>{fmtY(minPnL)}</text>
                                      
                                      {/* X 轴刻度(每 2500 一个,跟上面散点对齐) */}
                                      {(() => {
                                        const ticks = [];
                                        const step = 2500;
                                        for (let t = 0; t <= maxBullets; t += step) {
                                          const x = curvePadL + (t / maxBullets) * curvePlotW;
                                          ticks.push(
                                            <g key={`xt2_${t}`}>
                                              <line x1={x} y1={curveH - curvePadB} x2={x} y2={curveH - curvePadB + 2} stroke={C.textFaint} strokeWidth="0.5" />
                                              <text x={x} y={curveH - curvePadB + 11} textAnchor="middle" fontSize="8" fill={C.textFaint}>
                                                {t === 0 ? "0" : t < 1000 ? t : `${t/1000}K`}
                                              </text>
                                            </g>
                                          );
                                        }
                                        return ticks;
                                      })()}
                                      
                                      {/* 区域填充 */}
                                      <path d={areaPath} fill={lineColor} opacity="0.15" />
                                      
                                      {/* 曲线 */}
                                      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" opacity="0.9" />
                                      
                                      {/* 标签 */}
                                      <text x={curvePadL + 4} y={curvePadT + 8} fontSize="9" fill={C.textDim}>
                                        净盈亏曲线
                                      </text>
                                    </svg>
                                  );
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* 级别颜色图例 */}
                <div style={{ marginTop: 12, padding: 10, background: C.panelLight, borderRadius: 6, fontSize: 11, color: C.textDim }}>
                  <div style={{ marginBottom: 6 }}>级别颜色:</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {[
                      { bi: 25, color: "#3b82f6" }, { bi: 50, color: "#06b6d4" },
                      { bi: 100, color: "#10b981" }, { bi: 200, color: "#eab308" },
                      { bi: 400, color: "#f59e0b" }, { bi: 1000, color: "#ef4444" },
                    ].map(c => (
                      <div key={c.bi} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: c.color }} />
                        <span>${c.bi}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10, color: C.textFaint }}>
                    点的大小:大圆 = 冠军(≥100 BI),中圆 = rank 2-5(50-100 BI),小圆 = rank 6-9(12-50 BI)
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* 大成绩散点图放大模态框 */}
      {zoomedScatter && (() => {
        const path = results?.paths?.find(p => p.id === zoomedScatter.pathId);
        if (!path) return null;
        const wins = path.bigWinsByQuantile?.[zoomedScatter.quantileId] || [];
        const finalBR = path.finalBRByQuantile?.[zoomedScatter.quantileId] || 0;
        const pathBR = path.pathByQuantile?.[zoomedScatter.quantileId] || [];
        const champCount = wins.filter(w => w.winBI >= 100).length;
        const ftCount = wins.filter(w => w.winBI >= 12 && w.winBI < 100).length;
        const totalDollars = wins.reduce((sum, w) => sum + w.winDollars, 0);
        return (
          <ZoomedScatterModal
            quantileLabel={zoomedScatter.qLabel}
            quantileColor={zoomedScatter.qColor}
            pathName={path.name}
            pathColor={path.color}
            wins={wins}
            pathBR={pathBR}
            finalBR={finalBR}
            champCount={champCount}
            ftCount={ftCount}
            totalDollars={totalDollars}
            numBullets={numBullets}
            initialBR={initialBR}
            onClose={() => setZoomedScatter(null)}
          />
        );
      })()}
    </div>
  );
}

// ============================================================
// 风格自测:用曲线图选择 + 数据输入,确定玩家风格
// ============================================================

// 生成不同风格的典型曲线(确定性 + 强制特征点)
function generateCurve(style, width, height) {
  const N = 100;
  const points = [];
  let cum = 0;
  
  // 每种风格固定种子,保证视觉特征明显且稳定
  const seedMap = { steady: 15, balanced: 23, deepRun: 41, loser: 11, spewy: 53 };
  let seed = seedMap[style] || 17;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  
  // 强制大爆位置,让每条曲线视觉特征明显
  const bigSpikes = {
    steady: [],
    balanced: [40, 75],
    deepRun: [55, 88],
    loser: [],
    spewy: [22, 50, 78],
  };
  
  for (let i = 0; i < N; i++) {
    let delta = 0;
    const isSpike = (bigSpikes[style] || []).includes(i);
    
    if (style === "steady") {
      // 稳健:必须保证整体上行,提高入围率,降低空军率
      const r = rand();
      if (r < 0.65) delta = -1;
      else if (r < 0.98) delta = 1.8 + rand() * 1.5;
      else delta = 4 + rand() * 3;
    } else if (style === "balanced") {
      if (isSpike) delta = 18 + rand() * 12;
      else {
        const r = rand();
        if (r < 0.82) delta = -1;
        else delta = 2 + rand() * 3;
      }
    } else if (style === "deepRun") {
      // 搏深跑:轻微下行 + 强制大爆翻身
      if (isSpike) delta = 50 + rand() * 30;
      else {
        const r = rand();
        if (r < 0.90) delta = -1;
        else delta = 1 + rand() * 2;
      }
    } else if (style === "loser") {
      const r = rand();
      if (r < 0.86) delta = -1;
      else delta = 1 + rand() * 2;
    } else if (style === "spewy") {
      if (isSpike) delta = 30 + rand() * 25;
      else {
        const r = rand();
        if (r < 0.92) delta = -1;
        else delta = 1 + rand() * 2;
      }
    }
    cum += delta;
    points.push(cum);
  }
  
  // 归一化到 SVG 坐标
  let minV = 0, maxV = 0;
  for (const p of points) {
    if (p < minV) minV = p;
    if (p > maxV) maxV = p;
  }
  const range = (maxV - minV) || 1;
  const padding = 8;
  
  const xStep = (width - 2 * padding) / (N - 1);
  const yScale = (height - 2 * padding) / range;
  const zeroY = height - padding - (-minV) * yScale;
  
  const path = points.map((p, i) => {
    const x = padding + i * xStep;
    const y = height - padding - (p - minV) * yScale;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
  
  return { path, zeroY };
}

function StyleCurveCard({ style, label, desc, sigmaMult, color, selected, onClick }) {
  const W = 240, H = 100;
  const { path, zeroY } = useMemo(() => generateCurve(style, W, H), [style]);
  
  return (
    <div onClick={onClick} style={{
      background: selected ? `${color}15` : C.panelLight,
      border: `2px solid ${selected ? color : C.border}`,
      borderRadius: 10, padding: 14, cursor: "pointer",
      transition: "all 0.15s",
    }}>
      <svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>
        {/* 零线 */}
        <line x1={8} y1={zeroY} x2={W - 8} y2={zeroY}
          stroke={C.borderBright} strokeWidth={1} strokeDasharray="3 3" />
        {/* 曲线 */}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <div style={{ marginTop: 10, textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: selected ? color : C.text, marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{desc}</div>
        <div style={{ fontSize: 10, color: selected ? color : C.textFaint, marginTop: 6, fontWeight: 500 }}>
          σ × {sigmaMult.toFixed(2)}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 大成绩散点 + BR 曲线放大模态框
// ============================================================
function ZoomedScatterModal({
  quantileLabel, quantileColor,
  pathName, pathColor,
  wins, pathBR, finalBR,
  champCount, ftCount, totalDollars,
  numBullets, initialBR,
  onClose,
}) {
  const [hoverBullet, setHoverBullet] = useState(null);
  
  // ESC 关闭
  if (typeof window !== "undefined") {
    // 用 useEffect 替代但要避免 import 改动
  }
  
  // SVG 大尺寸
  const W = 1400;
  const padL = 70, padR = 30, padT = 20, padB = 30;
  const scatterH = 380;
  const curveH = 240;
  const totalH = scatterH + curveH + 30;  // 中间 30px 间隔
  const plotW = W - padL - padR;
  
  // 散点图 Y 轴(log)
  const maxDollars = Math.max(...wins.map(w => w.winDollars), 1000);
  const minLogS = Math.log10(100);
  const maxLogS = Math.log10(Math.max(maxDollars, 10000));
  const scatterPlotH = scatterH - padT - padB;
  
  // 曲线 Y 轴
  const startBR = pathBR[0] || initialBR;
  const netPnL = pathBR.map(br => br - startBR);
  const minPnL = Math.min(...netPnL, 0);
  const maxPnL = Math.max(...netPnL, 0);
  const range = maxPnL - minPnL || 1;
  const curvePlotH = curveH - padT - padB;
  
  // 坐标转换
  const xScaleScatter = bullet => padL + (bullet / numBullets) * plotW;
  const yScaleScatter = dollars => padT + scatterPlotH * (1 - (Math.log10(Math.max(dollars, 100)) - minLogS) / (maxLogS - minLogS));
  
  const curveTopY = scatterH + 30;
  const xScaleCurve = i => padL + (i / Math.max(1, pathBR.length - 1)) * plotW;
  const yScaleCurve = pnl => curveTopY + padT + curvePlotH * (1 - (pnl - minPnL) / range);
  
  const fmtY = v => {
    const a = Math.abs(v);
    const sign = v < 0 ? "−" : v > 0 ? "+" : "";
    if (a >= 1e6) return `${sign}$${(a/1e6).toFixed(2)}M`;
    if (a >= 1000) return `${sign}$${(a/1000).toFixed(1)}K`;
    return `${sign}$${a.toFixed(0)}`;
  };
  
  // 等级颜色
  const levelColors = {
    25: "#3b82f6", 50: "#06b6d4", 100: "#10b981",
    200: "#eab308", 400: "#f59e0b", 1000: "#ef4444",
  };
  
  // hover 时找最近的 bullet
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const x = xRatio * W;
    if (x < padL || x > W - padR) {
      setHoverBullet(null);
      return;
    }
    const bullet = Math.round(((x - padL) / plotW) * numBullets);
    setHoverBullet(Math.max(0, Math.min(numBullets, bullet)));
  };
  
  // hover 时算 BR / netPnL
  let hoverBR = null, hoverNetPnL = null, hoverWin = null;
  let bulletPerSample = 0, sampleStart = 0, sampleEnd = 0;
  if (hoverBullet !== null && pathBR.length > 1) {
    const idx = Math.round((hoverBullet / numBullets) * (pathBR.length - 1));
    hoverBR = pathBR[idx];
    hoverNetPnL = hoverBR - startBR;
    // 该采样点代表的子弹区间
    bulletPerSample = numBullets / (pathBR.length - 1);
    sampleStart = Math.round(idx * bulletPerSample);
    sampleEnd = Math.min(numBullets, Math.round((idx + 1) * bulletPerSample));
    // 找最接近的大成绩(扩大到该采样区间内)
    hoverWin = wins.find(w => w.bullet >= sampleStart - bulletPerSample/2 && w.bullet <= sampleEnd + bulletPerSample/2);
  }
  
  const lineColor = (netPnL[netPnL.length - 1] || 0) >= 0 ? C.good : C.bad;
  
  // 区域填充路径
  const zeroY = yScaleCurve(0);
  const linePoints = pathBR.map((_, i) => `${xScaleCurve(i)},${yScaleCurve(netPnL[i])}`).join(" L ");
  const linePath = `M ${linePoints}`;
  const areaPath = `M ${xScaleCurve(0)},${zeroY} L ${linePoints} L ${xScaleCurve(pathBR.length - 1)},${zeroY} Z`;
  
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.panel,
          border: `1px solid ${C.borderBright}`,
          borderRadius: 12,
          padding: 24,
          maxWidth: "95vw",
          maxHeight: "95vh",
          overflowY: "auto",
          width: "100%",
          position: "relative",
        }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12, right: 12,
            width: 32, height: 32,
            background: C.panelLight,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            color: C.text,
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
          title="关闭(也可点空白处)"
        >×</button>
        
        {/* 标题 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: pathColor }} />
            <h3 style={{ margin: 0, fontSize: 18, color: quantileColor, fontWeight: 600 }}>{quantileLabel}</h3>
            <span style={{ fontSize: 13, color: C.textDim }}>{pathName}</span>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: 12, color: C.textDim, flexWrap: "wrap" }}>
            <span>终值 BR: <b style={{ color: C.text }}>${Math.round(finalBR).toLocaleString()}</b></span>
            <span>净盈亏: <b style={{ color: (finalBR - initialBR) >= 0 ? C.good : C.bad }}>{fmtY(finalBR - initialBR)}</b></span>
            <span>冠军 <b style={{ color: C.text }}>{champCount}</b></span>
            <span>FT <b style={{ color: C.text }}>{ftCount}</b></span>
            <span>大成绩奖金 <b style={{ color: C.text }}>${Math.round(totalDollars).toLocaleString()}</b></span>
            <span>子弹数 <b style={{ color: C.text }}>{numBullets.toLocaleString()}</b></span>
          </div>
        </div>
        
        {/* SVG */}
        <svg
          viewBox={`0 0 ${W} ${totalH}`}
          style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverBullet(null)}
        >
          {/* === 散点图区 === */}
          {/* 背景轴 */}
          <line x1={padL} y1={padT} x2={padL} y2={scatterH - padB} stroke={C.border} strokeWidth="1" />
          <line x1={padL} y1={scatterH - padB} x2={W - padR} y2={scatterH - padB} stroke={C.border} strokeWidth="1" />
          
          {/* Y 轴刻度 */}
          {[100, 1000, 10000, 100000, 1000000].map(v => {
            if (Math.log10(v) > maxLogS + 0.1) return null;
            const y = padT + scatterPlotH * (1 - (Math.log10(v) - minLogS) / (maxLogS - minLogS));
            return (
              <g key={`ys_${v}`}>
                <line x1={padL - 5} y1={y} x2={W - padR} y2={y} stroke={C.border} strokeDasharray="3 5" strokeWidth="0.5" opacity="0.4" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill={C.textFaint}>
                  ${v >= 1000000 ? `${v/1e6}M` : v >= 1000 ? `${v/1000}K` : v}
                </text>
              </g>
            );
          })}
          
          {/* X 轴刻度(每 2500) */}
          {(() => {
            const ticks = [];
            const step = 2500;
            for (let t = 0; t <= numBullets; t += step) {
              const x = xScaleScatter(t);
              ticks.push(
                <g key={`xs_${t}`}>
                  <line x1={x} y1={scatterH - padB} x2={x} y2={scatterH - padB + 5} stroke={C.textFaint} strokeWidth="0.5" />
                  <text x={x} y={scatterH - padB + 18} textAnchor="middle" fontSize="11" fill={C.textFaint}>
                    {t === 0 ? "0" : t < 1000 ? t : `${t/1000}K`}
                  </text>
                </g>
              );
            }
            return ticks;
          })()}
          
          {/* 散点 */}
          {wins.map((w, idx) => {
            const x = xScaleScatter(w.bullet);
            const y = yScaleScatter(w.winDollars);
            const r = w.winBI >= 100 ? 7 : w.winBI >= 50 ? 5.5 : 4;
            const color = levelColors[w.bi] || "#888";
            return (
              <circle key={idx} cx={x} cy={y} r={r} 
                fill={color} 
                opacity={0.85}
                stroke={C.bg}
                strokeWidth="1">
                <title>{`第 ${w.bullet} 颗 | $${w.bi} 级别 | ${w.winBI.toFixed(0)} BI = $${Math.round(w.winDollars).toLocaleString()} | BR 涨到 $${Math.round(w.BRAfter).toLocaleString()}`}</title>
              </circle>
            );
          })}
          
          {/* 子图标题 */}
          <text x={padL + 4} y={padT + 4} fontSize="13" fill={C.text} fontWeight="600">
            大成绩散点(纵轴 = 该次赢的美元,对数)
          </text>
          
          {/* === 净盈亏曲线区 === */}
          {/* 边界 */}
          <line x1={padL} y1={curveTopY + padT} x2={padL} y2={curveTopY + curveH - padB} stroke={C.border} strokeWidth="1" />
          <line x1={padL} y1={curveTopY + curveH - padB} x2={W - padR} y2={curveTopY + curveH - padB} stroke={C.border} strokeWidth="1" />
          
          {/* 0 参考线 */}
          <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke={C.borderBright} strokeDasharray="4 4" strokeWidth="1" opacity="0.7" />
          <text x={W - padR + 4} y={zeroY + 4} fontSize="11" fill={C.textFaint}>$0(打平)</text>
          
          {/* Y 刻度(顶/中/底) */}
          {(() => {
            const labels = [];
            // 5 个等间隔的刻度
            for (let f = 0; f <= 4; f++) {
              const v = minPnL + (range * f / 4);
              const y = yScaleCurve(v);
              labels.push(
                <g key={`yc_${f}`}>
                  <line x1={padL - 4} y1={y} x2={W - padR} y2={y} stroke={C.border} strokeDasharray="3 5" strokeWidth="0.5" opacity="0.3" />
                  <text x={padL - 8} y={y + 4} textAnchor="end" fontSize="11" fill={C.textFaint}>{fmtY(v)}</text>
                </g>
              );
            }
            return labels;
          })()}
          
          {/* X 刻度 */}
          {(() => {
            const ticks = [];
            const step = 2500;
            for (let t = 0; t <= numBullets; t += step) {
              const x = xScaleScatter(t);
              ticks.push(
                <g key={`xc_${t}`}>
                  <line x1={x} y1={curveTopY + curveH - padB} x2={x} y2={curveTopY + curveH - padB + 5} stroke={C.textFaint} strokeWidth="0.5" />
                  <text x={x} y={curveTopY + curveH - padB + 18} textAnchor="middle" fontSize="11" fill={C.textFaint}>
                    {t === 0 ? "0" : t < 1000 ? t : `${t/1000}K`}
                  </text>
                </g>
              );
            }
            return ticks;
          })()}
          
          {/* 区域填充 */}
          <path d={areaPath} fill={lineColor} opacity="0.18" />
          
          {/* 曲线 */}
          <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2" />
          
          {/* 曲线上叠加大成绩点(垂直对齐) */}
          {wins.map((w, idx) => {
            const x = xScaleScatter(w.bullet);
            // 找该 bullet 时的 BR(从 path 里查)
            const pathIdx = Math.round((w.bullet / numBullets) * (pathBR.length - 1));
            const brAtBullet = pathBR[pathIdx];
            const pnlAtBullet = brAtBullet - startBR;
            const y = yScaleCurve(pnlAtBullet);
            const r = w.winBI >= 100 ? 5 : w.winBI >= 50 ? 4 : 2.5;
            const color = levelColors[w.bi] || "#888";
            return (
              <circle key={`cw_${idx}`} cx={x} cy={y} r={r} 
                fill={color} 
                opacity={0.7}
                stroke={C.bg}
                strokeWidth="1">
                <title>{`第 ${w.bullet} 颗大成绩 | 此时 BR ≈ $${Math.round(brAtBullet).toLocaleString()}`}</title>
              </circle>
            );
          })}
          
          {/* 子图标题 */}
          <text x={padL + 4} y={curveTopY + padT + 4} fontSize="13" fill={C.text} fontWeight="600">
            BR 净盈亏曲线(同色点 = 该时刻的大成绩,垂直对齐上图)
          </text>
          
          {/* === Hover 十字线 + tooltip === */}
          {hoverBullet !== null && (
            <g>
              <line 
                x1={xScaleScatter(hoverBullet)} y1={padT}
                x2={xScaleScatter(hoverBullet)} y2={curveTopY + curveH - padB}
                stroke={C.borderBright} strokeWidth="0.8" strokeDasharray="4 3" opacity="0.8" />
              {/* 曲线上标记点 */}
              {hoverBR !== null && (
                <circle 
                  cx={xScaleScatter(hoverBullet)} 
                  cy={yScaleCurve(hoverNetPnL)} 
                  r={5} 
                  fill={lineColor} 
                  stroke={C.bg} 
                  strokeWidth="2" />
              )}
            </g>
          )}
        </svg>
        
        {/* Hover 信息面板 */}
        {hoverBullet !== null && hoverBR !== null && (
          <div style={{
            marginTop: 12,
            padding: 12,
            background: C.panelLight,
            border: `1px solid ${C.borderBright}`,
            borderRadius: 6,
            display: "flex",
            gap: 24,
            fontSize: 13,
            flexWrap: "wrap",
          }}>
            <span>
              采样区间 <b style={{ color: C.text }}>[{sampleStart.toLocaleString()} - {sampleEnd.toLocaleString()}]</b> 颗
              <span style={{ color: C.textFaint, marginLeft: 4 }}>(每点跨 {Math.round(bulletPerSample)} 颗)</span>
            </span>
            <span>区间末 BR: <b style={{ color: C.text }}>${Math.round(hoverBR).toLocaleString()}</b></span>
            <span>净盈亏: <b style={{ color: hoverNetPnL >= 0 ? C.good : C.bad }}>{fmtY(hoverNetPnL)}</b></span>
            {hoverWin && (
              <span>
                区间内大成绩(第 {hoverWin.bullet.toLocaleString()} 颗): 
                <b style={{ color: levelColors[hoverWin.bi] || C.text, marginLeft: 4 }}>
                  ${hoverWin.bi} 级别 / {hoverWin.winBI.toFixed(0)} BI / ${Math.round(hoverWin.winDollars).toLocaleString()}
                </b>
              </span>
            )}
          </div>
        )}
        
        {/* 级别图例 */}
        <div style={{ marginTop: 12, padding: 10, background: C.panelLight, borderRadius: 6, fontSize: 11, color: C.textDim }}>
          <span style={{ marginRight: 12 }}>级别颜色:</span>
          {[
            { bi: 25, color: "#3b82f6" }, { bi: 50, color: "#06b6d4" },
            { bi: 100, color: "#10b981" }, { bi: 200, color: "#eab308" },
            { bi: 400, color: "#f59e0b" }, { bi: 1000, color: "#ef4444" },
          ].map(c => (
            <span key={c.bi} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, display: "inline-block" }} />
              <span>${c.bi}</span>
            </span>
          ))}
          <span style={{ marginLeft: 12, color: C.textFaint }}>
            点的大小:大 = 冠军(≥100 BI),中 = rank 2-5,小 = rank 6-9
          </span>
        </div>
      </div>
    </div>
  );
}

function QuizTab() {
  // 选定的风格(可由曲线点击或自测填入)
  const [selectedStyle, setSelectedStyle] = useState(null);
  
  // 数据自测输入
  const [itmPct, setItmPct] = useState("");
  const [avgCash, setAvgCash] = useState("");  // 单位:倍 BI
  const [maxCash, setMaxCash] = useState("");  // 单位:倍 BI
  const [roi, setRoi] = useState("");
  
  // 五种风格定义
  const styles = [
    {
      id: "steady",
      label: "稳健入围型",
      desc: "曲线平滑斜向上,小起小落",
      sigmaMult: 0.85,
      shape: 0.15,
      color: "#10b981",
      // 自测特征:ITM% > 18%,平均奖金 < 3 BI,最大奖金 < 80 BI
      criteria: { itmMin: 18, itmMax: 30, avgMin: 1.2, avgMax: 3.5, maxMax: 100 },
      details: [
        "ITM% 通常在 18-25%",
        "平均奖金 1.5-3 倍 BI",
        "最大单次奖金 30-80 BI",
        "曲线特征:几乎是平滑斜向上的线",
        "代表打法:turbo / hyper、PKO 早期赏金狩猎",
      ],
    },
    {
      id: "balanced",
      label: "均衡型",
      desc: "平稳上行,偶尔中等台阶跳",
      sigmaMult: 1.0,
      shape: 0.5,
      color: "#3b82f6",
      criteria: { itmMin: 14, itmMax: 19, avgMin: 2, avgMax: 6, maxMax: 250 },
      details: [
        "ITM% 大约 15-18%",
        "平均奖金 2-5 倍 BI",
        "最大单次奖金 50-200 BI",
        "曲线特征:主体平滑,偶有中等跳跃",
        "代表打法:大多数中级 reg,Felix 模型默认",
      ],
    },
    {
      id: "deepRun",
      label: "搏深跑型",
      desc: "长期横盘,偶尔阶梯式大爆",
      sigmaMult: 1.4,
      shape: 0.85,
      color: "#a78bfa",
      criteria: { itmMin: 8, itmMax: 14, avgMin: 4, avgMax: 20, maxMax: 5000 },
      details: [
        "ITM% 偏低,12-15%",
        "平均奖金 5-15 倍 BI",
        "最大单次奖金 500-2000+ BI",
        "曲线特征:长期持平或下行,某天阶梯式跳上去",
        "代表打法:打高手云集大场的 reg、追求冠军式打法",
      ],
    },
    {
      id: "loser",
      label: "稳定输家",
      desc: "整体斜向下,长期 ROI 为负",
      sigmaMult: 1.0,
      shape: 0.5,
      color: "#ef4444",
      criteria: { itmMax: 14, roiMax: 0 },
      details: [
        "ROI 长期为负(−5% 到 −30%)",
        "这不是风格问题,是水平问题",
        "卖股救不了——只能让你输得更慢",
        "建议:先解决打牌水平,再考虑卖股",
      ],
      isWarning: true,
    },
    {
      id: "spewy",
      label: "抽奖/Spewy 型",
      desc: "大起大落,靠零星大爆撑",
      sigmaMult: 1.4,
      shape: 0.85,
      color: "#f59e0b",
      criteria: { itmMax: 12, avgMin: 4 },
      details: [
        "ITM% 很低(8-12%)",
        "ROI 不一定负,但靠少数大爆撑住",
        "曲线特征:长期下行 → 大爆 → 短暂回正 → 又下行",
        "代表打法:激进 rec、低 BR 悍将",
        "建议:ROI 估计要保守,不要拍高",
      ],
    },
  ];
  
  // 数据自测自动判断
  const autoMatched = useMemo(() => {
    const itm = parseFloat(itmPct);
    const avg = parseFloat(avgCash);
    const max = parseFloat(maxCash);
    const r = parseFloat(roi);
    
    if (isNaN(itm) || isNaN(avg)) return null;
    
    // 先看 ROI(如果填了)
    if (!isNaN(r) && r < 0) return styles[3]; // 稳定输家
    
    // 集中度指数 = max / (avg × 入围次数比例)
    // 但简化处理:直接看 max/avg 比值
    const concentration = !isNaN(max) ? max / avg : 0;
    
    // 抽奖型:ITM 很低但平均奖金大
    if (itm < 12 && avg > 4) return styles[4];
    
    // 稳健:高 ITM,低平均
    if (itm >= 18 && avg < 3.5) return styles[0];
    
    // 搏深跑:低 ITM,高平均,集中度高
    if (itm < 15 && (avg > 4 || concentration > 30)) return styles[2];
    
    // 默认均衡
    return styles[1];
  }, [itmPct, avgCash, maxCash, roi]);
  
  const matchedStyle = autoMatched || styles.find(s => s.id === selectedStyle);
  
  const applyStyle = (style) => {
    // 用 sessionStorage 不能,artifacts 限制
    // 改成直接显示卖股的建议参数
    setSelectedStyle(style.id);
  };
  
  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      {/* 介绍 */}
      <div style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <SectionTitle>玩家风格自测</SectionTitle>
        <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.7 }}>
          扑克锦标赛的回报分布形状对资金管理决策影响巨大——同样的 ROI,
          稳健入围型和搏深跑型的方差能差 60%+。 知道自己的风格,才能正确设置计算器里的「玩家风格」参数。
        </div>
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 10 }}>
          两种判断方式 ↓ 任选其一(或都用)。
        </div>
      </div>
      
      {/* 方式一:曲线图选择 */}
      <div style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <SectionTitle>方式一:看曲线选最像自己的</SectionTitle>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 16 }}>
          打开 Sharkscope 看你最近 500-1000 颗子弹的曲线,跟下面哪一款最像?
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
          {styles.slice(0, 3).map(s => (
            <StyleCurveCard key={s.id} style={s.id} label={s.label}
              desc={s.desc} sigmaMult={s.sigmaMult} color={s.color}
              selected={selectedStyle === s.id}
              onClick={() => setSelectedStyle(s.id)} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {styles.slice(3).map(s => (
            <StyleCurveCard key={s.id} style={s.id} label={s.label}
              desc={s.desc} sigmaMult={s.sigmaMult} color={s.color}
              selected={selectedStyle === s.id}
              onClick={() => setSelectedStyle(s.id)} />
          ))}
        </div>
      </div>
      
      {/* 方式二:数据输入自测 */}
      <div style={{ background: C.panel, borderRadius: 12, padding: 24, border: `1px solid ${C.border}`, marginBottom: 16 }}>
        <SectionTitle>方式二:输入数据自动判断</SectionTitle>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 16 }}>
          从 Sharkscope 或自己记录里查这几个数字。最近 500+ 颗子弹的统计最准。
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          <Field label="ITM% (入围率)">
            <NumberInput value={itmPct} onChange={v => setItmPct(v)} allowEmpty decimals={1} placeholder="如 17" style={inputStyle} />
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
              在 Sharkscope 上叫 "ITM%"
            </div>
          </Field>
          <Field label="平均奖金 (倍 BI)">
            <NumberInput value={avgCash} onChange={v => setAvgCash(v)} allowEmpty decimals={1} placeholder="如 3.5" style={inputStyle} />
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
              入围时平均赢多少倍 BI
            </div>
          </Field>
          <Field label="最大单次 (倍 BI)">
            <NumberInput value={maxCash} onChange={v => setMaxCash(v)} allowEmpty decimals={0} placeholder="可选,如 200" style={inputStyle} />
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
              历史最大单次奖金
            </div>
          </Field>
          <Field label="累计 ROI %">
            <NumberInput value={roi} onChange={v => setRoi(v)} allowEmpty decimals={1} placeholder="如 12" style={inputStyle} />
            <div style={{ fontSize: 10, color: C.textFaint, marginTop: 4 }}>
              用于检测稳定输家
            </div>
          </Field>
        </div>
        
        {autoMatched && (
          <div style={{
            marginTop: 16, padding: 14, borderRadius: 8,
            background: `${autoMatched.color}10`,
            border: `1px solid ${autoMatched.color}40`,
          }}>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6 }}>自动判断:</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: autoMatched.color }}>
              {autoMatched.label}  →  σ × {autoMatched.sigmaMult.toFixed(2)}
            </div>
          </div>
        )}
      </div>
      
      {/* 结果详情 */}
      {matchedStyle && (
        <div style={{
          background: C.panel, borderRadius: 12, padding: 24,
          border: `2px solid ${matchedStyle.color}40`,
          borderTopWidth: 4, borderTopColor: matchedStyle.color,
        }}>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 6 }}>你的风格画像</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: matchedStyle.color, marginBottom: 16 }}>
            {matchedStyle.label}
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                典型特征
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: C.text, lineHeight: 1.9 }}>
                {matchedStyle.details.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
            
            <div>
              <div style={{ fontSize: 11, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                建议参数
              </div>
              {matchedStyle.isWarning ? (
                <div style={{
                  padding: 16, background: `${C.bad}10`, border: `1px solid ${C.bad}40`,
                  borderRadius: 8, fontSize: 13, color: C.text, lineHeight: 1.8,
                }}>
                  <div style={{ color: C.bad, fontWeight: 600, marginBottom: 6 }}>⚠️ 卖股不是你的优先问题</div>
                  Felix 文章本身就强调:形状产生 ROI,不是反过来。
                  如果 ROI 是负的,无论怎么卖股都没法赚钱。
                  先专注于打牌水平、复盘、教练等等,真有正 ROI 之后再回来用这个工具。
                </div>
              ) : (
                <div style={{
                  padding: 16, background: C.panelLight, borderRadius: 8,
                  fontSize: 13, color: C.text, lineHeight: 2,
                }}>
                  <div>
                    <span style={{ color: C.textDim }}>玩家风格滑块:</span>
                    <span style={{ color: matchedStyle.color, fontWeight: 600, marginLeft: 8 }}>
                      {matchedStyle.label}(σ × {matchedStyle.sigmaMult.toFixed(2)})
                    </span>
                  </div>
                  <div>
                    <span style={{ color: C.textDim }}>shape 值(底层参数):</span>
                    <span style={{ color: C.text, fontFamily: "monospace", marginLeft: 8 }}>
                      {matchedStyle.shape}
                    </span>
                  </div>
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, fontSize: 12, color: C.textFaint }}>
                    在「计算器」、「反推 BR」、「BR 查询表」、「资金曲线模拟」四个标签页的"玩家风格"选择器里,选对应的档位即可。
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* 集中度指数说明 */}
      <div style={{
        marginTop: 16, background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}`,
      }}>
        <SectionTitle>判断逻辑参考</SectionTitle>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 600, color: C.text, marginBottom: 8 }}>集中度指数 = 最大单次奖金 / 平均奖金</div>
          <div>这个指数衡量你的钱有多少集中在少数大爆里。指数越高,方差越大。</div>
          
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <div style={{ padding: 12, background: C.panelLight, borderRadius: 6 }}>
              <div style={{ color: "#10b981", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>&lt; 15</div>
              <div style={{ fontSize: 11 }}>稳健入围型</div>
            </div>
            <div style={{ padding: 12, background: C.panelLight, borderRadius: 6 }}>
              <div style={{ color: "#3b82f6", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>15 – 50</div>
              <div style={{ fontSize: 11 }}>均衡型</div>
            </div>
            <div style={{ padding: 12, background: C.panelLight, borderRadius: 6 }}>
              <div style={{ color: "#a78bfa", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>50 – 200</div>
              <div style={{ fontSize: 11 }}>搏深跑型</div>
            </div>
            <div style={{ padding: 12, background: C.panelLight, borderRadius: 6 }}>
              <div style={{ color: "#f59e0b", fontWeight: 600, fontSize: 13, marginBottom: 4 }}>&gt; 200</div>
              <div style={{ fontSize: 11 }}>极端搏冠型</div>
            </div>
          </div>
          
          <div style={{ marginTop: 14, fontSize: 11, color: C.textFaint }}>
            举例:你打 1000 颗子弹,平均奖金 4 BI,最大单次 800 BI → 集中度 = 200 → 搏深跑型边缘
          </div>
        </div>
      </div>
    </div>
  );
}

function FelixTab() {
  const [sortKey, setSortKey] = useState("ce");
  const [sortDesc, setSortDesc] = useState(true);

  const sorted = [...FELIX_TABLE].sort((a, b) => {
    const v = sortDesc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey];
    return v;
  });

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ background: C.panel, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
        <SectionTitle>Felix 原表(罗曼论坛截图,共 25 行)</SectionTitle>
        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 16 }}>
          原型玩家假设 ROI = 15%。表里 ROI 是 Felix 模型基于场子鱼/技术分布算出的、对该原型而言的预期回报。点击表头排序。
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: C.textDim, fontSize: 11, textAlign: "left", borderBottom: `1px solid ${C.borderBright}` }}>
                {[
                  ["type", "类型"],
                  ["field", "Field"],
                  ["buyin", "BI"],
                  ["roi", "ROI %"],
                  ["mu", "Markup"],
                  ["sale", "Optimal Sale %"],
                  ["ce", "CE Growth"],
                ].map(([k, l]) => (
                  <th key={k}
                    onClick={() => { if (sortKey === k) setSortDesc(!sortDesc); else { setSortKey(k); setSortDesc(true); } }}
                    style={{ padding: "10px 12px", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {l} {sortKey === k && (sortDesc ? "↓" : "↑")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.panelLight}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10,
                      background: r.type === "PKO" ? "#7c2d12" : r.type === "Mystery" ? "#581c87" : "#1e3a8a",
                      color: r.type === "PKO" ? "#fed7aa" : r.type === "Mystery" ? "#e9d5ff" : "#bfdbfe",
                    }}>
                      {r.type}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>{r.field.toLocaleString()}</td>
                  <td style={{ padding: "8px 12px" }}>${r.buyin}</td>
                  <td style={{ padding: "8px 12px", color: C.good }}>{r.roi}%</td>
                  <td style={{ padding: "8px 12px", color: C.blue }}>{r.mu.toFixed(3)}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: C.accent }}>{r.sale}%</td>
                  <td style={{ padding: "8px 12px", color: C.good }}>${r.ce}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 24, padding: 16, background: C.panelLight, borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
          <div style={{ color: C.accent, fontWeight: 600, marginBottom: 8 }}>规律观察</div>
          <div style={{ color: C.textDim }}>
            <div>• <b style={{ color: C.text }}>Field 越大 → 卖得越多</b>:20000 人场卖到 95-98%,100 人场只卖 79%</div>
            <div>• <b style={{ color: C.text }}>Markup ≈ 1 + 0.5 × ROI</b>:近乎完美的线性关系</div>
            <div>• <b style={{ color: C.text }}>同 field 不同 BI</b>:小买入 ROI 高(鱼多),但卖股比例略低(BR/BI 大)</div>
            <div>• <b style={{ color: C.text }}>三种类型方差差异不大</b>:Standard 略高于 PKO 略高于 Mystery</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 复用组件
// ============================================================
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
      color: C.textDim, marginBottom: 12,
    }}>{children}</div>
  );
}

// 数字输入组件:内部用字符串状态,允许自由编辑,失焦时校验
function NumberInput({ value, onChange, disabled, style, step, min, max, placeholder, allowEmpty = false, decimals }) {
  const [text, setText] = useState(formatNum(value, decimals));
  const [focused, setFocused] = useState(false);

  // 当外部 value 变化(且不是用户在输入)时同步显示
  if (!focused && formatNum(value, decimals) !== text && !(allowEmpty && text === "")) {
    setText(formatNum(value, decimals));
  }

  const handleChange = (e) => {
    const s = e.target.value;
    setText(s);
    // 允许空、负号、单独小数点等中间状态,只在能解析为有效数字时更新外部值
    if (s === "" && allowEmpty) {
      onChange("");
      return;
    }
    if (s === "" || s === "-" || s === "." || s === "-.") return;
    const n = parseFloat(s);
    if (!isNaN(n)) {
      if (min !== undefined && n < min) return;
      if (max !== undefined && n > max) return;
      onChange(n);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    if (text === "" || text === "-" || text === "." || text === "-.") {
      if (allowEmpty) {
        setText("");
        onChange("");
      } else {
        setText(formatNum(value, decimals));
      }
    } else {
      const n = parseFloat(text);
      if (isNaN(n)) {
        setText(formatNum(value, decimals));
      } else {
        setText(formatNum(n, decimals));
      }
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      style={style}
    />
  );
}

function formatNum(v, decimals) {
  if (v === "" || v === null || v === undefined || isNaN(v)) return "";
  if (decimals === undefined) return String(v);
  // 整数情况下不显示小数
  if (Number.isInteger(v)) return String(v);
  return Number(v).toFixed(decimals);
}

// 玩家风格选择器(代替抽象的方差形状滑块)
// 比赛类型选择器(显示相对方差)
function TypeSelector({ type, setType }) {
  const types = [
    { value: "PKO",      label: "PKO",      note: "方差最低 ★", relVar: "0.8×" },
    { value: "Standard", label: "Standard", note: "标准锦标赛",   relVar: "1.0×" },
    { value: "Mystery",  label: "Mystery",  note: "方差最高",     relVar: "1.4×" },
  ];

  return (
    <Field label={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>比赛类型</span>
        <span style={{ fontSize: 10, color: C.textFaint }}>方差差异显著,认真选</span>
      </div>
    }>
      <div style={{ display: "flex", gap: 4 }}>
        {types.map(t => {
          const active = type === t.value;
          return (
            <button key={t.value} onClick={() => setType(t.value)}
              style={{
                flex: 1, padding: "10px 8px", fontSize: 12,
                background: active ? C.accentDim : C.panelLight,
                border: `1px solid ${active ? C.accent : C.border}`,
                borderRadius: 6, color: active ? C.accent : C.textDim,
                cursor: "pointer", fontFamily: "inherit",
                fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
              }}>
              <div>{t.label}</div>
              <div style={{ fontSize: 9, color: active ? C.accent : C.textFaint, marginTop: 2, fontWeight: 400 }}>
                {t.note}
              </div>
              <div style={{ fontSize: 9, color: active ? C.accent : C.textFaint, marginTop: 1, fontWeight: 400, opacity: 0.7 }}>
                σ × {t.relVar}
              </div>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function PlayStyleSelector({ shape, setShape }) {
  const styles = [
    { value: 0.15, label: "稳健入围型", desc: "频繁小入围,少大爆", color: "#10b981" },
    { value: 0.5,  label: "均衡型",     desc: "Felix 模型默认",    color: "#3b82f6" },
    { value: 0.85, label: "搏深跑型",   desc: "经常空军,搏决赛桌", color: "#a78bfa" },
  ];

  // 根据当前 shape 选中最近的预设
  let activeIdx = 0;
  let minDist = Infinity;
  styles.forEach((s, i) => {
    const d = Math.abs(s.value - shape);
    if (d < minDist) { minDist = d; activeIdx = i; }
  });

  return (
    <Field label={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>玩家风格</span>
        <span style={{ fontSize: 11, color: styles[activeIdx].color }}>
          {styles[activeIdx].desc}
        </span>
      </div>
    }>
      <div style={{ display: "flex", gap: 4 }}>
        {styles.map((s, i) => {
          const active = i === activeIdx;
          return (
            <button key={i} onClick={() => setShape(s.value)}
              style={{
                flex: 1, padding: "10px 8px", fontSize: 11,
                background: active ? `${s.color}20` : C.panelLight,
                border: `1px solid ${active ? s.color : C.border}`,
                borderRadius: 6, color: active ? s.color : C.textDim,
                cursor: "pointer", fontFamily: "inherit",
                fontWeight: active ? 600 : 400,
                transition: "all 0.15s",
              }}>
              {s.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 12px", background: C.panelLight,
  border: `1px solid ${C.border}`, borderRadius: 6, color: C.text,
  fontSize: 14, fontFamily: "inherit", outline: "none",
  boxSizing: "border-box",
};

const chipStyle = (active) => ({
  padding: "5px 10px", fontSize: 11,
  background: active ? C.accentDim : C.panelLight,
  border: `1px solid ${active ? C.accent : C.border}`,
  borderRadius: 4, color: active ? C.accent : C.textDim,
  cursor: "pointer", fontFamily: "inherit",
});

const th = { padding: "10px 12px", fontWeight: 500, whiteSpace: "nowrap" };

function BigStat({ label, value, sub, color, big }) {
  return (
    <div style={{ background: C.panel, padding: 16, borderRadius: 10, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, color: C.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: big ? 32 : 22, fontWeight: 700, color, lineHeight: 1, marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.textFaint }}>{sub}</div>
    </div>
  );
}

function CompareRow({ label, a, b, diff, fmt }) {
  return (
    <tr style={{ borderTop: `1px solid ${C.border}` }}>
      <td style={{ padding: "8px 0", color: C.textDim }}>{label}</td>
      <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{a}</td>
      <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace" }}>{b}</td>
      <td style={{ padding: "8px 0", textAlign: "right", color: C.textFaint, fontSize: 11 }}>{fmt(diff)}</td>
    </tr>
  );
}

function DataRow({ label, value, hint, last }) {
  return (
    <tr style={{ borderBottom: last ? "none" : `1px solid ${C.border}` }}>
      <td style={{ padding: "12px 0", color: C.textDim, width: "30%" }}>{label}</td>
      <td style={{ padding: "12px 0", fontFamily: "monospace", color: C.text, fontWeight: 600, width: "30%" }}>{value}</td>
      <td style={{ padding: "12px 0", textAlign: "right", color: C.textFaint, fontSize: 11 }}>{hint}</td>
    </tr>
  );
}

function DiagnosticPanel({ BR, buyin, field, type, roi, optSale, sigmaBI }) {
  // 计算各种诊断指标
  const BIperBR = BR / buyin;
  const sigma_d = sigmaBI * buyin;
  const sigma_d_sq = sigma_d * sigma_d;
  
  // 要让自留 50%,需要的 BR 是多少?
  const targetSelfRetain = 0.5;
  const roiFrac = roi / 100;
  const markup = 1 + 0.499 * roiFrac;
  const requiredBR_50 = targetSelfRetain * sigma_d_sq / (buyin * (roiFrac - (markup - 1)));
  
  // 要让自留 30%(更接近罗曼实际的 12-44%),需要的 BR
  const requiredBR_30 = 0.30 * sigma_d_sq / (buyin * (roiFrac - (markup - 1)));
  
  // 给当前 BR,如果想自留 50%,该打多大 BI?
  const recommendedBI_50 = (BR * (roiFrac - (markup - 1)) / (sigmaBI * sigmaBI * 0.5));
  
  // 现在的 BR/sigma 比率
  const BR_to_sigma_d = BR / sigma_d;

  let mainMessage, severity;
  if (optSale >= 0.95) {
    severity = "extreme";
    mainMessage = "你的资金严重不足以打这个级别——模型说你必须卖几乎全部股份,只留极少自留。";
  } else if (optSale >= 0.80) {
    severity = "high";
    mainMessage = "资金偏紧——卖大部分股份才能让数学成立。这是高方差赛事的标准建议。";
  } else if (optSale >= 0.50) {
    severity = "moderate";
    mainMessage = "资金合理——可以自留相当比例,卖股是为了平滑方差,不是为了生存。";
  } else {
    severity = "good";
    mainMessage = "资金充裕——可以选择性卖股,主要为了赚 markup 和分散风险。";
  }

  const colorMap = {
    extreme: C.bad,
    high: C.accent,
    moderate: C.blue,
    good: C.good,
  };
  const color = colorMap[severity];

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}10, transparent)`,
      border: `1px solid ${color}40`,
      borderRadius: 12, padding: 18, marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>
          诊断:为什么是 {(optSale * 100).toFixed(1)}%?
        </div>
        <div style={{ fontSize: 11, color: C.textFaint }}>
          BR/BI = {BIperBR.toFixed(0)} 个买入  ·  σ = {sigmaBI.toFixed(1)} BI/子弹
        </div>
      </div>
      
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 14 }}>
        {mainMessage}
      </div>

      <div style={{ background: C.panelLight, borderRadius: 8, padding: 14, fontSize: 12, lineHeight: 1.8 }}>
        <div style={{ color: C.textDim, marginBottom: 10, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
          想自留更多?三条路:
        </div>
        
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ color: C.accent, fontSize: 11, marginBottom: 4 }}>① 提升 BR</div>
            <div style={{ color: C.text, fontWeight: 600, marginBottom: 2 }}>
              ${requiredBR_50.toFixed(0).toLocaleString()}
            </div>
            <div style={{ color: C.textFaint, fontSize: 10 }}>
              这个 BR 可以自留 50%(当前 ${BR.toLocaleString()})
            </div>
          </div>
          
          <div>
            <div style={{ color: C.accent, fontSize: 11, marginBottom: 4 }}>② 降低 BI</div>
            <div style={{ color: C.text, fontWeight: 600, marginBottom: 2 }}>
              ${recommendedBI_50.toFixed(0)}
            </div>
            <div style={{ color: C.textFaint, fontSize: 10 }}>
              当前 BR 下,打这个 BI 可以自留 50%
            </div>
          </div>
          
          <div>
            <div style={{ color: C.accent, fontSize: 11, marginBottom: 4 }}>③ 打小场</div>
            <div style={{ color: C.text, fontWeight: 600, marginBottom: 2 }}>
              field {Math.max(50, Math.round(field / 10))} 人
            </div>
            <div style={{ color: C.textFaint, fontSize: 10 }}>
              场子越小 σ 越小,自留比例自然上去
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: "10px 12px", background: C.panel, borderRadius: 6, fontSize: 11, color: C.textDim, lineHeight: 1.7 }}>
        <span style={{ color: C.accent }}>📐 直觉</span>:模型计算的是 (1−s) = BR × BI × (ROI − markup溢价) / σ²。
        分母里的 σ²(美元方差)在大场比赛里是个天文数字——比如 1000 人 $109 场,σ² ≈ 230 万美元²。
        分子要追上这个量级,要么 BR 极大、要么 BI 很小。罗曼实际打 88%/77%/66% 是因为他实际 BR 比模型隐含值高,而且会主动留点激励。
      </div>
    </div>
  );
}

function HealthCheck({ calibrated, theoretical, buyin, BR, field, roi }) {
  const warnings = [];
  if (calibrated.ceGrowth < 0) warnings.push({ level: "bad", text: `即使按最优比例卖股,CE 增长仍为负 ($${calibrated.ceGrowth.toFixed(2)})。这场你不该打——资金太薄,方差吃光所有 EV。` });
  if (calibrated.ceSelfOnly < 0 && calibrated.ceGrowth > 0) warnings.push({ level: "warn", text: `不卖股的话 CE 是负的 ($${calibrated.ceSelfOnly.toFixed(2)})。卖股不是可选项,是必须项——这场只有靠 markup 收入才能赚钱。` });
  if (BR / buyin < 50) warnings.push({ level: "warn", text: `BR/BI = ${(BR/buyin).toFixed(0)},不到 50 个买入。Felix 模型对小资金敏感,结果可能偏激进。` });
  if (calibrated.optSale > 0.95) warnings.push({ level: "info", text: `最优卖出比例 > 95%——你几乎是个"职业打手",自留风险极小,主要赚 markup 和小份子股权。这正常,但要注意激励问题(投资人可能担心你不上心)。` });
  if (Math.abs(calibrated.optSale - theoretical.optSale) > 0.05) warnings.push({ level: "info", text: `两个模型差距 > 5 个百分点。在极端参数下两种近似分歧变大,实际操作建议取保守值。` });
  if (roi < 5) warnings.push({ level: "bad", text: `ROI 太低 (${roi.toFixed(1)}%)。Felix 文章核心论点之一:形状决定 ROI——如果你的 ROI 真这么低,先解决打牌水平问题,不是卖股能救的。` });

  if (warnings.length === 0) {
    return (
      <div style={{ background: `${C.good}15`, border: `1px solid ${C.good}40`, borderRadius: 10, padding: 14, marginTop: 16, fontSize: 12, color: C.good }}>
        ✓ 健康度检查通过 — 这场以推荐参数打,模型预测资金能正向复利。
      </div>
    );
  }
  return (
    <div style={{ marginTop: 16 }}>
      {warnings.map((w, i) => {
        const c = w.level === "bad" ? C.bad : w.level === "warn" ? C.accent : C.blue;
        return (
          <div key={i} style={{
            background: `${c}10`, border: `1px solid ${c}30`,
            borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 12, color: c, lineHeight: 1.6,
          }}>
            {w.level === "bad" ? "✕ " : w.level === "warn" ? "⚠ " : "ℹ "}
            <span style={{ color: C.text }}>{w.text}</span>
          </div>
        );
      })}
    </div>
  );
}
