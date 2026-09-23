export const NEUTRAL_KELVIN = 6500;
const MIN_KELVIN = 1667;
const MAX_SEARCH_KELVIN = 10000;
const SEARCH_STEP_KELVIN = 10;

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function planckianChromaticity(kelvin) {
  const t = Math.min(25000, Math.max(MIN_KELVIN, kelvin));
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  let y;
  if (t <= 2222) y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  else if (t <= 4000) y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  else y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return { x, y };
}

export function blackbodyColor(kelvin) {
  const { x, y } = planckianChromaticity(kelvin);
  const X = x / y;
  const Z = (1 - x - y) / y;
  const linear = [
    3.2406 * X - 1.5372 - 0.4986 * Z,
    -0.9689 * X + 1.8758 + 0.0415 * Z,
    0.0557 * X - 0.204 + 1.057 * Z,
  ];
  const peak = Math.max(...linear);
  const [r, g, b] = linear.map((c) => Math.round(toGamma(Math.max(0, c / peak)) * 255));
  return { r, g, b };
}

export function interpolateKelvin(fromKelvin, toKelvin, t) {
  const mired = 1e6 / fromKelvin + (1e6 / toKelvin - 1e6 / fromKelvin) * t;
  return 1e6 / mired;
}

export function effectiveWhitePoint({ r, g, b, alpha }) {
  return [r, g, b].map((channel) => 1 - alpha + alpha * (channel / 255));
}

function toUv([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLinear);
  const X = 0.4124 * R + 0.3576 * G + 0.1805 * B;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = 0.0193 * R + 0.1192 * G + 0.9505 * B;
  const denominator = X + 15 * Y + 3 * Z;
  return [(4 * X) / denominator, (6 * Y) / denominator];
}

function chromaticityToUv({ x, y }) {
  const denominator = -2 * x + 12 * y + 3;
  return [(4 * x) / denominator, (6 * y) / denominator];
}

export function correlatedColorTemperature(whitePoint) {
  const [u, v] = toUv(whitePoint);
  let best = { kelvin: MIN_KELVIN, distance: Infinity, sign: 1 };
  for (let kelvin = MIN_KELVIN; kelvin <= MAX_SEARCH_KELVIN; kelvin += SEARCH_STEP_KELVIN) {
    const [pu, pv] = chromaticityToUv(planckianChromaticity(kelvin));
    const distance = Math.hypot(u - pu, v - pv);
    if (distance < best.distance) best = { kelvin, distance, sign: Math.sign(v - pv) || 1 };
  }
  return { kelvin: best.kelvin, duv: best.distance * best.sign };
}

export function estimateColorTemperature(overlay) {
  if (overlay.alpha <= 0) return NEUTRAL_KELVIN;
  const { kelvin } = correlatedColorTemperature(effectiveWhitePoint(overlay));
  return Math.round(Math.min(NEUTRAL_KELVIN, kelvin) / 100) * 100;
}
