import React from 'react';
import type { BiomarkerId } from '../domain/biomarkers';
import { Legend } from './ui';

/** Status key for the 3D map: white dots are in range; only concerns are coloured. */
export default function BiomarkerLegend(_: { mode?: 'overview' | BiomarkerId; only?: BiomarkerId[] }) {
  return <Legend items={[{ status: 'mild', label: 'Borderline' }, { status: 'high', label: 'Needs attention' }]} />;
}
