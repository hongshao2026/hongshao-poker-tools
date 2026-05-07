use crate::card::{Card, CardSet, Rank, Suit};

/// A combo is a specific pair of hole cards.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Combo(pub Card, pub Card);

impl Combo {
    pub fn cards(self) -> CardSet {
        let mut cs = CardSet::EMPTY;
        cs.add(self.0);
        cs.add(self.1);
        cs
    }

    pub fn overlaps(self, dead: CardSet) -> bool {
        dead.contains(self.0) || dead.contains(self.1)
    }
}

impl std::fmt::Display for Combo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}{:?}", self.0, self.1)
    }
}

/// A range is a collection of combos, optionally weighted.
#[derive(Debug, Clone)]
pub struct Range {
    /// (combo, weight) where weight is 0.0..=1.0
    pub combos: Vec<(Combo, f64)>,
}

impl Range {
    pub fn new() -> Range {
        Range { combos: Vec::new() }
    }

    /// Parse a range string like "AA,AKs,QQ-TT,87s-65s,ATo+"
    pub fn parse(input: &str) -> Result<Range, String> {
        let mut range = Range::new();
        let input = input.trim();
        if input.is_empty() {
            return Ok(range);
        }

        for part in input.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            parse_part(part, &mut range)?;
        }

        range.deduplicate();
        Ok(range)
    }

    /// Remove duplicate combos, keeping the highest weight.
    fn deduplicate(&mut self) {
        self.combos.sort_by(|a, b| {
            let ka = (a.0 .0 .0.min(a.0 .1 .0), a.0 .0 .0.max(a.0 .1 .0));
            let kb = (b.0 .0 .0.min(b.0 .1 .0), b.0 .0 .0.max(b.0 .1 .0));
            ka.cmp(&kb)
        });
        self.combos.dedup_by(|a, b| {
            let ka = (a.0 .0 .0.min(a.0 .1 .0), a.0 .0 .0.max(a.0 .1 .0));
            let kb = (b.0 .0 .0.min(b.0 .1 .0), b.0 .0 .0.max(b.0 .1 .0));
            if ka == kb {
                b.1 = b.1.max(a.1); // keep higher weight
                true
            } else {
                false
            }
        });
    }

    /// Filter out combos that overlap with dead cards.
    pub fn filter_dead(&self, dead: CardSet) -> Vec<(Combo, f64)> {
        self.combos
            .iter()
            .filter(|(combo, _)| !combo.overlaps(dead))
            .copied()
            .collect()
    }

    pub fn combo_count(&self) -> usize {
        self.combos.len()
    }
}

impl Default for Range {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse a single part of a range string (between commas).
fn parse_part(s: &str, range: &mut Range) -> Result<(), String> {
    // Check for weight prefix like "0.5:" (not yet supported, add later)

    // Try specific combo first: "AhKs"
    if s.len() == 4 {
        if let (Some(c1), Some(c2)) = (Card::from_str(&s[0..2]), Card::from_str(&s[2..4])) {
            if c1 != c2 {
                range.combos.push((Combo(c1, c2), 1.0));
                return Ok(());
            }
        }
    }

    // Check for range with dash: "QQ-TT", "ATs-A8s", "ATo-A8o"
    if let Some(dash_pos) = s.find('-') {
        let left = &s[..dash_pos];
        let right = &s[dash_pos + 1..];
        return parse_dash_range(left, right, range);
    }

    // Check for plus: "TT+", "ATs+", "ATo+"
    if let Some(base) = s.strip_suffix('+') {
        return parse_plus_range(base, range);
    }

    // Single hand: "AA", "AKs", "AKo", "AK"
    parse_single(s, range)
}

/// Parse a single hand notation and add all its combos.
fn parse_single(s: &str, range: &mut Range) -> Result<(), String> {
    let chars: Vec<char> = s.chars().collect();

    if chars.len() < 2 || chars.len() > 3 {
        return Err(format!("Invalid hand notation: {}", s));
    }

    let r1 = Rank::from_char(chars[0]).ok_or(format!("Invalid rank: {}", chars[0]))?;
    let r2 = Rank::from_char(chars[1]).ok_or(format!("Invalid rank: {}", chars[1]))?;

    let suited_type = if chars.len() == 3 {
        match chars[2] {
            's' | 'S' => Some(true),
            'o' | 'O' => Some(false),
            _ => return Err(format!("Invalid suit qualifier: {}", chars[2])),
        }
    } else {
        None
    };

    if r1 == r2 {
        // Pocket pair: always 6 combos, suited_type doesn't apply
        add_pair_combos(r1, range);
    } else {
        match suited_type {
            Some(true) => add_suited_combos(r1, r2, range),
            Some(false) => add_offsuit_combos(r1, r2, range),
            None => {
                // Both suited and offsuit
                add_suited_combos(r1, r2, range);
                add_offsuit_combos(r1, r2, range);
            }
        }
    }

    Ok(())
}

/// Parse "QQ-TT" or "ATs-A7s" style dash ranges.
fn parse_dash_range(left: &str, right: &str, range: &mut Range) -> Result<(), String> {
    let (r1_l, r2_l, st_l) = parse_hand_notation(left)?;
    let (r1_r, r2_r, st_r) = parse_hand_notation(right)?;

    // Pair range: "QQ-TT"
    if r1_l == r2_l && r1_r == r2_r {
        let high = (r1_l as u8).max(r1_r as u8);
        let low = (r1_l as u8).min(r1_r as u8);
        for r in low..=high {
            let rank = rank_from_u8(r)?;
            add_pair_combos(rank, range);
        }
        return Ok(());
    }

    // Non-pair range: must share first rank and same suited type
    if r1_l != r1_r {
        return Err(format!("Dash range must share first rank: {}-{}", left, right));
    }
    if st_l != st_r {
        return Err(format!(
            "Dash range must have same suited type: {}-{}",
            left, right
        ));
    }

    let high_kicker = (r2_l as u8).max(r2_r as u8);
    let low_kicker = (r2_l as u8).min(r2_r as u8);

    for k in low_kicker..=high_kicker {
        let kicker = rank_from_u8(k)?;
        if kicker == r1_l {
            continue; // skip pairs
        }
        match st_l {
            Some(true) => add_suited_combos(r1_l, kicker, range),
            Some(false) => add_offsuit_combos(r1_l, kicker, range),
            None => {
                add_suited_combos(r1_l, kicker, range);
                add_offsuit_combos(r1_l, kicker, range);
            }
        }
    }

    Ok(())
}

/// Parse "TT+", "ATs+", "ATo+" style plus ranges.
fn parse_plus_range(base: &str, range: &mut Range) -> Result<(), String> {
    let (r1, r2, st) = parse_hand_notation(base)?;

    if r1 == r2 {
        // Pair+: "TT+" means TT, JJ, QQ, KK, AA
        for r in (r1 as u8)..=12 {
            let rank = rank_from_u8(r)?;
            add_pair_combos(rank, range);
        }
    } else {
        // Non-pair+: "ATs+" means ATs, AJs, AQs, AKs
        let primary = r1.max(r2);
        let start_kicker = r1.min(r2);

        for k in (start_kicker as u8)..(primary as u8) {
            let kicker = rank_from_u8(k)?;
            match st {
                Some(true) => add_suited_combos(primary, kicker, range),
                Some(false) => add_offsuit_combos(primary, kicker, range),
                None => {
                    add_suited_combos(primary, kicker, range);
                    add_offsuit_combos(primary, kicker, range);
                }
            }
        }
    }

    Ok(())
}

/// Parse "AKs" → (Ace, King, Some(true)), "TT" → (Ten, Ten, None)
fn parse_hand_notation(s: &str) -> Result<(Rank, Rank, Option<bool>), String> {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() < 2 || chars.len() > 3 {
        return Err(format!("Invalid hand notation: {}", s));
    }
    let r1 = Rank::from_char(chars[0]).ok_or(format!("Invalid rank: {}", chars[0]))?;
    let r2 = Rank::from_char(chars[1]).ok_or(format!("Invalid rank: {}", chars[1]))?;
    let st = if chars.len() == 3 {
        match chars[2] {
            's' | 'S' => Some(true),
            'o' | 'O' => Some(false),
            _ => return Err(format!("Invalid suit qualifier: {}", chars[2])),
        }
    } else {
        None
    };
    Ok((r1, r2, st))
}

fn rank_from_u8(v: u8) -> Result<Rank, String> {
    if v > 12 {
        return Err(format!("Invalid rank value: {}", v));
    }
    Ok(unsafe { std::mem::transmute(v) })
}

fn add_pair_combos(rank: Rank, range: &mut Range) {
    for i in 0..4u8 {
        for j in (i + 1)..4u8 {
            let s1: Suit = unsafe { std::mem::transmute(i) };
            let s2: Suit = unsafe { std::mem::transmute(j) };
            range
                .combos
                .push((Combo(Card::new(rank, s1), Card::new(rank, s2)), 1.0));
        }
    }
}

fn add_suited_combos(r1: Rank, r2: Rank, range: &mut Range) {
    for s in Suit::ALL {
        range
            .combos
            .push((Combo(Card::new(r1, s), Card::new(r2, s)), 1.0));
    }
}

fn add_offsuit_combos(r1: Rank, r2: Rank, range: &mut Range) {
    for s1 in Suit::ALL {
        for s2 in Suit::ALL {
            if s1 != s2 {
                range
                    .combos
                    .push((Combo(Card::new(r1, s1), Card::new(r2, s2)), 1.0));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_pair() {
        let r = Range::parse("AA").unwrap();
        assert_eq!(r.combo_count(), 6); // C(4,2) = 6
    }

    #[test]
    fn test_parse_suited() {
        let r = Range::parse("AKs").unwrap();
        assert_eq!(r.combo_count(), 4); // 4 suits
    }

    #[test]
    fn test_parse_offsuit() {
        let r = Range::parse("AKo").unwrap();
        assert_eq!(r.combo_count(), 12); // 4*3 = 12
    }

    #[test]
    fn test_parse_both() {
        let r = Range::parse("AK").unwrap();
        assert_eq!(r.combo_count(), 16); // 4 + 12
    }

    #[test]
    fn test_parse_pair_plus() {
        let r = Range::parse("TT+").unwrap();
        // TT, JJ, QQ, KK, AA = 5 * 6 = 30
        assert_eq!(r.combo_count(), 30);
    }

    #[test]
    fn test_parse_suited_plus() {
        let r = Range::parse("ATs+").unwrap();
        // ATs, AJs, AQs, AKs = 4 * 4 = 16
        assert_eq!(r.combo_count(), 16);
    }

    #[test]
    fn test_parse_pair_dash() {
        let r = Range::parse("QQ-TT").unwrap();
        // TT, JJ, QQ = 3 * 6 = 18
        assert_eq!(r.combo_count(), 18);
    }

    #[test]
    fn test_parse_suited_dash() {
        let r = Range::parse("ATs-A8s").unwrap();
        // A8s, A9s, ATs = 3 * 4 = 12
        assert_eq!(r.combo_count(), 12);
    }

    #[test]
    fn test_parse_complex() {
        let r = Range::parse("AA,KK,AKs,QQ-TT").unwrap();
        // AA=6, KK=6, AKs=4, QQ=6,JJ=6,TT=6
        assert_eq!(r.combo_count(), 34);
    }

    #[test]
    fn test_parse_specific_combo() {
        let r = Range::parse("AhKs").unwrap();
        assert_eq!(r.combo_count(), 1);
    }

    #[test]
    fn test_filter_dead() {
        let r = Range::parse("AA").unwrap();
        let mut dead = CardSet::EMPTY;
        dead.add(Card::from_str("Ah").unwrap());
        let filtered = r.filter_dead(dead);
        // Remove combos containing Ah: 3 combos removed, 3 remaining
        assert_eq!(filtered.len(), 3);
    }

    #[test]
    fn test_parse_offsuit_plus() {
        let r = Range::parse("ATo+").unwrap();
        // ATo, AJo, AQo, AKo = 4 * 12 = 48
        assert_eq!(r.combo_count(), 48);
    }
}
