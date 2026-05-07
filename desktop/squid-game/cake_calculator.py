import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk
import collections
import threading
import random
import statistics

class CakeGameCalculator:
    def __init__(self, root):
        self.root = root
        self.root.title("鱿鱼博弈计算器 (EV & 概率)")
        self.root.geometry("600x750")

        # ================= 配置与变量 =================
        self.memo_ev = {}
        self.memo_prob = {}
        
        self.stop_people_count = 7  # 默认停止人数 (N-1)
        
        # ================= UI 布局 =================
        # 容器
        input_frame = tk.LabelFrame(root, text="游戏参数设置", padx=10, pady=10)
        input_frame.pack(fill="x", padx=10, pady=5)

        # 1. 总鱿鱼数
        tk.Label(input_frame, text="1. 游戏结束的最大鱿鱼数 (N):").grid(row=0, column=0, sticky="w")
        self.entry_max_cakes = tk.Entry(input_frame)
        self.entry_max_cakes.insert(0, "11")
        self.entry_max_cakes.grid(row=0, column=1, sticky="e")

        # 2. 总人数
        tk.Label(input_frame, text="2. 玩家总人数:").grid(row=1, column=0, sticky="w")
        self.entry_num_people = tk.Entry(input_frame)
        self.entry_num_people.insert(0, "8")
        self.entry_num_people.grid(row=1, column=1, sticky="e")

        # 3. 用户持有鱿鱼
        tk.Label(input_frame, text="3. 你当前持有的鱿鱼数:").grid(row=2, column=0, sticky="w")
        self.entry_my_cake = tk.Entry(input_frame)
        self.entry_my_cake.insert(0, "0")
        self.entry_my_cake.grid(row=2, column=1, sticky="e")

        # 4. 其他人持有鱿鱼
        tk.Label(input_frame, text="4. 其他玩家持有的鱿鱼 (逗号分隔):").grid(row=3, column=0, sticky="w")
        self.entry_others_cake = tk.Entry(input_frame)
        self.entry_others_cake.insert(0, "0,0,0,0,0,0,0")
        self.entry_others_cake.grid(row=3, column=1, sticky="e")

        # 5. 奖惩规则
        tk.Label(input_frame, text="5. 奖惩规则 (逗号分隔):").grid(row=4, column=0, sticky="w")
        tk.Label(input_frame, text="(0鱿鱼者需分别支付给持有1,2,3...个鱿鱼的人的罚金)").grid(row=5, column=0, columnspan=2, sticky="w", padx=20)
        self.entry_rules = tk.Entry(input_frame)
        self.entry_rules.insert(0, "1,2,3,4,5,6,7,8,9,10,11")
        self.entry_rules.grid(row=4, column=1, sticky="e")

        # 奖惩规则模式选择：默认 / 翻倍 / 自定义
        self.rule_mode = tk.StringVar(value="default")
        rule_btn_frame = tk.Frame(input_frame)
        rule_btn_frame.grid(row=4, column=2, padx=5, sticky="w")

        btn_default = tk.Radiobutton(
            rule_btn_frame,
            text="默认",
            variable=self.rule_mode,
            value="default",
            command=self.set_default_rules
        )
        btn_default.pack(side="left")

        btn_double = tk.Radiobutton(
            rule_btn_frame,
            text="翻倍",
            variable=self.rule_mode,
            value="double",
            command=self.set_double_rules
        )
        btn_double.pack(side="left", padx=(5, 0))

        btn_custom = tk.Radiobutton(
            rule_btn_frame,
            text="自定义",
            variable=self.rule_mode,
            value="custom",
            command=self.set_custom_rules
        )
        btn_custom.pack(side="left", padx=(5, 0))

        # “翻倍”模式下的参数输入区（翻倍节点 + 翻倍倍数）
        self.double_frame = tk.LabelFrame(input_frame, text="翻倍参数设置", padx=5, pady=5)
        self.double_frame.grid(row=6, column=0, columnspan=3, sticky="we", pady=(5, 0))

        tk.Label(self.double_frame, text="翻倍节点（逗号分隔）:").grid(row=0, column=0, sticky="w")
        self.entry_double_nodes = tk.Entry(self.double_frame, width=25)
        self.entry_double_nodes.grid(row=0, column=1, sticky="we", padx=5)

        tk.Label(self.double_frame, text="翻倍倍数（逗号分隔）:").grid(row=1, column=0, sticky="w")
        self.entry_double_multipliers = tk.Entry(self.double_frame, width=25)
        self.entry_double_multipliers.grid(row=1, column=1, sticky="we", padx=5)

        # 计算翻倍规则按钮：根据节点和倍数计算最终奖惩规则并填入“奖惩规则”
        btn_calc_double_rules = tk.Button(
            self.double_frame,
            text="计算翻倍规则",
            command=self.compute_double_rules,
            bg="#FFE4B5"
        )
        btn_calc_double_rules.grid(row=0, column=2, rowspan=2, padx=5, sticky="ns")

        self.double_frame.grid_columnconfigure(1, weight=1)
        # 初始不显示翻倍参数区，只有选择“翻倍”模式时才显示
        self.double_frame.grid_remove()

        # 默认与翻倍模式下不允许编辑规则输入框；初始为默认
        self.entry_rules.config(state="readonly")

        # 按钮区域
        button_frame = tk.Frame(root)
        button_frame.pack(pady=10)
        
        # 计算按钮
        btn_calc = tk.Button(button_frame, text="开始计算", command=self.on_calculate, bg="#DDDDDD", font=("Arial", 12, "bold"))
        btn_calc.pack(side="left", padx=5)
        
        # 模拟次数输入和模拟按钮
        sim_frame = tk.Frame(button_frame)
        sim_frame.pack(side="left", padx=10)
        
        tk.Label(sim_frame, text="模拟次数:").pack(side="left", padx=2)
        self.entry_sim_trials = tk.Entry(sim_frame, width=10)
        self.entry_sim_trials.insert(0, "30000")
        self.entry_sim_trials.pack(side="left", padx=2)
        
        btn_sim = tk.Button(sim_frame, text="开始模拟", command=self.on_simulate, bg="#CCE5FF", font=("Arial", 12, "bold"))
        btn_sim.pack(side="left", padx=5)

        # 输出区域 - 分成两部分
        output_frame = tk.LabelFrame(root, text="计算结果", padx=10, pady=10)
        output_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        # 第一部分：概率分布表格
        prob_frame = tk.LabelFrame(output_frame, text="概率分布", padx=5, pady=5)
        prob_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        # 概率分布表格：两列（最终持有、概率）
        prob_tree_frame = tk.Frame(prob_frame)
        prob_tree_frame.pack(fill="both", expand=True)
        
        self.tree_prob = ttk.Treeview(prob_tree_frame, columns=("final_count", "probability"), show="headings", height=8)
        self.tree_prob.heading("final_count", text="最终持有鱿鱼个数")
        self.tree_prob.heading("probability", text="概率")
        self.tree_prob.column("final_count", width=150, anchor="center")
        self.tree_prob.column("probability", width=150, anchor="center")
        
        prob_scrollbar = ttk.Scrollbar(prob_tree_frame, orient="vertical", command=self.tree_prob.yview)
        self.tree_prob.configure(yscrollcommand=prob_scrollbar.set)
        
        self.tree_prob.pack(side="left", fill="both", expand=True)
        prob_scrollbar.pack(side="right", fill="y")
        
        # 第二部分：奖励和差值表格
        reward_frame = tk.LabelFrame(output_frame, text="决策收益", padx=5, pady=5)
        reward_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        # 决策收益表格：2行3列（表头：获得价值、未获得价值、差值）
        reward_tree_frame = tk.Frame(reward_frame)
        reward_tree_frame.pack(fill="both", expand=True)
        
        self.tree_reward = ttk.Treeview(reward_tree_frame, columns=("hit_value", "miss_value", "delta"), show="headings", height=2)
        self.tree_reward.heading("hit_value", text="获得价值")
        self.tree_reward.heading("miss_value", text="未获得价值")
        self.tree_reward.heading("delta", text="差值")
        self.tree_reward.column("hit_value", width=150, anchor="center")
        self.tree_reward.column("miss_value", width=150, anchor="center")
        self.tree_reward.column("delta", width=150, anchor="center")
        
        self.tree_reward.pack(fill="both", expand=True)

    def set_default_rules(self):
        """设置为默认规则：1,2,3,...,N 且不允许手动编辑"""
        # 默认模式下隐藏翻倍参数输入区
        self.double_frame.grid_remove()
        try:
            max_cakes = int(self.entry_max_cakes.get())
            if max_cakes <= 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("输入错误", "请先在“最大鱿鱼数 (N)”中输入一个大于 0 的整数。")
            # 回退到自定义模式，允许用户自行修正
            self.rule_mode.set("custom")
            self.entry_rules.config(state="normal")
            return

        rules = [str(i) for i in range(1, max_cakes + 1)]
        self.entry_rules.config(state="normal")
        self.entry_rules.delete(0, tk.END)
        self.entry_rules.insert(0, ",".join(rules))
        self.entry_rules.config(state="readonly")

    def set_double_rules(self):
        """
        切换到“翻倍”模式：
        - 显示翻倍节点与翻倍倍数输入框
        - 奖惩规则由“计算翻倍规则”按钮根据参数计算后自动填入
        """
        # 显示翻倍参数区
        self.double_frame.grid()
        # 在翻倍模式下，奖惩规则由程序计算，用户不直接编辑
        self.entry_rules.config(state="readonly")

    def set_custom_rules(self):
        """切换为自定义模式，允许用户手动输入规则"""
        # 自定义模式下隐藏翻倍参数输入区
        self.double_frame.grid_remove()
        self.entry_rules.config(state="normal")

    def compute_double_rules(self):
        """
        根据“翻倍节点”和“翻倍倍数”计算最终的奖惩规则，并填入“奖惩规则”输入框。

        规则说明：
        - 基础奖惩规则为 1,2,3,...,N（第 k 条鱿鱼对应基础罚金 k）
        - 翻倍节点为若干鱿鱼数量的列表，例如：4,5,7,9
        - 翻倍倍数为与节点一一对应的倍数，例如：2,3,4,5
        - 对于每个鱿鱼数量 k：
            * 找到所有 <= k 的翻倍节点中，序号最大的那个节点的倍数；
            * 若没有任何节点 <= k，则倍数为 1（不翻倍）
            * 最终罚金 = k * 对应倍数

        示例：
        N=11，节点=4,5,7,9，倍数=2,3,4,5
        得到：1,2,3,8,15,18,28,32,45,50,55
        """
        # 读取 N
        try:
            max_cakes = int(self.entry_max_cakes.get())
            if max_cakes <= 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("输入错误", "请先在“最大鱿鱼数 (N)”中输入一个大于 0 的整数。")
            return

        # 读取翻倍节点与倍数
        nodes_raw = self.entry_double_nodes.get().strip().replace("，", ",")
        mults_raw = self.entry_double_multipliers.get().strip().replace("，", ",")

        if not nodes_raw or not mults_raw:
            messagebox.showerror("输入错误", "请先在“翻倍节点”和“翻倍倍数”中输入内容（用逗号分隔）。")
            return

        try:
            nodes = [int(x.strip()) for x in nodes_raw.split(",") if x.strip()]
            multipliers = [int(x.strip()) for x in mults_raw.split(",") if x.strip()]
        except ValueError:
            messagebox.showerror("输入错误", "翻倍节点和翻倍倍数必须是用逗号分隔的整数。")
            return

        if len(nodes) != len(multipliers):
            messagebox.showerror("输入错误", "翻倍节点和翻倍倍数的数量必须一致。")
            return

        # 校验节点与倍数的取值范围
        if any(n <= 0 or n > max_cakes for n in nodes):
            messagebox.showerror("输入错误", "翻倍节点必须是 1 到 N 之间的正整数。")
            return
        if any(m <= 0 for m in multipliers):
            messagebox.showerror("输入错误", "翻倍倍数必须是大于 0 的整数。")
            return

        # 按节点从小到大排序，保持节点与倍数一一对应
        pairs = sorted(zip(nodes, multipliers), key=lambda p: p[0])
        sorted_nodes = [p[0] for p in pairs]
        sorted_mults = [p[1] for p in pairs]

        # 根据规则计算最终奖惩列表
        final_rules = []
        for k in range(1, max_cakes + 1):
            # 找到所有 <= k 的节点中，序号最大的那个
            multiplier = 1
            for idx, node in enumerate(sorted_nodes):
                if k >= node:
                    multiplier = sorted_mults[idx]
                else:
                    break
            value = k * multiplier
            final_rules.append(str(value))

        # 将结果写入“奖惩规则”输入框
        self.entry_rules.config(state="normal")
        self.entry_rules.delete(0, tk.END)
        self.entry_rules.insert(0, ",".join(final_rules))
        self.entry_rules.config(state="readonly")

    def get_reward_amount(self, cake_count, rules):
        """根据规则获取单个0鱿鱼玩家需要支付给 cake_count 玩家的金额"""
        if cake_count == 0:
            return 0
        idx = cake_count - 1
        if idx >= len(rules):
            return rules[-1]
        return rules[idx]

    def calculate_terminal_payoff(self, cakes, rules):
        """计算终局状态下的罚金结算"""
        zeros_count = cakes.count(0)
        payoff_map = {}
        total_payment_per_zero_player = 0
        
        unique_counts = set(cakes)
        for k in unique_counts:
            if k > 0:
                reward = self.get_reward_amount(k, rules)
                income = reward * zeros_count
                payoff_map[k] = float(income)
                count_of_people_with_k = cakes.count(k)
                total_payment_per_zero_player += reward * count_of_people_with_k
        
        if 0 in unique_counts:
            payoff_map[0] = -float(total_payment_per_zero_player)
        return payoff_map

    def get_state_key(self, cakes):
        return tuple(sorted(cakes, reverse=True))

    def solve_ev(self, cakes, max_cakes, stop_count, rules, num_people):
        """
        计算当前状态下，每一类玩家(持有k个)的 最终期望罚金收益(EV)。
        返回: {k: expected_value}
        """
        state_key = self.get_state_key(cakes)
        if state_key in self.memo_ev:
            return self.memo_ev[state_key]

        occupied_count = sum(1 for c in cakes if c > 0)
        current_sum = sum(cakes)

        # 终止条件
        if occupied_count >= stop_count or current_sum >= max_cakes:
            result = self.calculate_terminal_payoff(cakes, rules)
            self.memo_ev[state_key] = result
            return result

        # 递归推演
        prob = 1.0 / num_people
        
        # 累加器：记录下一层所有状态加权后的 k -> total_ev
        # 注意：这里不能简单直接加，因为状态会发生置换。
        # 我们必须遍历每一种发鱿鱼的情况，把结果映射回当前的人。
        
        # 临时存储每个位置的人在所有未来分支中的 EV 总和
        # index -> total_expected_value
        current_players_total_ev = [0.0] * num_people

        for receiver_idx in range(num_people):
            next_cakes = list(cakes)
            next_cakes[receiver_idx] += 1
            
            # 获取下一状态对于持有不同鱿鱼数k的EV表
            future_ev_map = self.solve_ev(next_cakes, max_cakes, stop_count, rules, num_people)
            
            # 将未来的价值分配回现在的人
            for p_idx in range(num_people):
                # 这个人在下一轮拥有的鱿鱼数
                k_in_future = next_cakes[p_idx]
                # 他在下一轮的期望值
                val = future_ev_map.get(k_in_future, 0.0)
                current_players_total_ev[p_idx] += val

        # 计算平均值并按鱿鱼数归类
        result_map = collections.defaultdict(float)
        counts_check = collections.defaultdict(int)
        
        for p_idx in range(num_people):
            k = cakes[p_idx]
            avg_ev = (current_players_total_ev[p_idx] * prob) # * prob 等同于 / num_people
            
            # 因为可能有多个持有相同鱿鱼数k的人，他们的期望应该是一样的（对称性）
            # 我们累加起来，最后除以人数求平均，或者直接取其中一个
            # 为了数值稳定，我们累加
            result_map[k] += avg_ev
            counts_check[k] += 1
            
        # 归一化：如果有2个人持有3个鱿鱼，上面累加了2个人的平均值，现在除以2得到单人平均值
        for k in result_map:
            result_map[k] /= counts_check[k]

        self.memo_ev[state_key] = result_map
        return result_map

    def solve_prob(self, cakes, max_cakes, stop_count, num_people):
        """
        计算概率分布：对于当前持有 k 个鱿鱼的人，最终持有 x 个鱿鱼的概率。
        返回: {k: {final_x: probability}}
        这里的 k 是指当前状态下玩家持有的鱿鱼数。
        """
        state_key = self.get_state_key(cakes)
        if state_key in self.memo_prob:
            return self.memo_prob[state_key]

        occupied_count = sum(1 for c in cakes if c > 0)
        current_sum = sum(cakes)

        # 终止条件
        if occupied_count >= stop_count or current_sum >= max_cakes:
            # 此时概率是确定的：持有 k 的人最终一定持有 k (概率1.0)
            res = {}
            for k in set(cakes):
                res[k] = {k: 1.0}
            self.memo_prob[state_key] = res
            return res

        # 递归
        # 我们需要追踪每个位置的玩家及其概率分布
        prob_step = 1.0 / num_people
        
        # position_dists[i] = 玩家 i (当前持有 cakes[i]) 的最终分布 {final_count: prob}
        position_dists = [collections.defaultdict(float) for _ in range(num_people)]

        for receiver_idx in range(num_people):
            next_cakes = list(cakes)
            next_cakes[receiver_idx] += 1
            
            future_prob_map = self.solve_prob(next_cakes, max_cakes, stop_count, num_people)
            
            for p_idx in range(num_people):
                k_in_future = next_cakes[p_idx]
                # 获取这个人在未来状态下的最终分布
                future_dist = future_prob_map.get(k_in_future, {})
                
                # 累加到当前玩家 p_idx 的分布中
                for final_k, p_val in future_dist.items():
                    position_dists[p_idx][final_k] += p_val * prob_step

        # 将按位置的分布 汇总为 按当前持有数 k 的分布
        # result[k] = {final_x: prob}
        result = {}
        unique_ks = set(cakes)
        
        for k in unique_ks:
            # 找到所有当前持有 k 的玩家位置
            indices = [i for i, x in enumerate(cakes) if x == k]
            # 合并他们的分布（理论上是对称的，取平均即可）
            combined_dist = collections.defaultdict(float)
            for idx in indices:
                for final_k, p_val in position_dists[idx].items():
                    combined_dist[final_k] += p_val
            
            # 除以该类玩家的数量，得到单人平均概率
            count_k = len(indices)
            for final_k in combined_dist:
                combined_dist[final_k] /= count_k
            
            result[k] = dict(combined_dist)

        self.memo_prob[state_key] = result
        return result

    # ================= 蒙特卡洛模拟相关方法 =================
    
    def monte_carlo_get_reward_amount(self, k, rules):
        """蒙特卡洛模拟用的奖励计算"""
        if k == 0:
            return 0
        idx = k - 1
        if idx >= len(rules):
            return rules[-1]
        return rules[idx]

    def monte_carlo_calculate_final_payoff(self, cakes, rules, num_people):
        """结算终局罚金（蒙特卡洛用）"""
        zeros_count = cakes.count(0)
        scores = [0.0] * num_people
        
        # 1. 有蛋糕的人收钱
        total_payment_from_each_zero = 0
        for i, k in enumerate(cakes):
            if k > 0:
                gain = self.monte_carlo_get_reward_amount(k, rules) * zeros_count
                scores[i] = gain
                total_payment_from_each_zero += self.monte_carlo_get_reward_amount(k, rules)
                
        # 2. 0蛋糕的人付钱
        for i, k in enumerate(cakes):
            if k == 0:
                scores[i] = -total_payment_from_each_zero
                
        return scores

    def monte_carlo_play_game_to_end(self, start_cakes, max_cakes, stop_count, num_people):
        """从给定状态随机玩到游戏结束，返回最终每个人的收益列表"""
        cakes = list(start_cakes)
        
        while True:
            occupied = sum(1 for c in cakes if c > 0)
            current_sum = sum(cakes)
            
            if occupied >= stop_count or current_sum >= max_cakes:
                break
                
            # 发蛋糕 (完全随机)
            lucky_idx = random.randint(0, num_people - 1)
            cakes[lucky_idx] += 1
            
        return cakes

    def monte_carlo_simulate_probability(self, current_state, player_idx, trials, max_cakes, stop_count, num_people, stop_event=None, progress_callback=None):
        """从当前状态开始模拟，计算概率分布

        stop_event: 若被设置，则提前停止循环，配合“停止模拟”按钮使用
        """
        final_counts = collections.defaultdict(int)
        
        for trial in range(trials):
            # 支持外部停止
            if stop_event is not None and stop_event.is_set():
                break

            final_cakes = self.monte_carlo_play_game_to_end(current_state, max_cakes, stop_count, num_people)
            final_counts[final_cakes[player_idx]] += 1
            
            if progress_callback and (trial + 1) % 100 == 0:  # 每100次更新一次，避免阻塞窗口
                # 创建副本以避免线程安全问题
                counts_copy = dict(final_counts)
                progress_callback(trial + 1, trials, counts_copy)
        
        # 最后一次更新，确保显示最终结果
        if progress_callback:
            counts_copy = dict(final_counts)
            progress_callback(trials, trials, counts_copy)
        
        return final_counts

    def monte_carlo_simulate_hit_vs_miss(
        self,
        current_state,
        player_idx,
        trials,
        max_cakes,
        stop_count,
        rules,
        num_people,
        stop_event=None,
        progress_callback=None,
    ):
        """针对特定玩家，模拟一次“下一只鱿鱼”随机发给谁的过程，并区分 Hit / Miss。

        含义与命令行版本的直觉一致：
        - 一共模拟 `trials` 次；
        - 每次根据 1/num_people 的概率给当前玩家（Hit），其余概率给别人（Miss）；
        - 我们分别记录所有 Hit 样本和所有 Miss 样本，分别求平均，得到 EV_hit / EV_miss。

        stop_event: 若被设置，则提前停止循环，配合“结束模拟”按钮使用。
        """
        hit_scores: list[float] = []
        miss_scores: list[float] = []

        others_indices = [i for i in range(num_people) if i != player_idx]

        for t in range(trials):
            if stop_event is not None and stop_event.is_set():
                break

            # 从当前状态出发，随机决定“下一只鱿鱼”发给谁
            next_state = list(current_state)
            lucky_idx = random.randint(0, num_people - 1)

            if lucky_idx == player_idx:
                # Hit：下一只鱿鱼发给当前玩家
                next_state[player_idx] += 1
                phase = "hit"
            else:
                # Miss：发给其他任意一人
                next_state[lucky_idx] += 1
                phase = "miss"

            final_cakes = self.monte_carlo_play_game_to_end(
                next_state, max_cakes, stop_count, num_people
            )
            final_payoff = self.monte_carlo_calculate_final_payoff(
                final_cakes, rules, num_people
            )
            payoff_me = final_payoff[player_idx]

            if phase == "hit":
                hit_scores.append(payoff_me)
            else:
                miss_scores.append(payoff_me)

            # 进度回调：每 100 次更新一次，避免阻塞窗口
            if progress_callback and (t + 1) % 100 == 0:
                progress_callback(t + 1, trials, phase, hit_scores, miss_scores)

        # 最后一轮进度更新，保证 UI 能看到最终结果
        if progress_callback and (hit_scores or miss_scores):
            # phase 用不上太多，只是为了兼容现有回调签名
            last_phase = "hit" if hit_scores else "miss"
            progress_callback(trials, trials, last_phase, hit_scores, miss_scores)

        avg_hit = statistics.mean(hit_scores) if hit_scores else 0.0
        avg_miss = statistics.mean(miss_scores) if miss_scores else 0.0

        return avg_hit, avg_miss, hit_scores, miss_scores

    def on_simulate(self):
        """启动蒙特卡洛模拟"""
        try:
            # 获取输入参数
            max_cakes = int(self.entry_max_cakes.get())
            num_people = int(self.entry_num_people.get())
            my_cake = int(self.entry_my_cake.get())
            
            others_str = self.entry_others_cake.get().replace("，", ",")
            others_cakes = [int(x.strip()) for x in others_str.split(",") if x.strip()]
            
            rules_str = self.entry_rules.get().replace("，", ",")
            rules = [int(x.strip()) for x in rules_str.split(",") if x.strip()]
            
            num_trials = int(self.entry_sim_trials.get())
            
            # 补齐人数
            current_others_count = len(others_cakes)
            needed_others = num_people - 1
            if current_others_count < needed_others:
                others_cakes.extend([0] * (needed_others - current_others_count))
            elif current_others_count > needed_others:
                others_cakes = others_cakes[:needed_others]
            
            # 初始状态构建
            all_cakes = [my_cake] + others_cakes
            stop_count = num_people - 1
            
            # 检查合法性
            if sum(all_cakes) > max_cakes:
                messagebox.showerror("错误", "当前蛋糕总数已超过最大值！")
                return
            
            # 检查是否已经是终局
            occupied = sum(1 for c in all_cakes if c > 0)
            if occupied >= stop_count or sum(all_cakes) >= max_cakes:
                messagebox.showinfo("提示", "当前持有蛋糕数已经达到最大蛋糕数，游戏已结束。")
                return
            
            # 打开模拟窗口
            sim_window = MonteCarloSimWindow(
                self.root, all_cakes, my_cake, max_cakes, stop_count, rules, num_people, num_trials,
                self.monte_carlo_simulate_probability,
                self.monte_carlo_simulate_hit_vs_miss
            )
            
        except Exception as e:
            messagebox.showerror("错误", f"参数错误: {str(e)}")

    def on_calculate(self):
        # 清空表格
        for item in self.tree_prob.get_children():
            self.tree_prob.delete(item)
        for item in self.tree_reward.get_children():
            self.tree_reward.delete(item)
        self.root.update()

        try:
            # 1. 获取输入
            max_cakes = int(self.entry_max_cakes.get())
            num_people = int(self.entry_num_people.get())
            my_cake = int(self.entry_my_cake.get())
            
            others_str = self.entry_others_cake.get().replace("，", ",")
            others_cakes = [int(x.strip()) for x in others_str.split(",") if x.strip()]
            
            rules_str = self.entry_rules.get().replace("，", ",")
            rules = [int(x.strip()) for x in rules_str.split(",") if x.strip()]

            # 补齐人数
            current_others_count = len(others_cakes)
            needed_others = num_people - 1
            if current_others_count < needed_others:
                others_cakes.extend([0] * (needed_others - current_others_count))
            elif current_others_count > needed_others:
                others_cakes = others_cakes[:needed_others]

            # 初始状态构建
            all_cakes = [my_cake] + others_cakes
            stop_count = num_people - 1 # 默认规则：N-1人有时停止

            # 检查当前总鱿鱼数
            total_cakes = sum(all_cakes)
            if total_cakes > max_cakes:
                messagebox.showerror("错误", "当前鱿鱼总数已超过最大值！")
                return
            # 如果当前总鱿鱼数已经等于最大鱿鱼数，则游戏已结束，直接结算当前状态
            if total_cakes == max_cakes:
                messagebox.showinfo("游戏已结束", "当前持有鱿鱼数已经达到最大鱿鱼数，游戏已结束。")

                # 计算当前终局下每类玩家的应得/应付总额
                payoff_map = self.calculate_terminal_payoff(all_cakes, rules)
                my_final_payoff = payoff_map.get(my_cake, 0.0)

                # 概率分布：当前就是终局，最终持有数等于当前持有数，概率为 100%
                self.tree_prob.insert("", "end", values=(my_cake, "100.00%"))

                # 决策收益表格：显示该玩家应得/应付的总额（正数表示获得，负数表示支付）
                self.tree_reward.insert(
                    "",
                    "end",
                    values=(
                        f"{my_final_payoff:+.2f}",  # 使用“获得价值”这一列承载终局结果
                        "",
                        ""
                    ),
                )
                return

            # 清空缓存
            self.memo_ev = {}
            self.memo_prob = {}

            # ================= 计算过程 =================

            # 1. 计算概率分布
            prob_map = self.solve_prob(all_cakes, max_cakes, stop_count, num_people)
            my_prob_dist = prob_map.get(my_cake, {})
            
            # 2. 计算下一轮收益比较
            # 场景 A: 我获得了鱿鱼
            next_cakes_if_get = [my_cake + 1] + others_cakes
            # 注意：传入 solve_ev 时需要列表，且函数内部会排序，但返回的 map 是基于持有数的
            ev_map_if_get = self.solve_ev(next_cakes_if_get, max_cakes, stop_count, rules, num_people)
            ev_val_if_get = ev_map_if_get.get(my_cake + 1, 0.0)

            # 场景 B: 我没有获得鱿鱼 (其他人获得了)
            # 这意味着鱿鱼发给了其他人中的某一个。
            # 概率均摊给其他 N-1 个人 (假设前提是"已知我没拿到")
            total_ev_if_not_get = 0.0
            
            # 遍历每一个"其他人"获得鱿鱼的情况
            for i in range(len(others_cakes)):
                # 构造临时状态：我和其他没变的人 + 这个人+1
                temp_others = list(others_cakes)
                temp_others[i] += 1
                next_cakes_if_lose = [my_cake] + temp_others
                
                ev_map_temp = self.solve_ev(next_cakes_if_lose, max_cakes, stop_count, rules, num_people)
                # 在这种情况下，我依然只有 my_cake 个
                total_ev_if_not_get += ev_map_temp.get(my_cake, 0.0)
            
            # 平均值 (除以其他人数)
            if len(others_cakes) > 0:
                ev_val_if_not_get = total_ev_if_not_get / len(others_cakes)
            else:
                ev_val_if_not_get = 0.0 # 只有1个人玩的情况

            diff = ev_val_if_get - ev_val_if_not_get

            # ================= 输出显示 =================
            # 第一部分：概率分布表格（两列：最终持有、概率）
            sorted_outcomes = sorted(my_prob_dist.items())
            for count, p in sorted_outcomes:
                self.tree_prob.insert("", "end", values=(count, f"{p*100:.2f}%"))
            
            # 第二部分：决策收益表格（2行3列：获得价值、未获得价值、差值）
            self.tree_reward.insert("", "end", values=(
                f"{ev_val_if_get:+.2f}",
                f"{ev_val_if_not_get:+.2f}",
                f"{diff:+.2f}"
            ))

        except Exception as e:
            messagebox.showerror("计算错误", str(e))


class MonteCarloSimWindow:
    """蒙特卡洛模拟窗口"""
    def __init__(self, parent, all_cakes, my_cake, max_cakes, stop_count, rules, num_people, num_trials, prob_func, reward_func):
        self.parent = parent
        self.all_cakes = all_cakes
        self.my_cake = my_cake
        self.max_cakes = max_cakes
        self.stop_count = stop_count
        self.rules = rules
        self.num_people = num_people
        self.num_trials = num_trials
        self.prob_func = prob_func
        self.reward_func = reward_func
        # 进度状态
        self.prob_current = 0
        self.hit_done = 0
        self.miss_done = 0
        # 停止控制事件
        self.stop_event = threading.Event()
        
        self.window = tk.Toplevel(parent)
        self.window.title("蒙特卡洛模拟")
        self.window.geometry("700x600")
        
        # 顶部控制区：进度 + 停止按钮
        top_frame = tk.Frame(self.window)
        top_frame.pack(fill="x", pady=10)

        # 模拟进度标签
        self.label_progress = tk.Label(top_frame, text="模拟次数: 0 / 0", font=("Arial", 12, "bold"))
        self.label_progress.pack(side="left", padx=10)

        # 结束按钮
        self.btn_stop = tk.Button(top_frame, text="结束模拟", command=self.stop_simulation, bg="#FFCCCC")
        self.btn_stop.pack(side="right", padx=10)
        self.is_stopped = False  # 标记是否已停止
        
        # 输出区域
        output_frame = tk.LabelFrame(self.window, text="模拟结果", padx=10, pady=10)
        output_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        # 第一部分：概率分布表格
        prob_frame = tk.LabelFrame(output_frame, text="概率分布", padx=5, pady=5)
        prob_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        prob_tree_frame = tk.Frame(prob_frame)
        prob_tree_frame.pack(fill="both", expand=True)
        
        self.tree_prob = ttk.Treeview(prob_tree_frame, columns=("final_count", "probability"), show="headings", height=8)
        self.tree_prob.heading("final_count", text="最终持有鱿鱼个数")
        self.tree_prob.heading("probability", text="概率")
        self.tree_prob.column("final_count", width=200, anchor="center")
        self.tree_prob.column("probability", width=200, anchor="center")
        
        prob_scrollbar = ttk.Scrollbar(prob_tree_frame, orient="vertical", command=self.tree_prob.yview)
        self.tree_prob.configure(yscrollcommand=prob_scrollbar.set)
        
        self.tree_prob.pack(side="left", fill="both", expand=True)
        prob_scrollbar.pack(side="right", fill="y")
        
        # 第二部分：决策收益表格
        reward_frame = tk.LabelFrame(output_frame, text="决策收益", padx=5, pady=5)
        reward_frame.pack(fill="both", expand=True, padx=5, pady=5)
        
        reward_tree_frame = tk.Frame(reward_frame)
        reward_tree_frame.pack(fill="both", expand=True)
        
        self.tree_reward = ttk.Treeview(reward_tree_frame, columns=("hit_value", "miss_value", "delta"), show="headings", height=2)
        self.tree_reward.heading("hit_value", text="获得价值")
        self.tree_reward.heading("miss_value", text="未获得价值")
        self.tree_reward.heading("delta", text="差值")
        self.tree_reward.column("hit_value", width=150, anchor="center")
        self.tree_reward.column("miss_value", width=150, anchor="center")
        self.tree_reward.column("delta", width=150, anchor="center")
        
        self.tree_reward.pack(fill="both", expand=True)
        
        # 启动模拟线程
        self.simulating = True
        self.thread = threading.Thread(target=self.run_simulation, daemon=True)
        self.thread.start()

    def stop_simulation(self):
        """用户点击“结束模拟”时调用"""
        if self.is_stopped:
            # 如果已经停止，关闭窗口
            self.window.destroy()
            return
        
        # 如果正在模拟，停止模拟
        if self.simulating:
            self.simulating = False
            self.stop_event.set()
            self.is_stopped = True
            # 更新进度显示为当前实际完成的次数
            self._update_progress_label()
            # 在标签上标记为已停止
            current_text = self.label_progress.cget("text")
            if "（已停止）" not in current_text:
                self.label_progress.config(text=current_text + "（已停止）")
            # 按钮文字改为"关闭窗口"
            self.btn_stop.config(text="关闭窗口")
    
    def update_prob_progress(self, current, total, final_counts):
        """更新概率分布进度"""
        if not self.simulating:
            return
        # 使用after确保在主线程更新UI，并让窗口能处理其他事件
        self.window.after(0, lambda: self._update_prob_ui(current, total, final_counts))
    
    def update_reward_progress(self, current, total, phase, hit_scores, miss_scores):
        """更新决策收益进度"""
        if not self.simulating:
            return
        # 使用after确保在主线程更新UI，并让窗口能处理其他事件
        self.window.after(0, lambda: self._update_reward_ui(current, total, phase, hit_scores, miss_scores))
    
    def _update_prob_ui(self, current, total, final_counts):
        """更新概率分布UI"""
        # 如果模拟已停止，不再更新
        if not self.simulating:
            return
        
        # 更新内部进度状态
        self.prob_current = current
        
        # 如果已经完成，不再更新表格（避免数字继续变化）
        if current >= total:
            self.prob_current = total
            self._update_progress_label()
            return
        
        if final_counts and sum(final_counts.values()) > 0:
            # 清空旧数据
            for item in self.tree_prob.get_children():
                self.tree_prob.delete(item)
            
            # 计算概率
            total_count = sum(final_counts.values())
            sorted_counts = sorted(final_counts.items())
            for count, freq in sorted_counts:
                prob = freq / total_count
                self.tree_prob.insert("", "end", values=(count, f"{prob*100:.2f}%"))

        # 刷新统一进度文本
        self._update_progress_label()
        # 让窗口能处理事件
        self.window.update_idletasks()
    
    def _update_reward_ui(self, current, total, phase, hit_scores, miss_scores):
        """更新决策收益UI"""
        # 如果模拟已停止，不再更新
        if not self.simulating:
            return
        
        # 当前已经完成的 Hit / Miss 次数（根据样本数量推算）
        self.hit_done = len(hit_scores) if hit_scores else 0
        self.miss_done = len(miss_scores) if miss_scores else 0
        
        # 如果已经完成，不再更新表格
        if current >= total:
            self._update_progress_label()
            return
        
        # 清空旧数据
        for item in self.tree_reward.get_children():
            self.tree_reward.delete(item)

        # 计算并显示决策收益
        if self.hit_done > 0:
            avg_hit = statistics.mean(hit_scores)

            if self.miss_done > 0:
                avg_miss = statistics.mean(miss_scores)
                delta = avg_hit - avg_miss
                miss_text = f"{avg_miss:+.2f}"
                delta_text = f"{delta:+.2f}"
            else:
                # Miss 还在计算中
                avg_miss = 0.0
                delta = avg_hit
                miss_text = "计算中..."
                delta_text = "计算中..."

            self.tree_reward.insert(
                "",
                "end",
                values=(
                    f"{avg_hit:+.2f}",
                    miss_text,
                    delta_text,
                ),
            )
        else:
            # Hit 还没开始
            self.tree_reward.insert(
                "",
                "end",
                values=(
                    "计算中...",
                    "等待中...",
                    "等待中...",
                ),
            )

        # 刷新统一进度文本
        self._update_progress_label()
        # 让窗口能处理事件
        self.window.update_idletasks()
    
    def _update_progress_label(self):
        """统一更新顶部进度文字：只显示总模拟次数进度"""
        trials = self.num_trials
        # 总进度：概率分布和决策收益各自运行trials次，取两者的最小值
        # 因为它们是并行运行的，实际完成的是两者中较慢的那个
        # 决策收益的总次数是 hit_done + miss_done
        reward_total = self.hit_done + self.miss_done
        done = min(self.prob_current, reward_total)
        # 确保不超过总次数
        done = min(done, trials)
        self.label_progress.config(text=f"模拟次数： {done} / {trials}")
        # 让窗口能处理事件，避免阻塞
        self.window.update_idletasks()
    
    def run_simulation(self):
        """在后台线程中运行模拟"""
        player_idx = 0  # 当前玩家是第一个
        
        try:
            # 用户输入的是总次数：
            # - 概率分布：运行 num_trials 次
            # - 决策收益：运行 num_trials 次（内部再对 Hit / Miss 平分）
            trials_per_sim = self.num_trials
            
            # 初始化进度显示（从 0 / N 开始）
            self.prob_current = 0
            self.hit_done = 0
            self.miss_done = 0
            self.window.after(0, self._update_progress_label)
            
            # 同时运行概率分布和决策收益模拟
            import threading
            
            prob_result = [None]
            reward_result = [None]
            
            def run_prob():
                try:
                    final_counts = self.prob_func(
                        self.all_cakes, player_idx, trials_per_sim,
                        self.max_cakes, self.stop_count, self.num_people,
                        self.stop_event,
                        lambda curr, total, counts: self._prob_callback(curr, total, counts)
                    )
                    prob_result[0] = final_counts
                except Exception as e:
                    prob_result[0] = e
            
            def run_reward():
                try:
                    avg_hit, avg_miss, hit_scores, miss_scores = self.reward_func(
                        self.all_cakes, player_idx, trials_per_sim,
                        self.max_cakes, self.stop_count, self.rules, self.num_people,
                        self.stop_event,
                        lambda curr, total, phase, hit, miss: self._reward_callback(curr, total, phase, hit, miss)
                    )
                    reward_result[0] = (avg_hit, avg_miss, hit_scores, miss_scores)
                except Exception as e:
                    reward_result[0] = e
            
            # 启动两个线程
            prob_thread = threading.Thread(target=run_prob, daemon=True)
            reward_thread = threading.Thread(target=run_reward, daemon=True)
            
            prob_thread.start()
            reward_thread.start()
            
            # 等待两个线程完成
            prob_thread.join()
            reward_thread.join()
            
            # 检查结果
            if isinstance(prob_result[0], Exception):
                raise prob_result[0]
            if isinstance(reward_result[0], Exception):
                raise reward_result[0]
            
            # 最终更新
            self.window.after(0, lambda: self._final_update(
                reward_result[0][0], reward_result[0][1], 
                prob_result[0], reward_result[0][2], reward_result[0][3]
            ))
            
        except Exception as e:
            self.window.after(0, lambda: messagebox.showerror("模拟错误", str(e)))
        finally:
            self.simulating = False
    
    def _prob_callback(self, current, total, final_counts):
        """概率分布回调"""
        self.prob_current = current
        self.update_prob_progress(current, total, final_counts)
    
    def _reward_callback(self, current, total, phase, hit_scores, miss_scores):
        """决策收益回调"""
        # 确保hit_scores和miss_scores是列表的副本，避免线程安全问题
        hit_copy = list(hit_scores) if hit_scores else []
        miss_copy = list(miss_scores) if miss_scores else []
        self.update_reward_progress(current, total, phase, hit_copy, miss_copy)
    
    def _final_update(self, avg_hit, avg_miss, final_counts, hit_scores, miss_scores):
        """最终更新界面"""
        # 计算实际完成的次数（基于实际结果）
        actual_prob_done = sum(final_counts.values()) if final_counts else 0
        actual_reward_done = len(hit_scores) + len(miss_scores) if hit_scores or miss_scores else 0
        
        # 更新进度为实际完成的次数
        self.prob_current = actual_prob_done
        self.hit_done = len(hit_scores) if hit_scores else 0
        self.miss_done = len(miss_scores) if miss_scores else 0
        
        # 实际完成的总次数（取两者的最小值，因为它们是并行运行的）
        actual_total = min(actual_prob_done, actual_reward_done)
        self._update_progress_label()
        
        # 模拟完成后，按钮文字改为"关闭窗口"
        self.btn_stop.config(text="关闭窗口")
        self.is_stopped = True
        
        # 更新概率分布（基于实际完成的次数）
        for item in self.tree_prob.get_children():
            self.tree_prob.delete(item)
        
        if final_counts and sum(final_counts.values()) > 0:
            total_count = sum(final_counts.values())
            sorted_counts = sorted(final_counts.items())
            for count, freq in sorted_counts:
                prob = freq / total_count
                self.tree_prob.insert("", "end", values=(count, f"{prob*100:.2f}%"))
        
        # 更新决策收益（基于实际完成的次数）
        for item in self.tree_reward.get_children():
            self.tree_reward.delete(item)
        
        delta = avg_hit - avg_miss
        self.tree_reward.insert("", "end", values=(
            f"{avg_hit:+.2f}",
            f"{avg_miss:+.2f}",
            f"{delta:+.2f}"
        ))


if __name__ == "__main__":
    root = tk.Tk()
    app = CakeGameCalculator(root)
    root.mainloop()