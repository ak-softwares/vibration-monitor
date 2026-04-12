import { Ionicons } from "@expo/vector-icons";
import { Accelerometer } from "expo-sensors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Stop,
  LinearGradient as SvgLinearGradient,
  Text as SvgText,
} from "react-native-svg";
import { BottomBannerAd } from "../components/ads/BottomBannerAd";

const { width: SW, height: SH } = Dimensions.get("window");

// ── Responsive sizing based on both screen width and height ───────────────────
const DIAM    = Math.min(SW * 0.80, SH * 0.38);
const CHART_H = Math.max(90, Math.round(SH * 0.16));
const CHART_W = SW - 48;

const MAX_PTS        = 1200;
const WARMUP_SAMPLES = 20;
const HP_ALPHA       = 0.8;
const MAX_G          = 1.5;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Metrics {
  value: number;
  maxVal: number;
  minVal: number;
  avg: number;
  count: number;
  data: number[];
}

const DEFAULT_METRICS: Metrics = {
  value: 0, maxVal: 0, minVal: 0, avg: 0, count: 0, data: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const classify = (m: number) => {
  if (m < 0.02) return { label: "STABLE",   color: "#22C55E", desc: "No vibration detected" };
  if (m < 0.10) return { label: "LOW",      color: "#38BDF8", desc: "Minor vibration — smooth operation" };
  if (m < 0.30) return { label: "MODERATE", color: "#FACC15", desc: "Normal running vibration" };
  if (m < 0.60) return { label: "HIGH",     color: "#F97316", desc: "Elevated — check mountings" };
  if (m < 1.00) return { label: "DANGER",   color: "#EF4444", desc: "High vibration — inspect immediately" };
  return               { label: "EXTREME",  color: "#A855F7", desc: "Critical — stop vehicle/motor now!" };
};

const fmt     = (n: number) => n.toFixed(3);
const fmtTime = (s: number) => {
  const m   = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

// ─── Speedometer geometry ─────────────────────────────────────────────────────
const CX      = DIAM / 2;
const CY      = DIAM / 2 + 10;
const R       = DIAM * 0.40;
const START_A = -210;
const END_A   = 30;
const SWEEP   = END_A - START_A;

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const arcPath = (cx: number, cy: number, r: number, a1: number, a2: number) => {
  const s = polar(cx, cy, r, a1);
  const e = polar(cx, cy, r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
};

const valToAngle = (v: number) =>
  START_A + (Math.min(Math.max(v, 0), MAX_G) / MAX_G) * SWEEP;

const ZONES: [number, number, string][] = [
  [0.00, 0.02, "#22C55E"],
  [0.02, 0.10, "#38BDF8"],
  [0.10, 0.30, "#FACC15"],
  [0.30, 0.60, "#F97316"],
  [0.60, 1.00, "#EF4444"],
  [1.00, 1.50, "#A855F7"],
];

const TICKS       = [0, 0.3, 0.6, 0.9, 1.2, 1.5];
const MINOR_TICKS = [0.15, 0.45, 0.75, 1.05, 1.35];

// ─── Speedometer Component ────────────────────────────────────────────────────
const Speedometer = React.memo(({ value, maxValue }: { value: number; maxValue: number }) => {
  const needleAnim = useRef(new Animated.Value(valToAngle(0))).current;
  const maxAnim    = useRef(new Animated.Value(valToAngle(0))).current;
  const [needleDeg, setNeedleDeg] = useState(valToAngle(0));
  const [maxDeg,    setMaxDeg]    = useState(valToAngle(0));
  const c = classify(value);

  useEffect(() => {
    Animated.spring(needleAnim, {
      toValue: valToAngle(value),
      useNativeDriver: false,
      speed: 35,
      bounciness: 1,
    }).start();
  }, [value]);

  useEffect(() => {
    Animated.spring(maxAnim, {
      toValue: valToAngle(maxValue),
      useNativeDriver: false,
      speed: 8,
    }).start();
  }, [maxValue]);

  useEffect(() => {
    const id1 = needleAnim.addListener(({ value: v }) => setNeedleDeg(v));
    const id2 = maxAnim.addListener(({ value: v }) => setMaxDeg(v));
    return () => {
      needleAnim.removeListener(id1);
      maxAnim.removeListener(id2);
    };
  }, []);

  const needleTip  = polar(CX, CY, R * 0.80, needleDeg);
  const needleBase = polar(CX, CY, R * 0.18, needleDeg + 180);
  const maxOuter   = polar(CX, CY, R + 10, maxDeg);
  const maxInner   = polar(CX, CY, R - 10, maxDeg);
  const trackPath  = arcPath(CX, CY, R, START_A, END_A);
  const fillPath   = arcPath(CX, CY, R, START_A, valToAngle(Math.max(value, 0.001)));

  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
      <Svg
        width={DIAM}
        height={DIAM * 0.58}
        viewBox={`0 0 ${DIAM} ${DIAM}`}
        style={{ overflow: "visible" }}
      >
        <Path d={trackPath} stroke="#1E293B" strokeWidth={16} fill="none" strokeLinecap="round" />

        {ZONES.map(([from, to, color]) => (
          <Path
            key={color}
            d={arcPath(CX, CY, R, valToAngle(from), valToAngle(to))}
            stroke={color} strokeWidth={16} fill="none" strokeLinecap="butt" opacity={0.2}
          />
        ))}

        <Path d={fillPath} stroke={c.color} strokeWidth={16} fill="none" strokeLinecap="round" opacity={0.95} />

        {TICKS.map((t) => {
          const a     = valToAngle(t);
          const outer = polar(CX, CY, R + 22, a);
          const inner = polar(CX, CY, R - 8,  a);
          const lbl   = polar(CX, CY, R + 36, a);
          return (
            <G key={t}>
              <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke="#64748B" strokeWidth={2} strokeLinecap="round" />
              <SvgText x={lbl.x} y={lbl.y + 4} fontSize={11} fill="#64748B"
                textAnchor="middle" fontWeight="600">
                {t.toFixed(1)}
              </SvgText>
            </G>
          );
        })}

        {MINOR_TICKS.map((t) => {
          const a     = valToAngle(t);
          const outer = polar(CX, CY, R + 14, a);
          const inner = polar(CX, CY, R - 4,  a);
          return (
            <Line key={t} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="#334155" strokeWidth={1.2} strokeLinecap="round" />
          );
        })}

        <Line x1={maxInner.x} y1={maxInner.y} x2={maxOuter.x} y2={maxOuter.y}
          stroke="#EF4444" strokeWidth={3} strokeLinecap="round" />
        <Circle cx={maxOuter.x} cy={maxOuter.y} r={4} fill="#EF4444" />

        <Line x1={needleBase.x + 1} y1={needleBase.y + 1} x2={needleTip.x + 1} y2={needleTip.y + 1}
          stroke="#00000055" strokeWidth={4} strokeLinecap="round" />
        <Line x1={needleBase.x} y1={needleBase.y} x2={needleTip.x} y2={needleTip.y}
          stroke={c.color} strokeWidth={3.5} strokeLinecap="round" />

        <Circle cx={CX} cy={CY} r={18} fill="#0B1120" stroke="#1E293B" strokeWidth={3} />
        <Circle cx={CX} cy={CY} r={7}  fill={c.color} />
      </Svg>

      <View style={styles.readingRow}>
        <Text style={[styles.readingVal, { color: c.color }]}>{fmt(value)}</Text>
        <Text style={styles.readingUnit}>g</Text>
      </View>

      <View style={styles.infoRow}>
        <View style={styles.maxTag}>
          <Text style={styles.maxTagLabel}>PEAK</Text>
          <Text style={[styles.maxTagVal, { color: "#EF4444" }]}>{fmt(maxValue)} g</Text>
        </View>
        <View style={[styles.zonePill, { borderColor: c.color + "55", backgroundColor: c.color + "18" }]}>
          <View style={[styles.zoneDot, { backgroundColor: c.color }]} />
          <Text style={[styles.zoneText, { color: c.color }]}>{c.label}</Text>
        </View>
      </View>

      <Text style={styles.descTxt}>{c.desc}</Text>
    </View>
  );
});

// ─── Magnitude Chart ──────────────────────────────────────────────────────────
const MagnitudeChart = React.memo(({ data }: { data: number[] }) => {
  if (data.length < 2) {
    return (
      <View style={[styles.chartEmpty, { height: CHART_H }]}>
        <Text style={styles.chartEmptyTxt}>Starting…</Text>
      </View>
    );
  }

  const maxV = data.reduce((a, b) => Math.max(a, b), 0.05);
  const span = maxV * 1.15;
  const toX  = (i: number) => (i / (data.length - 1)) * CHART_W;
  const toY  = (v: number) => CHART_H - (Math.max(v, 0) / span) * CHART_H;
  const pts  = data
    .map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(" ");
  const gridVals = [0, 0.25, 0.5, 0.75, 1.0].map((p) => ({ v: span * p, y: toY(span * p) }));
  const lc = classify(data[data.length - 1]);

  return (
    <Svg width={CHART_W} height={CHART_H} style={{ overflow: "visible" }}>
      <Defs>
        <SvgLinearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%"   stopColor="#38BDF8" />
          <Stop offset="50%"  stopColor="#FACC15" />
          <Stop offset="100%" stopColor={lc.color} />
        </SvgLinearGradient>
      </Defs>
      {gridVals.map((g, i) => (
        <G key={i}>
          <Line x1={0} y1={g.y} x2={CHART_W} y2={g.y} stroke="#1E293B" strokeWidth={1} />
          <SvgText x={2} y={g.y - 3} fontSize={9} fill="#334155">{g.v.toFixed(2)}</SvgText>
        </G>
      ))}
      <Path d={pts} stroke="url(#cg)" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={toX(data.length - 1)} cy={toY(data[data.length - 1])} r={5} fill={lc.color} />
    </Svg>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VibrationMeterScreen() {
  const [playing, setPlaying] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(DEFAULT_METRICS);
  const [elapsed, setElapsed] = useState(0);
  const [isCalib, setIsCalib] = useState(true);
  const [dotAnim]             = useState(new Animated.Value(1));

  const hpRef     = useRef({ x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 });
  const sampleRef = useRef(0);
  const subRef    = useRef<any>(null);
  const timerRef  = useRef<any>(null);

  const startRecording = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;

    hpRef.current     = { x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 };
    sampleRef.current = 0;
    setIsCalib(true);
    setPlaying(true);

    subRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const hp = hpRef.current;
      hp.x = HP_ALPHA * (hp.x + x - hp.px);
      hp.y = HP_ALPHA * (hp.y + y - hp.py);
      hp.z = HP_ALPHA * (hp.z + z - hp.pz);
      hp.px = x; hp.py = y; hp.pz = z;

      sampleRef.current += 1;
      if (sampleRef.current <= WARMUP_SAMPLES) return;
      if (sampleRef.current === WARMUP_SAMPLES + 1) setIsCalib(false);

      const v = Math.max(0, Math.sqrt(hp.x * hp.x + hp.y * hp.y + hp.z * hp.z));

      setMetrics((prev) => {
        const newCount = prev.count + 1;
        const newAvg   = prev.avg + (v - prev.avg) / newCount;
        return {
          value:  v,
          maxVal: Math.max(prev.maxVal, v),
          minVal: prev.count === 0 ? v : Math.min(prev.minVal, v),
          avg:    newAvg,
          count:  newCount,
          data:   [...prev.data.slice(-(MAX_PTS - 1)), v],
        };
      });
    });

    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }, []);

  useEffect(() => {
    Accelerometer.isAvailableAsync().then((available) => {
      if (!available) {
        Alert.alert("Not supported", "This device has no accelerometer.");
        return;
      }
      Accelerometer.setUpdateInterval(100);
      startRecording();
    });
    return () => {
      subRef.current?.remove();
      clearInterval(timerRef.current);
    };
  }, [startRecording]);

  useEffect(() => {
    if (playing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.1, duration: 500, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1,   duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      dotAnim.stopAnimation();
      dotAnim.setValue(1);
    }
  }, [playing]);

  const handlePause = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  }, []);

  const handlePlay  = useCallback(() => { if (!playing) startRecording(); }, [playing, startRecording]);

  const handleReset = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;
    hpRef.current     = { x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0 };
    sampleRef.current = 0;
    setMetrics(DEFAULT_METRICS);
    setElapsed(0);
    setIsCalib(true);
    startRecording();
  }, [startRecording]);

  const { value, maxVal, minVal, avg, data } = metrics;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#080D1A" />

      {/* ── All content fills the space above the banner ── */}
      <View style={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Animated.View style={[styles.liveDot, { opacity: dotAnim, backgroundColor: playing ? "#EF4444" : "#334155" }]} />
            <View>
              <Text style={styles.title}>Vibration Meter</Text>
              <Text style={styles.subtitle}>
                {isCalib ? "Calibrating…" : `${fmtTime(elapsed)} · ${playing ? "Live" : "Paused"}`}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={[styles.headerBtn, playing && styles.headerBtnActive]}
              onPress={playing ? handlePause : handlePlay}
            >
              <Ionicons name={playing ? "pause" : "play"} size={18} color={playing ? "#080D1A" : "#22C55E"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={handleReset}>
              <Ionicons name="refresh" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Dial — flex:1 grows to fill remaining vertical space */}
        <View style={styles.dialCard}>
          <Speedometer value={value} maxValue={maxVal} />
        </View>

        {/* MIN / AVG / MAX */}
        <View style={styles.statsCard}>
          {[
            { label: "MIN", val: minVal, color: "#22C55E" },
            { label: "AVG", val: avg,    color: "#94A3B8" },
            { label: "MAX", val: maxVal, color: "#EF4444" },
          ].map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.statItem}>
                <Text style={[styles.statVal, { color: s.color }]}>{fmt(s.val)}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartTop}>
            <Text style={styles.chartTitle}>REAL-TIME CHART (g)</Text>
            <View style={styles.chartBadge}>
              <Animated.View style={[styles.chartDot, { opacity: dotAnim }]} />
              <Text style={styles.chartBadgeTxt}>{data.length} pts</Text>
            </View>
          </View>
          <View style={styles.chartArea}>
            <MagnitudeChart data={data} />
          </View>
          <View style={styles.xAxis}>
            {["–120s", "–90s", "–60s", "–30s", "–10s", "now"].map((t) => (
              <Text key={t} style={styles.xLabel}>{t}</Text>
            ))}
          </View>
        </View>

      </View>

      {/* Banner ad always at the bottom */}
      <BottomBannerAd />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: "#080D1A" },

  // flex:1 fills everything between SafeAreaView top and the banner ad
  content: { flex: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },

  // Header
  header:          { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  headerLeft:      { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight:     { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot:         { width: 10, height: 10, borderRadius: 5, marginTop: 2 },
  title:           { color: "#F1F5F9", fontSize: 18, fontWeight: "700" },
  subtitle:        { color: "#475569", fontSize: 11, marginTop: 2, letterSpacing: 1 },
  headerBtn:       { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#0F172A", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: "#1E293B" },
  headerBtnActive: { backgroundColor: "#1E293B", borderColor: "#334155" },

  // Dial card grows to fill all leftover vertical space
  dialCard:    { flex: 1, backgroundColor: "#0B1120", borderRadius: 24, borderWidth: 1, borderColor: "#1E293B", alignItems: "center", justifyContent: "center", marginBottom: 8, overflow: "hidden" },
  readingRow:  { flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: -12 },
  readingVal:  { fontSize: 52, fontWeight: "900", letterSpacing: 1 },
  readingUnit: { color: "#64748B", fontSize: 20, marginBottom: 12 },
  infoRow:     { flexDirection: "row", gap: 10, marginTop: 4, alignItems: "center" },
  maxTag:      { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#1E293B", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  maxTagLabel: { color: "#64748B", fontSize: 10, fontWeight: "700", letterSpacing: 1.5 },
  maxTagVal:   { fontSize: 13, fontWeight: "700" },
  zonePill:    { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  zoneDot:     { width: 7, height: 7, borderRadius: 4 },
  zoneText:    { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  descTxt:     { color: "#475569", fontSize: 11, marginTop: 8, letterSpacing: 0.3 },

  // Stats (fixed height)
  statsCard:  { flexDirection: "row", backgroundColor: "#0B1120", borderRadius: 18, borderWidth: 1, borderColor: "#1E293B", paddingVertical: 16, paddingHorizontal: 8, marginBottom: 8 },
  statItem:   { flex: 1, alignItems: "center" },
  statVal:    { fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
  statLabel:  { color: "#475569", fontSize: 11, fontWeight: "700", letterSpacing: 2, marginTop: 3 },
  divider:    { width: 1, backgroundColor: "#1E293B", marginVertical: 4 },

  // Chart (fixed height driven by CHART_H constant)
  chartCard:     { backgroundColor: "#0B1120", borderRadius: 20, borderWidth: 1, borderColor: "#1E293B", padding: 14 },
  chartTop:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  chartTitle:    { color: "#94A3B8", fontSize: 11, fontWeight: "700", letterSpacing: 2.5 },
  chartBadge:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1E293B", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  chartDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444" },
  chartBadgeTxt: { color: "#64748B", fontSize: 10 },
  chartArea:     { height: CHART_H, backgroundColor: "#080D1A", borderRadius: 12, overflow: "hidden" },
  chartEmpty:    { alignItems: "center", justifyContent: "center" },
  chartEmptyTxt: { color: "#334155", fontSize: 13 },
  xAxis:         { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  xLabel:        { color: "#334155", fontSize: 9 },
});