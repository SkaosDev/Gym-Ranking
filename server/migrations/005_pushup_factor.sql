-- Push-up bodyweight share: 0.64, the force-plate figure for a standard
-- push-up (Ebben et al. 2011, J Strength Cond Res 25(10):2891). The earlier
-- 0.70 was the top-position value from Suprak et al. 2011. The push-up
-- standards are scored against the same factor, so it matters mostly for
-- how much an added plate is worth.

UPDATE exercises SET bw_factor = 0.64 WHERE code = 'pushup';
