use clap::Parser;
use equity_core::equity::{equity_exact_hands, equity_monte_carlo, Board};
use equity_core::range::Range;

#[derive(Parser)]
#[command(name = "equity")]
#[command(about = "Texas Hold'em range vs range equity calculator")]
struct Cli {
    /// Player ranges, e.g. "AA,AKs" "QQ-TT,AQo+"
    #[arg(required = true, num_args = 2..)]
    ranges: Vec<String>,

    /// Board cards, e.g. "AhKd2c" or "Ah Kd 2c"
    #[arg(short, long, default_value = "")]
    board: String,

    /// Number of Monte Carlo simulations (0 = exact for 2 hands)
    #[arg(short = 'n', long, default_value = "100000")]
    simulations: u64,

    /// Use exact enumeration for hand vs hand (ignores -n)
    #[arg(short, long)]
    exact: bool,
}

fn main() {
    let cli = Cli::parse();

    let board = match Board::parse(&cli.board) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("Error parsing board: {}", e);
            std::process::exit(1);
        }
    };

    let ranges: Vec<Range> = cli
        .ranges
        .iter()
        .map(|s| Range::parse(s).unwrap_or_else(|e| {
            eprintln!("Error parsing range '{}': {}", s, e);
            std::process::exit(1);
        }))
        .collect();

    println!("Equity Engine - Texas Hold'em Equity Calculator");
    println!("============================================");

    for (i, (range_str, range)) in cli.ranges.iter().zip(ranges.iter()).enumerate() {
        println!("Player {}: {} ({} combos)", i + 1, range_str, range.combo_count());
    }

    if !cli.board.is_empty() {
        println!("Board: {}", board.cards.iter().map(|c| format!("{:?}", c)).collect::<Vec<_>>().join(" "));
    } else {
        println!("Board: (preflop)");
    }
    println!();

    // Check if exact mode with specific hands (single combo each)
    if cli.exact && ranges.len() == 2 && ranges[0].combo_count() == 1 && ranges[1].combo_count() == 1 {
        println!("Mode: Exact enumeration");
        let hand1 = ranges[0].combos[0].0;
        let hand2 = ranges[1].combos[0].0;
        let result = equity_exact_hands(hand1, hand2, &board);
        print_results(&result.players, result.total_samples);
    } else {
        println!("Mode: Monte Carlo ({} simulations)", cli.simulations);
        let range_refs: Vec<&Range> = ranges.iter().collect();
        let result = equity_monte_carlo(&range_refs, &board, cli.simulations);
        print_results(&result.players, result.total_samples);
    }
}

fn print_results(players: &[equity_core::equity::EquityResult], total: u64) {
    println!("--------------------------------------------");
    println!("Results ({} matchups evaluated):", total);
    println!();
    for (i, p) in players.iter().enumerate() {
        println!(
            "  Player {}: Equity {:.2}%  (Win {:.2}% | Tie {:.2}%)",
            i + 1,
            p.equity * 100.0,
            p.win_pct * 100.0,
            p.tie_pct * 100.0,
        );
    }
    println!("--------------------------------------------");
}
