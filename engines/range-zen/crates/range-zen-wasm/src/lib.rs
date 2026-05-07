use range_zen_core::analysis::analyze_range;
use range_zen_core::card::Card;
use range_zen_core::equity::{equity_monte_carlo, Board};
use range_zen_core::range::Range;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct PlayerEquity {
    equity: f64,
    win_pct: f64,
    tie_pct: f64,
}

#[derive(Serialize)]
struct EquityResultJs {
    players: Vec<PlayerEquity>,
    total_samples: f64,
}

/// Run a range-vs-range Monte Carlo equity calculation.
/// `range1`, `range2`: PokerStove syntax (e.g. "AA,KK,AKs")
/// `board`: 0–5 cards (e.g. "AhKd2c"), empty string for preflop
/// `num_sims`: number of Monte Carlo iterations
#[wasm_bindgen]
pub fn equity_mc(
    range1: &str,
    range2: &str,
    board: &str,
    num_sims: u32,
) -> Result<JsValue, JsValue> {
    let r1 = Range::parse(range1).map_err(|e| JsValue::from_str(&format!("range1: {}", e)))?;
    let r2 = Range::parse(range2).map_err(|e| JsValue::from_str(&format!("range2: {}", e)))?;
    let b = Board::parse(board).map_err(|e| JsValue::from_str(&format!("board: {}", e)))?;

    let result = equity_monte_carlo(&[&r1, &r2], &b, num_sims as u64);

    let out = EquityResultJs {
        players: result
            .players
            .iter()
            .map(|p| PlayerEquity {
                equity: p.equity,
                win_pct: p.win_pct,
                tie_pct: p.tie_pct,
            })
            .collect(),
        total_samples: result.total_samples as f64,
    };

    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[derive(Serialize)]
struct CategoryJs {
    label: String,
    label_cn: String,
    count: f64,
    pct: f64,
}

#[derive(Serialize)]
struct AnalysisJs {
    total_combos: f64,
    categories: Vec<CategoryJs>,
}

/// Analyze a range against a board (Flopzilla-style hand-strength distribution).
#[wasm_bindgen]
pub fn analyze(range: &str, board: &str) -> Result<JsValue, JsValue> {
    let r = Range::parse(range).map_err(|e| JsValue::from_str(&format!("range: {}", e)))?;
    let b = Board::parse(board).map_err(|e| JsValue::from_str(&format!("board: {}", e)))?;
    let board_cards: Vec<Card> = b.cards.clone();

    let analysis = analyze_range(&r, &board_cards);
    let total = analysis.total_combos as f64;

    let cats: Vec<CategoryJs> = analysis
        .categories
        .iter()
        .map(|c| CategoryJs {
            label: c.category.label().to_string(),
            label_cn: c.category.label_cn().to_string(),
            count: c.count as f64,
            pct: c.percentage,
        })
        .collect();

    let out = AnalysisJs {
        total_combos: total,
        categories: cats,
    };

    serde_wasm_bindgen::to_value(&out).map_err(|e| JsValue::from_str(&e.to_string()))
}
