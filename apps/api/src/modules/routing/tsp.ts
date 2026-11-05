/**
 * هستهٔ خالصِ بهینه‌سازی مسیر (TSP) — بدون DB و بدون I/O، پس کاملاً قابل تست است.
 * الگوریتم: نزدیک‌ترین همسایه (nearest neighbour) برای ساختِ تورِ اولیه، سپس
 * بهبودِ 2-opt. فاصله‌ها هاورساین (great-circle) روی مختصاتِ جغرافیایی‌اند؛ برای
 * مسافتِ جاده‌ای واقعی می‌توان بعداً ماتریسِ OSRM/نقشه را جایگزین کرد (رابطهٔ
 * distanceMatrix همان نقطهٔ تزریق است).
 */

export interface RouteStop {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface OptimizeOptions {
  /** نقطهٔ شروع (دپو/انبار). اگر نباشد، از اولین توقف شروع می‌شود (مسیرِ باز). */
  startLat?: number;
  startLng?: number;
  /** سرعت متوسط برای برآورد زمان (کیلومتر/ساعت). پیش‌فرض ۳۰ (شهری). */
  avgSpeedKmh?: number;
  /** زمان خدمت در هر توقف (دقیقه). پیش‌فرض ۵. */
  serviceMinPerStop?: number;
}

export interface SequencedStop extends RouteStop {
  sequence: number; // ۱-based
  leg_distance_km: number; // فاصله از توقفِ قبلی (یا دپو)
  cumulative_distance_km: number;
  eta_min: number; // زمانِ تخمینیِ رسیدن (دقیقه، از شروع)
}

export interface TourResult {
  stops: SequencedStop[];
  total_distance_km: number;
  total_duration_min: number;
  savings_percent: number; // بهبود نسبت به ترتیبِ ورودی
  /** توقف‌هایی که مختصاتِ نامعتبر/ناموجود داشتند و از بهینه‌سازی کنار گذاشته شدند */
  skipped_stops: number;
  /** اگر خروجیِ بهینه‌ساز از ترتیبِ ورودی بدتر بود، ترتیبِ پایه برگردانده شده است */
  baseline_used: boolean;
}

/**
 * سقفِ «صریحِ» تعدادِ توقف‌ها — با env قابلِ تنظیم (پیش‌فرض ۲۰۰).
 *
 * چرا لازم است: حلِ TSP اینجا ماتریسِ فاصلهٔ n×n می‌سازد و سپس 2-opt را تا
 * ۲۰۰ بار روی O(n²) اجرا می‌کند؛ یعنی هزینهٔ آن با n به‌شدت رشد می‌کند. بدونِ سقف،
 * یک درخواستِ معمولی با فهرستِ بزرگِ customer_ids می‌تواند رویدادِ Node را برای
 * چند ثانیه/دقیقه ببندد (سطحِ حملهٔ DoS). سقف هم در DTO (@ArrayMaxSize → ۴۰۰) و
 * هم اینجا (لایهٔ دوم، برای مسیرِ route_id که از DB می‌آید) اعمال می‌شود.
 */
export const MAX_ROUTE_STOPS = (() => {
  const raw = Number(process.env.MAX_ROUTE_STOPS);
  if (!Number.isFinite(raw) || raw < 2) return 200;
  return Math.floor(raw);
})();

export type RouteErrorCode = 'too_many_stops';

/** خطایِ دامنه‌ایِ بهینه‌سازی — در لایهٔ سرویس به ۴۰۰ با کدِ پایدار نگاشت می‌شود. */
export class RouteOptimizationError extends Error {
  constructor(
    readonly code: RouteErrorCode,
    message: string,
    readonly details?: Record<string, number>,
  ) {
    super(message);
    this.name = 'RouteOptimizationError';
  }
}

/**
 * تصمیمِ «خطِ پایه»: اگر تورِ بهینه‌شده از ترتیبِ ورودی بدتر باشد، همان ترتیبِ ورودی
 * برگردانده می‌شود. این تضمین می‌کند بهینه‌ساز هرگز نتیجهٔ بدتری از وضعیتِ موجود ندهد.
 * تلورانسِ ۱e-۹ از مقایسهٔ شناورِ بی‌معنی (و نوسانِ بی‌اثر) جلوگیری می‌کند.
 *
 * به‌صورتِ تابعِ خالص و صادرشده پیاده شده تا مستقیم و قطعی آزمون شود — چون در عمل
 * 2-opt تقریباً همیشه بهتر از ترتیبِ ورودی است و این شاخه به‌ندرت با دادهٔ تصادفی
 * فعال می‌شود (پوششِ تصادفیِ آن اتکاپذیر نیست).
 */
export function shouldUseBaseline(optimizedKm: number, naiveKm: number): boolean {
  return naiveKm > 0 && optimizedKm > naiveKm + 1e-9;
}

/** مختصاتِ معتبر: عددِ متناهی و در بازهٔ جغرافیاییِ ممکن. */
function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

const R_KM = 6371.0088; // شعاع متوسط زمین (کیلومتر)
const rad = (d: number): number => (d * Math.PI) / 180;

/** فاصلهٔ هاورساینِ دو نقطهٔ لات/لانگ بر حسبِ کیلومتر. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface MatrixNode {
  lat: number;
  lng: number;
}

/**
 * ماتریسِ فاصلهٔ متقارن برای گره‌ها (اگر start داده شود، گرهِ ۰ = دپو است و
 * بقیه توقف‌اند). نقطهٔ تزریقِ «فاصله» اینجاست؛ برای مسافتِ جاده‌ای می‌توان این
 * تابع را با یک فراخوانیِ OSRM/نقشه جایگزین کرد بدون تغییرِ بقیهٔ الگوریتم.
 */
export function distanceMatrix(nodes: readonly MatrixNode[]): number[][] {
  const n = nodes.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(nodes[i].lat, nodes[i].lng, nodes[j].lat, nodes[j].lng);
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

/** تورِ اولیه با نزدیک‌ترین همسایه از گرهٔ شروع (معمولاً ۰). مسیرِ باز (بدون بازگشت). */
export function nearestNeighborTour(count: number, dist: number[][], start = 0): number[] {
  const visited = new Array<boolean>(count).fill(false);
  const tour: number[] = [start];
  visited[start] = true;
  let current = start;
  for (let step = 1; step < count; step++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < count; j++) {
      if (!visited[j] && dist[current][j] < bestD) {
        bestD = dist[current][j];
        best = j;
      }
    }
    if (best === -1) break;
    tour.push(best);
    visited[best] = true;
    current = best;
  }
  return tour;
}

/** طولِ یک تورِ باز (مجموعِ یال‌های متوالی؛ بدون بازگشت به شروع). */
export function tourLength(tour: readonly number[], dist: number[][]): number {
  let sum = 0;
  for (let i = 1; i < tour.length; i++) sum += dist[tour[i - 1]][tour[i]];
  return sum;
}

/**
 * بهبودِ 2-opt روی تورِ باز با گرهِ شروعِ ثابت (index ۰ دست‌نخورده می‌ماند تا
 * دپو اول بماند). هر جا معکوس‌کردنِ یک زیربازه طول را کم کند، اعمال می‌شود تا
 * دیگر بهبودی نماند.
 */
export function twoOpt(tour: readonly number[], dist: number[][], maxPasses = 200): number[] {
  let best = tour.slice();
  const fixedStart = best.length > 0 ? best[0] : 0;
  let improved = true;
  let passes = 0;
  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = best.slice();
        // معکوس‌کردنِ بازهٔ [i..k]
        let lo = i;
        let hi = k;
        while (lo < hi) {
          const tmp = candidate[lo];
          candidate[lo] = candidate[hi];
          candidate[hi] = tmp;
          lo++;
          hi--;
        }
        if (tourLength(candidate, dist) + 1e-9 < tourLength(best, dist)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  // گرهٔ شروع باید اول بماند
  if (best.length > 0 && best[0] !== fixedStart) {
    const idx = best.indexOf(fixedStart);
    if (idx > 0) best = [...best.slice(idx), ...best.slice(0, idx)];
  }
  return best;
}

const round = (n: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * حلِ TSP برای توقف‌ها: ساخت ماتریس (با دپوی اختیاری در index ۰)، تورِ نزدیک‌ترین
 * همسایه + بهبودِ 2-opt، و محاسبهٔ مسافت/زمان/درصدِ بهبود نسبت به ترتیبِ ورودی.
 */
export function solveRoute(
  stops: readonly RouteStop[],
  options: OptimizeOptions = {},
): TourResult {
  const avgSpeedKmh = options.avgSpeedKmh && options.avgSpeedKmh > 0 ? options.avgSpeedKmh : 30;
  const serviceMin = options.serviceMinPerStop ?? 5;

  // لایهٔ دومِ سقفِ توقف‌ها (لایهٔ اول @ArrayMaxSize در DTO است). این لایه مسیرِ
  // route_id را هم پوشش می‌دهد که توقف‌هایش از DB خوانده می‌شوند نه از ورودیِ کاربر.
  if (stops.length > MAX_ROUTE_STOPS) {
    throw new RouteOptimizationError(
      'too_many_stops',
      `stop count ${stops.length} exceeds MAX_ROUTE_STOPS (${MAX_ROUTE_STOPS})`,
      { stop_count: stops.length, max_stops: MAX_ROUTE_STOPS },
    );
  }

  // مختصاتِ نامعتبر «کنار گذاشته» می‌شوند نه اینکه خطا بدهند: مشتریِ بدونِ ژئوکد
  // نباید کلِ بهینه‌سازی را از کار بیندازد. اما تعدادشان گزارش می‌شود (skipped_stops).
  const clean: RouteStop[] = [];
  let skipped = 0;
  for (const s of stops) {
    if (isValidCoordinate(s.lat, s.lng)) clean.push(s);
    else skipped += 1;
  }

  if (clean.length === 0) {
    return {
      stops: [],
      total_distance_km: 0,
      total_duration_min: 0,
      savings_percent: 0,
      skipped_stops: skipped,
      baseline_used: false,
    };
  }
  if (clean.length === 1) {
    const only = clean[0];
    return {
      stops: [
        { ...only, sequence: 1, leg_distance_km: 0, cumulative_distance_km: 0, eta_min: 0 },
      ],
      total_distance_km: 0,
      total_duration_min: round(serviceMin, 2),
      savings_percent: 0,
      skipped_stops: skipped,
      baseline_used: false,
    };
  }

  const hasDepot =
    Number.isFinite(options.startLat as number) && Number.isFinite(options.startLng as number);
  const nodes: MatrixNode[] = hasDepot
    ? [{ lat: options.startLat as number, lng: options.startLng as number }, ...clean]
    : [...clean];

  const dist = distanceMatrix(nodes);
  const nn = nearestNeighborTour(nodes.length, dist, 0);
  const optimized = twoOpt(nn, dist);

  // نگاشتِ اندیسِ گره → توقف (اگر دپو داشته باشیم، گره ۰ = دپو و گره i>0 = clean[i-1])
  const nodeToStop = (nodeIdx: number): RouteStop | null =>
    hasDepot ? (nodeIdx === 0 ? null : clean[nodeIdx - 1]) : clean[nodeIdx];

  // مسافتِ بهینه (مسیرِ باز از گرهٔ ۰)
  const optimizedKm = tourLength(optimized, dist);

  // مسافتِ ترتیبِ ورودی — هم مبنای درصدِ بهبود است و هم «خطِ پایه» (baseline)
  const naiveNodes: number[] = hasDepot
    ? [0, ...clean.map((_, i) => i + 1)]
    : clean.map((_, i) => i);
  const naiveKm = tourLength(naiveNodes, dist);

  // اگر بهینه‌ساز خروجیِ بدتری از ترتیبِ ورودی تولید کرد (در ورودی‌هایِ تباهیده یا
  // بسیار همگرا ممکن است)، ترتیبِ پایه برگردانده می‌شود تا هرگز مسیرِ بدتری تحویل ندهیم.
  const baselineUsed = shouldUseBaseline(optimizedKm, naiveKm);
  const finalOrder: readonly number[] = baselineUsed ? naiveNodes : optimized;
  const finalKm = baselineUsed ? naiveKm : optimizedKm;

  const orderedStops: RouteStop[] = [];
  for (const nodeIdx of finalOrder) {
    const s = nodeToStop(nodeIdx);
    if (s) orderedStops.push(s);
  }

  // orderedStops[i] متناظر با finalOrder[hasDepot ? i+1 : i] است (دپو در index ۰ ثابت ماند)
  const seq: SequencedStop[] = [];
  let cumulative = 0;
  let prevNode = finalOrder[0];
  for (let i = 0; i < orderedStops.length; i++) {
    const actualNode = finalOrder[hasDepot ? i + 1 : i];
    const leg = dist[prevNode][actualNode];
    cumulative += leg;
    const etaMin = (cumulative / avgSpeedKmh) * 60 + serviceMin * i;
    seq.push({
      ...orderedStops[i],
      sequence: i + 1,
      leg_distance_km: round(leg, 3),
      cumulative_distance_km: round(cumulative, 3),
      eta_min: round(etaMin, 1),
    });
    prevNode = actualNode;
  }

  const travelMin = (finalKm / avgSpeedKmh) * 60;
  const totalDurationMin = travelMin + serviceMin * orderedStops.length;
  const savings =
    !baselineUsed && naiveKm > 0 ? Math.max(0, ((naiveKm - optimizedKm) / naiveKm) * 100) : 0;

  return {
    stops: seq,
    total_distance_km: round(finalKm, 3),
    total_duration_min: round(totalDurationMin, 1),
    savings_percent: round(savings, 1),
    skipped_stops: skipped,
    baseline_used: baselineUsed,
  };
}
