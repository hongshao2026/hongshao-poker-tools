use crate::card::{Card, CardSet};
use crate::eval::{evaluate_7cards, HandCategory, HandValue};
use crate::range::{Combo, Range};

/// Made hand strength categories for flop/turn/river analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum HandStrength {
    // ── Made hands (strongest first) ──
    StraightFlush,
    FourOfAKind,
    FullHouse,
    Flush,
    Straight,
    ThreeOfAKind,
    TwoPair,
    Overpair,     // pocket pair above all board cards
    TopPair,      // paired with the highest board card
    SecondPair,   // paired with the second highest board card
    MiddlePair,   // pocket pair between board cards
    ThirdPair,    // paired with the third board card (or lower)
    LowPair,      // pocket pair below all board cards, or bottom board pair
    // ── Draws ──
    FlushDraw,    // 4 to a flush
    OpenEndedStraightDraw, // 8-out straight draw
    Gutshot,      // 4-out straight draw
    // ── Nothing ──
    Overcards,    // both hole cards above all board cards, no pair
    HighCard,     // anything else
}

impl HandStrength {
    pub fn label(self) -> &'static str {
        match self {
            Self::StraightFlush => "Straight Flush",
            Self::FourOfAKind => "Four of a Kind",
            Self::FullHouse => "Full House",
            Self::Flush => "Flush",
            Self::Straight => "Straight",
            Self::ThreeOfAKind => "Three of a Kind",
            Self::TwoPair => "Two Pair",
            Self::Overpair => "Overpair",
            Self::TopPair => "Top Pair",
            Self::SecondPair => "Second Pair",
            Self::MiddlePair => "Middle Pair",
            Self::ThirdPair => "Third Pair / Bottom Pair",
            Self::LowPair => "Low Pair / Underpair",
            Self::FlushDraw => "Flush Draw",
            Self::OpenEndedStraightDraw => "Open-Ended Straight Draw",
            Self::Gutshot => "Gutshot",
            Self::Overcards => "Overcards",
            Self::HighCard => "High Card / Air",
        }
    }

    pub fn label_cn(self) -> &'static str {
        match self {
            Self::StraightFlush => "同花顺",
            Self::FourOfAKind => "四条",
            Self::FullHouse => "葫芦",
            Self::Flush => "同花",
            Self::Straight => "顺子",
            Self::ThreeOfAKind => "三条",
            Self::TwoPair => "两对",
            Self::Overpair => "超对",
            Self::TopPair => "顶对",
            Self::SecondPair => "第二对",
            Self::MiddlePair => "中间对子",
            Self::ThirdPair => "第三对 / 底对",
            Self::LowPair => "低对 / 口袋小对",
            Self::FlushDraw => "同花听牌",
            Self::OpenEndedStraightDraw => "两头顺子听牌",
            Self::Gutshot => "卡顺听牌",
            Self::Overcards => "两高张",
            Self::HighCard => "高牌 / 空气",
        }
    }

    /// Sort order (lower = stronger)
    pub fn order(self) -> u8 {
        match self {
            Self::StraightFlush => 0,
            Self::FourOfAKind => 1,
            Self::FullHouse => 2,
            Self::Flush => 3,
            Self::Straight => 4,
            Self::ThreeOfAKind => 5,
            Self::TwoPair => 6,
            Self::Overpair => 7,
            Self::TopPair => 8,
            Self::SecondPair => 9,
            Self::MiddlePair => 10,
            Self::ThirdPair => 11,
            Self::LowPair => 12,
            Self::FlushDraw => 13,
            Self::OpenEndedStraightDraw => 14,
            Self::Gutshot => 15,
            Self::Overcards => 16,
            Self::HighCard => 17,
        }
    }
}

/// Result of analyzing one combo against a board.
#[derive(Debug, Clone)]
pub struct ComboAnalysis {
    pub combo: Combo,
    pub hand_value: HandValue,
    pub made_hand: HandStrength,
    pub draws: Vec<HandStrength>, // can have made hand + draws simultaneously
}

/// Aggregated analysis of a range on a board.
#[derive(Debug, Clone)]
pub struct RangeAnalysis {
    pub board: Vec<Card>,
    pub total_combos: usize,
    pub categories: Vec<CategoryCount>,
    pub combos: Vec<ComboAnalysis>,
}

#[derive(Debug, Clone)]
pub struct CategoryCount {
    pub category: HandStrength,
    pub count: usize,
    pub percentage: f64,
    pub example: Option<Combo>,
}

/// Analyze how a range hits a given board.
pub fn analyze_range(range: &Range, board: &[Card]) -> RangeAnalysis {
    assert!(board.len() >= 3 && board.len() <= 5, "Board must have 3-5 cards");

    let mut board_set = CardSet::EMPTY;
    for &c in board {
        board_set.add(c);
    }

    // Board rank info
    let mut board_ranks: Vec<u8> = board.iter().map(|c| c.rank() as u8).collect();
    board_ranks.sort_unstable_by(|a, b| b.cmp(a));
    board_ranks.dedup();

    let board_suits: Vec<u8> = board.iter().map(|c| c.suit() as u8).collect();

    // Suit counts on board
    let mut board_suit_count = [0u8; 4];
    for &s in &board_suits {
        board_suit_count[s as usize] += 1;
    }

    // Filter valid combos
    let valid_combos = range.filter_dead(board_set);
    let mut analyses: Vec<ComboAnalysis> = Vec::with_capacity(valid_combos.len());

    for &(combo, _weight) in &valid_combos {
        let analysis = analyze_combo(combo, board, &board_ranks, &board_suit_count);
        analyses.push(analysis);
    }

    // Aggregate by category
    let total = analyses.len();
    let mut cat_counts: Vec<(HandStrength, usize, Option<Combo>)> = Vec::new();

    // Count made hands
    for a in &analyses {
        if let Some(entry) = cat_counts.iter_mut().find(|e| e.0 == a.made_hand) {
            entry.1 += 1;
        } else {
            cat_counts.push((a.made_hand, 1, Some(a.combo)));
        }
    }

    // Count draws (a combo can be both a made hand and a draw)
    for a in &analyses {
        for &draw in &a.draws {
            if let Some(entry) = cat_counts.iter_mut().find(|e| e.0 == draw) {
                entry.1 += 1;
            } else {
                cat_counts.push((draw, 1, Some(a.combo)));
            }
        }
    }

    // Sort by strength order
    cat_counts.sort_by_key(|e| e.0.order());

    let categories: Vec<CategoryCount> = cat_counts
        .into_iter()
        .map(|(cat, count, example)| CategoryCount {
            category: cat,
            count,
            percentage: if total > 0 {
                count as f64 / total as f64 * 100.0
            } else {
                0.0
            },
            example,
        })
        .collect();

    RangeAnalysis {
        board: board.to_vec(),
        total_combos: total,
        categories,
        combos: analyses,
    }
}

fn analyze_combo(
    combo: Combo,
    board: &[Card],
    board_ranks_desc: &[u8],
    board_suit_count: &[u8; 4],
) -> ComboAnalysis {
    let r0 = combo.0.rank() as u8;
    let r1 = combo.1.rank() as u8;
    let _high_rank = r0.max(r1);
    let _low_rank = r0.min(r1);
    let is_pocket_pair = r0 == r1;

    // Evaluate 5-7 card hand
    let mut all_cards = Vec::with_capacity(7);
    all_cards.push(combo.0);
    all_cards.push(combo.1);
    all_cards.extend_from_slice(board);

    let hand_value = if all_cards.len() == 7 {
        evaluate_7cards([
            all_cards[0], all_cards[1], all_cards[2], all_cards[3],
            all_cards[4], all_cards[5], all_cards[6],
        ])
    } else {
        // < 7 cards, pad for evaluation (turn/flop with fewer cards)
        // For classification we still evaluate what we have
        eval_partial(&all_cards)
    };

    let category = hand_value.category();

    // Determine made hand classification
    let made_hand = classify_made_hand(
        category,
        r0, r1, is_pocket_pair,
        board, board_ranks_desc,
    );

    // Detect draws
    let draws = detect_draws(
        combo, board, board_suit_count, &made_hand,
    );

    ComboAnalysis {
        combo,
        hand_value,
        made_hand,
        draws,
    }
}

fn classify_made_hand(
    category: HandCategory,
    r0: u8,
    r1: u8,
    is_pocket_pair: bool,
    board: &[Card],
    board_ranks_desc: &[u8],
) -> HandStrength {
    match category {
        HandCategory::StraightFlush => HandStrength::StraightFlush,
        HandCategory::FourOfAKind => HandStrength::FourOfAKind,
        HandCategory::FullHouse => HandStrength::FullHouse,
        HandCategory::Flush => HandStrength::Flush,
        HandCategory::Straight => HandStrength::Straight,
        HandCategory::ThreeOfAKind => HandStrength::ThreeOfAKind,
        HandCategory::TwoPair => HandStrength::TwoPair,
        HandCategory::OnePair => classify_pair(r0, r1, is_pocket_pair, board, board_ranks_desc),
        HandCategory::HighCard => {
            let high = r0.max(r1);
            let low = r0.min(r1);
            if !board_ranks_desc.is_empty() && high > board_ranks_desc[0] && low > board_ranks_desc[0] {
                HandStrength::Overcards
            } else {
                HandStrength::HighCard
            }
        }
    }
}

fn classify_pair(
    r0: u8, r1: u8,
    is_pocket_pair: bool,
    board: &[Card],
    board_ranks_desc: &[u8], // unique board ranks, sorted descending
) -> HandStrength {
    if board_ranks_desc.is_empty() {
        return HandStrength::LowPair;
    }

    // Count board rank occurrences for detecting board pairs
    let mut board_rank_counts = [0u8; 13];
    for c in board {
        board_rank_counts[c.rank() as u8 as usize] += 1;
    }

    if is_pocket_pair {
        let pp_rank = r0;
        // Board pair exists that makes our "one pair" hand?
        // No — if category is OnePair, it means we only have one pair total
        // So our pocket pair is the pair
        if pp_rank > board_ranks_desc[0] {
            return HandStrength::Overpair;
        }
        // Check if pocket pair is between board cards
        let lowest_board = *board_ranks_desc.last().unwrap();
        if pp_rank < lowest_board {
            return HandStrength::LowPair;
        }
        return HandStrength::MiddlePair;
    }

    // Not a pocket pair — one of our cards paired with a board card
    let paired_rank = if board_rank_counts[r0 as usize] > 0 { r0 }
        else if board_rank_counts[r1 as usize] > 0 { r1 }
        else {
            // Board has a pair itself
            return HandStrength::LowPair;
        };

    if paired_rank == board_ranks_desc[0] {
        HandStrength::TopPair
    } else if board_ranks_desc.len() >= 2 && paired_rank == board_ranks_desc[1] {
        HandStrength::SecondPair
    } else {
        HandStrength::ThirdPair
    }
}

fn detect_draws(
    combo: Combo,
    board: &[Card],
    _board_suit_count: &[u8; 4],
    made_hand: &HandStrength,
) -> Vec<HandStrength> {
    let mut draws = Vec::new();

    // Don't report draws for hands that are already very strong
    match made_hand {
        HandStrength::StraightFlush | HandStrength::FourOfAKind
        | HandStrength::FullHouse | HandStrength::Flush | HandStrength::Straight => {
            return draws;
        }
        _ => {}
    }

    let s0 = combo.0.suit() as u8;
    let s1 = combo.1.suit() as u8;

    // ── Flush draw: 4 to a flush ──
    let mut suit_total = [0u8; 4];
    for s in [s0, s1] {
        suit_total[s as usize] += 1;
    }
    for c in board {
        suit_total[c.suit() as u8 as usize] += 1;
    }
    for s in 0..4 {
        if suit_total[s] == 4 {
            // Need at least 1 hole card of this suit to count as a draw
            if s0 as usize == s || s1 as usize == s {
                draws.push(HandStrength::FlushDraw);
                break;
            }
        }
    }

    // ── Straight draws ──
    // Build rank presence mask for all cards
    let mut rank_mask: u16 = 0;
    rank_mask |= 1 << (combo.0.rank() as u8);
    rank_mask |= 1 << (combo.1.rank() as u8);
    for c in board {
        rank_mask |= 1 << (c.rank() as u8);
    }

    // Count straight outs (number of ranks that complete a straight)
    let straight_out_ranks = count_straight_outs(rank_mask, combo);
    if straight_out_ranks >= 2 {
        draws.push(HandStrength::OpenEndedStraightDraw);
    } else if straight_out_ranks >= 1 {
        draws.push(HandStrength::Gutshot);
    }

    draws
}

/// Count how many cards would complete a straight, considering that
/// at least one hole card must be used.
fn count_straight_outs(rank_mask: u16, combo: Combo) -> u8 {
    let r0 = combo.0.rank() as u8;
    let r1 = combo.1.rank() as u8;
    let mut outs = 0u8;

    // For each possible missing rank (0..12), check if adding it completes a straight
    for add_rank in 0..13u8 {
        if rank_mask & (1 << add_rank) != 0 {
            continue; // already have this rank
        }
        let new_mask = rank_mask | (1 << add_rank);
        // Check if new_mask contains a 5-card straight that uses at least one hole card
        if has_straight_using_hole(new_mask, r0, r1) {
            outs += 1;
        }
    }
    outs
}

fn has_straight_using_hole(mask: u16, r0: u8, r1: u8) -> bool {
    // Check all possible straights
    for high in (4u8..=12).rev() {
        let low = high - 4;
        let pattern = 0x1Fu16 << low;
        if mask & pattern == pattern {
            // This straight spans ranks low..=high
            if (r0 >= low && r0 <= high) || (r1 >= low && r1 <= high) {
                return true;
            }
        }
    }
    // Wheel: A(12), 2(0), 3(1), 4(2), 5(3)
    if mask & 0x100F == 0x100F {
        let wheel_ranks = [0u8, 1, 2, 3, 12];
        if wheel_ranks.contains(&r0) || wheel_ranks.contains(&r1) {
            return true;
        }
    }
    false
}

/// Evaluate a partial hand (5 or 6 cards) — pad to 7 for the evaluator.
fn eval_partial(cards: &[Card]) -> HandValue {
    if cards.len() == 7 {
        return evaluate_7cards([
            cards[0], cards[1], cards[2], cards[3],
            cards[4], cards[5], cards[6],
        ]);
    }
    // For 5-6 cards, we need to consider the best hand
    // Use the 5-card evaluator on all C(n,5) combinations
    let n = cards.len();
    let mut best = HandValue(0);
    let indices: Vec<usize> = (0..n).collect();
    for_each_combination(&indices, 5, |combo_indices| {
        let hand = [
            cards[combo_indices[0]],
            cards[combo_indices[1]],
            cards[combo_indices[2]],
            cards[combo_indices[3]],
            cards[combo_indices[4]],
        ];
        let val = crate::eval::evaluate_5cards(hand);
        if val > best {
            best = val;
        }
    });
    best
}

fn for_each_combination(items: &[usize], k: usize, mut f: impl FnMut(&[usize])) {
    let n = items.len();
    let mut indices: Vec<usize> = (0..k).collect();
    loop {
        let combo: Vec<usize> = indices.iter().map(|&i| items[i]).collect();
        f(&combo);
        // Next combination
        let mut i = k;
        while i > 0 {
            i -= 1;
            if indices[i] != i + n - k {
                indices[i] += 1;
                for j in (i + 1)..k {
                    indices[j] = indices[j - 1] + 1;
                }
                break;
            }
            if i == 0 {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::card::Card;
    use crate::range::Range;

    fn parse_board(s: &str) -> Vec<Card> {
        let mut cards = Vec::new();
        let mut i = 0;
        let bytes = s.as_bytes();
        while i + 1 < bytes.len() {
            if bytes[i] == b' ' {
                i += 1;
                continue;
            }
            let card = Card::from_str(&s[i..i + 2]).unwrap();
            cards.push(card);
            i += 2;
        }
        cards
    }

    #[test]
    fn test_top_pair() {
        let range = Range::parse("AKo").unwrap();
        let board = parse_board("Ah 7d 2c");
        let result = analyze_range(&range, &board);

        // AK on A-high board: should be top pair
        let top_pair_count = result.categories.iter()
            .find(|c| c.category == HandStrength::TopPair)
            .map(|c| c.count)
            .unwrap_or(0);
        assert!(top_pair_count > 0, "AKo should have top pair on A72 board");
    }

    #[test]
    fn test_overpair() {
        let range = Range::parse("QQ").unwrap();
        let board = parse_board("Th 7d 2c");
        let result = analyze_range(&range, &board);

        let overpair = result.categories.iter()
            .find(|c| c.category == HandStrength::Overpair)
            .map(|c| c.count)
            .unwrap_or(0);
        assert_eq!(overpair, 6, "QQ should be overpair on T72");
    }

    #[test]
    fn test_flush_draw() {
        let range = Range::parse("AhKh").unwrap();
        let board = parse_board("9h 5h 2c");
        let result = analyze_range(&range, &board);

        let fd = result.categories.iter()
            .find(|c| c.category == HandStrength::FlushDraw)
            .map(|c| c.count)
            .unwrap_or(0);
        assert!(fd > 0, "AhKh should have flush draw on 9h5h2c");
    }

    #[test]
    fn test_made_flush() {
        let range = Range::parse("AhKh").unwrap();
        let board = parse_board("9h 5h 2h");
        let result = analyze_range(&range, &board);

        let flush = result.categories.iter()
            .find(|c| c.category == HandStrength::Flush)
            .map(|c| c.count)
            .unwrap_or(0);
        assert!(flush > 0, "AhKh should have flush on 9h5h2h");
    }

    #[test]
    fn test_straight_draw() {
        let range = Range::parse("JTs").unwrap();
        let board = parse_board("9h 8c 2d");
        let result = analyze_range(&range, &board);

        let oesd = result.categories.iter()
            .find(|c| c.category == HandStrength::OpenEndedStraightDraw)
            .map(|c| c.count)
            .unwrap_or(0);
        assert!(oesd > 0, "JTs should have OESD on 982: J-T-9-8 needs Q or 7");
    }

    #[test]
    fn test_wide_range_distribution() {
        let range = Range::parse("66+,A5s+,KTs+,QJs,T9s,98s,ATo+,KJo+,QJo").unwrap();
        let board = parse_board("Ah Kd 7c");
        let result = analyze_range(&range, &board);

        println!("15% range on AhKd7c ({} combos):", result.total_combos);
        for cat in &result.categories {
            println!("  {:25} {:3} combos ({:.1}%)",
                cat.category.label_cn(), cat.count, cat.percentage);
        }

        assert!(result.total_combos > 0);
        // Should have some top pairs (Ax hands)
        let top_pair = result.categories.iter()
            .find(|c| c.category == HandStrength::TopPair)
            .map(|c| c.count)
            .unwrap_or(0);
        assert!(top_pair > 0, "15% range should have top pair combos on A-high board");
    }

    #[test]
    fn test_overcards() {
        let range = Range::parse("AKo").unwrap();
        let board = parse_board("9h 5d 2c");
        let result = analyze_range(&range, &board);

        let overcards = result.categories.iter()
            .find(|c| c.category == HandStrength::Overcards)
            .map(|c| c.count)
            .unwrap_or(0);
        assert!(overcards > 0, "AKo should be overcards on 952");
    }

    #[test]
    fn test_trips() {
        let range = Range::parse("77").unwrap();
        let board = parse_board("7h 9d 2c");
        let result = analyze_range(&range, &board);

        let trips = result.categories.iter()
            .find(|c| c.category == HandStrength::ThreeOfAKind)
            .map(|c| c.count)
            .unwrap_or(0);
        // 77 on 7xx: 3 combos that don't conflict with 7h (7d7s, 7d7c, 7s7c)
        assert!(trips > 0, "77 should be trips on 7-high board");
    }
}
