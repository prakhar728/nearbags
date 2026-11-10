//! Hard limits on target weights. Whatever the model proposes, the weights that leave this module obey these rules.
//! Weights are basis points (10,000 = 100%). Pure code, no I/O, so it is unit-tested on the host.

/// The most any limit may be set to by a basket, whatever its settings say.
pub const MAX_ASSETS: usize = 10;
pub const HARD_MAX_WEIGHT: u32 = 8_000; // no single asset over 80%
pub const HARD_MAX_TURNOVER: u32 = 3_000; // at most 30% of the basket changes hands per run

#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub min_weight: u32,
    pub max_weight: u32,
    /// Most an asset's weight may move per run, either way.
    pub max_change: u32,
    /// Most of the basket that may change hands per run: sum of |new - old| / 2.
    pub max_turnover: u32,
}

impl Limits {
    /// Tighten whatever the basket asked for to the hard caps, and make the set feasible for `n` assets.
    pub fn sane(self, n: usize) -> Result<Limits, String> {
        if n == 0 || n > MAX_ASSETS {
            return Err(format!("a basket has 1 to {MAX_ASSETS} assets"));
        }
        let n = n as u32;
        let max_weight = self.max_weight.min(HARD_MAX_WEIGHT).max(10_000_u32.div_ceil(n));
        let min_weight = self.min_weight.min(10_000 / n);
        if min_weight > max_weight {
            return Err("min weight is above max weight".into());
        }
        Ok(Limits { min_weight, max_weight, max_change: self.max_change.min(10_000), max_turnover: self.max_turnover.min(HARD_MAX_TURNOVER) })
    }
}

pub fn turnover(a: &[u32], b: &[u32]) -> u32 {
    a.iter().zip(b).map(|(x, y)| x.abs_diff(*y)).sum::<u32>() / 2
}

/// Clamp `proposed` (any numbers; missing or junk entries keep the current weight) against `current` targets.
/// Returns weights that sum to exactly 10,000, sit inside [min, max], move each asset by at most `max_change`,
/// and change hands at most `max_turnover` in total. If `current` itself breaks the bounds, it is first pulled inside.
pub fn clamp(current: &[u32], proposed: &[f64], limits: Limits) -> Result<Vec<u32>, String> {
    let n = current.len();
    if proposed.len() != n {
        return Err("one proposed weight per asset".into());
    }
    let l = limits.sane(n)?;
    let cur = fit(&current.iter().map(|&w| w as f64).collect::<Vec<_>>(), &vec![l.min_weight as f64; n], &vec![l.max_weight as f64; n]);

    // Each asset's band: inside [min, max] and within max_change of where it is now.
    let lo: Vec<f64> = cur.iter().map(|&c| (c - l.max_change as f64).max(l.min_weight as f64)).collect();
    let hi: Vec<f64> = cur.iter().map(|&c| (c + l.max_change as f64).min(l.max_weight as f64)).collect();
    let want: Vec<f64> = proposed.iter().zip(&cur).map(|(&p, &c)| if p.is_finite() && p >= 0.0 { p } else { c }).collect();
    let scaled = scale_to(&want, 10_000.0);
    let mut next = fit(&scaled, &lo, &hi);

    // Turnover cap: move only part of the way from cur to next. Both sum to 10,000 and sit in the bands, so every
    // point on the line between them does too.
    let t: f64 = cur.iter().zip(&next).map(|(a, b)| (a - b).abs()).sum::<f64>() / 2.0;
    if t > l.max_turnover as f64 {
        let k = l.max_turnover as f64 / t;
        next = cur.iter().zip(&next).map(|(a, b)| a + (b - a) * k).collect();
    }
    Ok(round_to_10000(&next, &lo, &hi))
}

fn scale_to(v: &[f64], total: f64) -> Vec<f64> {
    let s: f64 = v.iter().sum();
    if s <= 0.0 {
        return vec![total / v.len() as f64; v.len()];
    }
    v.iter().map(|x| x * total / s).collect()
}

/// Closest vector to `v` (summing to 10,000) inside per-asset [lo, hi]: clip, then spread the remainder over the
/// assets that still have room, repeatedly.
fn fit(v: &[f64], lo: &[f64], hi: &[f64]) -> Vec<f64> {
    let mut x: Vec<f64> = v.iter().zip(lo.iter().zip(hi)).map(|(&a, (&l, &h))| a.clamp(l, h)).collect();
    for _ in 0..64 {
        let gap = 10_000.0 - x.iter().sum::<f64>();
        if gap.abs() < 1e-9 {
            break;
        }
        let room: Vec<f64> = x.iter().zip(lo.iter().zip(hi)).map(|(&a, (&l, &h))| if gap > 0.0 { h - a } else { a - l }).collect();
        let total: f64 = room.iter().sum();
        if total <= 1e-12 {
            break;
        }
        let k = (gap.abs() / total).min(1.0);
        for (a, r) in x.iter_mut().zip(&room) {
            *a += r * k * gap.signum();
        }
    }
    x
}

/// Whole basis points summing to exactly 10,000, each inside [lo, hi] (largest-remainder rounding).
fn round_to_10000(x: &[f64], lo: &[f64], hi: &[f64]) -> Vec<u32> {
    let mut out: Vec<u32> = x.iter().map(|v| v.floor().max(0.0) as u32).collect();
    let mut short = 10_000_i64 - out.iter().map(|&v| v as i64).sum::<i64>();
    let mut order: Vec<usize> = (0..x.len()).collect();
    order.sort_by(|&a, &b| (x[b] - x[b].floor()).total_cmp(&(x[a] - x[a].floor())));
    for &i in order.iter().cycle().take(order.len() * 4) {
        if short <= 0 {
            break;
        }
        if (out[i] as f64) + 1.0 <= hi[i] + 1e-9 {
            out[i] += 1;
            short -= 1;
        }
    }
    let _ = lo;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const L: Limits = Limits { min_weight: 500, max_weight: 6_000, max_change: 1_500, max_turnover: 2_000 };

    fn check(cur: &[u32], out: &[u32], l: Limits) {
        let l = l.sane(cur.len()).unwrap();
        assert_eq!(out.iter().sum::<u32>(), 10_000, "{out:?}");
        for (&o, &c) in out.iter().zip(cur) {
            assert!(o >= l.min_weight && o <= l.max_weight, "{out:?}");
            assert!(o.abs_diff(c) <= l.max_change + 1, "{out:?} vs {cur:?}");
        }
        assert!(turnover(cur, out) <= l.max_turnover + 1, "{out:?}");
    }

    #[test]
    fn keeps_a_reasonable_proposal() {
        let cur = [5_000, 5_000];
        let out = clamp(&cur, &[4_000.0, 6_000.0], L).unwrap();
        assert_eq!(out, vec![4_000, 6_000]);
    }

    #[test]
    fn caps_an_all_in_bet() {
        let cur = [2_500, 2_500, 2_500, 2_500];
        let out = clamp(&cur, &[100.0, 0.0, 0.0, 0.0], L).unwrap();
        check(&cur, &out, L);
        assert!(out[0] > out[1]);
    }

    #[test]
    fn ignores_junk_and_scales() {
        let cur = [3_000, 3_000, 4_000];
        let out = clamp(&cur, &[f64::NAN, -5.0, 1.0], L).unwrap();
        check(&cur, &out, L);
    }

    #[test]
    fn hard_caps_beat_basket_settings() {
        let loose = Limits { min_weight: 0, max_weight: 10_000, max_change: 10_000, max_turnover: 10_000 };
        let cur = [5_000, 5_000];
        let out = clamp(&cur, &[1.0, 0.0], loose).unwrap();
        assert!(out[0] <= HARD_MAX_WEIGHT);
        assert!(turnover(&cur, &out) <= HARD_MAX_TURNOVER);
        check(&cur, &out, loose);
    }

    #[test]
    fn pulls_a_bad_current_inside() {
        let cur = [9_500, 500];
        let out = clamp(&cur, &[9_500.0, 500.0], L).unwrap();
        assert_eq!(out.iter().sum::<u32>(), 10_000);
        assert!(out[0] <= 6_000);
    }

    #[test]
    fn rejects_bad_shapes() {
        assert!(clamp(&[10_000], &[1.0, 2.0], L).is_err());
        assert!(clamp(&[], &[], L).is_err());
    }
}
