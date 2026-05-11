use crate::card::Card;
use std::sync::LazyLock;

/// Hand rank category, ordered from worst to best.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[repr(u8)]
pub enum HandCategory {
    HighCard = 0,
    OnePair = 1,
    TwoPair = 2,
    ThreeOfAKind = 3,
    Straight = 4,
    Flush = 5,
    FullHouse = 6,
    FourOfAKind = 7,
    StraightFlush = 8,
}

/// Hand strength value. Higher is better.
/// Encoding: category(4 bits) | c0(4) | c1(4) | c2(4) | c3(4) | c4(4)
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct HandValue(pub u32);

impl HandValue {
    pub fn category(self) -> HandCategory {
        let cat = (self.0 >> 20) as u8;
        unsafe { std::mem::transmute(cat) }
    }
}

// ─── Lookup Tables ───────────────────────────────────────────────────────────

/// STRAIGHT_TABLE[mask] = highest straight top rank, or 0xFF if no straight.
/// Indexed by 13-bit rank presence bitmask (bit 0 = rank 2, bit 12 = rank A).
static STRAIGHT_TABLE: LazyLock<[u8; 8192]> = LazyLock::new(|| {
    let mut table = [0xFFu8; 8192];
    for mask in 0u16..8192 {
        // Check A-high down to 6-high (top ranks 12 down to 4)
        let mut found = false;
        for high in (4u8..=12).rev() {
            let pattern = 0x1Fu16 << (high - 4);
            if mask & pattern == pattern {
                table[mask as usize] = high;
                found = true;
                break;
            }
        }
        if !found {
            // Wheel: A(bit12), 2(bit0), 3(bit1), 4(bit2), 5(bit3)
            if mask & 0x100F == 0x100F {
                table[mask as usize] = 3; // 5-high straight
            }
        }
    }
    table
});

/// FLUSH_TABLE[mask] = HandValue for the best flush hand from that rank bitmask.
/// Only valid for masks with 5+ bits set.
static FLUSH_TABLE: LazyLock<[HandValue; 8192]> = LazyLock::new(|| {
    let mut table = [HandValue(0); 8192];
    for mask in 0u16..8192 {
        if mask.count_ones() >= 5 {
            table[mask as usize] = compute_flush_value(mask);
        }
    }
    table
});

fn compute_flush_value(mask: u16) -> HandValue {
    // Check straight flush
    let mut sf_high = 0xFFu8;
    for high in (4u8..=12).rev() {
        let pattern = 0x1Fu16 << (high - 4);
        if mask & pattern == pattern {
            sf_high = high;
            break;
        }
    }
    if sf_high == 0xFF && mask & 0x100F == 0x100F {
        sf_high = 3;
    }
    if sf_high != 0xFF {
        return make_value(HandCategory::StraightFlush, &[sf_high]);
    }

    // Regular flush: top 5 ranks
    let mut ranks = [0u8; 5];
    let mut idx = 0;
    for r in (0u8..13).rev() {
        if mask & (1 << r) != 0 {
            ranks[idx] = r;
            idx += 1;
            if idx == 5 {
                break;
            }
        }
    }
    make_value(HandCategory::Flush, &ranks)
}

// ─── Fast 7-Card Evaluator ──────────────────────────────────────────────────

/// Optimized 7-card evaluator using lookup tables and direct rank analysis.
/// Replaces the C(7,5)=21 brute-force approach.
pub fn evaluate_7cards(cards: [Card; 7]) -> HandValue {
    // Single pass: build rank counts, suit counts, suit rank masks
    let mut rc = [0u8; 13]; // rank counts
    let mut sc = [0u8; 4]; // suit counts
    let mut sm = [0u16; 4]; // suit rank bitmasks (13 bits per suit)

    for &c in &cards {
        let r = (c.0 / 4) as usize;
        let s = (c.0 % 4) as usize;
        rc[r] += 1;
        sc[s] += 1;
        sm[s] |= 1u16 << r;
    }

    // Check for flush (any suit with 5+ cards)
    for s in 0..4 {
        if sc[s] >= 5 {
            let flush_mask = sm[s];

            // Straight flush check via lookup
            let sf_high = STRAIGHT_TABLE[flush_mask as usize];
            if sf_high != 0xFF {
                return make_value(HandCategory::StraightFlush, &[sf_high]);
            }

            // Regular flush via lookup (top 5 suited ranks)
            let flush_val = FLUSH_TABLE[flush_mask as usize];

            // Compare with non-flush value (quads/full-house beat flush)
            let rank_val = eval_rank_hand(&rc);
            return flush_val.max(rank_val);
        }
    }

    // No flush — evaluate by rank pattern
    eval_rank_hand(&rc)
}

/// Evaluate hand strength from rank counts alone (no flush possible).
fn eval_rank_hand(rc: &[u8; 13]) -> HandValue {
    // Gather ranks by frequency, iterating high to low
    let mut quad: u8 = 0xFF;
    let mut trips = [0xFFu8; 2];
    let mut tc: usize = 0;
    let mut pairs = [0xFFu8; 3];
    let mut pc: usize = 0;
    let mut singles = [0xFFu8; 7];
    let mut kc: usize = 0;

    for r in (0u8..13).rev() {
        match rc[r as usize] {
            4 => quad = r,
            3 => {
                trips[tc] = r;
                tc += 1;
            }
            2 => {
                pairs[pc] = r;
                pc += 1;
            }
            1 => {
                singles[kc] = r;
                kc += 1;
            }
            _ => {}
        }
    }

    // Four of a kind (beats everything except straight flush)
    if quad != 0xFF {
        // Best kicker is the highest rank among all remaining cards
        let mut kicker = 0u8;
        if tc > 0 {
            kicker = kicker.max(trips[0]);
        }
        if pc > 0 {
            kicker = kicker.max(pairs[0]);
        }
        if kc > 0 {
            kicker = kicker.max(singles[0]);
        }
        return make_value(HandCategory::FourOfAKind, &[quad, kicker]);
    }

    // Full house
    if tc >= 2 {
        // Two trips: best trips + second trips as pair
        return make_value(HandCategory::FullHouse, &[trips[0], trips[1]]);
    }
    if tc == 1 && pc >= 1 {
        return make_value(HandCategory::FullHouse, &[trips[0], pairs[0]]);
    }

    // Build rank mask for straight check
    let mut rank_mask: u16 = 0;
    for r in 0..13 {
        if rc[r] > 0 {
            rank_mask |= 1u16 << r;
        }
    }
    let straight_high = STRAIGHT_TABLE[rank_mask as usize];

    // Straight (beats trips, two pair, pair, high card)
    // Note: with 7 cards, quads/full-house + straight is impossible
    // (quads use 4+slots, full house uses 3+2+slots, leaving <5 distinct ranks)
    if straight_high != 0xFF {
        return make_value(HandCategory::Straight, &[straight_high]);
    }

    // Three of a kind
    if tc == 1 {
        return make_value(
            HandCategory::ThreeOfAKind,
            &[trips[0], singles[0], singles[1]],
        );
    }

    // Two pair
    if pc >= 2 {
        // With 3 pairs (2+2+2+1), kicker = max(third pair rank, best single)
        let kicker = if pc >= 3 {
            pairs[2].max(singles[0])
        } else {
            singles[0]
        };
        return make_value(
            HandCategory::TwoPair,
            &[pairs[0], pairs[1], kicker],
        );
    }

    // One pair
    if pc == 1 {
        return make_value(
            HandCategory::OnePair,
            &[pairs[0], singles[0], singles[1], singles[2]],
        );
    }

    // High card (top 5 of 7 singles)
    make_value(
        HandCategory::HighCard,
        &[singles[0], singles[1], singles[2], singles[3], singles[4]],
    )
}

// ─── Legacy 5-Card Evaluator (kept for testing) ─────────────────────────────

/// Evaluate exactly 5 cards. Returns HandValue.
pub fn evaluate_5cards(cards: [Card; 5]) -> HandValue {
    let ranks: [u8; 5] = [
        cards[0].rank() as u8,
        cards[1].rank() as u8,
        cards[2].rank() as u8,
        cards[3].rank() as u8,
        cards[4].rank() as u8,
    ];
    let suits: [u8; 5] = [
        cards[0].suit() as u8,
        cards[1].suit() as u8,
        cards[2].suit() as u8,
        cards[3].suit() as u8,
        cards[4].suit() as u8,
    ];

    let is_flush = suits[0] == suits[1]
        && suits[1] == suits[2]
        && suits[2] == suits[3]
        && suits[3] == suits[4];

    let mut sorted = ranks;
    sorted.sort_unstable_by(|a, b| b.cmp(a));

    let is_straight = is_straight_sorted(&sorted);
    let is_wheel = sorted == [12, 3, 2, 1, 0];

    let mut counts = [0u8; 13];
    for &r in &ranks {
        counts[r as usize] += 1;
    }

    let mut freq: Vec<(u8, u8)> = counts
        .iter()
        .enumerate()
        .filter(|(_, c)| **c > 0)
        .map(|(r, c)| (*c, r as u8))
        .collect();
    freq.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));

    if is_straight || is_wheel {
        let high = if is_wheel { 3u8 } else { sorted[0] };
        if is_flush {
            return make_value(HandCategory::StraightFlush, &[high]);
        }
        if !has_pairs(&freq) {
            return make_value(HandCategory::Straight, &[high]);
        }
    }

    if is_flush {
        return make_value(HandCategory::Flush, &sorted);
    }

    match freq[0].0 {
        4 => {
            let quad = freq[0].1;
            let kicker = freq[1].1;
            make_value(HandCategory::FourOfAKind, &[quad, kicker])
        }
        3 => {
            if freq.len() >= 2 && freq[1].0 >= 2 {
                make_value(HandCategory::FullHouse, &[freq[0].1, freq[1].1])
            } else {
                let trips = freq[0].1;
                let k1 = freq[1].1;
                let k2 = freq[2].1;
                make_value(HandCategory::ThreeOfAKind, &[trips, k1, k2])
            }
        }
        2 => {
            if freq.len() >= 2 && freq[1].0 == 2 {
                let high_pair = freq[0].1;
                let low_pair = freq[1].1;
                let kicker = freq[2].1;
                make_value(HandCategory::TwoPair, &[high_pair, low_pair, kicker])
            } else {
                let pair = freq[0].1;
                let k1 = freq[1].1;
                let k2 = freq[2].1;
                let k3 = freq[3].1;
                make_value(HandCategory::OnePair, &[pair, k1, k2, k3])
            }
        }
        1 => make_value(HandCategory::HighCard, &sorted),
        _ => unreachable!(),
    }
}

fn is_straight_sorted(sorted: &[u8; 5]) -> bool {
    if sorted[0] - sorted[4] == 4
        && sorted[0] - sorted[1] == 1
        && sorted[1] - sorted[2] == 1
        && sorted[2] - sorted[3] == 1
    {
        return true;
    }
    sorted == &[12, 3, 2, 1, 0]
}

fn has_pairs(freq: &[(u8, u8)]) -> bool {
    freq.iter().any(|&(c, _)| c >= 2)
}

fn make_value(category: HandCategory, components: &[u8]) -> HandValue {
    let mut val: u32 = (category as u32) << 20;
    for (i, &c) in components.iter().enumerate() {
        if i >= 5 {
            break;
        }
        val |= (c as u32) << (16 - i * 4);
    }
    HandValue(val)
}

// ─── Brute-force 7-card evaluator (for correctness verification) ────────────

/// Old brute-force evaluator: C(7,5)=21 combinations.
/// Kept for cross-validation with the optimized version.
pub fn evaluate_7cards_bruteforce(cards: [Card; 7]) -> HandValue {
    let mut best = HandValue(0);
    for i in 0..7 {
        for j in (i + 1)..7 {
            let mut hand = [Card(0); 5];
            let mut idx = 0;
            for k in 0..7 {
                if k != i && k != j {
                    hand[idx] = cards[k];
                    idx += 1;
                }
            }
            let val = evaluate_5cards(hand);
            if val > best {
                best = val;
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cards(s: &str) -> Vec<Card> {
        s.split_whitespace()
            .map(|c| Card::from_str(c).unwrap())
            .collect()
    }

    fn eval5(s: &str) -> HandValue {
        let c = cards(s);
        evaluate_5cards([c[0], c[1], c[2], c[3], c[4]])
    }

    fn eval7(s: &str) -> HandValue {
        let c = cards(s);
        evaluate_7cards([c[0], c[1], c[2], c[3], c[4], c[5], c[6]])
    }

    fn eval7_old(s: &str) -> HandValue {
        let c = cards(s);
        evaluate_7cards_bruteforce([c[0], c[1], c[2], c[3], c[4], c[5], c[6]])
    }

    // ── 5-card tests (unchanged) ──

    #[test]
    fn test_high_card() {
        let v = eval5("Ah Kd Qs Jc 9h");
        assert_eq!(v.category(), HandCategory::HighCard);
    }

    #[test]
    fn test_one_pair() {
        let v = eval5("Ah Ad Qs Jc 9h");
        assert_eq!(v.category(), HandCategory::OnePair);
    }

    #[test]
    fn test_two_pair() {
        let v = eval5("Ah Ad Qs Qc 9h");
        assert_eq!(v.category(), HandCategory::TwoPair);
    }

    #[test]
    fn test_three_of_a_kind() {
        let v = eval5("Ah Ad As Jc 9h");
        assert_eq!(v.category(), HandCategory::ThreeOfAKind);
    }

    #[test]
    fn test_straight() {
        let v = eval5("Th 9d 8s 7c 6h");
        assert_eq!(v.category(), HandCategory::Straight);
    }

    #[test]
    fn test_wheel() {
        let v = eval5("Ah 2d 3s 4c 5h");
        assert_eq!(v.category(), HandCategory::Straight);
        let v2 = eval5("6h 2d 3s 4c 5h");
        assert!(v < v2);
    }

    #[test]
    fn test_flush() {
        let v = eval5("Ah Kh Qh Jh 9h");
        assert_eq!(v.category(), HandCategory::Flush);
    }

    #[test]
    fn test_full_house() {
        let v = eval5("Ah Ad As Kc Kh");
        assert_eq!(v.category(), HandCategory::FullHouse);
    }

    #[test]
    fn test_four_of_a_kind() {
        let v = eval5("Ah Ad As Ac 9h");
        assert_eq!(v.category(), HandCategory::FourOfAKind);
    }

    #[test]
    fn test_straight_flush() {
        let v = eval5("Th 9h 8h 7h 6h");
        assert_eq!(v.category(), HandCategory::StraightFlush);
    }

    #[test]
    fn test_royal_flush() {
        let v = eval5("Ah Kh Qh Jh Th");
        assert_eq!(v.category(), HandCategory::StraightFlush);
    }

    #[test]
    fn test_ordering() {
        let high_card = eval5("Ah Kd Qs Jc 9h");
        let pair = eval5("Ah Ad Qs Jc 9h");
        let two_pair = eval5("Ah Ad Qs Qc 9h");
        let trips = eval5("Ah Ad As Jc 9h");
        let straight = eval5("Th 9d 8s 7c 6h");
        let flush = eval5("Ah Kh Qh Jh 9h");
        let full_house = eval5("Ah Ad As Kc Kh");
        let quads = eval5("Ah Ad As Ac 9h");
        let straight_flush = eval5("Th 9h 8h 7h 6h");

        assert!(high_card < pair);
        assert!(pair < two_pair);
        assert!(two_pair < trips);
        assert!(trips < straight);
        assert!(straight < flush);
        assert!(flush < full_house);
        assert!(full_house < quads);
        assert!(quads < straight_flush);
    }

    #[test]
    fn test_kicker_comparison() {
        let aa_k = eval5("Ah Ad Ks Jc 9h");
        let aa_q = eval5("Ah Ad Qs Jc 9h");
        assert!(aa_k > aa_q);
    }

    // ── 7-card fast evaluator tests ──

    #[test]
    fn test_7card_finds_best() {
        let v = eval7("Ah Kh Qh Jh 9h 2c 3d");
        assert_eq!(v.category(), HandCategory::Flush);

        let v = eval7("Th 9d 8s 7c 6h 2c 3d");
        assert_eq!(v.category(), HandCategory::Straight);
    }

    #[test]
    fn test_7card_full_house_over_two_pair() {
        let v = eval7("Ah Ad As Kc Kh 9c 3d");
        assert_eq!(v.category(), HandCategory::FullHouse);
    }

    #[test]
    fn test_7card_straight_flush() {
        let v = eval7("5h 6h 7h 8h 9h 2c 3d");
        assert_eq!(v.category(), HandCategory::StraightFlush);
    }

    #[test]
    fn test_7card_royal_flush() {
        let v = eval7("Ah Kh Qh Jh Th 2c 3d");
        assert_eq!(v.category(), HandCategory::StraightFlush);
    }

    #[test]
    fn test_7card_wheel_straight_flush() {
        let v = eval7("Ah 2h 3h 4h 5h Kc Qd");
        assert_eq!(v.category(), HandCategory::StraightFlush);
    }

    #[test]
    fn test_7card_flush_beats_straight() {
        // Has both a straight and a flush (different cards)
        let v = eval7("Ah Kh Qh Jh 2h Tc 9d");
        assert_eq!(v.category(), HandCategory::Flush);
    }

    #[test]
    fn test_7card_quads() {
        let v = eval7("Ah Ad As Ac 9h 3c 2d");
        assert_eq!(v.category(), HandCategory::FourOfAKind);
    }

    #[test]
    fn test_7card_full_house_from_two_trips() {
        // Two sets of trips → full house using best trips + second trips
        let v = eval7("Ah Ad As Kc Kd Ks 2h");
        assert_eq!(v.category(), HandCategory::FullHouse);
    }

    #[test]
    fn test_7card_three_pairs() {
        // Three pairs → two pair (best two) + kicker
        let v = eval7("Ah Ad Kc Kd Qh Qd 2s");
        assert_eq!(v.category(), HandCategory::TwoPair);
        // Should be AA KK with Q kicker, not AA QQ or KK QQ
        let v2 = eval7("Ah Ad Kc Kd Jh Jd 2s");
        assert!(v > v2); // Q kicker > J kicker for same AA KK two pair... wait
        // Actually both are AA KK two pair, v has Q kicker, v2 has J kicker
        assert!(v > v2);
    }

    #[test]
    fn test_7card_straight_over_trips() {
        // Has trips AND a straight → straight wins
        let v = eval7("5h 5d 5s 6c 7h 8d 9c");
        assert_eq!(v.category(), HandCategory::Straight);
    }

    #[test]
    fn test_7card_quads_with_full_house_material() {
        // Quads + a pair → still quads
        let v = eval7("Ah Ad As Ac Kh Kd 2s");
        assert_eq!(v.category(), HandCategory::FourOfAKind);
    }

    #[test]
    fn test_7card_full_house_beats_flush() {
        // 5 hearts (flush) but also full house → full house wins
        let v = eval7("Ah Ad As Kh Kd 9h 3h");
        assert_eq!(v.category(), HandCategory::FullHouse);
    }

    // ── Cross-validation: fast vs brute-force ──

    #[test]
    fn test_fast_matches_bruteforce_comprehensive() {
        // Test a wide range of hands to verify fast evaluator matches brute-force
        let test_hands = [
            "Ah Kd Qs Jc 9h 7s 2c", // high card
            "Ah Ad Qs Jc 9h 7s 2c", // pair
            "Ah Ad Kh Kd 9s 7c 2h", // two pair
            "Ah Ad As Jc 9h 7s 2c", // trips
            "Th 9d 8s 7c 6h Ac Kd", // straight
            "Ah Kh Qh Jh 9h 2c 3d", // flush
            "Ah Ad As Kc Kh 9c 3d", // full house
            "Ah Ad As Ac 9h 3c 2d", // quads
            "Th 9h 8h 7h 6h 2c 3d", // straight flush
            "5h 5d 5s 6c 7h 8d 9c", // trips + straight → straight
            "Ah Ad As Kc Kd Ks 2h", // two trips → full house
            "Ah Ad Kc Kd Qh Qd 2s", // three pairs
            "Ah Ad As Ac Kh Kd 2s", // quads + pair
            "Ah 2h 3h 4h 5h Kc Qd", // wheel straight flush
            "Ah Ad As Kh Kd 9h 3h", // full house beats potential flush
            "2h 3d 4s 5c 6h 7s 8c", // 7-card straight
            "Ah Kh Qh Jh 2h Tc 9d", // flush + straight → flush
        ];

        for &hand_str in &test_hands {
            let c = cards(hand_str);
            let arr = [c[0], c[1], c[2], c[3], c[4], c[5], c[6]];
            let fast = evaluate_7cards(arr);
            let brute = evaluate_7cards_bruteforce(arr);
            assert_eq!(
                fast, brute,
                "Mismatch for {}: fast={:?} ({:?}), brute={:?} ({:?})",
                hand_str, fast, fast.category(), brute, brute.category()
            );
        }
    }

    #[test]
    fn test_fast_matches_bruteforce_random() {
        // Generate many random hands and verify
        use crate::card::Card;
        let mut rng = rand::rng();
        use rand::seq::SliceRandom;

        let mut deck: Vec<Card> = (0..52).map(|i| Card(i)).collect();
        for _ in 0..10000 {
            deck.shuffle(&mut rng);
            let arr = [deck[0], deck[1], deck[2], deck[3], deck[4], deck[5], deck[6]];
            let fast = evaluate_7cards(arr);
            let brute = evaluate_7cards_bruteforce(arr);
            assert_eq!(
                fast, brute,
                "Mismatch: cards={:?}, fast={:?} ({:?}), brute={:?} ({:?})",
                arr, fast, fast.category(), brute, brute.category()
            );
        }
    }
}
