use crate::card::{Card, CardSet};
use crate::eval::{evaluate_7cards, HandValue};
use crate::range::{Combo, Range};
use rand::Rng;

/// Result of an equity calculation for one player.
#[derive(Debug, Clone)]
pub struct EquityResult {
    pub equity: f64,     // 0.0..1.0
    pub win_pct: f64,    // pure win percentage
    pub tie_pct: f64,    // tie percentage
    pub samples: u64,    // number of matchups evaluated
}

/// Result for a range-vs-range calculation.
#[derive(Debug, Clone)]
pub struct EquityCalcResult {
    pub players: Vec<EquityResult>,
    pub total_samples: u64,
}

/// Board cards (0 to 5 community cards already dealt).
#[derive(Debug, Clone)]
pub struct Board {
    pub cards: Vec<Card>,
}

impl Board {
    pub fn new() -> Board {
        Board { cards: Vec::new() }
    }

    pub fn parse(s: &str) -> Result<Board, String> {
        let s = s.trim();
        if s.is_empty() {
            return Ok(Board::new());
        }
        let mut cards = Vec::new();
        let mut i = 0;
        let bytes = s.as_bytes();
        while i < bytes.len() {
            // Skip whitespace
            if bytes[i] == b' ' {
                i += 1;
                continue;
            }
            if i + 1 >= bytes.len() {
                return Err(format!("Incomplete card at position {}", i));
            }
            let card_str = &s[i..i + 2];
            let card =
                Card::from_str(card_str).ok_or(format!("Invalid card: {}", card_str))?;
            cards.push(card);
            i += 2;
        }
        if cards.len() > 5 {
            return Err(format!("Board has {} cards, max 5", cards.len()));
        }
        Ok(Board { cards })
    }

    pub fn to_cardset(&self) -> CardSet {
        let mut cs = CardSet::EMPTY;
        for &c in &self.cards {
            cs.add(c);
        }
        cs
    }
}

impl Default for Board {
    fn default() -> Self {
        Self::new()
    }
}

/// Calculate equity between two ranges using Monte Carlo simulation.
pub fn equity_monte_carlo(
    ranges: &[&Range],
    board: &Board,
    num_simulations: u64,
) -> EquityCalcResult {
    assert!(ranges.len() >= 2, "Need at least 2 ranges");

    let board_set = board.to_cardset();
    let board_cards = &board.cards;
    let cards_needed = 5 - board_cards.len();

    let num_players = ranges.len();
    let mut wins = vec![0u64; num_players];
    let mut ties = vec![0u64; num_players];
    let mut total: u64 = 0;

    let mut rng = rand::rng();

    // Pre-filter combos that don't conflict with board
    let filtered: Vec<Vec<(Combo, f64)>> = ranges
        .iter()
        .map(|r| r.filter_dead(board_set))
        .collect();

    for f in &filtered {
        if f.is_empty() {
            return empty_result(num_players);
        }
    }

    for _ in 0..num_simulations {
        // Pick random combos for each player
        let mut dead = board_set;
        let mut player_combos = Vec::with_capacity(num_players);
        let mut conflict = false;

        for combos in &filtered {
            // Weighted random selection
            let idx = rng.random_range(0..combos.len());
            let (combo, _weight) = combos[idx];

            if combo.overlaps(dead) {
                conflict = true;
                break;
            }

            dead = dead.union(combo.cards());
            player_combos.push(combo);
        }

        if conflict {
            continue;
        }

        // Deal remaining board cards
        let mut run_board = board_cards.clone();
        for _ in 0..cards_needed {
            loop {
                let idx = rng.random_range(0..52u8);
                let card = Card::from_index(idx);
                if !dead.contains(card) {
                    dead.add(card);
                    run_board.push(card);
                    break;
                }
            }
        }

        // Evaluate each player's hand
        let mut hand_values = Vec::with_capacity(num_players);
        for combo in &player_combos {
            let seven = [
                combo.0,
                combo.1,
                run_board[0],
                run_board[1],
                run_board[2],
                run_board[3],
                run_board[4],
            ];
            hand_values.push(evaluate_7cards(seven));
        }

        // Find winner(s)
        let best = *hand_values.iter().max().unwrap();
        let winner_count = hand_values.iter().filter(|&&v| v == best).count();

        if winner_count == 1 {
            for (i, &v) in hand_values.iter().enumerate() {
                if v == best {
                    wins[i] += 1;
                }
            }
        } else {
            for (i, &v) in hand_values.iter().enumerate() {
                if v == best {
                    ties[i] += 1;
                }
            }
        }
        total += 1;
    }

    build_result(&wins, &ties, total)
}

/// Calculate exact equity between two specific hands on a given board.
/// This enumerates all possible remaining board cards.
pub fn equity_exact_hands(
    hand1: Combo,
    hand2: Combo,
    board: &Board,
) -> EquityCalcResult {
    let board_cards = &board.cards;
    let cards_needed = 5 - board_cards.len();

    let mut dead = board.to_cardset();
    dead = dead.union(hand1.cards());
    dead = dead.union(hand2.cards());

    let mut wins = [0u64; 2];
    let mut ties = [0u64; 2];
    let mut total: u64 = 0;

    // Get available cards
    let available: Vec<Card> = (0..52u8)
        .map(Card::from_index)
        .filter(|c| !dead.contains(*c))
        .collect();

    match cards_needed {
        0 => {
            // All board cards known - evaluate directly
            let seven1 = make_seven(hand1, board_cards);
            let seven2 = make_seven(hand2, board_cards);
            let v1 = evaluate_7cards(seven1);
            let v2 = evaluate_7cards(seven2);
            score_matchup(v1, v2, &mut wins, &mut ties);
            total = 1;
        }
        1 => {
            for &c in &available {
                let mut b = board_cards.clone();
                b.push(c);
                let v1 = evaluate_7cards(make_seven(hand1, &b));
                let v2 = evaluate_7cards(make_seven(hand2, &b));
                score_matchup(v1, v2, &mut wins, &mut ties);
                total += 1;
            }
        }
        2 => {
            for i in 0..available.len() {
                for j in (i + 1)..available.len() {
                    let mut b = board_cards.clone();
                    b.push(available[i]);
                    b.push(available[j]);
                    let v1 = evaluate_7cards(make_seven(hand1, &b));
                    let v2 = evaluate_7cards(make_seven(hand2, &b));
                    score_matchup(v1, v2, &mut wins, &mut ties);
                    total += 1;
                }
            }
        }
        _ => {
            // 3, 4, or 5 cards needed - use enumeration for 3, MC would be
            // better for 4-5 but let's implement 3-card enum and fallback to MC
            enumerate_remaining(&available, cards_needed, board_cards, hand1, hand2, &mut wins, &mut ties, &mut total);
        }
    }

    build_result(&wins.to_vec(), &ties.to_vec(), total)
}

fn enumerate_remaining(
    available: &[Card],
    depth: usize,
    board: &[Card],
    hand1: Combo,
    hand2: Combo,
    wins: &mut [u64; 2],
    ties: &mut [u64; 2],
    total: &mut u64,
) {
    let n = available.len();
    let indices: Vec<usize> = (0..depth).collect();
    enumerate_combinations(n, depth, &indices, available, board, hand1, hand2, wins, ties, total);
}

fn enumerate_combinations(
    n: usize,
    k: usize,
    _template: &[usize],
    available: &[Card],
    board: &[Card],
    hand1: Combo,
    hand2: Combo,
    wins: &mut [u64; 2],
    ties: &mut [u64; 2],
    total: &mut u64,
) {
    let mut indices: Vec<usize> = (0..k).collect();
    loop {
        let mut b = board.to_vec();
        for &idx in &indices {
            b.push(available[idx]);
        }
        let v1 = evaluate_7cards(make_seven(hand1, &b));
        let v2 = evaluate_7cards(make_seven(hand2, &b));
        score_matchup(v1, v2, wins, ties);
        *total += 1;

        // Next combination
        if !next_combination(&mut indices, n) {
            break;
        }
    }
}

fn next_combination(indices: &mut Vec<usize>, n: usize) -> bool {
    let k = indices.len();
    let mut i = k;
    while i > 0 {
        i -= 1;
        if indices[i] != i + n - k {
            indices[i] += 1;
            for j in (i + 1)..k {
                indices[j] = indices[j - 1] + 1;
            }
            return true;
        }
    }
    false
}

fn make_seven(combo: Combo, board: &[Card]) -> [Card; 7] {
    [
        combo.0, combo.1, board[0], board[1], board[2], board[3], board[4],
    ]
}

fn score_matchup(v1: HandValue, v2: HandValue, wins: &mut [u64; 2], ties: &mut [u64; 2]) {
    if v1 > v2 {
        wins[0] += 1;
    } else if v2 > v1 {
        wins[1] += 1;
    } else {
        ties[0] += 1;
        ties[1] += 1;
    }
}

fn build_result(wins: &[u64], ties: &[u64], total: u64) -> EquityCalcResult {
    if total == 0 {
        return empty_result(wins.len());
    }

    let t = total as f64;
    // equity = win% + tie%/2 (for 2-player case)
    let players: Vec<EquityResult> = wins
        .iter()
        .zip(ties.iter())
        .map(|(&w, &ti)| {
            let win_pct = w as f64 / t;
            let tie_pct = ti as f64 / t;
            let equity = win_pct + tie_pct / 2.0;
            EquityResult {
                equity,
                win_pct,
                tie_pct,
                samples: total,
            }
        })
        .collect();

    EquityCalcResult {
        players,
        total_samples: total,
    }
}

fn empty_result(num_players: usize) -> EquityCalcResult {
    EquityCalcResult {
        players: vec![
            EquityResult {
                equity: 0.0,
                win_pct: 0.0,
                tie_pct: 0.0,
                samples: 0,
            };
            num_players
        ],
        total_samples: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn combo(s: &str) -> Combo {
        let c1 = Card::from_str(&s[0..2]).unwrap();
        let c2 = Card::from_str(&s[2..4]).unwrap();
        Combo(c1, c2)
    }

    #[test]
    fn test_exact_aa_vs_kk_preflop() {
        // AA vs KK preflop: AA should win ~81-82%
        let hand1 = combo("AhAd");
        let hand2 = combo("KhKd");
        let board = Board::new();
        let result = equity_exact_hands(hand1, hand2, &board);

        let eq1 = result.players[0].equity;
        println!("AA vs KK: {:.2}% vs {:.2}%", eq1 * 100.0, result.players[1].equity * 100.0);
        assert!(eq1 > 0.80 && eq1 < 0.84, "AA equity was {}", eq1);
    }

    #[test]
    fn test_exact_same_hand_ties() {
        // Same hand should tie ~100% (minus board flushes etc with different suits)
        let hand1 = combo("AhKh");
        let hand2 = combo("AdKd");
        let board = Board::new();
        let result = equity_exact_hands(hand1, hand2, &board);

        let eq1 = result.players[0].equity;
        let eq2 = result.players[1].equity;
        // Should be close to 50/50
        assert!((eq1 - 0.5).abs() < 0.05, "Equity was {}", eq1);
        assert!((eq2 - 0.5).abs() < 0.05, "Equity was {}", eq2);
    }

    #[test]
    fn test_exact_with_flop() {
        // AhKh on Ah Kd 2c board - two pair, very strong
        let hand1 = combo("AhKh"); // has two pair
        let hand2 = combo("QsQd"); // has pair of queens
        let board = Board::parse("As Kd 2c").unwrap();
        let result = equity_exact_hands(hand1, hand2, &board);

        let eq1 = result.players[0].equity;
        println!("AK vs QQ on AK2: {:.2}%", eq1 * 100.0);
        assert!(eq1 > 0.85, "AK should dominate QQ on AK2 board, got {}", eq1);
    }

    #[test]
    fn test_monte_carlo_aa_vs_kk() {
        let r1 = Range::parse("AA").unwrap();
        let r2 = Range::parse("KK").unwrap();
        let board = Board::new();
        let result = equity_monte_carlo(&[&r1, &r2], &board, 50000);

        let eq1 = result.players[0].equity;
        println!("MC AA vs KK: {:.2}% (n={})", eq1 * 100.0, result.total_samples);
        // With 50k sims, should be within ~2% of true value
        assert!(eq1 > 0.78 && eq1 < 0.86, "AA equity was {}", eq1);
    }

    #[test]
    fn test_monte_carlo_range_vs_range() {
        // Top 10% vs top 20% - should favor tighter range
        let r1 = Range::parse("TT+,AQs+,AKo").unwrap();
        let r2 = Range::parse("77+,A9s+,KTs+,ATo+,KJo+").unwrap();
        let board = Board::new();
        let result = equity_monte_carlo(&[&r1, &r2], &board, 50000);

        let eq1 = result.players[0].equity;
        println!(
            "Top ~5% vs wider: {:.2}% vs {:.2}% (n={})",
            eq1 * 100.0,
            result.players[1].equity * 100.0,
            result.total_samples
        );
        // Tighter range should have edge
        assert!(eq1 > 0.50, "Tighter range should have >50% equity, got {}", eq1);
    }

    #[test]
    fn test_board_parse() {
        let b = Board::parse("Ah Kd Qs").unwrap();
        assert_eq!(b.cards.len(), 3);

        let b = Board::parse("AhKdQsJcTh").unwrap();
        assert_eq!(b.cards.len(), 5);

        let b = Board::parse("").unwrap();
        assert_eq!(b.cards.len(), 0);
    }
}
