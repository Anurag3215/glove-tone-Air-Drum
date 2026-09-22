// Spatial 3D Configuration for the 6 Holographic Drum Pads

export const HOLOGRAPHIC_DRUMS = [
  {
    id: 'drum1',
    name: 'CRASH',
    sound: 'crash',
    positionName: 'Upper-Left',
    pos3d: [-2.4, 1.25, -1.3],
    rot3d: [0.35, 0.45, -0.1],
    radius: 0.65,
    height: 0.08,
    isCymbal: true,
    color: '#00f3ff',
    hand: 'left',
    finger: 'pinky',
    fingerLabel: 'LITTLE FINGER'
  },
  {
    id: 'drum2',
    name: 'HI-HAT',
    sound: 'hihat',
    positionName: 'Upper-Center',
    pos3d: [0.0, 1.55, -1.8],
    rot3d: [0.45, 0.0, 0.0],
    radius: 0.60,
    height: 0.08,
    isCymbal: true,
    color: '#00f3ff',
    hand: 'right',
    finger: 'ring',
    fingerLabel: 'RING FINGER'
  },
  {
    id: 'drum3',
    name: 'TOM 1',
    sound: 'tom1',
    positionName: 'Upper-Right',
    pos3d: [2.3, 1.25, -1.3],
    rot3d: [0.35, -0.45, 0.1],
    radius: 0.62,
    height: 0.35,
    isCymbal: false,
    color: '#00f3ff',
    hand: 'right',
    finger: 'index',
    fingerLabel: 'INDEX FINGER'
  },
  {
    id: 'drum4',
    name: 'SNARE',
    sound: 'snare',
    positionName: 'Middle-Left',
    pos3d: [-1.6, 0.15, 0.1],
    rot3d: [0.22, 0.25, 0.0],
    radius: 0.72,
    height: 0.38,
    isCymbal: false,
    color: '#00f3ff',
    hand: 'left',
    finger: 'middle',
    fingerLabel: 'MIDDLE FINGER'
  },
  {
    id: 'drum5',
    name: 'TOM 2',
    sound: 'tom2',
    positionName: 'Middle-Right',
    pos3d: [1.6, 0.15, 0.1],
    rot3d: [0.22, -0.25, 0.0],
    radius: 0.74,
    height: 0.42,
    isCymbal: false,
    color: '#00f3ff',
    hand: 'right',
    finger: 'ring',
    fingerLabel: 'RING FINGER'
  },
  {
    id: 'drum6',
    name: 'KICK',
    sound: 'kick',
    positionName: 'Bottom-Center',
    pos3d: [0.0, -0.75, 1.1],
    rot3d: [0.38, 0.0, 0.0],
    radius: 0.88,
    height: 0.48,
    isCymbal: false,
    color: '#00f3ff',
    hand: 'both',
    finger: 'thumb',
    fingerLabel: 'THUMB'
  }
]

export const HOLO_COLORS = {
  primaryCyan: '#00f3ff',
  deepBlue: '#0055ff',
  accentWhite: '#ffffff',
  backgroundNavy: '#02050e',
  gridCyan: '#00f3ff',
  dimCyan: 'rgba(0, 243, 255, 0.25)',
  glowCyan: 'rgba(0, 243, 255, 0.65)',
}
