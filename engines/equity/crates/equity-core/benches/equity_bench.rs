use std::time::Instant;
use equity_core::card::Card;
use equity_core::eval::{evaluate_5cards, evaluate_7cards, evaluate_7cards_bruteforce};
use equity_core::equity::{equity_exact_hands, equity_monte_carlo, Board};
use equity_core::range::{Combo, Range};

fn bench_eval_5cards(iterations: u64) -> f64 {
    let cards = [
        Card::from_str("Ah").unwrap(),
        Card::from_str("Kh").unwrap(),
        Card::from_str("Qh").unwrap(),
        Card::from_str("Jh").unwrap(),
        Card::from_str("9d").unwrap(),
    ];
    let start = Instant::now();
    for _ in 0..iterations {
        std::hint::black_box(evaluate_5cards(cards));
    }
    let elapsed = start.elapsed();
    let ns_per_eval = elapsed.as_nanos() as f64 / iterations as f64;
    let evals_per_sec = 1_000_000_000.0 / ns_per_eval;
    println!("  5-card eval: {:.1} ns/eval, {:.2}M evals/sec ({} iterations)",
        ns_per_eval, evals_per_sec / 1_000_000.0, iterations);
    evals_per_sec
}

fn bench_eval_7cards(iterations: u64) -> f64 {
    let cards = [
        Card::from_str("Ah").unwrap(),
        Card::from_str("Kh").unwrap(),
        Card::from_str("Td").unwrap(),
        Card::from_str("9c").unwrap(),
        Card::from_str("5s").unwrap(),
        Card::from_str("3h").unwrap(),
        Card::from_str("2d").unwrap(),
    ];
    let start = Instant::now();
    for _ in 0..iterations {
        std::hint::black_box(evaluate_7cards(cards));
    }
    let elapsed = start.elapsed();
    let ns_per_eval = elapsed.as_nanos() as f64 / iterations as f64;
    let evals_per_sec = 1_000_000_000.0 / ns_per_eval;
    println!("  7-card eval: {:.1} ns/eval, {:.2}M evals/sec ({} iterations)",
        ns_per_eval, evals_per_sec / 1_000_000.0, iterations);
    evals_per_sec
}

fn bench_exact_hands(label: &str, h1: &str, h2: &str, board_str: &str) -> (f64, f64, u64) {
    let hand1 = Combo(
        Card::from_str(&h1[0..2]).unwrap(),
        Card::from_str(&h1[2..4]).unwrap(),
    );
    let hand2 = Combo(
        Card::from_str(&h2[0..2]).unwrap(),
        Card::from_str(&h2[2..4]).unwrap(),
    );
    let board = Board::parse(board_str).unwrap();

    let start = Instant::now();
    let result = equity_exact_hands(hand1, hand2, &board);
    let elapsed = start.elapsed();

    let ms = elapsed.as_secs_f64() * 1000.0;
    let eq1 = result.players[0].equity;
    let eq2 = result.players[1].equity;
    let samples = result.total_samples;

    println!("  {}: {:.2}% vs {:.2}% ({} boards, {:.1}ms)",
        label, eq1 * 100.0, eq2 * 100.0, samples, ms);
    (eq1, ms, samples)
}

fn bench_monte_carlo(label: &str, r1_str: &str, r2_str: &str, board_str: &str, n: u64) -> (f64, f64) {
    let r1 = Range::parse(r1_str).unwrap();
    let r2 = Range::parse(r2_str).unwrap();
    let board = Board::parse(board_str).unwrap();

    let start = Instant::now();
    let result = equity_monte_carlo(&[&r1, &r2], &board, n);
    let elapsed = start.elapsed();

    let ms = elapsed.as_secs_f64() * 1000.0;
    let eq1 = result.players[0].equity;
    let effective = result.total_samples;
    let rate = effective as f64 / elapsed.as_secs_f64();

    println!("  {} (n={}): {:.2}% vs {:.2}% ({:.1}ms, {:.0} effective sims, {:.0} sims/sec)",
        label, n, eq1 * 100.0, result.players[1].equity * 100.0, ms, effective as f64, rate);
    (eq1, ms)
}

fn main() {
    println!("========================================");
    println!(" Equity Engine Performance Benchmark");
    println!("========================================");
    println!();

    // --- 1. Raw evaluation speed ---
    println!("[1] Hand Evaluation Speed");
    println!("─────────────────────────");
    bench_eval_5cards(10_000_000);
    bench_eval_7cards(5_000_000);

    // Benchmark old brute-force for comparison
    let cards_bf = [
        Card::from_str("Ah").unwrap(),
        Card::from_str("Kh").unwrap(),
        Card::from_str("Td").unwrap(),
        Card::from_str("9c").unwrap(),
        Card::from_str("5s").unwrap(),
        Card::from_str("3h").unwrap(),
        Card::from_str("2d").unwrap(),
    ];
    let bf_iters = 1_000_000u64;
    let start = std::time::Instant::now();
    for _ in 0..bf_iters {
        std::hint::black_box(evaluate_7cards_bruteforce(cards_bf));
    }
    let elapsed = start.elapsed();
    let ns_bf = elapsed.as_nanos() as f64 / bf_iters as f64;
    let rate_bf = 1_000_000_000.0 / ns_bf;
    println!("  7-card BRUTE FORCE (old): {:.1} ns/eval, {:.2}M evals/sec ({} iterations)", ns_bf, rate_bf / 1_000_000.0, bf_iters);
    println!();

    // --- 2. Exact hand vs hand ---
    println!("[2] Exact Hand vs Hand (exhaustive enumeration)");
    println!("────────────────────────────────────────────────");
    bench_exact_hands("AA vs KK preflop", "AhAd", "KhKd", "");
    bench_exact_hands("AKs vs QQ preflop", "AhKh", "QsQd", "");
    bench_exact_hands("AKo vs 22 preflop", "AhKd", "2s2c", "");
    bench_exact_hands("AA vs KK on flop", "AhAd", "KhKd", "Ts 9c 3d");
    bench_exact_hands("AA vs KK on turn", "AhAd", "KhKd", "Ts 9c 3d 7h");
    bench_exact_hands("AA vs KK on river", "AhAd", "KhKd", "Ts 9c 3d 7h 2s");
    println!();

    // --- 3. Monte Carlo range vs range ---
    println!("[3] Monte Carlo Range vs Range");
    println!("──────────────────────────────");
    for &n in &[10_000u64, 50_000, 100_000, 500_000, 1_000_000] {
        bench_monte_carlo("AA vs KK", "AA", "KK", "", n);
    }
    println!();

    println!("  --- Varying range widths (n=500,000) ---");
    bench_monte_carlo("5% vs 10%",
        "TT+,AJs+,AKo,AQo",
        "88+,A9s+,KJs+,KQs,ATo+,KQo",
        "", 500_000);
    bench_monte_carlo("15% vs 30%",
        "66+,A5s+,KTs+,QJs,T9s,98s,ATo+,KJo+,QJo",
        "22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo",
        "", 500_000);
    bench_monte_carlo("30% vs 50%",
        "22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo",
        "22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,76s,65s,54s,A2o+,K3o+,Q7o+,J7o+,T8o+,98o",
        "", 500_000);
    println!();

    println!("  --- With board cards (n=500,000) ---");
    bench_monte_carlo("15% vs 30% flop AhKd7c",
        "66+,A5s+,KTs+,QJs,T9s,98s,ATo+,KJo+,QJo",
        "22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo",
        "AhKd7c", 500_000);
    bench_monte_carlo("15% vs 30% flop 7h8h9h",
        "66+,A5s+,KTs+,QJs,T9s,98s,ATo+,KJo+,QJo",
        "22+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,A5o+,K9o+,QTo+,JTo",
        "7h8h9h", 500_000);
    println!();

    // --- 4. Memory usage estimate ---
    println!("[4] Memory Usage");
    println!("────────────────");
    let r_big = Range::parse("22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,76s,65s,54s,A2o+,K3o+,Q7o+,J7o+,T8o+,98o").unwrap();
    let combo_size = std::mem::size_of::<(equity_core::range::Combo, f64)>();
    println!("  sizeof(Combo, f64) = {} bytes", combo_size);
    println!("  50% range ({} combos) = {} bytes", r_big.combo_count(), r_big.combo_count() * combo_size);
    println!("  sizeof(Card) = {} bytes", std::mem::size_of::<equity_core::card::Card>());
    println!("  sizeof(CardSet) = {} bytes", std::mem::size_of::<equity_core::card::CardSet>());
    println!("  sizeof(HandValue) = {} bytes", std::mem::size_of::<equity_core::eval::HandValue>());

    println!();
    println!("========================================");
    println!(" Benchmark complete");
    println!("========================================");
}
