import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as MediaLibrary from "expo-media-library";
import { Stack } from "expo-router";
import { Accelerometer } from "expo-sensors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_W = SCREEN_WIDTH - 48;
const CHART_H = 180;
const MAX_PTS = 80;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const magnitude = (x: number, y: number, z: number) =>
  Math.sqrt(x * x + y * y + z * z);

const classify = (m: number) => {
  if (m < 0.05) return { label: "STABLE",   color: "#00E5A0", bg: "#00E5A01A" };
  if (m < 0.3)  return { label: "LOW",      color: "#FFD166", bg: "#FFD1661A" };
  if (m < 0.7)  return { label: "MODERATE", color: "#FF9F43", bg: "#FF9F431A" };
  return          { label: "HIGH",      color: "#FF4757", bg: "#FF47571A" };
};

// ─── Realtime Line Chart ──────────────────────────────────────────────────────
const RealtimeChart = ({
  dataX, dataY, dataZ, dataMag, activeLines,
}: {
  dataX: number[];
  dataY: number[];
  dataZ: number[];
  dataMag: number[];
  activeLines: { x: boolean; y: boolean; z: boolean; mag: boolean };
}) => {
  const allVals = [
    ...(activeLines.x   ? dataX   : []),
    ...(activeLines.y   ? dataY   : []),
    ...(activeLines.z   ? dataZ   : []),
    ...(activeLines.mag ? dataMag : []),
  ];
  const minV = Math.min(...allVals, -0.1);
  const maxV = Math.max(...allVals,  0.1);
  const range = maxV - minV || 1;

  const toY = (v: number) => CHART_H - ((v - minV) / range) * (CHART_H - 20) - 10;
  const toX = (i: number, len: number) => (i / Math.max(len - 1, 1)) * CHART_W;

  const renderLine = (data: number[], color: string) => {
    if (data.length < 2) return null;
    return data.slice(1).map((_, i) => {
      const x1 = toX(i, data.length);
      const y1 = toY(data[i]);
      const x2 = toX(i + 1, data.length);
      const y2 = toY(data[i + 1]);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      return (
        <View
          key={i}
          style={{
            position: "absolute",
            left: x1,
            top: y1 - 1,
            width: len,
            height: 2,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: "left center",
            borderRadius: 1,
          }}
        />
      );
    });
  };

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    y: toY(minV + p * range),
    label: (minV + p * range).toFixed(2),
  }));

  return (
    <View style={{ width: CHART_W, height: CHART_H + 24 }}>
      {gridLines.map((g, i) => (
        <View key={i} style={{ position: "absolute", top: g.y, left: 0, right: 0, flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, height: 1, backgroundColor: "#1E293B" }} />
          <Text style={{ color: "#374151", fontSize: 9, marginLeft: 4, width: 36 }}>{g.label}</Text>
        </View>
      ))}
      {activeLines.x   && renderLine(dataX,   "#FF6B9D")}
      {activeLines.y   && renderLine(dataY,   "#4ECDC4")}
      {activeLines.z   && renderLine(dataZ,   "#A78BFA")}
      {activeLines.mag && renderLine(dataMag, "#00E5A0")}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between" }}>
        {["–8s", "–6s", "–4s", "–2s", "now"].map((t) => (
          <Text key={t} style={{ color: "#374151", fontSize: 9 }}>{t}</Text>
        ))}
      </View>
    </View>
  );
};

// ─── Gauge ────────────────────────────────────────────────────────────────────
const Gauge = ({ value }: { value: number }) => {
  const anim = useRef(new Animated.Value(0)).current;
  const pct  = Math.min(value / 2, 1);
  const c    = classify(value);

  useEffect(() => {
    Animated.spring(anim, { toValue: pct, useNativeDriver: false, speed: 22 }).start();
  }, [pct]);

  return (
    <View style={styles.gaugeWrap}>
      <View style={styles.gaugeTrack} />
      <View style={[styles.gaugeFill, { backgroundColor: c.bg }]} />
      <View style={styles.gaugeCenter}>
        <Text style={[styles.gaugeVal, { color: c.color }]}>{value.toFixed(3)}</Text>
        <Text style={styles.gaugeUnit}>g  magnitude</Text>
      </View>
      <Animated.View
        style={[
          styles.gaugeDot,
          { backgroundColor: c.color, shadowColor: c.color },
          {
            transform: [
              {
                rotate: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-125deg", "125deg"],
                }),
              },
            ],
          },
        ]}
      />
      <View style={[styles.statusBadge, { backgroundColor: c.bg, borderColor: c.color }]}>
        <Text style={[styles.statusLabel, { color: c.color }]}>{c.label}</Text>
      </View>
    </View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function VibrationMeterScreen() {
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState({ x: 0, y: 0, z: 0, magnitude: 0 });
  const [dataX,   setDataX]   = useState<number[]>([]);
  const [dataY,   setDataY]   = useState<number[]>([]);
  const [dataZ,   setDataZ]   = useState<number[]>([]);
  const [dataMag, setDataMag] = useState<number[]>([]);
  const [activeLines, setActiveLines] = useState({ x: true, y: true, z: true, mag: true });
  const [pulseAnim] = useState(new Animated.Value(1));
  const [dotAnim]   = useState(new Animated.Value(1));

  const screenRef = useRef<View>(null);
  const subRef    = useRef<any>(null);

  useEffect(() => {
    if (playing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.025, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,     duration: 900, useNativeDriver: true }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 0.15, duration: 550, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 1,    duration: 550, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation(); pulseAnim.setValue(1);
      dotAnim.stopAnimation();   dotAnim.setValue(1);
    }
  }, [playing]);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100);
    return () => subRef.current?.remove();
  }, []);

  const push = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>, val: T) =>
    setter((prev) => [...prev.slice(-(MAX_PTS - 1)), val]);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    subRef.current = Accelerometer.addListener(({ x, y, z }) => {
      const m = magnitude(x, y, z);
      setCurrent({ x, y, z, magnitude: m });
      push(setDataX,   x);
      push(setDataY,   y);
      push(setDataZ,   z);
      push(setDataMag, m);
    });
  }, []);

  const handlePause = useCallback(() => {
    setPlaying(false);
    subRef.current?.remove();
    subRef.current = null;
  }, []);

  const handleReset = useCallback(() => {
    handlePause();
    setCurrent({ x: 0, y: 0, z: 0, magnitude: 0 });
    setDataX([]); setDataY([]); setDataZ([]); setDataMag([]);
  }, []);

  const takeScreenshot = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Grant media library access to save screenshots.");
        return;
      }
      const uri = await captureRef(screenRef, { format: "jpg", quality: 0.95 });
      await MediaLibrary.saveToLibraryAsync(uri);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("📸 Saved!", "Screenshot saved to your photo library.");
    } catch {
      Alert.alert("Error", "Could not capture screenshot.");
    }
  }, []);

  const toggleLine = (key: keyof typeof activeLines) =>
    setActiveLines((p) => ({ ...p, [key]: !p[key] }));

  const axes = [
    { key: "x"   as const, label: "X", value: current.x,         color: "#FF6B9D" },
    { key: "y"   as const, label: "Y", value: current.y,         color: "#4ECDC4" },
    { key: "z"   as const, label: "Z", value: current.z,         color: "#A78BFA" },
    { key: "mag" as const, label: "M", value: current.magnitude, color: "#00E5A0" },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen
        options={{
          headerShown: false, // ✅ hides header completely
        }}
      />
      <StatusBar barStyle="light-content" backgroundColor="#070B14" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View ref={screenRef} style={styles.root} collapsable={false}>

          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Animated.View style={{ opacity: dotAnim }}>
                <View style={[styles.liveDot, { backgroundColor: playing ? "#00E5A0" : "#374151" }]} />
              </Animated.View>
              <View>
                <Text style={styles.title}>VIBRATION METER</Text>
                <Text style={styles.subtitle}>{playing ? "● Live Recording" : "○ Standby"}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.camBtn} onPress={takeScreenshot}>
              <Feather name="camera" size={17} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* ── Gauge Card ── */}
          <Animated.View style={[styles.card, { transform: [{ scale: pulseAnim }] }]}>
            <LinearGradient colors={["#0F172A", "#111827"]} style={styles.cardInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Gauge value={current.magnitude} />
            </LinearGradient>
          </Animated.View>

          {/* ── Axis Chips ── */}
          <View style={styles.axisRow}>
            {axes.map((a) => (
              <View key={a.key} style={[styles.axisChip, { borderColor: a.color + "44" }]}>
                <View style={[styles.axisIcon, { backgroundColor: a.color + "22" }]}>
                  <Text style={[styles.axisIconTxt, { color: a.color }]}>{a.label}</Text>
                </View>
                <Text style={[styles.axisVal, { color: a.color }]}>{a.value.toFixed(3)}</Text>
                <Text style={styles.axisUnit}>g</Text>
              </View>
            ))}
          </View>

          {/* ── Chart Card ── */}
          <View style={styles.card}>
            <LinearGradient colors={["#0F172A", "#0A0E1A"]} style={styles.cardInner}>

              {/* Chart top bar */}
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>REAL-TIME CHART</Text>
                  <Text style={styles.chartSub}>{dataMag.length} samples · 100ms interval</Text>
                </View>
                <View style={styles.legendRow}>
                  {[
                    { key: "x"   as const, label: "X", color: "#FF6B9D" },
                    { key: "y"   as const, label: "Y", color: "#4ECDC4" },
                    { key: "z"   as const, label: "Z", color: "#A78BFA" },
                    { key: "mag" as const, label: "M", color: "#00E5A0" },
                  ].map((l) => (
                    <TouchableOpacity
                      key={l.key}
                      style={[
                        styles.legendChip,
                        { borderColor: activeLines[l.key] ? l.color : "#1E293B" },
                      ]}
                      onPress={() => toggleLine(l.key)}
                    >
                      <View style={[styles.legendDot, { backgroundColor: activeLines[l.key] ? l.color : "#374151" }]} />
                      <Text style={[styles.legendTxt, { color: activeLines[l.key] ? l.color : "#374151" }]}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Chart area */}
              <View style={styles.chartBox}>
                {dataMag.length < 2 ? (
                  <View style={styles.chartEmpty}>
                    <MaterialCommunityIcons name="chart-line-variant" size={36} color="#1E293B" />
                    <Text style={styles.chartEmptyTxt}>Press Play to start recording</Text>
                  </View>
                ) : (
                  <RealtimeChart
                    dataX={dataX} dataY={dataY} dataZ={dataZ} dataMag={dataMag}
                    activeLines={activeLines}
                  />
                )}
              </View>

              {/* Min / Max / Avg */}
              {dataMag.length > 1 && (
                <View style={styles.statsRow}>
                  {[
                    { label: "MIN", val: Math.min(...dataMag) },
                    { label: "MAX", val: Math.max(...dataMag) },
                    { label: "AVG", val: dataMag.reduce((a, b) => a + b, 0) / dataMag.length },
                  ].map((s) => (
                    <View key={s.label} style={styles.statChip}>
                      <Text style={styles.statLabel}>{s.label}</Text>
                      <Text style={styles.statVal}>{s.val.toFixed(3)}</Text>
                      <Text style={styles.statUnit}>g</Text>
                    </View>
                  ))}
                </View>
              )}
            </LinearGradient>
          </View>

          {/* ── Controls ── */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.btn, playing ? styles.btnPlayActive : styles.btnPlay]}
              onPress={handlePlay}
              disabled={playing}
            >
              <Ionicons name="play" size={20} color={playing ? "#070B14" : "#00E5A0"} />
              <Text style={[styles.btnTxt, { color: playing ? "#070B14" : "#00E5A0" }]}>Play</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, !playing ? styles.btnPauseActive : styles.btnPause]}
              onPress={handlePause}
              disabled={!playing}
            >
              <Ionicons name="pause" size={20} color={!playing ? "#070B14" : "#FF4757"} />
              <Text style={[styles.btnTxt, { color: !playing ? "#070B14" : "#FF4757" }]}>Pause</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.btnReset]} onPress={handleReset}>
              <Ionicons name="refresh" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070B14" },
  root: { backgroundColor: "#070B14", padding: 16 },

  header:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14, marginTop: 40  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  liveDot:    { width: 10, height: 10, borderRadius: 5 },
  title:      { color: "#F1F5F9", fontSize: 17, fontWeight: "800", letterSpacing: 2.5 },
  subtitle:   { color: "#475569", fontSize: 10, letterSpacing: 1, marginTop: 2 },
  camBtn:     { backgroundColor: "#0F172A", padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "#1E293B" },

  card:      { borderRadius: 20, overflow: "hidden", marginBottom: 12, borderWidth: 1, borderColor: "#1E293B" },
  cardInner: { padding: 20 },

  gaugeWrap:   { alignItems: "center", paddingVertical: 6 },
  gaugeTrack:  { width: 150, height: 150, borderRadius: 75, borderWidth: 8, borderColor: "#1E293B", position: "absolute" },
  gaugeFill:   { width: 134, height: 134, borderRadius: 67, position: "absolute" },
  gaugeCenter: { alignItems: "center", justifyContent: "center", height: 150 },
  gaugeVal:    { fontSize: 34, fontWeight: "900", letterSpacing: 1 },
  gaugeUnit:   { color: "#475569", fontSize: 11, marginTop: 2, letterSpacing: 1 },
  gaugeDot: {
    position: "absolute", width: 14, height: 14, borderRadius: 7,
    top: 8, left: 68,
    shadowOpacity: 0.9, shadowRadius: 8, elevation: 8,
  },
  statusBadge: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  statusLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 3 },

  axisRow:    { flexDirection: "row", gap: 8, marginBottom: 12 },
  axisChip:   { flex: 1, backgroundColor: "#0F172A", borderRadius: 14, padding: 10, alignItems: "center", borderWidth: 1 },
  axisIcon:   { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  axisIconTxt:{ fontSize: 13, fontWeight: "800" },
  axisVal:    { fontSize: 13, fontWeight: "700" },
  axisUnit:   { color: "#374151", fontSize: 9, marginTop: 1 },

  chartHeader:{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  chartTitle: { color: "#94A3B8", fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  chartSub:   { color: "#374151", fontSize: 10, marginTop: 2 },
  legendRow:  { flexDirection: "row", gap: 5 },
  legendChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  legendDot:  { width: 6, height: 6, borderRadius: 3 },
  legendTxt:  { fontSize: 10, fontWeight: "700" },
  chartBox:   { borderRadius: 12, backgroundColor: "#070B14", padding: 8, minHeight: CHART_H + 36 },
  chartEmpty: { height: CHART_H, alignItems: "center", justifyContent: "center", gap: 10 },
  chartEmptyTxt: { color: "#1E293B", fontSize: 13 },

  statsRow:  { flexDirection: "row", gap: 8, marginTop: 14 },
  statChip:  { flex: 1, backgroundColor: "#070B14", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#1E293B" },
  statLabel: { color: "#374151", fontSize: 9, letterSpacing: 2, marginBottom: 2 },
  statVal:   { color: "#94A3B8", fontSize: 14, fontWeight: "700" },
  statUnit:  { color: "#374151", fontSize: 9, marginTop: 1 },

  controls:       { flexDirection: "row", gap: 10 },
  btn:            { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 16, borderWidth: 1 },
  btnPlay:        { backgroundColor: "#0F172A", borderColor: "#00E5A044" },
  btnPlayActive:  { backgroundColor: "#00E5A0", borderColor: "#00E5A0" },
  btnPause:       { backgroundColor: "#0F172A", borderColor: "#FF475744" },
  btnPauseActive: { backgroundColor: "#FF4757", borderColor: "#FF4757" },
  btnReset:       { flex: 0, paddingHorizontal: 18, backgroundColor: "#0F172A", borderColor: "#1E293B" },
  btnTxt:         { fontWeight: "700", fontSize: 14 },
});