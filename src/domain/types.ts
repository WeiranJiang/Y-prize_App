import type { SurfaceId } from './arch';
import type { BiomarkerId } from './biomarkers';
import type { Arch } from './teeth';

export type SiteRole = 'measure' | 'comparison';

/** A configured sensing location on the strip (may contain several transmitters). */
export interface SensingSite {
  id: string;
  toothUniversal: number;
  surface: SurfaceId;
  biomarker: BiomarkerId;
  role: SiteRole;
  /** Radius (mm) of the area a site's transmitters actually sample. */
  footprintMm: number;
  /** Transmitter ids grouped into this site (research mode). */
  transmitters: string[];
  /** [mm along the arch, mm in height] from the surface anchor, so sensors can share a surface. */
  offset?: [number, number];
  /** A shared contact is one physical sensor associated with both teeth. */
  contactWith?: number;
  face?: 'buccal' | 'lingual';
  height?: 'mid-crown' | 'gingival-margin';
  half?: 'mesial' | 'distal';
  corner?: 'mesial' | 'distal';
}

/** Chemically inert optical spot used to separate fouling from chemistry. */
export interface ReferenceSpot {
  id: string;
  label: string;
  toothUniversal: number;
  surface: SurfaceId;
}

/** Chemical compensation/background references, not optical clarity spots or clinical readings. */
export interface SensorReferenceSpot extends Pick<SensingSite, 'toothUniversal' | 'surface' | 'face' | 'height' | 'offset'> {
  id: string;
  label: string;
  biomarker: BiomarkerId;
  purpose: 'potassium-compensation' | 'ammp8-background';
}

export interface Strip {
  id: string;
  arch: Arch;
  batch: string;
  installedAt: string;
  retiredAt?: string;
  retiredReason?: string;
  calibrationVersion: string;
  supported: BiomarkerId[];
  sites: SensingSite[];
  referenceSpots: ReferenceSpot[];
  /** Separate from the simulated optical references used by the strip-health demo. */
  sensorReferences: SensorReferenceSpot[];
}

export type Health = 'ok' | 'degraded' | 'failed';

export interface SiteReading {
  siteId: string;
  biomarker: BiomarkerId;
  /** Ratiometric optical response (dimensionless band ratio). */
  rawRatio: number;
  /** Peak emission counts (arbitrary units). */
  rawCounts: number;
  /** Calibrated value, or null when the signal failed quality gating. */
  value: number | null;
  /** ± uncertainty in biomarker units. */
  uncertainty: number;
  snr: number;
  /** 0–1 composite quality score. */
  quality: number;
  /** Local optical transmission relative to this strip's baseline (0–1). */
  transmission: number;
  /** Estimated calibration drift (biomarker units). */
  drift: number;
  health: Health;
  calibration: 'ok' | 'recalibrate';
  /** Why the reading was withheld or down-weighted. */
  note?: string;
}

export interface ReferenceReading {
  spotId: string;
  transmission: number;
  snr: number;
}

export interface Scan {
  id: string;
  at: string;
  stripId: string;
  /** 1-based session count on this strip. */
  sessionIndex: number;
  /** Planned/actual wear for the measurement session (min). */
  sessionMinutes: number;
  /** Cumulative in-mouth exposure of the strip at readout (h), estimated from time out of case. */
  exposureHours: number;
  /** Minutes between retainer removal and optical readout. */
  readoutDelayMin: number;
  readoutWindowMin: number;
  calibrationVersion: string;
  readings: SiteReading[];
  references: ReferenceReading[];
  demo: boolean;
  /** True for the first scan of a strip, which sets its optical baseline. */
  baseline: boolean;
}

export interface StripLimits {
  /** Validated use period (days since install). */
  maxDays: number;
  maxSessions: number;
  /** Mean reference-spot transmission below which the strip must be replaced. */
  clarityReplace: number;
  /** …and below which it should be replaced soon. */
  claritySoon: number;
  /** Minimum SNR for a reading to be reported. */
  snrFloor: number;
  /** Minimum share of usable sites before readings are considered incomplete. */
  usableMin: number;
}
