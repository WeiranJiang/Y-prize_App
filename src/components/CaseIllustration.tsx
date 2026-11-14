import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../theme/tokens';

const ND = Platform.OS !== 'web';

/** Dotted retainer silhouette (top view) used inside the case illustration. */
function RetainerGlyph({ width = 120, glow = false }: { width?: number; glow?: boolean }) {
  const dots: { x: number; y: number }[] = [];
  for (let i = 0; i <= 46; i++) {
    const t = -1 + (2 * i) / 46;
    const x = 60 + 50 * Math.sin(t * 1.45);
    const y = 12 + 52 * (1 - Math.cos(t * 1.45)) ** 1.1 * 0.95;
    dots.push({ x, y });
    dots.push({ x: x + Math.sin(t * 1.45) * -7, y: y - 6 + Math.abs(t) * 2 });
  }
  return (
    <Svg width={width} height={width * 0.62} viewBox="0 0 120 74">
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={74 - d.y} r={1.25} fill={glow ? '#C8D4FF' : colors.point} opacity={0.9} />
      ))}
    </Svg>
  );
}

/**
 * Stylised scanning case: a soft pebble base with a contoured tray, a hinged
 * lid and positioning guides. `stage` drives the lid / retainer animation.
 */
export default function CaseIllustration({ stage, size = 260 }: { stage: 'closed' | 'open' | 'placing' | 'scanning'; size?: number }) {
  const lid = useRef(new Animated.Value(stage === 'closed' ? 0 : 1)).current;
  const drop = useRef(new Animated.Value(stage === 'placing' || stage === 'scanning' ? 1 : 0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const lidTo = stage === 'closed' || stage === 'scanning' ? 0 : 1;
    Animated.sequence([
      Animated.timing(lid, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
      Animated.timing(drop, { toValue: stage === 'placing' || stage === 'scanning' ? 1 : 0, duration: 1100, easing: Easing.inOut(Easing.cubic), useNativeDriver: ND }),
      Animated.timing(lid, { toValue: lidTo, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: ND }),
    ]).start();
    if (stage === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: ND }),
          Animated.timing(glow, { toValue: 0.3, duration: 900, useNativeDriver: ND }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    glow.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const W = size;
  const H = size * 0.62;
  const lidRot = lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-72deg'] });
  const retY = drop.interpolate({ inputRange: [0, 1], outputRange: [-H * 0.55, H * 0.06] });
  const retOpacity = drop.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.0, 0.9, 1] });

  return (
    <View style={{ width: W, height: H * 1.45, alignItems: 'center', justifyContent: 'flex-end' }}>
      {/* Lid */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: H * 0.62,
          width: W * 0.94,
          height: H * 0.5,
          transform: [{ perspective: 600 }, { translateY: H * 0.25 }, { rotateX: lidRot }, { translateY: -H * 0.25 }],
        }}
      >
        <LinearGradient colors={['#1B2350', '#0D1330']} style={[styles.lid, { borderRadius: H * 0.25 }]}>
          <View style={styles.lidLine} />
        </LinearGradient>
      </Animated.View>

      {/* Base */}
      <LinearGradient colors={['#1A2148', '#0B1024']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.base, { width: W, height: H * 0.68, borderRadius: H * 0.34 }]}>
        <View style={[styles.tray, { width: W * 0.8, height: H * 0.44, borderRadius: H * 0.22 }]}>
          {/* Positioning guides */}
          <Svg width={W * 0.8} height={H * 0.44} style={StyleSheet.absoluteFill}>
            <Path d={`M${W * 0.12},${H * 0.36} Q${W * 0.4},${H * 0.02} ${W * 0.68},${H * 0.36}`} stroke="rgba(169,184,255,0.25)" strokeWidth={1} fill="none" strokeDasharray="2 4" />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(120,150,255,0.18)', opacity: glow, borderRadius: H * 0.22 }]} />
        </View>
        <View style={styles.led}>
          <Animated.View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stage === 'scanning' ? colors.accent : colors.normal, opacity: stage === 'scanning' ? glow : 0.9 }} />
        </View>
      </LinearGradient>

      {/* Retainer */}
      <Animated.View style={{ position: 'absolute', bottom: H * 0.2, opacity: retOpacity, transform: [{ translateY: retY }] }} pointerEvents="none">
        <RetainerGlyph width={W * 0.55} glow={stage === 'scanning'} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(169,184,255,0.22)' },
  tray: { backgroundColor: 'rgba(5,6,27,0.7)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(169,184,255,0.18)', overflow: 'hidden' },
  lid: { flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(169,184,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  lidLine: { width: '40%', height: 2, borderRadius: 1, backgroundColor: 'rgba(169,184,255,0.25)' },
  led: { position: 'absolute', bottom: 10 },
});
