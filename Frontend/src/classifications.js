// NTRO standard classification palette (FRONTEND_INTEGRATION.md §4).
// The backend sends properties.marker_color; these are the fallback + labels.
//
// This palette is mandated, and two pairs (#E63946/#D62828 crimson vs deep red)
// are close enough that colour alone cannot distinguish them. Every surface that
// uses these colours must also show the text label — never colour on its own.

export const CLASSIFICATIONS = {
  INDUSTRIAL_FIRE_ALERT: {
    color: '#E63946',
    label: 'Industrial Fire Alert',
    short: 'Ind. Fire',
    meaning: 'Thermal explosion inside refinery / chemical complex',
    priority: 'Critical',
  },
  UNMAPPED_INDUSTRIAL_ACCIDENT: {
    color: '#D62828',
    label: 'Unmapped Industrial Accident',
    short: 'Unmapped',
    meaning: 'Massive heat surge in unmapped industrial area',
    priority: 'Emergency',
  },
  PERSISTENT_INDUSTRIAL_SOURCE: {
    color: '#7209B7',
    label: 'Persistent Industrial Source',
    short: 'Persistent',
    meaning: 'Regulated flare stack / blast furnace, not a disaster',
    priority: 'Routine',
  },
  ROUTINE_GAS_FLARE: {
    color: '#F77F00',
    label: 'Routine Gas Flare',
    short: 'Gas Flare',
    meaning: 'Confirmed high-temperature hydrocarbon flaring (T > 1200 K)',
    priority: 'Routine',
  },
  AGRICULTURAL_STUBBLE_FIRE: {
    color: '#FCBF49',
    label: 'Agricultural Stubble Fire',
    short: 'Stubble',
    meaning: 'Farm biomass burn (Punjab / Haryana season)',
    priority: 'Low',
  },
  WILDFIRE_FOREST_FIRE: {
    color: '#2A9D8F',
    label: 'Wildfire / Forest Fire',
    short: 'Wildfire',
    meaning: 'Forest / wildland vegetation fire',
    priority: 'High',
  },
  FALSE_POSITIVE_GLINT: {
    color: '#A8DADC',
    label: 'False Positive (Glint)',
    short: 'Glint',
    meaning: 'Solar panel / water reflection, filtered noise',
    priority: 'Noise',
  },
  unclassified: {
    color: '#6C757D',
    label: 'Unclassified',
    short: 'Pending',
    meaning: 'Pending pipeline processing',
    priority: 'Pending',
  },
};

export const CLASSIFICATION_KEYS = Object.keys(CLASSIFICATIONS);

export const metaFor = (key) => CLASSIFICATIONS[key] || CLASSIFICATIONS.unclassified;
