use axum::{
    Json, Router,
    http::StatusCode,
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use tower_http::cors::CorsLayer;

use range_zen_core::analysis::analyze_range;
use range_zen_core::card::Card;
use range_zen_core::equity::{equity_monte_carlo, equity_exact_hands, Board};
use range_zen_core::range::Range;

// ─── Equity endpoint ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct EquityRequest {
    ranges: Vec<String>,
    #[serde(default)]
    board: String,
    #[serde(default = "default_simulations")]
    simulations: u64,
    #[serde(default)]
    exact: bool,
}

fn default_simulations() -> u64 {
    100_000
}

#[derive(Serialize)]
struct EquityResponse {
    players: Vec<PlayerResult>,
    total_samples: u64,
    time_ms: f64,
}

#[derive(Serialize)]
struct PlayerResult {
    equity: f64,
    win_pct: f64,
    tie_pct: f64,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

async fn health() -> &'static str {
    "Range Zen API v0.1.0"
}

async fn calculate_equity(
    Json(req): Json<EquityRequest>,
) -> Result<Json<EquityResponse>, (StatusCode, Json<ErrorResponse>)> {
    let err = |msg: String| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: msg }),
        )
    };

    if req.ranges.len() < 2 {
        return Err(err("Need at least 2 ranges".into()));
    }
    if req.ranges.len() > 10 {
        return Err(err("Maximum 10 players".into()));
    }
    if req.simulations > 10_000_000 {
        return Err(err("Maximum 10,000,000 simulations".into()));
    }

    let board = Board::parse(&req.board).map_err(|e| err(e))?;

    let ranges: Vec<Range> = req
        .ranges
        .iter()
        .map(|s| Range::parse(s))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| err(e))?;

    let start = std::time::Instant::now();

    let result = if req.exact && ranges.len() == 2 && ranges[0].combo_count() == 1 && ranges[1].combo_count() == 1 {
        let hand1 = ranges[0].combos[0].0;
        let hand2 = ranges[1].combos[0].0;
        equity_exact_hands(hand1, hand2, &board)
    } else {
        let sims = req.simulations.max(1000).min(10_000_000);
        let range_refs: Vec<&Range> = ranges.iter().collect();
        equity_monte_carlo(&range_refs, &board, sims)
    };

    let time_ms = start.elapsed().as_secs_f64() * 1000.0;

    let players: Vec<PlayerResult> = result
        .players
        .iter()
        .map(|p| PlayerResult {
            equity: (p.equity * 10000.0).round() / 10000.0,
            win_pct: (p.win_pct * 10000.0).round() / 10000.0,
            tie_pct: (p.tie_pct * 10000.0).round() / 10000.0,
        })
        .collect();

    Ok(Json(EquityResponse {
        players,
        total_samples: result.total_samples,
        time_ms: (time_ms * 100.0).round() / 100.0,
    }))
}

// ─── Analysis endpoint ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AnalysisRequest {
    /// Range string, e.g. "66+,A5s+,KTs+,ATo+"
    range: String,
    /// Board cards (3-5), e.g. "AhKd7c"
    board: String,
}

#[derive(Serialize)]
struct AnalysisResponse {
    total_combos: usize,
    categories: Vec<CategoryResult>,
    board: String,
    time_ms: f64,
}

#[derive(Serialize)]
struct CategoryResult {
    name: String,
    name_cn: String,
    count: usize,
    percentage: f64,
}

async fn analyze(
    Json(req): Json<AnalysisRequest>,
) -> Result<Json<AnalysisResponse>, (StatusCode, Json<ErrorResponse>)> {
    let err = |msg: String| {
        (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse { error: msg }),
        )
    };

    let range = Range::parse(&req.range).map_err(|e| err(e))?;

    let board = parse_board_cards(&req.board).map_err(|e| err(e))?;
    if board.len() < 3 || board.len() > 5 {
        return Err(err(format!("Board must have 3-5 cards, got {}", board.len())));
    }

    let start = std::time::Instant::now();
    let result = analyze_range(&range, &board);
    let time_ms = start.elapsed().as_secs_f64() * 1000.0;

    let categories: Vec<CategoryResult> = result
        .categories
        .iter()
        .map(|c| CategoryResult {
            name: c.category.label().to_string(),
            name_cn: c.category.label_cn().to_string(),
            count: c.count,
            percentage: (c.percentage * 100.0).round() / 100.0,
        })
        .collect();

    Ok(Json(AnalysisResponse {
        total_combos: result.total_combos,
        categories,
        board: board.iter().map(|c| format!("{:?}", c)).collect::<Vec<_>>().join(""),
        time_ms: (time_ms * 100.0).round() / 100.0,
    }))
}

fn parse_board_cards(s: &str) -> Result<Vec<Card>, String> {
    let s = s.trim();
    if s.is_empty() {
        return Err("Board is required for analysis".into());
    }
    let mut cards = Vec::new();
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b' ' {
            i += 1;
            continue;
        }
        if i + 1 >= bytes.len() {
            return Err(format!("Incomplete card at position {}", i));
        }
        let card_str = &s[i..i + 2];
        let card = Card::from_str(card_str).ok_or(format!("Invalid card: {}", card_str))?;
        cards.push(card);
        i += 2;
    }
    Ok(cards)
}

// ─── Main ───────────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() {
    let cors = CorsLayer::permissive();

    let app = Router::new()
        .route("/", get(health))
        .route("/api/health", get(health))
        .route("/api/equity", post(calculate_equity))
        .route("/api/analysis", post(analyze))
        .layer(cors);

    let addr = "0.0.0.0:3000";
    println!("Range Zen API listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
