// =====================================================================
// Hongshao Chat — OpenAI-compatible LLM front-end with local tool execution
// =====================================================================
// All five poker calculators are exposed as OpenAI "function tools" that
// the model picks and fills in. Calculation runs in the browser using
// packages/core (pure JS) and the range-zen WASM worker — no backend.

import { calcPKO, calcMystery } from '/packages/core/bounty/index.js';
import { analyzeDecision } from '/packages/core/squid/index.js';
import { calibratedModel, theoreticalModel, refROI } from '/packages/core/staking/mtt-model.js';
import { solveAll } from '/packages/core/staking/solver.js';

// =====================================================================
// 1. Configuration (BYOK, persisted in localStorage)
// =====================================================================

const PRESETS = {
  deepseek: { endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai:   { endpoint: 'https://api.openai.com/v1',   model: 'gpt-4o-mini' },
  qwen:     { endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  moonshot: { endpoint: 'https://api.moonshot.cn/v1',  model: 'moonshot-v1-8k' },
  zhipu:    { endpoint: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
};

const DEFAULTS = { ...PRESETS.deepseek, apiKey: '' };

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('hongshao-chat') || '{}') };
  } catch { return { ...DEFAULTS }; }
}
export function saveConfig(cfg) {
  localStorage.setItem('hongshao-chat', JSON.stringify(cfg));
}

// =====================================================================
// 2. Tool schemas — OpenAI "tools" array
// =====================================================================

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'calc_pko_call',
      description: '在 PKO (Progressive Knockout / 渐进式淘汰赛) 锦标赛中,计算面对全下时跟注所需的最小胜率,会考虑赏金价值。当用户问"赏金桌跟还是弃" / "PKO 跟注胜率" / 类似问题时使用。',
      parameters: {
        type: 'object',
        properties: {
          totalEntrants:   { type: 'number', description: '比赛总人数' },
          playersLeft:     { type: 'number', description: '当前剩余人数' },
          startingStack:   { type: 'number', description: '起始筹码 (chips)' },
          startingBounty:  { type: 'number', description: '起始赏金 ($)' },
          currentPot:      { type: 'number', description: '当前总底池 (chips,含 ante/blinds/已下注)' },
          heroCall:        { type: 'number', description: 'Hero 还需要跟注的筹码量' },
          heroStack:       { type: 'number', description: 'Hero 当前总筹码 (用于判定能否 cover 对手)' },
          villains:        {
            type: 'array',
            description: '所有 all-in 对手,每人 stack(筹码) + bounty(美元赏金)',
            items: {
              type: 'object',
              properties: {
                stack:  { type: 'number', description: '该对手的筹码量' },
                bounty: { type: 'number', description: '该对手身上挂的赏金 ($)' },
              },
              required: ['stack', 'bounty'],
            },
          },
        },
        required: ['totalEntrants','playersLeft','startingStack','startingBounty','currentPot','heroCall','heroStack','villains'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calc_mystery_call',
      description: '神秘赏金 (Mystery Bounty) 赛制下计算跟注所需胜率。用于"GG 神秘赏金 day2 / 25K 起始 100 买入 / 盲盒赏金"等问题。',
      parameters: {
        type: 'object',
        properties: {
          startingStack:  { type: 'number', description: '起始筹码' },
          regBuyin:       { type: 'number', description: '常规奖池买入额 ($)' },
          currentPot:     { type: 'number', description: '当前总底池 (chips)' },
          heroInvested:   { type: 'number', description: 'Hero 已投入筹码' },
          heroCall:       { type: 'number', description: 'Hero 还需跟注的筹码' },
          bountyTable:    {
            type: 'array',
            description: '剩余盲盒奖金表 (value=金额$, count=个数)',
            items: {
              type: 'object',
              properties: {
                value: { type: 'number' },
                count: { type: 'integer' },
              },
              required: ['value', 'count'],
            },
          },
          villainStacks: {
            type: 'array',
            description: '所有 all-in 对手筹码量,用于判定 Hero 能否 cover 拿赏金',
            items: { type: 'number' },
          },
        },
        required: ['startingStack','regBuyin','currentPot','heroInvested','heroCall','bountyTable','villainStacks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_squid_decision',
      description: '鱿鱼博弈 (Squid Game / 蛋糕游戏) 局势分析: 计算"获得下一个鱿鱼" vs "未获得"的 EV 差值,以及最终鱿鱼数的概率分布。allCakes[0] = Hero 当前持有的鱿鱼数,其余 = 其他玩家。',
      parameters: {
        type: 'object',
        properties: {
          allCakes:  { type: 'array', items: { type: 'integer' }, description: '所有玩家当前鱿鱼数,Hero 在 index 0' },
          maxCakes:  { type: 'integer', description: '游戏结束时的最大鱿鱼总数 (默认 11)' },
          stopCount: { type: 'integer', description: '占位玩家数达到此数时游戏结束 (默认 numPeople-1)' },
          rules:     { type: 'array', items: { type: 'integer' }, description: '奖惩规则数组,rules[i] = 持有 i+1 个鱿鱼的奖励' },
          numPeople: { type: 'integer', description: '玩家总人数 (默认 8)' },
        },
        required: ['allCakes', 'maxCakes', 'rules', 'numPeople'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_mtt_staking',
      description: 'MTT 投资分析: 给定 buyin/field/ROI/Bankroll/markup,基于 Felix 校准模型计算最优出售比例 + 期望增长率 + 等价确定性增长。用于"我打 1000 人场子 ROI 25% 怎么卖股最优" / "Markup 多少合理"。',
      parameters: {
        type: 'object',
        properties: {
          buyin:  { type: 'number', description: '单场 buy-in ($)' },
          field:  { type: 'integer', description: '场子人数' },
          roi:    { type: 'number', description: '选手 ROI 百分比,例如 25 表示 25%' },
          BR:     { type: 'number', description: '选手 bankroll ($)' },
          type:   { type: 'string', enum: ['Standard','PKO','Mystery'], description: '锦标赛类型' },
          markup: { type: 'number', description: '溢价倍数 (e.g. 1.1 = +10%)' },
          shape:  { type: 'number', description: '选手风格 0-1: 0=稳健入围,0.5=均衡,1.0=搏深跑 (默认 0.5)' },
        },
        required: ['buyin','field','roi','BR','type','markup'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calc_staking_deal',
      description: '通用 staking 投资交易求解器: 给定 10 个变量 (B/N/b/C/s/m/R/Reff/G/K) 中的任意一部分,反推剩余的。用于"打 50 场 buy-in 200,卖 60% 股 markup 1.2 ROI 30%,我赚多少" / "想保本溢价多少"。',
      parameters: {
        type: 'object',
        properties: {
          B:    { type: 'number', description: '总 buyin ($)' },
          N:    { type: 'number', description: '场次数' },
          b:    { type: 'number', description: '单场 buyin ($)' },
          C:    { type: 'number', description: '其它成本 ($)' },
          s:    { type: 'number', description: '出售比例 0-1 (注意: 这里要传 0.5 不是 50)' },
          m:    { type: 'number', description: '溢价倍数,如 1.2' },
          R:    { type: 'number', description: '选手 ROI 0-1 (传 0.3 不是 30)' },
          Reff: { type: 'number', description: '选手有效 ROI 0-1' },
          G:    { type: 'number', description: '选手净利润 ($)' },
          K:    { type: 'number', description: '选手自留资金 ($,= B*(1-s))' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'range_equity_mc',
      description: '德州扑克范围对范围胜率蒙特卡洛模拟。可指定 board (翻前留空)。范围用 PokerStove 语法: "AA,KK,AKs", "QQ-TT,AQo+", "TT+,AQs+,AKo"。',
      parameters: {
        type: 'object',
        properties: {
          range1: { type: 'string', description: 'Player 1 范围,例如 "AA,KK,QQ" 或 "TT+,AQs+,AKo"' },
          range2: { type: 'string', description: 'Player 2 范围' },
          board:  { type: 'string', description: 'Board cards: "" 翻前 / "AhKd2c" 翻牌 / "AhKd2c5sQs" 河牌' },
          sims:   { type: 'integer', description: '模拟次数,默认 100000' },
        },
        required: ['range1', 'range2'],
      },
    },
  },
];

// =====================================================================
// 3. Tool dispatcher (executes locally)
// =====================================================================

let rangeWorker = null;
function getRangeWorker() {
  if (rangeWorker) return rangeWorker;
  rangeWorker = new Worker('/tools/range-zen/worker.js', { type: 'module' });
  rangeWorker.postMessage({ type: 'init' });
  return rangeWorker;
}

function callRangeWorker(payload) {
  return new Promise((resolve, reject) => {
    const w = getRangeWorker();
    const handler = (e) => {
      const m = e.data;
      if (m.type === 'ready') return; // wait for done
      w.removeEventListener('message', handler);
      if (m.type === 'done') resolve(m.result);
      else if (m.type === 'error') reject(new Error(m.error));
      else reject(new Error('Unexpected worker message: ' + m.type));
    };
    w.addEventListener('message', handler);
    w.postMessage(payload);
  });
}

export const DISPATCH = {
  calc_pko_call: async (args) => calcPKO(args),
  calc_mystery_call: async (args) => calcMystery(args),
  analyze_squid_decision: async (args) => {
    const stopCount = args.stopCount ?? Math.max(1, args.numPeople - 1);
    return analyzeDecision({
      ...args,
      stopCount,
      myIndex: 0,
    });
  },
  analyze_mtt_staking: async (args) => {
    const params = { shape: 0.5, ...args };
    return {
      calibrated:  calibratedModel(params),
      theoretical: theoreticalModel(params),
      refROI:      refROI(params.field, params.buyin),
    };
  },
  calc_staking_deal: async (args) => solveAll(args),
  range_equity_mc: async (args) => {
    const result = await callRangeWorker({
      type: 'run',
      r1: args.range1,
      r2: args.range2,
      board: args.board || '',
      sims: args.sims || 100000,
    });
    return result;
  },
};

// =====================================================================
// 4. Chat loop
// =====================================================================

const SYSTEM_PROMPT = `你是"红烧扑克工具集"的 AI 助手,帮用户用工具回答德州扑克 / 锦标赛 / 投资 / 博弈相关问题。

可用工具:
- calc_pko_call:     PKO 跟注所需胜率
- calc_mystery_call: 神秘赏金跟注所需胜率
- analyze_squid_decision: 鱿鱼博弈 EV 决策分析
- analyze_mtt_staking: MTT 投资模型 (Felix 校准)
- calc_staking_deal: 通用 staking 交易求解 (10 变量任意填,反推剩余)
- range_equity_mc:   范围对范围胜率蒙特卡洛

规则:
1. 用户问问题时,**优先调用工具**计算,不要心算估算。
2. 如果用户给的信息不够调用工具,先用一句话问清楚缺的关键参数(只问最少必要的)。
3. 给出工具结果后,**用中文 1-3 句解释结论**,突出关键数字 + 给一个直白建议(跟/弃/卖多少股之类)。
4. 不要把工具的原始 JSON 全列出来,提炼最重要的 2-4 个数字即可。
5. 如果用户用英文问,用英文回答。`;

export class Chat {
  constructor() {
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }];
    this.config = loadConfig();
  }

  setConfig(cfg) {
    this.config = { ...this.config, ...cfg };
    saveConfig(this.config);
  }

  reset() {
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  /**
   * Send a user message and stream events back via the callback.
   * @param {string} userText
   * @param {(ev: {type, ...}) => void} onEvent  emits: 'user', 'assistant', 'tool_call', 'tool_result', 'error', 'done'
   */
  async send(userText, onEvent) {
    if (!this.config.apiKey) {
      onEvent({ type: 'error', message: '请先在右上角设置中填入 API Key' });
      return;
    }

    this.history.push({ role: 'user', content: userText });
    onEvent({ type: 'user', content: userText });

    for (let iter = 0; iter < 6; iter++) {
      let data;
      try {
        const resp = await fetch(`${this.config.endpoint}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model: this.config.model,
            messages: this.history,
            tools: TOOLS,
            tool_choice: 'auto',
            temperature: 0.3,
          }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          onEvent({ type: 'error', message: `${resp.status}: ${text.slice(0, 300)}` });
          return;
        }
        data = await resp.json();
      } catch (e) {
        onEvent({ type: 'error', message: '网络错误: ' + e.message });
        return;
      }

      const msg = data.choices?.[0]?.message;
      if (!msg) {
        onEvent({ type: 'error', message: '响应格式异常' });
        return;
      }

      // Push assistant message (with potential tool_calls)
      this.history.push(msg);

      if (msg.content) {
        onEvent({ type: 'assistant', content: msg.content });
      }

      const toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0) {
        onEvent({ type: 'done' });
        return;
      }

      // Execute each tool call
      for (const call of toolCalls) {
        const name = call.function.name;
        let argsObj;
        try { argsObj = JSON.parse(call.function.arguments || '{}'); }
        catch { argsObj = {}; }
        onEvent({ type: 'tool_call', name, args: argsObj });

        let result;
        try {
          if (!DISPATCH[name]) throw new Error(`Unknown tool: ${name}`);
          result = await DISPATCH[name](argsObj);
        } catch (e) {
          result = { error: String(e.message || e) };
        }

        onEvent({ type: 'tool_result', name, args: argsObj, result });

        this.history.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      // loop again so the model sees tool results
    }

    onEvent({ type: 'error', message: '工具调用次数超限 (>6 轮)' });
  }
}

// =====================================================================
// 5. Result formatters — render structured output for each tool
// =====================================================================

const fmt = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(d) : '—';
const pct = (v, d = 2) => (typeof v === 'number' && Number.isFinite(v)) ? (v * 100).toFixed(d) + '%' : '—';
const intf = (v) => (typeof v === 'number' && Number.isFinite(v)) ? Math.round(v).toLocaleString() : '—';

export function formatToolResult(name, result) {
  if (!result || result.error) return null;
  const rows = [];

  if (name === 'calc_pko_call') {
    rows.push(['含赏金所需胜率', pct(result.requiredEquity)]);
    rows.push(['不含赏金所需胜率', pct(result.normalEquity)]);
    rows.push(['赏金折合筹码', intf(result.bountyChips)]);
    rows.push(['可争夺赏金 / 覆盖人数', `$${fmt(result.totalCoveredBounty)} / ${result.coveredCount}`]);
  } else if (name === 'calc_mystery_call') {
    rows.push(['含神秘赏金所需胜率', pct(result.requiredEquity)]);
    rows.push(['不含赏金所需胜率', pct(result.normalEquity)]);
    rows.push(['平均赏金', `$${fmt(result.averageBounty)}`]);
    rows.push(['1 个盲盒折合筹码', intf(result.singleBountyChips)]);
    rows.push(['覆盖对手数', String(result.coveredCount)]);
  } else if (name === 'analyze_squid_decision') {
    rows.push(['获得 (Hit) EV', fmt(result.evHit)]);
    rows.push(['未获得 (Miss) EV', fmt(result.evMiss)]);
    rows.push(['差值', fmt(result.diff)]);
    if (result.probDist) {
      const dist = Object.entries(result.probDist)
        .sort((a, b) => +a[0] - +b[0])
        .map(([k, p]) => `${k}: ${(p * 100).toFixed(1)}%`).join(', ');
      rows.push(['最终鱿鱼数概率', dist]);
    }
  } else if (name === 'analyze_mtt_staking') {
    const c = result.calibrated, t = result.theoretical;
    rows.push(['推荐出售比例 (校准)', pct(c.optSale, 1)]);
    rows.push(['推荐出售比例 (理论)', pct(t.optSale, 1)]);
    rows.push(['等价确定性年增长', `${intf(c.ceGrowth)} buyins`]);
    rows.push(['不卖的等价增长', `${intf(c.ceSelfOnly)} buyins`]);
    rows.push(['σ per BI', fmt(c.sigmaBI)]);
  } else if (name === 'calc_staking_deal') {
    if (result.B != null) rows.push(['B 总 buyin', `$${fmt(result.B)}`]);
    if (result.N != null) rows.push(['N 场次', fmt(result.N, 1)]);
    if (result.b != null) rows.push(['b 单场', `$${fmt(result.b)}`]);
    if (result.C != null) rows.push(['C 成本', `$${fmt(result.C)}`]);
    if (result.s != null) rows.push(['s 卖出', pct(result.s, 1)]);
    if (result.m != null) rows.push(['m 溢价', fmt(result.m, 3)]);
    if (result.R != null) rows.push(['R ROI', pct(result.R, 1)]);
    if (result.Reff != null) rows.push(['Reff 有效 ROI', pct(result.Reff, 1)]);
    if (result.G != null) rows.push(['G 利润', `$${fmt(result.G)}`]);
    if (result.K != null) rows.push(['K 自留', `$${fmt(result.K)}`]);
  } else if (name === 'range_equity_mc') {
    if (result.players) {
      const [p1, p2] = result.players;
      rows.push(['Player 1 胜率', pct(p1.equity)]);
      rows.push(['Player 2 胜率', pct(p2.equity)]);
      rows.push(['P1 W/T', `${pct(p1.win_pct, 1)} / ${pct(p1.tie_pct, 1)}`]);
      rows.push(['P2 W/T', `${pct(p2.win_pct, 1)} / ${pct(p2.tie_pct, 1)}`]);
      rows.push(['模拟样本数', intf(result.total_samples)]);
    }
  }

  return rows.length ? rows : null;
}
