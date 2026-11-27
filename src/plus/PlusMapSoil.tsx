import { Image, StyleSheet } from 'react-native';
import soil from '../../assets/soil.png';

// React Native Web also provides focus in the press state.
export type MapCardPressState = { pressed: boolean; focused?: boolean };

export const soilMapColors = {
  ground: '#33261f',
  groundRim: '#8a6a50',
  seed: '#fbf2e1',
  manualGroup: '#f3e5c9',
  seedRim: '#d0b591',
  selected: '#fff0cc',
  selectedRim: '#efd096',
  pressed: '#eed9b5',
  darkOchre: '#65492f',
  connection: '#ddc5a3',
  branch: '#b39372',
  selectedConnection: '#fff1d2',
  selectedBranch: '#e4bd81',
  selectedHalo: '#806044',
  candidate: '#f6a08b',
};

export const soilMapStyles = StyleSheet.create({
  board: { overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: soilMapColors.groundRim, backgroundColor: soilMapColors.ground },
  seed: { zIndex: 1, borderRadius: 46, borderWidth: 1, borderColor: soilMapColors.seedRim, backgroundColor: soilMapColors.seed,
    shadowColor: '#190f08', shadowOpacity: 0.32, shadowOffset: { width: 0, height: 3 }, shadowRadius: 6 },
  selected: { borderWidth: 2, borderColor: soilMapColors.selectedRim, backgroundColor: soilMapColors.selected },
  focused: { outlineColor: soilMapColors.selectedConnection, outlineStyle: 'solid', outlineWidth: 2, outlineOffset: 2 },
  pressed: { backgroundColor: soilMapColors.pressed },
  ring: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 1, borderColor: '#b29263', borderRadius: 42 },
  texture: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', opacity: 0.34 },
});

export function PlusMapSoil() {
  return <Image source={soil} resizeMode="cover" accessible={false} aria-hidden style={soilMapStyles.texture} />;
}
