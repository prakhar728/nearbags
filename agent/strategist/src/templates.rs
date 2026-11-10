//! Rule-based strategies a creator can pick instead of writing a prompt. Each one turns the basket's starting
//! weights and price history into proposed weights; the hard limits in policy.rs still apply afterwards.
//! Pure code, no I/O, unit-tested on the host. The evidence behind each rule is summarised in docs/agent.md.
//!
//! Price history arrives as daily closes on a calendar-day grid (stocks carried over weekends and holidays),
//! oldest first, so every asset's series lines up and volatility annualises with √365 for all of them.

/// One asset as a template sees it.
pub struct Series<'a> {
    pub id: &'a str,
    /// "stock" | "etf" | "crypto" | "stable"
    pub kind: &'a str,
    pub closes: &'a [f64],
    /// The asset's starting weight, set by the creator (basis points).
    pub base: f64,
    /// The basket's current target (basis points).
    pub current: f64,
}

impl Series<'_> {
    fn stable(&self) -> bool {
        self.kind == "stable"
    }
    fn market(&self) -> bool {
        self.kind == "stock" || self.kind == "etf"
    }
}

#[cfg(test)]
pub const IDS: [&str; 6] = ["fixed", "equal", "risk", "trend", "voltarget", "momentum"];

/// Templates that recompute monthly; on other days they keep the current targets.
pub fn monthly(id: &str) -> bool {
    id == "risk" || id == "momentum"
}

/// Proposed weights (basis points, any scale) and a one-sentence reason.
pub fn propose(id: &str, a: &[Series], due: bool) -> Result<(Vec<f64>, String), String> {
    if a.is_empty() {
        return Err("no assets".into());
    }
    let keep = || a.iter().map(|s| s.current).collect::<Vec<_>>();
    if monthly(id) && !due {
        return Ok((keep(), format!("{}: kept the targets until this month's recompute.", name(id))));
    }
    match id {
        "fixed" => Ok((a.iter().map(|s| s.base).collect(), "Fixed Mix: back to the creator's weights.".into())),
        "equal" => Ok((vec![10_000.0 / a.len() as f64; a.len()], "Equal Weight: every asset gets the same share.".into())),
        "risk" => Ok(risk_balanced(a)),
        "trend" => Ok(trend_guard(a)),
        "voltarget" => Ok(vol_target(a)),
        "momentum" => Ok(momentum(a)),
        other => Err(format!("unknown template {other:?}")),
    }
}

pub fn name(id: &str) -> &'static str {
    match id {
        "fixed" => "Fixed Mix",
        "equal" => "Equal Weight",
        "risk" => "Risk Balanced",
        "trend" => "Trend Guard",
        "voltarget" => "Volatility Target",
        "momentum" => "Momentum Tilt",
        _ => "Template",
    }
}

// ---------- the templates ----------

/// Weights ∝ 1/volatility (90 days, EWMA half-life 30) for risky assets; cash keeps its starting share.
/// Half way from the current targets to the new ones, so one noisy month can't swing the basket.
fn risk_balanced(a: &[Series]) -> (Vec<f64>, String) {
    let risky_share: f64 = a.iter().filter(|s| !s.stable()).map(|s| s.base).sum();
    let inv: Vec<Option<f64>> = a.iter().map(|s| if s.stable() { None } else { ewma_vol(s.closes, 90, 30.0).filter(|v| *v > 0.01).map(|v| 1.0 / v) }).collect();
    let inv_sum: f64 = inv.iter().flatten().sum();
    // Assets without enough history keep their starting weight; the rest share what's left by inverse volatility.
    let fixed: f64 = a.iter().zip(&inv).filter(|(s, v)| !s.stable() && v.is_none()).map(|(s, _)| s.base).sum();
    let out: Vec<f64> = a
        .iter()
        .zip(&inv)
        .map(|(s, v)| match v {
            _ if s.stable() => s.base,
            Some(x) if inv_sum > 0.0 => 0.5 * (risky_share - fixed) * x / inv_sum + 0.5 * s.current,
            _ => s.base,
        })
        .collect();
    let calmest = a.iter().zip(&inv).filter_map(|(s, v)| v.map(|x| (s.id, x))).max_by(|x, y| x.1.total_cmp(&y.1));
    let reason = match calmest {
        Some((id, _)) => format!("Risk Balanced: steadier assets get more; {id} has been the calmest over 90 days."),
        None => "Risk Balanced: not enough history yet, so the starting weights stay.".into(),
    };
    (out, reason)
}

/// An asset stays in while its price is above its moving average (100 days for crypto, about 200 trading days for
/// stocks), with a 3% buffer either side so it doesn't flip back and forth. An asset that's out moves to cash.
fn trend_guard(a: &[Series]) -> (Vec<f64>, String) {
    let mut off: Vec<&str> = vec![];
    let mut freed = 0.0;
    let mut out: Vec<f64> = a.iter().map(|s| s.base).collect();
    for (i, s) in a.iter().enumerate() {
        if s.stable() {
            continue;
        }
        let n = if s.market() { 290 } else { 100 };
        let (Some(avg), Some(&p)) = (sma(s.closes, n), s.closes.last()) else { continue };
        // Was it out last time? Its target sat well under its starting weight.
        let was_off = s.current < 0.5 * s.base;
        let is_off = if p < avg * 0.97 { true } else if p > avg * 1.03 { false } else { was_off };
        if is_off {
            off.push(s.id);
            freed += out[i];
            out[i] = 0.0;
        }
    }
    let cash: Vec<usize> = (0..a.len()).filter(|&i| a[i].stable()).collect();
    if freed > 0.0 {
        if cash.is_empty() {
            spread(&mut out, freed, |i| !a[i].stable() && out_is_on(&off, a[i].id));
        } else {
            spread(&mut out, freed, |i| a[i].stable());
        }
    }
    let reason = if off.is_empty() {
        "Trend Guard: every asset is above its moving average, so all stay in.".to_string()
    } else {
        format!("Trend Guard: {} fell below the moving average, so {} moved to cash.", off.join(", "), if off.len() == 1 { "its share" } else { "their shares" })
    };
    (out, reason)
}

fn out_is_on(off: &[&str], id: &str) -> bool {
    !off.contains(&id)
}

/// Hold less of the risky assets when the basket has been swinging hard: exposure = target vol / recent vol,
/// between 20% and 100%. The rest sits in cash. Exposure only changes when it moves by more than 10 points.
fn vol_target(a: &[Series]) -> (Vec<f64>, String) {
    let base_risky: f64 = a.iter().filter(|s| !s.stable()).map(|s| s.base).sum();
    if base_risky <= 0.0 || !a.iter().any(|s| s.stable()) {
        return (a.iter().map(|s| s.base).collect(), "Volatility Target needs cash (USDC) in the basket; kept the starting weights.".into());
    }
    let target = if a.iter().any(|s| s.kind == "crypto") { 0.40 } else { 0.15 };
    let weights: Vec<f64> = a.iter().map(|s| if s.stable() { 0.0 } else { s.base / base_risky }).collect();
    let Some(vol) = portfolio_vol(a, &weights, 30, 10.0) else {
        return (a.iter().map(|s| s.base).collect(), "Volatility Target: not enough history yet, so the starting weights stay.".into());
    };
    let wanted = (target / vol).clamp(0.2, 1.0);
    let now = a.iter().filter(|s| !s.stable()).map(|s| s.current).sum::<f64>() / base_risky;
    let exposure = if (wanted - now).abs() > 0.10 { wanted } else { now.clamp(0.2, 1.0) };
    let risky_total = exposure * base_risky;
    let cash_n = a.iter().filter(|s| s.stable()).count() as f64;
    let out = a.iter().map(|s| if s.stable() { (10_000.0 - risky_total) / cash_n } else { exposure * s.base }).collect();
    (out, format!("Volatility Target: the basket swung about {:.0}% a year lately, so it holds {:.0}% in the risky assets.", vol * 100.0, exposure * 100.0))
}

/// Lean toward what has risen most for its risk over 30 and 90 days (each return divided by volatility), at most
/// half again or half less than the starting weight. Anything down over 90 days goes to cash if there is cash.
fn momentum(a: &[Series]) -> (Vec<f64>, String) {
    let scores: Vec<Option<f64>> = a
        .iter()
        .map(|s| {
            if s.stable() {
                return None;
            }
            let v = ewma_vol(s.closes, 90, 30.0)?.max(0.05);
            Some(0.5 * ret(s.closes, 30)? / v + 0.5 * ret(s.closes, 90)? / v)
        })
        .collect();
    let have: Vec<f64> = scores.iter().flatten().copied().collect();
    if have.len() < 2 {
        return (a.iter().map(|s| s.base).collect(), "Momentum Tilt: not enough history yet, so the starting weights stay.".into());
    }
    let mean = have.iter().sum::<f64>() / have.len() as f64;
    let sd = (have.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / have.len() as f64).sqrt().max(1e-9);
    let has_cash = a.iter().any(|s| s.stable());
    let risky_share: f64 = a.iter().filter(|s| !s.stable()).map(|s| s.base).sum();
    let mut out: Vec<f64> = a.iter().zip(&scores).map(|(s, z)| match z {
        Some(x) => s.base * (1.0 + 0.3 * (x - mean) / sd).clamp(0.5, 1.5),
        None => s.base,
    }).collect();
    let mut dropped = vec![];
    if has_cash {
        for (i, s) in a.iter().enumerate() {
            if !s.stable() && ret(s.closes, 90).is_some_and(|r| r < 0.0) {
                dropped.push(s.id);
                out[i] = 0.0;
            }
        }
    }
    // Keep the risky assets' total share where it started, less whatever was dropped to cash.
    let kept_base: f64 = a.iter().zip(&out).filter(|(s, w)| !s.stable() && **w > 0.0).map(|(s, _)| s.base).sum();
    let tilted: f64 = a.iter().zip(&out).filter(|(s, _)| !s.stable()).map(|(_, w)| w).sum();
    if tilted > 0.0 {
        for (s, w) in a.iter().zip(out.iter_mut()) {
            if !s.stable() {
                *w *= kept_base / tilted;
            }
        }
    }
    let to_cash = risky_share - kept_base;
    let cash_n = a.iter().filter(|s| s.stable()).count() as f64;
    for (s, w) in a.iter().zip(out.iter_mut()) {
        if s.stable() {
            *w += to_cash / cash_n;
        }
    }
    let best = a.iter().zip(&scores).filter_map(|(s, z)| z.map(|x| (s.id, x))).max_by(|x, y| x.1.total_cmp(&y.1)).map(|x| x.0).unwrap_or("");
    let mut reason = format!("Momentum Tilt: leaning toward {best}, the strongest over 30 and 90 days for its risk.");
    if !dropped.is_empty() {
        reason.push_str(&format!(" {} is down over 90 days, so it moved to cash.", dropped.join(", ")));
    }
    (out, reason)
}

// ---------- maths ----------

/// Add `amount` to the entries chosen by `pick`, split by their current size (evenly if they're all zero).
fn spread(out: &mut [f64], amount: f64, pick: impl Fn(usize) -> bool) {
    let idx: Vec<usize> = (0..out.len()).filter(|&i| pick(i)).collect();
    if idx.is_empty() {
        return;
    }
    let total: f64 = idx.iter().map(|&i| out[i]).sum();
    for &i in &idx {
        out[i] += if total > 0.0 { amount * out[i] / total } else { amount / idx.len() as f64 };
    }
}

fn log_returns(c: &[f64]) -> Vec<f64> {
    c.windows(2).filter(|w| w[0] > 0.0 && w[1] > 0.0).map(|w| (w[1] / w[0]).ln()).collect()
}

/// Annualised volatility of the last `days` daily returns, weighting recent days more (half-life in days).
pub fn ewma_vol(closes: &[f64], days: usize, half_life: f64) -> Option<f64> {
    let r = log_returns(closes);
    if r.len() < days.min(20) {
        return None;
    }
    let r = &r[r.len().saturating_sub(days)..];
    let lambda = 0.5_f64.powf(1.0 / half_life);
    let (mut num, mut den) = (0.0, 0.0);
    for (k, x) in r.iter().rev().enumerate() {
        let w = lambda.powi(k as i32);
        num += w * x * x;
        den += w;
    }
    Some((num / den * 365.0).sqrt())
}

fn portfolio_vol(a: &[Series], w: &[f64], days: usize, half_life: f64) -> Option<f64> {
    let rets: Vec<Vec<f64>> = a.iter().map(|s| log_returns(s.closes)).collect();
    let n = rets.iter().zip(w).filter(|(_, &x)| x > 0.0).map(|(r, _)| r.len()).min()?;
    if n < 20 {
        return None;
    }
    let len = n.min(days);
    let series: Vec<f64> = (0..len)
        .map(|k| rets.iter().zip(w).filter(|(_, &x)| x > 0.0).map(|(r, x)| x * r[r.len() - len + k]).sum())
        .collect();
    // The series is already returns; turn it back into prices so ewma_vol can read it.
    let mut px = vec![1.0];
    for r in series {
        px.push(px.last().unwrap() * r.exp());
    }
    ewma_vol(&px, days, half_life)
}

pub fn sma(closes: &[f64], n: usize) -> Option<f64> {
    if closes.len() < n || n == 0 {
        return None;
    }
    Some(closes[closes.len() - n..].iter().sum::<f64>() / n as f64)
}

/// Return over the last `days` calendar days.
pub fn ret(closes: &[f64], days: usize) -> Option<f64> {
    let last = *closes.last()?;
    let then = *closes.get(closes.len().checked_sub(days + 1)?)?;
    (then > 0.0).then(|| last / then - 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn walk(start: f64, daily: f64, n: usize, wiggle: f64) -> Vec<f64> {
        (0..n).map(|i| start * (1.0 + daily).powi(i as i32) * (1.0 + if i % 2 == 0 { wiggle } else { -wiggle })).collect()
    }

    fn s<'a>(id: &'a str, kind: &'a str, c: &'a [f64], base: f64) -> Series<'a> {
        Series { id, kind, closes: c, base, current: base }
    }

    #[test]
    fn equal_and_fixed() {
        let c = walk(100.0, 0.0, 120, 0.01);
        let a = [s("BTC", "crypto", &c, 7_000.0), s("ETH", "crypto", &c, 3_000.0)];
        assert_eq!(propose("fixed", &a, true).unwrap().0, vec![7_000.0, 3_000.0]);
        assert_eq!(propose("equal", &a, true).unwrap().0, vec![5_000.0, 5_000.0]);
    }

    #[test]
    fn risk_balanced_favours_the_calm_asset() {
        let calm = walk(100.0, 0.0, 120, 0.005);
        let wild = walk(100.0, 0.0, 120, 0.04);
        let a = [s("BTC", "crypto", &calm, 5_000.0), s("DOGE", "crypto", &wild, 5_000.0)];
        let (w, _) = propose("risk", &a, true).unwrap();
        assert!(w[0] > w[1], "{w:?}");
        assert!((w.iter().sum::<f64>() - 10_000.0).abs() < 1.0);
    }

    #[test]
    fn monthly_templates_wait() {
        let c = walk(100.0, 0.0, 120, 0.01);
        let mut a = [s("BTC", "crypto", &c, 5_000.0), s("ETH", "crypto", &c, 5_000.0)];
        a[0].current = 6_000.0;
        a[1].current = 4_000.0;
        assert_eq!(propose("risk", &a, false).unwrap().0, vec![6_000.0, 4_000.0]);
    }

    #[test]
    fn trend_guard_moves_a_falling_asset_to_cash() {
        let up = walk(100.0, 0.003, 150, 0.0);
        let down = walk(100.0, -0.004, 150, 0.0);
        let cash = vec![1.0; 150];
        let a = [s("BTC", "crypto", &up, 4_000.0), s("ETH", "crypto", &down, 4_000.0), s("USDC", "stable", &cash, 2_000.0)];
        let (w, why) = propose("trend", &a, true).unwrap();
        assert_eq!(w, vec![4_000.0, 0.0, 6_000.0]);
        assert!(why.contains("ETH"));
    }

    #[test]
    fn trend_guard_buffer_keeps_state() {
        // Price ends 1% under its average: inside the 3% buffer, so it keeps whatever it was.
        let mut flat = vec![100.0; 150];
        *flat.last_mut().unwrap() = 99.0;
        let cash = vec![1.0; 150];
        let mut a = [s("BTC", "crypto", &flat, 8_000.0), s("USDC", "stable", &cash, 2_000.0)];
        assert_eq!(propose("trend", &a, true).unwrap().0[0], 8_000.0);
        a[0].current = 500.0; // was out
        assert_eq!(propose("trend", &a, true).unwrap().0[0], 0.0);
    }

    #[test]
    fn vol_target_cuts_exposure_when_wild() {
        let wild = walk(100.0, 0.0, 120, 0.06);
        let cash = vec![1.0; 120];
        let a = [s("SOL", "crypto", &wild, 8_000.0), s("USDC", "stable", &cash, 2_000.0)];
        let (w, _) = propose("voltarget", &a, true).unwrap();
        assert!(w[0] < 8_000.0 && w[0] >= 0.2 * 8_000.0 - 1.0, "{w:?}");
        assert!((w.iter().sum::<f64>() - 10_000.0).abs() < 1.0);
        // Without cash it keeps the starting weights.
        let b = [s("SOL", "crypto", &wild, 5_000.0), s("ETH", "crypto", &wild, 5_000.0)];
        assert_eq!(propose("voltarget", &b, true).unwrap().0, vec![5_000.0, 5_000.0]);
    }

    #[test]
    fn momentum_leans_to_the_winner_and_drops_losers_to_cash() {
        let up = walk(100.0, 0.004, 120, 0.01);
        let flat = walk(100.0, 0.0005, 120, 0.01);
        let down = walk(100.0, -0.003, 120, 0.01);
        let cash = vec![1.0; 120];
        let a = [s("SOL", "crypto", &up, 3_000.0), s("ETH", "crypto", &flat, 3_000.0), s("DOGE", "crypto", &down, 2_000.0), s("USDC", "stable", &cash, 2_000.0)];
        let (w, why) = propose("momentum", &a, true).unwrap();
        assert!(w[0] > w[1], "{w:?}");
        assert_eq!(w[2], 0.0);
        assert!((w.iter().sum::<f64>() - 10_000.0).abs() < 1.0, "{w:?}");
        assert!(why.contains("DOGE"));
    }

    #[test]
    fn short_history_is_safe() {
        let c = vec![100.0, 101.0];
        let a = [s("BTC", "crypto", &c, 5_000.0), s("ETH", "crypto", &c, 5_000.0)];
        for id in IDS {
            let (w, _) = propose(id, &a, true).unwrap();
            assert_eq!(w.len(), 2);
            assert!(w.iter().all(|x| x.is_finite()));
        }
    }
}
