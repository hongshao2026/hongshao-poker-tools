import math
import tkinter as tk
from tkinter import messagebox, ttk


def parse_float(value_str):
    try:
        return float(value_str)
    except ValueError:
        return None


def build_pko_tab(parent):
    font_title = ("Arial", 10, "bold")
    sync_lock = False
    sync_pairs = []

    # 变量
    var_total_entrants = tk.StringVar()
    var_players_left = tk.StringVar()
    var_start_stack = tk.StringVar()
    var_start_bounty = tk.StringVar()
    var_ante = tk.StringVar()
    var_big_blind = tk.StringVar()
    var_players_at_table = tk.StringVar()
    var_pot = tk.StringVar()
    var_pot_bb = tk.StringVar()
    var_hero_invested = tk.StringVar(value="0")
    var_hero_invested_bb = tk.StringVar()
    var_hero_call = tk.StringVar()
    var_hero_call_bb = tk.StringVar()
    var_hero_stack = tk.StringVar()
    var_hero_bb = tk.StringVar()
    result_table_vars = {
        "剩余玩家比例": tk.StringVar(value="-"),
        "起始赏金价值": tk.StringVar(value="-"),
        "可争夺总赏金": tk.StringVar(value="-"),
        "赏金折合虚拟底池": tk.StringVar(value="-"),
        "当前总底池": tk.StringVar(value="-"),
        "Hero需要跟注": tk.StringVar(value="-"),
        "不含赏金所需胜率": tk.StringVar(value="-"),
        "含赏金所需胜率": tk.StringVar(value="-"),
    }

    left_frame = tk.Frame(parent)
    left_frame.grid(row=0, column=0, sticky="n", padx=10, pady=10)

    result_frame = tk.Frame(parent)
    result_frame.grid(row=0, column=1, sticky="n", padx=10, pady=10)

    villain_rows = []
    for _ in range(4):
        villain_rows.append(
            {
                "stack": tk.StringVar(),
                "bb": tk.StringVar(),
                "bounty": tk.StringVar(),
            }
        )

    def get_bb_value():
        bb_value = parse_float(var_big_blind.get().strip())
        if bb_value is None or bb_value <= 0:
            return None
        return bb_value

    def sync_pair_from_stack(stack_var, bb_var):
        nonlocal sync_lock
        if sync_lock:
            return
        stack_text = stack_var.get().strip()
        bb_value = get_bb_value()
        if not stack_text:
            sync_lock = True
            bb_var.set("")
            sync_lock = False
            return
        stack_value = parse_float(stack_text)
        if stack_value is None or bb_value is None:
            return
        sync_lock = True
        bb_var.set(f"{stack_value / bb_value:.2f}")
        sync_lock = False
        calculate_current_pot()
        calculate_hero_call()

    def sync_pair_from_bb(stack_var, bb_var):
        nonlocal sync_lock
        if sync_lock:
            return
        bb_text = bb_var.get().strip()
        bb_value = get_bb_value()
        if not bb_text:
            sync_lock = True
            stack_var.set("")
            sync_lock = False
            return
        bb_count = parse_float(bb_text)
        if bb_count is None or bb_value is None:
            return
        sync_lock = True
        stack_var.set(f"{bb_count * bb_value:.2f}")
        sync_lock = False
        calculate_current_pot()
        calculate_hero_call()

    def bind_stack_bb_pair(stack_var, bb_var):
        stack_var.trace_add("write", lambda *args: sync_pair_from_stack(stack_var, bb_var))
        bb_var.trace_add("write", lambda *args: sync_pair_from_bb(stack_var, bb_var))
        sync_pairs.append((stack_var, bb_var))

    def refresh_all_pairs():
        for stack_var, bb_var in sync_pairs:
            if stack_var.get().strip():
                sync_pair_from_stack(stack_var, bb_var)
            elif bb_var.get().strip():
                sync_pair_from_bb(stack_var, bb_var)

    def sync_pot_bb_from_pot():
        nonlocal sync_lock
        if sync_lock:
            return
        pot_value = parse_float(var_pot.get().strip())
        bb_value = get_bb_value()
        if pot_value is None or bb_value is None:
            sync_lock = True
            var_pot_bb.set("")
            sync_lock = False
            return
        sync_lock = True
        var_pot_bb.set(f"{pot_value / bb_value:.2f}")
        sync_lock = False

    def sync_call_bb_from_call():
        nonlocal sync_lock
        if sync_lock:
            return
        call_value = parse_float(var_hero_call.get().strip())
        bb_value = get_bb_value()
        if call_value is None or bb_value is None:
            sync_lock = True
            var_hero_call_bb.set("")
            sync_lock = False
            return
        sync_lock = True
        var_hero_call_bb.set(f"{call_value / bb_value:.2f}")
        sync_lock = False

    def calculate_current_pot():
        nonlocal sync_lock
        if sync_lock:
            return

        ante = parse_float(var_ante.get().strip())
        bb = parse_float(var_big_blind.get().strip())
        players_at_table = parse_float(var_players_at_table.get().strip())
        hero_invested = parse_float(var_hero_invested.get().strip())
        sb = bb / 2 if bb is not None else None

        allin_total = 0.0
        for row in villain_rows:
            v_stack = parse_float(row["stack"].get().strip())
            if v_stack is not None and v_stack >= 0:
                allin_total += v_stack

        if (
            ante is None
            or bb is None
            or players_at_table is None
            or hero_invested is None
            or players_at_table <= 0
            or ante < 0
            or sb < 0
            or bb < 0
            or hero_invested < 0
        ):
            sync_lock = True
            var_pot.set("")
            sync_lock = False
            sync_pot_bb_from_pot()
            return

        pot_value = ante * players_at_table + sb + bb + hero_invested + allin_total
        sync_lock = True
        var_pot.set(f"{pot_value:.2f}")
        sync_lock = False
        sync_pot_bb_from_pot()

    def calculate_hero_call():
        nonlocal sync_lock
        if sync_lock:
            return

        hero_invested = parse_float(var_hero_invested.get().strip())
        villain_allins = []
        for row in villain_rows:
            v_stack = parse_float(row["stack"].get().strip())
            if v_stack is not None and v_stack >= 0:
                villain_allins.append(v_stack)

        if hero_invested is None or hero_invested < 0 or not villain_allins:
            sync_lock = True
            var_hero_call.set("")
            sync_lock = False
            sync_call_bb_from_call()
            return

        call_value = max(0.0, max(villain_allins) - hero_invested)
        sync_lock = True
        var_hero_call.set(f"{call_value:.2f}")
        sync_lock = False
        sync_call_bb_from_call()

    def calculate_equity():
        errors = []

        start_stack_text = var_start_stack.get().strip()
        if not start_stack_text:
            errors.append("请填写起始筹码。")
        starting_stack = parse_float(start_stack_text)
        if start_stack_text and (starting_stack is None or starting_stack <= 0):
            errors.append("起始筹码必须是大于0的数字。")

        start_bounty_text = var_start_bounty.get().strip()
        if not start_bounty_text:
            errors.append("请填写起始赏金。")
        starting_bounty = parse_float(start_bounty_text)
        if start_bounty_text and (starting_bounty is None or starting_bounty <= 0):
            errors.append("起始赏金必须是大于0的数字。")

        total_entrants_text = var_total_entrants.get().strip()
        if not total_entrants_text:
            errors.append("请填写比赛总人数。")
        total_entrants = parse_float(total_entrants_text)
        if total_entrants_text and (total_entrants is None or total_entrants <= 0):
            errors.append("比赛总人数必须是大于0的数字。")

        players_left_text = var_players_left.get().strip()
        if not players_left_text:
            errors.append("请填写剩余人数。")
        players_left = parse_float(players_left_text)
        if players_left_text and (players_left is None or players_left <= 0):
            errors.append("剩余人数必须是大于0的数字。")
        elif total_entrants is not None and players_left > total_entrants:
            errors.append("剩余人数不能大于比赛总人数。")

        ante_text = var_ante.get().strip()
        if not ante_text:
            errors.append("请填写前注。")
        ante_value = parse_float(ante_text)
        if ante_text and (ante_value is None or ante_value < 0):
            errors.append("前注必须是大于等于0的数字。")

        bb_text = var_big_blind.get().strip()
        if not bb_text:
            errors.append("请填写大盲。")
        bb_value = parse_float(bb_text)
        if bb_text and (bb_value is None or bb_value <= 0):
            errors.append("大盲必须是大于0的数字。")

        players_at_table_text = var_players_at_table.get().strip()
        if not players_at_table_text:
            errors.append("请填写当桌人数(含Hero)。")
        players_at_table_value = parse_float(players_at_table_text)
        if players_at_table_text and (players_at_table_value is None or players_at_table_value <= 0):
            errors.append("当桌人数(含Hero)必须是大于0的数字。")

        current_pot = parse_float(var_pot.get().strip())
        if current_pot is None or current_pot < 0:
            errors.append("当前总底池计算失败，请检查前注/大盲/当桌人数/投入筹码。")

        hero_call = parse_float(var_hero_call.get().strip())
        if hero_call is None or hero_call < 0:
            errors.append("Hero需要跟注必须是大于等于0的数字。")

        hero_stack_text = var_hero_stack.get().strip()
        if not hero_stack_text:
            errors.append("请填写Hero当前总筹码。")
        hero_stack = parse_float(hero_stack_text)
        if hero_stack_text and (hero_stack is None or hero_stack < 0):
            errors.append("Hero当前总筹码必须是大于等于0的数字。")

        total_covered_bounty = 0.0
        covered_count = 0
        for i, row in enumerate(villain_rows, start=1):
            v_stack_str = row["stack"].get().strip()
            v_bounty_str = row["bounty"].get().strip()
            if not v_stack_str and not v_bounty_str:
                continue
            if not v_stack_str:
                errors.append(f"对手{i}缺少All-in筹码。")
                continue
            if not v_bounty_str:
                errors.append(f"对手{i}缺少赏金金额。")
                continue

            v_stack = parse_float(v_stack_str)
            v_bounty = parse_float(v_bounty_str)
            if v_stack is None or v_stack < 0:
                errors.append(f"对手{i}All-in筹码无效。")
                continue
            if v_bounty is None or v_bounty < 0:
                errors.append(f"对手{i}赏金金额无效。")
                continue

            if hero_stack is not None and hero_stack >= v_stack:
                total_covered_bounty += v_bounty
                covered_count += 1

        if errors:
            messagebox.showerror("输入错误", "\n".join(errors))
            return

        bb_value = get_bb_value()
        F = players_left / total_entrants
        bounty_factor = 0.5 / (1 + math.sqrt(F))
        bounty_in_chips = (total_covered_bounty / starting_bounty) * bounty_factor * starting_stack

        total_reward = current_pot + hero_call + bounty_in_chips
        if total_reward <= 0 or (current_pot + hero_call) <= 0:
            messagebox.showerror("计算错误", "底池与跟注合计必须大于0，无法计算胜率。")
            return

        required_equity = hero_call / total_reward
        normal_equity = hero_call / (current_pot + hero_call)

        bounty_bb_text = f" ({bounty_in_chips / bb_value:.2f} BB)" if bb_value else ""
        pot_bb_text = f" ({current_pot / bb_value:.2f} BB)" if bb_value else ""
        call_bb_text = f" ({hero_call / bb_value:.2f} BB)" if bb_value else ""
        result_table_vars["剩余玩家比例"].set(f"{F*100:.1f}%")
        result_table_vars["起始赏金价值"].set(f"{int(bounty_factor * starting_stack)} 筹码")
        result_table_vars["可争夺总赏金"].set(f"${total_covered_bounty:.2f}（覆盖{covered_count}人）")
        result_table_vars["赏金折合虚拟底池"].set(f"{int(bounty_in_chips)} 筹码{bounty_bb_text}")
        result_table_vars["当前总底池"].set(f"{current_pot:.2f} 筹码{pot_bb_text}")
        result_table_vars["Hero需要跟注"].set(f"{hero_call:.2f} 筹码{call_bb_text}")
        result_table_vars["不含赏金所需胜率"].set(f"{normal_equity*100:.2f}%")
        result_table_vars["含赏金所需胜率"].set(f"{required_equity*100:.2f}%")

    # 布局
    tk.Label(left_frame, text="--- 赛事基础信息 ---", font=font_title).grid(
        row=0, column=0, columnspan=2, pady=(10, 5)
    )
    tk.Label(left_frame, text="比赛总人数:").grid(row=1, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_total_entrants).grid(row=1, column=1, sticky="w")
    tk.Label(left_frame, text="剩余人数:").grid(row=2, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_players_left).grid(row=2, column=1, sticky="w")
    tk.Label(left_frame, text="起始筹码:").grid(row=3, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_start_stack).grid(row=3, column=1, sticky="w")
    tk.Label(left_frame, text="起始赏金 ($):").grid(row=4, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_start_bounty).grid(row=4, column=1, sticky="w")

    tk.Label(left_frame, text="--- 当前局势 ---", font=font_title).grid(
        row=5, column=0, columnspan=2, pady=(15, 5)
    )
    tk.Label(left_frame, text="前注:").grid(row=6, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_ante).grid(row=6, column=1, sticky="w")
    tk.Label(left_frame, text="大盲:").grid(row=7, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_big_blind).grid(row=7, column=1, sticky="w")
    tk.Label(left_frame, text="当桌人数(含Hero):").grid(row=8, column=0, sticky="e")
    tk.Entry(left_frame, textvariable=var_players_at_table).grid(row=8, column=1, sticky="w")

    tk.Label(left_frame, text="当前总底池(自动) 筹码 | BB:").grid(row=9, column=0, sticky="e")
    frame_pot = tk.Frame(left_frame)
    frame_pot.grid(row=9, column=1, sticky="w")
    tk.Entry(frame_pot, width=10, textvariable=var_pot, state="readonly").pack(side="left")
    tk.Entry(frame_pot, width=8, textvariable=var_pot_bb, state="readonly").pack(side="left", padx=5)

    tk.Label(left_frame, text="Hero已投入 筹码 | BB:").grid(row=10, column=0, sticky="e")
    frame_hero_invested = tk.Frame(left_frame)
    frame_hero_invested.grid(row=10, column=1, sticky="w")
    tk.Entry(frame_hero_invested, width=10, textvariable=var_hero_invested).pack(side="left")
    tk.Entry(frame_hero_invested, width=8, textvariable=var_hero_invested_bb).pack(side="left", padx=5)

    tk.Label(left_frame, text="Hero需要跟注(自动) 筹码 | BB:").grid(row=11, column=0, sticky="e")
    frame_hero_call = tk.Frame(left_frame)
    frame_hero_call.grid(row=11, column=1, sticky="w")
    tk.Entry(frame_hero_call, width=10, textvariable=var_hero_call, state="readonly").pack(side="left")
    tk.Entry(frame_hero_call, width=8, textvariable=var_hero_call_bb, state="readonly").pack(side="left", padx=5)

    tk.Label(left_frame, text="Hero当前总筹码 | BB:").grid(row=12, column=0, sticky="e")
    frame_hero = tk.Frame(left_frame)
    frame_hero.grid(row=12, column=1, sticky="w")
    tk.Entry(frame_hero, width=10, textvariable=var_hero_stack).pack(side="left")
    tk.Entry(frame_hero, width=8, textvariable=var_hero_bb).pack(side="left", padx=5)

    tk.Label(left_frame, text="--- 对手信息 (留空代表无此对手) ---", font=font_title).grid(
        row=13, column=0, columnspan=2, pady=(15, 5)
    )

    for i, row_vars in enumerate(villain_rows, start=1):
        row_idx = 13 + i
        tk.Label(left_frame, text=f"对手{i} All-in筹码 | BB | 赏金($):").grid(row=row_idx, column=0, sticky="e")
        frame_v = tk.Frame(left_frame)
        frame_v.grid(row=row_idx, column=1, sticky="w")
        tk.Entry(frame_v, width=8, textvariable=row_vars["stack"]).pack(side="left")
        tk.Entry(frame_v, width=6, textvariable=row_vars["bb"]).pack(side="left", padx=5)
        tk.Entry(frame_v, width=8, textvariable=row_vars["bounty"]).pack(side="left", padx=5)

    tk.Button(
        result_frame,
        text="计算所需胜率",
        command=calculate_equity,
        bg="green",
        fg="white",
        font=("Arial", 12, "bold"),
    ).grid(row=0, column=0, columnspan=2, sticky="we", pady=(12, 10))

    result_row = 1
    for k, v in result_table_vars.items():
        tk.Label(
            result_frame,
            text=k,
            anchor="w",
            width=16,
            relief="solid",
            borderwidth=1,
        ).grid(row=result_row, column=0, sticky="w")
        tk.Label(
            result_frame,
            textvariable=v,
            anchor="w",
            width=26,
            relief="solid",
            borderwidth=1,
        ).grid(row=result_row, column=1, sticky="w")
        result_row += 1

    # 绑定
    bind_stack_bb_pair(var_hero_stack, var_hero_bb)
    bind_stack_bb_pair(var_hero_invested, var_hero_invested_bb)
    for row in villain_rows:
        bind_stack_bb_pair(row["stack"], row["bb"])

    var_big_blind.trace_add("write", lambda *args: refresh_all_pairs())

    auto_vars = [
        var_ante,
        var_big_blind,
        var_players_at_table,
        var_hero_invested,
        var_hero_invested_bb,
    ]
    auto_vars.extend(row["stack"] for row in villain_rows)
    auto_vars.extend(row["bb"] for row in villain_rows)
    for source_var in auto_vars:
        source_var.trace_add("write", lambda *args: calculate_current_pot())
        source_var.trace_add("write", lambda *args: calculate_hero_call())


def build_mystery_tab(parent):
    font_title = ("Arial", 10, "bold")
    mb_sync_lock = False
    hero_invested_user_overridden = False

    var_total_entrants = tk.StringVar()
    var_players_left = tk.StringVar()
    var_start_stack = tk.StringVar()
    var_reg_buyin = tk.StringVar()
    var_big_blind = tk.StringVar()
    var_players_at_table = tk.StringVar()
    var_ante = tk.StringVar()
    var_pot = tk.StringVar()
    var_pot_bb = tk.StringVar()
    var_hero_call = tk.StringVar()
    var_hero_call_bb = tk.StringVar()
    var_hero_invested = tk.StringVar(value="0")
    var_hero_invested_bb = tk.StringVar(value="0")
    var_total_bounty = tk.StringVar()
    var_remaining_bounty = tk.StringVar()
    result_table_vars = {
        "剩余盲盒总数": tk.StringVar(value="-"),
        "当前平均赏金($)": tk.StringVar(value="-"),
        "1个盲盒折合": tk.StringVar(value="-"),
        "覆盖对手人数": tk.StringVar(value="-"),
        "额外死筹": tk.StringVar(value="-"),
        "当前总底池": tk.StringVar(value="-"),
        "Hero需跟注": tk.StringVar(value="-"),
        "不含赏金所需胜率": tk.StringVar(value="-"),
        "含神秘赏金所需胜率": tk.StringVar(value="-"),
    }
    var_villains = [tk.StringVar() for _ in range(4)]
    var_villain_bbs = [tk.StringVar() for _ in range(4)]
    mb_sync_pairs = []
    mb_pair_mode = {}
    bounty_rows = []

    left_frame = tk.Frame(parent)
    left_frame.grid(row=0, column=0, sticky="n", padx=10, pady=10)

    right_frame = tk.Frame(parent)
    right_frame.grid(row=0, column=1, sticky="n", padx=10, pady=10)

    result_frame = tk.Frame(parent)
    result_frame.grid(row=0, column=2, sticky="n", padx=10, pady=10)

    def get_mb_bb_value():
        bb_value = parse_float(var_big_blind.get().strip())
        if bb_value is None or bb_value <= 0:
            return None
        return bb_value

    def mb_sync_from_stack(stack_var, bb_var):
        nonlocal mb_sync_lock
        if mb_sync_lock:
            return
        stack_text = stack_var.get().strip()
        bb_value = get_mb_bb_value()
        if not stack_text:
            mb_sync_lock = True
            bb_var.set("")
            mb_sync_lock = False
            return
        stack_value = parse_float(stack_text)
        if stack_value is None or bb_value is None:
            return
        mb_sync_lock = True
        bb_var.set(f"{stack_value / bb_value:.2f}")
        mb_sync_lock = False
        update_hero_call_auto()
        update_mb_pot_auto()

    def mb_sync_from_bb(stack_var, bb_var):
        nonlocal mb_sync_lock
        if mb_sync_lock:
            return
        bb_text = bb_var.get().strip()
        bb_value = get_mb_bb_value()
        if not bb_text:
            mb_sync_lock = True
            stack_var.set("")
            mb_sync_lock = False
            return
        bb_count = parse_float(bb_text)
        if bb_count is None or bb_value is None:
            return
        mb_sync_lock = True
        stack_var.set(f"{bb_count * bb_value:.2f}")
        mb_sync_lock = False
        update_hero_call_auto()
        update_mb_pot_auto()

    def mb_bind_pair(stack_var, bb_var):
        pair_key = id(stack_var)
        mb_pair_mode[pair_key] = "stack"

        def on_stack_write(*args):
            if mb_sync_lock:
                return
            mb_pair_mode[pair_key] = "stack"
            mb_sync_from_stack(stack_var, bb_var)

        def on_bb_write(*args):
            if mb_sync_lock:
                return
            mb_pair_mode[pair_key] = "bb"
            mb_sync_from_bb(stack_var, bb_var)

        stack_var.trace_add("write", on_stack_write)
        bb_var.trace_add("write", on_bb_write)
        mb_sync_pairs.append((stack_var, bb_var))

    def mb_refresh_pairs():
        for stack_var, bb_var in mb_sync_pairs:
            mode = mb_pair_mode.get(id(stack_var), "stack")
            if mode == "bb" and bb_var.get().strip():
                mb_sync_from_bb(stack_var, bb_var)
            elif mode == "stack" and stack_var.get().strip():
                mb_sync_from_stack(stack_var, bb_var)
            elif bb_var.get().strip():
                mb_sync_from_bb(stack_var, bb_var)
            elif stack_var.get().strip():
                mb_sync_from_stack(stack_var, bb_var)

    def update_hero_call_auto():
        nonlocal mb_sync_lock
        if mb_sync_lock:
            return
        hero_invested = parse_float(var_hero_invested.get().strip())
        if hero_invested is None:
            hero_invested = 0.0
        villain_stacks = []
        for v_var in var_villains:
            v_val = parse_float(v_var.get().strip())
            if v_val is not None and v_val >= 0:
                villain_stacks.append(v_val)

        if hero_invested < 0 or not villain_stacks:
            mb_sync_lock = True
            var_hero_call.set("")
            var_hero_call_bb.set("")
            mb_sync_lock = False
            return

        call_value = max(0.0, max(villain_stacks) - hero_invested)
        bb_value = get_mb_bb_value()
        mb_sync_lock = True
        var_hero_call.set(f"{call_value:.2f}")
        var_hero_call_bb.set(f"{call_value / bb_value:.2f}" if bb_value else "")
        mb_sync_lock = False

    def mark_hero_invested_overridden(*args):
        nonlocal hero_invested_user_overridden
        if mb_sync_lock:
            return
        hero_invested_user_overridden = True

    def prefill_hero_invested_from_ante():
        nonlocal mb_sync_lock, hero_invested_user_overridden
        if mb_sync_lock:
            return
        if hero_invested_user_overridden:
            return
        ante = parse_float(var_ante.get().strip())
        if ante is None or ante < 0:
            return

        bb_value = get_mb_bb_value()
        mb_sync_lock = True
        var_hero_invested.set(f"{ante:.2f}")
        var_hero_invested_bb.set(f"{ante / bb_value:.2f}" if bb_value else "")
        mb_sync_lock = False

    def update_mb_pot_auto():
        nonlocal mb_sync_lock
        if mb_sync_lock:
            return

        players_at_table = parse_float(var_players_at_table.get().strip())
        ante = parse_float(var_ante.get().strip())
        bb_value = get_mb_bb_value()
        hero_invested = parse_float(var_hero_invested.get().strip())
        if hero_invested is None:
            hero_invested = 0.0

        opponents_stack_total = 0.0
        for v_stack_var in var_villains:
            v_stack = parse_float(v_stack_var.get().strip())
            if v_stack is not None and v_stack >= 0:
                opponents_stack_total += v_stack

        if (
            players_at_table is None
            or players_at_table <= 0
            or ante is None
            or ante < 0
            or bb_value is None
            or hero_invested < 0
        ):
            mb_sync_lock = True
            var_pot.set("")
            var_pot_bb.set("")
            mb_sync_lock = False
            return

        pot_chips = (
            players_at_table * ante
            + 1.5 * bb_value
            + opponents_stack_total
            + hero_invested
        )
        pot_bb = pot_chips / bb_value if bb_value else 0.0

        mb_sync_lock = True
        var_pot.set(f"{pot_chips:.2f}")
        var_pot_bb.set(f"{pot_bb:.2f}")
        mb_sync_lock = False

    def update_mb_totals(auto_fill_empty_count=False):
        nonlocal mb_sync_lock
        total_bounty_value = 0.0
        total_bounty_count = 0

        for row in bounty_rows:
            val = parse_float(row["value"].get().strip())
            count = parse_float(row["count"].get().strip())
            if val is None or count is None:
                continue
            if count < 0:
                count = 0
            count_int = int(count)
            total_bounty_value += val * count_int
            total_bounty_count += count_int

        entrants = parse_float(var_total_entrants.get().strip())
        reg_buyin = parse_float(var_reg_buyin.get().strip())
        if entrants is not None and reg_buyin is not None and entrants >= 0 and reg_buyin >= 0:
            var_total_bounty.set(f"{entrants * reg_buyin / 2:.2f}")
        else:
            var_total_bounty.set("")

        if total_bounty_count > 0:
            var_remaining_bounty.set(f"{total_bounty_value:.2f}")
            mb_sync_lock = True
            var_players_left.set(str(total_bounty_count))
            mb_sync_lock = False
        else:
            # 若还未录入明细，则默认显示进圈总赏金
            var_remaining_bounty.set(var_total_bounty.get())
            if auto_fill_empty_count:
                current_left = parse_float(var_players_left.get().strip())
                if current_left is None:
                    mb_sync_lock = True
                    var_players_left.set("")
                    mb_sync_lock = False

    def adjust_count(row_var, delta):
        nonlocal mb_sync_lock
        current = parse_float(row_var.get().strip())
        current_int = int(current) if current is not None else 0
        new_value = max(0, current_int + delta)
        mb_sync_lock = True
        row_var.set(str(new_value))
        mb_sync_lock = False
        update_mb_totals()

    def on_count_change(*args):
        if mb_sync_lock:
            return
        update_mb_totals()

    def apply_preset_108_day2():
        nonlocal mb_sync_lock
        preset_data = [
            (260000, 1),
            (164204, 1),
            (100000, 10),
            (67000, 2),
            (22000, 6),
            (8900, 15),
            (3900, 32),
            (2500, 60),
            (1700, 76),
            (730, 183),
            (310, 422),
            (150, 600),
            (130, 972),
            (60, 2340),
        ]

        mb_sync_lock = True
        var_total_entrants.set("57487")
        var_reg_buyin.set("100")
        var_start_stack.set("25000")
        for i, row in enumerate(bounty_rows):
            if i < len(preset_data):
                amount, count = preset_data[i]
                row["value"].set(str(amount))
                row["count"].set(str(count))
            else:
                row["value"].set("")
                row["count"].set("")
        mb_sync_lock = False
        update_mb_totals()

    def calculate_mb_equity():
        errors = []

        starting_stack = parse_float(var_start_stack.get().strip())
        if starting_stack is None or starting_stack <= 0:
            errors.append("起始筹码必须是大于0的数字。")

        reg_buyin = parse_float(var_reg_buyin.get().strip())
        if reg_buyin is None or reg_buyin <= 0:
            errors.append("常规奖池买入额必须是大于0的数字。")

        players_at_table = parse_float(var_players_at_table.get().strip())
        if players_at_table is None or players_at_table <= 0:
            errors.append("当桌人数必须是大于0的数字。")

        ante = parse_float(var_ante.get().strip())
        if ante is None or ante < 0:
            errors.append("前注必须是大于等于0的数字。")

        bb_value = get_mb_bb_value()
        if bb_value is None:
            errors.append("大盲必须是大于0的数字。")

        current_pot = parse_float(var_pot.get().strip())
        if current_pot is None or current_pot < 0:
            errors.append("当前总底池计算失败，请检查当桌人数/前注/大盲/投入筹码。")

        hero_call = parse_float(var_hero_call.get().strip())
        if hero_call is None or hero_call < 0:
            errors.append("Hero需跟注必须是大于等于0的数字。")

        hero_invested = parse_float(var_hero_invested.get().strip())
        if hero_invested is None:
            hero_invested = 0.0
        if hero_invested < 0:
            errors.append("Hero已投入不能为负数。")

        total_bounty_value = 0.0
        total_bounty_count = 0
        for i, row in enumerate(bounty_rows, start=1):
            val_str = row["value"].get().strip()
            count_str = row["count"].get().strip()
            if not val_str and not count_str:
                continue
            if not val_str:
                errors.append(f"奖金表第{i}行缺少赏金金额。")
                continue
            if not count_str:
                errors.append(f"奖金表第{i}行缺少剩余个数。")
                continue
            val = parse_float(val_str)
            count = parse_float(count_str)
            if val is None or val < 0:
                errors.append(f"奖金表第{i}行赏金金额无效。")
                continue
            if count is None or count < 0 or int(count) != count:
                errors.append(f"奖金表第{i}行剩余个数必须是非负整数。")
                continue
            count_int = int(count)
            total_bounty_value += val * count_int
            total_bounty_count += count_int

        if total_bounty_count <= 0:
            errors.append("请至少输入一行有效的剩余盲盒奖金和个数。")

        if errors:
            messagebox.showerror("输入错误", "\n".join(errors))
            return

        average_bounty = total_bounty_value / total_bounty_count
        single_bounty_chips = average_bounty * (starting_stack / reg_buyin)

        hero_total_commit = hero_invested + hero_call
        covered_count = 0
        for i, v_var in enumerate(var_villains, start=1):
            v_text = v_var.get().strip()
            if not v_text:
                continue
            v_stack = parse_float(v_text)
            if v_stack is None or v_stack < 0:
                messagebox.showerror("输入错误", f"对手{i}筹码无效。")
                return
            if hero_total_commit >= v_stack:
                covered_count += 1

        total_bounty_chips = covered_count * single_bounty_chips
        total_reward = current_pot + hero_call + total_bounty_chips
        if total_reward <= 0 or (current_pot + hero_call) <= 0:
            messagebox.showerror("计算错误", "底池与跟注合计必须大于0，无法计算胜率。")
            return

        required_equity = hero_call / total_reward
        normal_equity = hero_call / (current_pot + hero_call)

        pot_bb_text = f" ({current_pot / bb_value:.2f} BB)" if bb_value else ""
        call_bb_text = f" ({hero_call / bb_value:.2f} BB)" if bb_value else ""
        single_bb_text = f" ({single_bounty_chips / bb_value:.2f} BB)" if bb_value else ""
        total_bb_text = f" ({total_bounty_chips / bb_value:.2f} BB)" if bb_value else ""

        result_table_vars["剩余盲盒总数"].set(f"{total_bounty_count}")
        result_table_vars["当前平均赏金($)"].set(f"{average_bounty:.2f}")
        result_table_vars["1个盲盒折合"].set(f"{int(single_bounty_chips)} 筹码{single_bb_text}")
        result_table_vars["覆盖对手人数"].set(f"{covered_count}")
        result_table_vars["额外死筹"].set(f"{int(total_bounty_chips)} 筹码{total_bb_text}")
        result_table_vars["当前总底池"].set(f"{current_pot:.2f} 筹码{pot_bb_text}")
        result_table_vars["Hero需跟注"].set(f"{hero_call:.2f} 筹码{call_bb_text}")
        result_table_vars["不含赏金所需胜率"].set(f"{normal_equity*100:.2f}%")
        result_table_vars["含神秘赏金所需胜率"].set(f"{required_equity*100:.2f}%")

    # 左侧
    tk.Label(left_frame, text="--- 赛事基础信息 ---", font=font_title).grid(row=0, column=0, columnspan=2, pady=(10, 5))
    tk.Label(left_frame, text="总人数:").grid(row=1, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_total_entrants).grid(row=1, column=1)
    tk.Label(left_frame, text="剩余人数(自动):").grid(row=2, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_players_left, state="readonly").grid(row=2, column=1)
    tk.Label(left_frame, text="起始筹码:").grid(row=3, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_start_stack).grid(row=3, column=1)
    tk.Label(left_frame, text="常规奖池买入额 ($):").grid(row=4, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_reg_buyin).grid(row=4, column=1)
    tk.Label(left_frame, text="进圈总赏金(估算$):").grid(row=5, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_total_bounty, state="readonly").grid(row=5, column=1)
    tk.Label(left_frame, text="大盲:").grid(row=6, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_big_blind).grid(row=6, column=1)
    tk.Label(left_frame, text="当桌人数:").grid(row=7, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_players_at_table).grid(row=7, column=1)
    tk.Label(left_frame, text="前注:").grid(row=8, column=0, sticky="e")
    tk.Entry(left_frame, width=12, textvariable=var_ante).grid(row=8, column=1)

    tk.Label(left_frame, text="--- 当前局势 ---", font=font_title).grid(row=9, column=0, columnspan=2, pady=(15, 5))
    tk.Label(left_frame, text="当前总底池(自动) 筹码 | BB:").grid(row=10, column=0, sticky="e")
    frame_mb_pot = tk.Frame(left_frame)
    frame_mb_pot.grid(row=10, column=1, sticky="w")
    tk.Entry(frame_mb_pot, width=8, textvariable=var_pot, state="readonly").pack(side="left")
    tk.Entry(frame_mb_pot, width=7, textvariable=var_pot_bb, state="readonly").pack(side="left", padx=4)

    tk.Label(left_frame, text="Hero已投入 筹码 | BB:").grid(row=11, column=0, sticky="e")
    frame_mb_call = tk.Frame(left_frame)
    frame_mb_call.grid(row=11, column=1, sticky="w")
    tk.Entry(frame_mb_call, width=8, textvariable=var_hero_invested).pack(side="left")
    tk.Entry(frame_mb_call, width=7, textvariable=var_hero_invested_bb).pack(side="left", padx=4)

    tk.Label(left_frame, text="Hero需跟注(自动) 筹码 | BB:").grid(row=12, column=0, sticky="e")
    frame_mb_hero = tk.Frame(left_frame)
    frame_mb_hero.grid(row=12, column=1, sticky="w")
    tk.Entry(frame_mb_hero, width=8, textvariable=var_hero_call, state="readonly").pack(side="left")
    tk.Entry(frame_mb_hero, width=7, textvariable=var_hero_call_bb, state="readonly").pack(side="left", padx=4)

    tk.Label(left_frame, text="--- 对手筹码 (最多4人) ---", font=font_title).grid(row=13, column=0, columnspan=2, pady=(15, 5))
    for i, (v_var, v_bb_var) in enumerate(zip(var_villains, var_villain_bbs), start=1):
        row_idx = 13 + i
        tk.Label(left_frame, text=f"对手{i} 筹码 | BB:").grid(row=row_idx, column=0, sticky="e")
        frame_mb_v = tk.Frame(left_frame)
        frame_mb_v.grid(row=row_idx, column=1, sticky="w")
        tk.Entry(frame_mb_v, width=8, textvariable=v_var).pack(side="left")
        tk.Entry(frame_mb_v, width=7, textvariable=v_bb_var).pack(side="left", padx=4)

    tk.Button(
        left_frame,
        text="108神秘day2",
        command=apply_preset_108_day2,
        bg="#4a6fa5",
        fg="white",
        font=("Arial", 10, "bold"),
    ).grid(row=18, column=0, columnspan=2, pady=(10, 0))

    # 右侧
    tk.Label(right_frame, text="--- 剩余盲盒奖金表 ---", font=font_title).grid(row=0, column=0, columnspan=5, pady=(10, 5))
    tk.Label(right_frame, text="行号").grid(row=1, column=0)
    tk.Label(right_frame, text="赏金金额 ($)").grid(row=1, column=1)
    tk.Label(right_frame, text="剩余个数").grid(row=1, column=2)
    tk.Label(right_frame, text="-").grid(row=1, column=3)
    tk.Label(right_frame, text="+").grid(row=1, column=4)

    for i in range(15):
        tk.Label(right_frame, text=f"{i + 1}").grid(row=i + 2, column=0)
        val_var = tk.StringVar()
        count_var = tk.StringVar()
        ent_val = tk.Entry(right_frame, width=10, textvariable=val_var)
        ent_val.grid(row=i + 2, column=1, padx=2, pady=2)
        ent_count = tk.Entry(right_frame, width=8, textvariable=count_var)
        ent_count.grid(row=i + 2, column=2, padx=2, pady=2)
        tk.Button(
            right_frame,
            text="-",
            width=2,
            command=lambda cv=count_var: adjust_count(cv, -1),
        ).grid(row=i + 2, column=3, padx=1, pady=2)
        tk.Button(
            right_frame,
            text="+",
            width=2,
            command=lambda cv=count_var: adjust_count(cv, 1),
        ).grid(row=i + 2, column=4, padx=1, pady=2)
        count_var.trace_add("write", on_count_change)
        val_var.trace_add("write", lambda *args: update_mb_totals())
        bounty_rows.append({"value": val_var, "count": count_var})

    tk.Label(right_frame, text="当前剩余赏金 ($):", font=font_title).grid(
        row=18, column=0, columnspan=2, sticky="e", pady=(10, 0)
    )
    tk.Entry(right_frame, width=14, textvariable=var_remaining_bounty, state="readonly").grid(
        row=18, column=2, columnspan=3, sticky="w", pady=(10, 0)
    )

    # 右侧结果表格（紧邻奖金表）
    tk.Label(result_frame, text="--- 计算结果 ---", font=font_title).grid(
        row=0, column=0, columnspan=2, sticky="w", pady=(10, 8)
    )
    tk.Button(
        result_frame,
        text="计算所需胜率",
        command=calculate_mb_equity,
        bg="darkorange",
        fg="white",
        font=("Arial", 12, "bold"),
    ).grid(row=1, column=0, columnspan=2, sticky="we", pady=(0, 10))

    result_row = 2
    for k, v in result_table_vars.items():
        tk.Label(
            result_frame,
            text=k,
            anchor="w",
            width=16,
            relief="solid",
            borderwidth=1,
        ).grid(row=result_row, column=0, sticky="w")
        tk.Label(
            result_frame,
            textvariable=v,
            anchor="w",
            width=24,
            relief="solid",
            borderwidth=1,
        ).grid(row=result_row, column=1, sticky="w")
        result_row += 1

    # 绑定神秘赏金页的筹码 <-> BB 双向换算
    mb_bind_pair(var_hero_invested, var_hero_invested_bb)
    for v_var, v_bb_var in zip(var_villains, var_villain_bbs):
        mb_bind_pair(v_var, v_bb_var)

    var_big_blind.trace_add("write", lambda *args: mb_refresh_pairs())
    var_big_blind.trace_add("write", lambda *args: update_hero_call_auto())
    var_big_blind.trace_add("write", lambda *args: update_mb_pot_auto())
    var_players_at_table.trace_add("write", lambda *args: update_mb_pot_auto())
    var_ante.trace_add("write", lambda *args: prefill_hero_invested_from_ante())
    var_ante.trace_add("write", lambda *args: update_mb_pot_auto())
    var_hero_invested.trace_add("write", mark_hero_invested_overridden)
    var_hero_invested_bb.trace_add("write", mark_hero_invested_overridden)
    var_hero_invested.trace_add("write", lambda *args: update_hero_call_auto())
    var_hero_invested.trace_add("write", lambda *args: update_mb_pot_auto())
    var_hero_invested_bb.trace_add("write", lambda *args: update_hero_call_auto())
    var_hero_invested_bb.trace_add("write", lambda *args: update_mb_pot_auto())
    for v_var, v_bb_var in zip(var_villains, var_villain_bbs):
        v_var.trace_add("write", lambda *args: update_hero_call_auto())
        v_var.trace_add("write", lambda *args: update_mb_pot_auto())
        v_bb_var.trace_add("write", lambda *args: update_mb_pot_auto())
    var_total_entrants.trace_add("write", lambda *args: update_mb_totals())
    var_reg_buyin.trace_add("write", lambda *args: update_mb_totals())
    prefill_hero_invested_from_ante()
    update_hero_call_auto()
    update_mb_pot_auto()
    update_mb_totals()


def main():
    root = tk.Tk()
    root.title("赏金跟注计算器")
    root.geometry("900x720")

    notebook = ttk.Notebook(root)
    notebook.pack(fill="both", expand=True)

    pko_tab = tk.Frame(notebook)
    mb_tab = tk.Frame(notebook)
    notebook.add(pko_tab, text="PKO")
    notebook.add(mb_tab, text="神秘赏金")

    build_pko_tab(pko_tab)
    build_mystery_tab(mb_tab)

    tk.Label(
        root,
        text="Copyright © 2026 ZENGTO. Developed by hongshao. All Rights Reserved.",
        font=("Arial", 8),
        fg="#B8B8B8",
    ).pack(side="bottom", pady=(0, 4))

    root.mainloop()


if __name__ == "__main__":
    main()