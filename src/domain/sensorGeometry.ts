import { BIOMARKER_COLORS } from './biomarkers';
/** Sensor anchors use the same tooth frames as the rendered crowns. No subgingival points. */
import { frameFor, localToModel, type Vec3 } from './arch';
import type { SensingSite, SensorReferenceSpot } from './types';
import { siteTeeth } from './sensorLayout';

type Placement = Pick<SensingSite, 'toothUniversal' | 'surface' | 'contactWith' | 'face' | 'height' | 'half' | 'corner' | 'offset'>;
const unit = (v: Vec3): Vec3 => { const length = Math.hypot(...v) || 1; return [v[0] / length, v[1] / length, v[2] / length]; };
export function sensorAnchor(site: Placement | SensorReferenceSpot): { p: Vec3; n: Vec3 } {
  const placement = site as Placement;
  const teeth = siteTeeth(placement);
  const faceSign = placement.face === 'buccal' ? 1 : -1;
  const points: Vec3[] = [];
  const normals: Vec3[] = [];
  for (const tooth of teeth) {
    const f = frameFor(tooth)!;
    let t = 0;
    if (placement.contactWith != null) {
      const other = frameFor(teeth.find(value => value !== tooth)!)!;
      const distal = other.tooth.position > f.tooth.position;
      t = (distal ? 1 : -1) * (f.w / 2 + 0.175);
    } else if (placement.corner) t = (placement.corner === 'distal' ? 1 : -1) * f.w * 0.35;
    else if (placement.half) t = (placement.half === 'distal' ? 1 : -1) * f.w * 0.23;
    const n = faceSign * (f.b * (placement.corner ? 0.42 : 0.5) + 0.65);
    const y = placement.height === 'gingival-margin' ? 0.35 : f.h * 0.5;
    points.push(localToModel(f, t + (placement.offset?.[0] ?? 0), n, y + (placement.offset?.[1] ?? 0)));
    normals.push([f.normal[0] * faceSign, 0, f.normal[2] * faceSign]);
  }
  const average = (values: Vec3[]): Vec3 => [0, 1, 2].map(axis => values.reduce((sum, value) => sum + value[axis], 0) / values.length) as Vec3;
  return { p: average(points), n: unit(average(normals)) };
}

/** Physical sensor map is independent of whether a clinical reading is available. */
export function configuredSensorRegions(strip: import('./types').Strip, mode: 'overview' | import('./biomarkers').BiomarkerId = 'overview'): import('../three/regions').Region[] {
  const sites = strip.sites.filter(site => mode === 'overview' || site.biomarker === mode);
  const references = strip.sensorReferences.filter(site => mode === 'overview' || site.biomarker === mode);
  return [
    ...sites.map(site => { const { p, n } = sensorAnchor(site); return { id: site.id, tooth: site.toothUniversal, anchor: p, normal: n, radius: site.footprintMm, color: BIOMARKER_COLORS[site.biomarker], intensity: 1, outline: false, wrap: site.contactWith != null }; }),
    ...references.map(reference => { const { p, n } = sensorAnchor(reference); return { id: reference.id, tooth: reference.toothUniversal, anchor: p, normal: n, radius: 0.7, color: BIOMARKER_COLORS[reference.biomarker], intensity: 0, outline: false }; }),
  ];
}
