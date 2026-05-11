use std::fmt;

/// 4 suits: Clubs, Diamonds, Hearts, Spades
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[repr(u8)]
pub enum Suit {
    Clubs = 0,
    Diamonds = 1,
    Hearts = 2,
    Spades = 3,
}

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades];

    pub fn from_char(c: char) -> Option<Suit> {
        match c {
            'c' | 'C' => Some(Suit::Clubs),
            'd' | 'D' => Some(Suit::Diamonds),
            'h' | 'H' => Some(Suit::Hearts),
            's' | 'S' => Some(Suit::Spades),
            _ => None,
        }
    }

    pub fn to_char(self) -> char {
        match self {
            Suit::Clubs => 'c',
            Suit::Diamonds => 'd',
            Suit::Hearts => 'h',
            Suit::Spades => 's',
        }
    }
}

impl fmt::Display for Suit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let symbol = match self {
            Suit::Clubs => "♣",
            Suit::Diamonds => "♦",
            Suit::Hearts => "♥",
            Suit::Spades => "♠",
        };
        write!(f, "{}", symbol)
    }
}

/// 13 ranks: 2..=A
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[repr(u8)]
pub enum Rank {
    Two = 0,
    Three = 1,
    Four = 2,
    Five = 3,
    Six = 4,
    Seven = 5,
    Eight = 6,
    Nine = 7,
    Ten = 8,
    Jack = 9,
    Queen = 10,
    King = 11,
    Ace = 12,
}

impl Rank {
    pub const ALL: [Rank; 13] = [
        Rank::Two, Rank::Three, Rank::Four, Rank::Five, Rank::Six,
        Rank::Seven, Rank::Eight, Rank::Nine, Rank::Ten,
        Rank::Jack, Rank::Queen, Rank::King, Rank::Ace,
    ];

    pub fn from_char(c: char) -> Option<Rank> {
        match c {
            '2' => Some(Rank::Two),
            '3' => Some(Rank::Three),
            '4' => Some(Rank::Four),
            '5' => Some(Rank::Five),
            '6' => Some(Rank::Six),
            '7' => Some(Rank::Seven),
            '8' => Some(Rank::Eight),
            '9' => Some(Rank::Nine),
            'T' | 't' => Some(Rank::Ten),
            'J' | 'j' => Some(Rank::Jack),
            'Q' | 'q' => Some(Rank::Queen),
            'K' | 'k' => Some(Rank::King),
            'A' | 'a' => Some(Rank::Ace),
            _ => None,
        }
    }

    pub fn to_char(self) -> char {
        match self {
            Rank::Two => '2',
            Rank::Three => '3',
            Rank::Four => '4',
            Rank::Five => '5',
            Rank::Six => '6',
            Rank::Seven => '7',
            Rank::Eight => '8',
            Rank::Nine => '9',
            Rank::Ten => 'T',
            Rank::Jack => 'J',
            Rank::Queen => 'Q',
            Rank::King => 'K',
            Rank::Ace => 'A',
        }
    }
}

impl fmt::Display for Rank {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

/// A card is represented as a u8 index 0..51
/// index = rank * 4 + suit
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Card(pub u8);

impl Card {
    pub fn new(rank: Rank, suit: Suit) -> Card {
        Card(rank as u8 * 4 + suit as u8)
    }

    pub fn from_index(index: u8) -> Card {
        debug_assert!(index < 52);
        Card(index)
    }

    /// Parse "Ah", "Tc", "2d" etc.
    pub fn from_str(s: &str) -> Option<Card> {
        let mut chars = s.chars();
        let rank = Rank::from_char(chars.next()?)?;
        let suit = Suit::from_char(chars.next()?)?;
        if chars.next().is_some() {
            return None;
        }
        Some(Card::new(rank, suit))
    }

    pub fn rank(self) -> Rank {
        // Safety: value is always 0..12 because Card(0..51)
        unsafe { std::mem::transmute(self.0 / 4) }
    }

    pub fn suit(self) -> Suit {
        // Safety: value is always 0..3
        unsafe { std::mem::transmute(self.0 % 4) }
    }

    pub fn index(self) -> usize {
        self.0 as usize
    }
}

impl fmt::Debug for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}{}", self.rank().to_char(), self.suit().to_char())
    }
}

impl fmt::Display for Card {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}{}", self.rank(), self.suit())
    }
}

/// A 64-bit bitset representing a set of cards.
/// Bit i is set if card with index i is in the set.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Default)]
pub struct CardSet(pub u64);

impl CardSet {
    pub const EMPTY: CardSet = CardSet(0);
    pub const FULL_DECK: CardSet = CardSet((1u64 << 52) - 1);

    pub fn add(&mut self, card: Card) {
        self.0 |= 1u64 << card.index();
    }

    pub fn remove(&mut self, card: Card) {
        self.0 &= !(1u64 << card.index());
    }

    pub fn contains(self, card: Card) -> bool {
        (self.0 >> card.index()) & 1 == 1
    }

    pub fn len(self) -> u32 {
        self.0.count_ones()
    }

    pub fn is_empty(self) -> bool {
        self.0 == 0
    }

    pub fn overlaps(self, other: CardSet) -> bool {
        (self.0 & other.0) != 0
    }

    pub fn union(self, other: CardSet) -> CardSet {
        CardSet(self.0 | other.0)
    }

    pub fn iter(self) -> CardSetIter {
        CardSetIter(self.0)
    }
}

impl fmt::Debug for CardSet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let cards: Vec<String> = self.iter().map(|c| format!("{:?}", c)).collect();
        write!(f, "{{{}}}", cards.join(", "))
    }
}

pub struct CardSetIter(u64);

impl Iterator for CardSetIter {
    type Item = Card;

    fn next(&mut self) -> Option<Card> {
        if self.0 == 0 {
            return None;
        }
        let idx = self.0.trailing_zeros() as u8;
        self.0 &= self.0 - 1; // clear lowest set bit
        Some(Card(idx))
    }
}

/// A standard 52-card deck that can deal cards.
pub struct Deck {
    cards: [Card; 52],
    top: usize,
}

impl Deck {
    pub fn new() -> Deck {
        let mut cards = [Card(0); 52];
        for i in 0..52 {
            cards[i] = Card(i as u8);
        }
        Deck { cards, top: 0 }
    }

    pub fn shuffle(&mut self, rng: &mut impl rand::Rng) {
        use rand::seq::SliceRandom;
        self.cards.shuffle(rng);
        self.top = 0;
    }

    /// Shuffle only cards not in `dead` set.
    pub fn shuffle_remaining(&mut self, dead: CardSet, rng: &mut impl rand::Rng) {
        use rand::seq::SliceRandom;
        let mut live = Vec::with_capacity(52);
        for i in 0..52u8 {
            if !dead.contains(Card(i)) {
                live.push(Card(i));
            }
        }
        live.shuffle(rng);
        self.cards[..live.len()].copy_from_slice(&live);
        self.top = 0;
    }

    pub fn deal(&mut self) -> Card {
        let card = self.cards[self.top];
        self.top += 1;
        card
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn card_roundtrip() {
        for i in 0..52u8 {
            let card = Card(i);
            let r = card.rank();
            let s = card.suit();
            assert_eq!(Card::new(r, s), card);
        }
    }

    #[test]
    fn card_parse() {
        let card = Card::from_str("Ah").unwrap();
        assert_eq!(card.rank(), Rank::Ace);
        assert_eq!(card.suit(), Suit::Hearts);
        assert_eq!(format!("{:?}", card), "Ah");

        let card = Card::from_str("2c").unwrap();
        assert_eq!(card.rank(), Rank::Two);
        assert_eq!(card.suit(), Suit::Clubs);
    }

    #[test]
    fn cardset_basics() {
        let mut set = CardSet::EMPTY;
        let ace_spades = Card::from_str("As").unwrap();
        let king_hearts = Card::from_str("Kh").unwrap();

        set.add(ace_spades);
        assert!(set.contains(ace_spades));
        assert!(!set.contains(king_hearts));
        assert_eq!(set.len(), 1);

        set.add(king_hearts);
        assert_eq!(set.len(), 2);

        let cards: Vec<Card> = set.iter().collect();
        assert_eq!(cards.len(), 2);
    }

    #[test]
    fn full_deck_has_52_cards() {
        assert_eq!(CardSet::FULL_DECK.len(), 52);
    }
}
