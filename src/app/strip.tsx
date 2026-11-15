import { router, useIsFocused } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet from '../components/BottomSheet';
import LineChart from '../components/charts/LineChart';
import { replaceEta } from '../components/StripHealthCard';
import ArchToggle from '../components/ArchToggle';
import { Button, Card, DemoBadge, Divider, IconButton, KV, Legend, Meter, Screen, Section, StatusDot, T } from '../components/ui';
import { siteTitle } from '../domain/analysis';
import { Status } from '../domain/biomarkers';
import { computeStripHealth, pct, STATE_COLOR_KEY } from '../domain/fouling';
import { useStore } from '../state/store';
import RetainerView from '../three/RetainerView';
import { signalRegions } from '../three/regions';
import { colors, space } from '../theme/tokens';

const tStatus = (t: number, usable: boolean): Status => (!usable ? 'high' : t >= 0.8 ? 'normal' : t >= 0.7 ? 'mild' : 'elevated');

export default function StripHealth() {
  const { health: h, state, dispatch, strip } = useStore();
  const focused = useIsFocused();
  const [confirm, setConfirm] = useState(false);
  const key = STATE_COLOR_KEY[h.state];
  const latest = h.scans[h.scans.length - 1];
  const regions = useMemo(() => (latest ? signalRegions(latest, strip) : []), [latest, strip]);
  const L = h.limits;

  const previous = useMemo(
    () =>
      state.strips
        .filter((s) => s.id !== strip.id && s.arch === strip.arch)
        .map((s) => ({ s, h: computeStripHealth(s, state.scans, L, s.retiredAt ? new Date(s.retiredAt) : new Date()) }))
        .reverse(),
    [state.strips, state.scans, strip.id, L],
  );
  const prevRate = previous.find((p) => p.h.forecast)?.h.forecast?.rate;
  const rateDelta = h.forecast && prevRate ? h.forecast.rate / prevRate - 1 : null;

  const points = h.clarityHistory.map((p) => ({ x: p.exposureHours, y: p.clarity, hollow: p.usableFraction < L.usableMin }));
  const projection = h.forecast?.projection.map((p) => ({ x: p.exposureHours, y: p.clarity })) ?? [];
  const xMax = Math.max(...points.map((p) => p.x), ...projection.map((p) => p.x), 24);

  const sites = h.siteSignals.slice().sort((a, b) => a.transmission - b.transmission).slice(0, 10);
  const constraintLabel = { clarity: 'Optical clarity', signal: 'Local signal loss', days: 'Use period', sessions: 'Session count' } as const;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={styles.header}>
          <IconButton name="chevronLeft" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
          <DemoBadge />
        </View>
        <View style={{ paddingHorizontal: space.xl, marginTop: space.lg }}>
          <ArchToggle />
          <T v="label" style={{ marginTop: space.lg }}>{strip.arch === 'upper' ? 'Upper' : 'Lower'} sensing strip · {strip.batch}</T>
          <T v="display" style={{ marginTop: 6 }}>{h.headline}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.sm }}>
            <StatusDot status={key} />
            <T v="small" style={{ color: colors.text }}>{h.constraint ? `Limiting factor: ${constraintLabel[h.constraint]}` : 'No limit approaching'}</T>
          </View>
          <T v="body" style={{ marginTop: space.md }}>{h.detail}</T>
        </View>

        {/* Forecast hero */}
        <Section>
          <Card>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <T v="small">Replace in</T>
                <T v="number" style={{ fontSize: 34, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{replaceEta(h)}</T>
                {h.forecast && h.state !== 'now' ? (
                  <T v="small">around {h.forecast.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</T>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                {h.forecast ? (
                  <>
                    <T v="small" style={{ fontSize: 11 }}>Forecast fit R² {h.forecast.r2.toFixed(2)}</T>
                    <T v="small" style={{ fontSize: 11 }}>{h.forecast.n} scans · {(h.forecast.rate * 100 * h.hoursPerSession).toFixed(1)}% / session</T>
                  </>
                ) : (
                  <T v="small" style={{ fontSize: 11, textAlign: 'right' }}>Forecast needs{'\n'}3+ scans</T>
                )}
              </View>
            </View>
            <Divider style={{ marginVertical: space.lg }} />
            <Gauge label="Optical clarity" value={h.clarity ?? 1} display={h.clarity != null ? pct(h.clarity) : '—'} limit={`limit ${pct(L.clarityReplace)}`} status={h.clarity == null ? 'unavailable' : h.clarity < L.clarityReplace ? 'high' : h.clarity < L.claritySoon ? 'elevated' : h.clarity < 0.85 ? 'mild' : 'normal'} marks={[L.clarityReplace, L.claritySoon]} />
            <Gauge label="Use period" value={h.daysInUse / L.maxDays} display={`Day ${Math.floor(h.daysInUse) + 1} of ${L.maxDays}`} limit="" status={h.daysInUse >= L.maxDays ? 'high' : L.maxDays - h.daysInUse <= 2 ? 'elevated' : 'normal'} />
            <Gauge label="Sessions" value={h.sessions / L.maxSessions} display={`${h.sessions} of ${L.maxSessions}`} limit="" status={h.sessions >= L.maxSessions ? 'high' : L.maxSessions - h.sessions <= 2 ? 'elevated' : 'normal'} />
            <Gauge label="Usable sites" value={h.usableFraction ?? 1} display={h.usableFraction != null ? pct(h.usableFraction) : '—'} limit={`min ${pct(L.usableMin)}`} status={h.usableFraction == null ? 'unavailable' : h.usableFraction < L.usableMin ? 'elevated' : 'normal'} marks={[L.usableMin]} />
          </Card>
        </Section>

        <Section title="Optical clarity over time">
          <Card>
            <T v="small">Mean transmission of the inert reference spots, relative to this strip's first scan. These spots carry no chemistry, so any dimming is film on the strip, not a change in your mouth.</T>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 14, height: 2, backgroundColor: colors.seriesA }} />
                <T v="small" style={{ fontSize: 11 }}>Measured</T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: colors.seriesA }} />
                <T v="small" style={{ fontSize: 11 }}>Forecast</T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.seriesA }} />
                <T v="small" style={{ fontSize: 11 }}>Sites withheld</T>
              </View>
            </View>
            <View style={{ marginTop: space.md }}>
              {points.length ? (
                <LineChart
                  height={210}
                  series={[
                    { id: 'm', label: 'Measured', color: colors.seriesA, points },
                    ...(projection.length ? [{ id: 'f', label: 'Forecast', color: colors.seriesA, points: projection, dashed: true, markers: false }] : []),
                  ]}
                  yDomain={[0.5, 1.0]}
                  yTicks={[0.5, 0.6, 0.7, 0.8, 0.9, 1.0]}
                  formatY={(v) => `${Math.round(v * 100)}%`}
                  xDomain={[0, xMax]}
                  xTicks={[0, xMax / 2, xMax]}
                  formatX={(x) => `${Math.round(x)} h`}
                  formatTooltipX={(x) => `${Math.round(x)} h in mouth`}
                  thresholds={[
                    { y: L.clarityReplace, label: `Replace ${pct(L.clarityReplace)}` },
                    { y: L.claritySoon, label: `Soon ${pct(L.claritySoon)}` },
                  ]}
                />
              ) : (
                <T v="body">No scans on this strip yet.</T>
              )}
            </View>
            <T v="small" style={{ fontSize: 11, marginTop: space.sm }}>Hours of wear are estimated from time the retainer spent out of the case.</T>
            {rateDelta != null && Math.abs(rateDelta) >= 0.05 ? (
              <T v="small" style={{ marginTop: space.md, color: colors.text }}>
                Film is building {Math.abs(rateDelta * 100).toFixed(0)}% {rateDelta > 0 ? 'faster' : 'slower'} than on your previous strip.
              </T>
            ) : null}
          </Card>
        </Section>

        <Section title="Where film is building">
          <Card style={{ paddingHorizontal: 0, paddingBottom: space.md }}>
            <View style={{ height: 260 }}>
              {latest ? <RetainerView key={strip.arch} arch={strip.arch} style={{ flex: 1 }} regions={regions} active={focused} zoom={1.05} /> : null}
            </View>
            <Legend
              showUnmeasured={false}
              title="Signal · clear areas stay white"
              items={[
                { status: 'mild', label: '70–80%' },
                { status: 'elevated', label: '<70%' },
                { status: 'high', label: 'Below floor' },
              ]}
            />
          </Card>
          <Card style={{ marginTop: space.md, paddingVertical: 6 }}>
            {sites.map((s, i) => {
              const site = strip.sites.find((x) => x.id === s.siteId)!;
              const t = siteTitle(site, state.settings.numbering);
              const speed = h.clarity && h.clarity < 1 && s.transmission < 1 ? Math.log(s.transmission) / Math.log(h.clarity) : 1;
              return (
                <View key={s.siteId} style={{ paddingVertical: 10, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.hairline }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                      <StatusDot status={tStatus(s.transmission, s.usable)} />
                      <T v="small" style={{ color: colors.text }} numberOfLines={1}>{t.number} {t.surface.toLowerCase()}</T>
                    </View>
                    <T v="small" style={{ color: colors.text, fontVariant: ['tabular-nums'] }}>{pct(s.transmission)}</T>
                  </View>
                  <T v="small" style={{ fontSize: 11, marginLeft: 16 }}>
                    {s.usable ? `SNR ${s.snr.toFixed(0)}` : `SNR ${s.snr.toFixed(0)} · withheld`}
                    {speed > 1.25 ? ` · film ${speed.toFixed(1)}× faster than average` : ''}
                  </T>
                </View>
              );
            })}
          </Card>
        </Section>

        <Section title="Reference spots">
          <Card style={{ paddingVertical: 6 }}>
            {strip.referenceSpots.map((spot, i) => {
              const v = latest?.references.find((r) => r.spotId === spot.id)?.transmission;
              return (
                <View key={spot.id} style={{ paddingVertical: 12, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.hairline }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <T v="small" style={{ color: colors.text }}>{spot.id} · {spot.label}</T>
                    <T v="small" style={{ color: colors.text }}>{v != null ? pct(v) : '—'}</T>
                  </View>
                  <Meter value={v ?? 0} status={v == null ? 'unavailable' : tStatus(v, true)} marks={[L.clarityReplace]} />
                </View>
              );
            })}
          </Card>
        </Section>

        <Section title="Effect on your readings">
          <Card>
            <KV k="Added uncertainty (typical)" v={h.addedUncertainty != null ? `± ${h.addedUncertainty.toFixed(2)} pH` : '—'} />
            <KV k="Sites withheld at last scan" v={`${h.lowSignalSites.length}`} />
            <KV k="Signal-quality floor" v={`SNR ≥ ${L.snrFloor}`} />
            <T v="small" style={{ marginTop: space.md }}>
              pH is read as a ratio of two optical bands, so film mostly reduces signal strength rather than shifting the value. The app widens each reading's uncertainty as clarity falls. When a site drops below the quality floor, the app withholds it instead of estimating it.
            </T>
          </Card>
        </Section>

        <Section title="Strip history">
          <Card style={{ paddingVertical: 6 }}>
            <HistoryRow title={`${strip.id} · current`} sub={`Installed ${new Date(strip.installedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${h.sessions} sessions`} value={h.clarity != null ? pct(h.clarity) : '—'} />
            {previous.map((p) => (
              <HistoryRow
                key={p.s.id}
                title={p.s.id}
                sub={`${new Date(p.s.installedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${p.s.retiredAt ? new Date(p.s.retiredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} · ${p.h.sessions} sessions · ${p.s.retiredReason ?? ''}`}
                value={p.h.clarity != null ? pct(p.h.clarity) : '—'}
              />
            ))}
          </Card>
        </Section>

        <Section title="How replacement is decided">
          <T v="small">
            {`• Replace now when clarity is below ${pct(L.clarityReplace)}, fewer than ${pct(L.usableMin - 0.25)} of sites are usable, or the ${L.maxDays}-day / ${L.maxSessions}-session validated limit is reached.\n• Replace soon when clarity is below ${pct(L.claritySoon)}, the forecast reaches the limit within 3 sessions, or usable sites fall below ${pct(L.usableMin)}.\n• Forecast: exponential attenuation fitted to the last 8 scans on this strip.\n\nThese are configurable engineering thresholds (Profile → Thresholds), not validated clinical limits.`}
          </T>
          <Button label="I've replaced my strip" style={{ marginTop: space.xl }} onPress={() => setConfirm(true)} />
        </Section>
      </Screen>

      <BottomSheet open={confirm} onClose={() => setConfirm(false)}>
        <T v="title">Start a new strip?</T>
        <T v="body" style={{ marginTop: space.md }}>
          {strip.id} will be retired. Your next scan records the new strip's optical baseline; trends continue across strips, and comparisons note the calibration change.
        </T>
        <Button
          label="Confirm replacement"
          style={{ marginTop: space.xl }}
          onPress={() => {
            dispatch({ type: 'replaceStrip', at: new Date() });
            setConfirm(false);
          }}
        />
        <Button label="Cancel" kind="ghost" style={{ marginTop: space.sm }} onPress={() => setConfirm(false)} />
      </BottomSheet>
    </View>
  );
}

function Gauge({ label, value, display, limit, status, marks }: { label: string; value: number; display: string; limit: string; status: Status; marks?: number[] }) {
  return (
    <View style={{ marginBottom: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <T v="small" style={{ color: colors.text }}>{label}</T>
        <T v="small"><T v="small" style={{ color: colors.text }}>{display}</T>{limit ? `  ·  ${limit}` : ''}</T>
      </View>
      <Meter value={value} status={status} marks={marks} />
    </View>
  );
}

function HistoryRow({ title, sub, value }: { title: string; sub: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline }}>
      <View style={{ flex: 1 }}>
        <T v="small" style={{ color: colors.text }}>{title}</T>
        <T v="small" style={{ fontSize: 11 }}>{sub}</T>
      </View>
      <T v="small" style={{ color: colors.text }}>{value}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
