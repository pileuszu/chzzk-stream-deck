// Exact damped spring integration keeps motion consistent across refresh rates.
export const axis = value => ({ value, velocity: 0 });
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function advance(state, target, dt, frequency = 6, damping = .78, precision = .05) {
    if (!(dt > 0)) return true;
    const w = 2 * Math.PI * frequency, z = clamp(damping, .01, .999);
    const wd = w * Math.sqrt(1 - z * z), decay = Math.exp(-z * w * dt);
    const delta = state.value - target, velocity = state.velocity;
    const sin = Math.sin(wd * dt), cos = Math.cos(wd * dt);
    state.value = target + decay * (delta * cos + (velocity + z * w * delta) / wd * sin);
    state.velocity = decay * (velocity * cos - (z * w * velocity + w * w * delta) / wd * sin);
    const moving = Math.abs(state.value - target) > precision || Math.abs(state.velocity) > precision * 8;
    if (!moving) { state.value = target; state.velocity = 0; }
    return moving;
}
