import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import Svg, { Path, G } from 'react-native-svg';

// ─── Region definitions ─────────────────────────────────────────────

export interface BodyRegion {
  id: string;
  label: string;
  pathData: string; // SVG path for the front-view region
  pathDataBack?: string; // SVG path for back view (lower back only)
}

const BODY_REGIONS: BodyRegion[] = [
  {
    id: 'lower_abdomen',
    label: 'Lower abdomen',
    pathData: 'M 130 60 Q 105 65 95 85 L 95 115 L 205 115 L 205 85 Q 195 65 170 60 Z',
  },
  {
    id: 'bladder',
    label: 'Bladder area',
    pathData: 'M 130 120 L 170 120 L 173 148 Q 173 158 150 158 Q 127 158 127 148 Z',
  },
  {
    id: 'pelvic',
    label: 'Pelvic',
    pathData: 'M 115 155 Q 115 180 150 185 Q 185 180 185 155 Z',
  },
  {
    id: 'bowel_left',
    label: 'Bowel/gut (left)',
    pathData: 'M 95 100 L 130 100 L 128 150 L 98 148 Q 85 135 95 100 Z',
  },
  {
    id: 'bowel_right',
    label: 'Bowel/gut (right)',
    pathData: 'M 170 100 L 205 100 Q 215 135 202 148 L 172 150 L 170 100 Z',
  },
  {
    id: 'left_leg',
    label: 'Left leg',
    pathData: 'M 105 180 L 145 180 L 145 240 L 105 240 Z',
  },
  {
    id: 'right_leg',
    label: 'Right leg',
    pathData: 'M 155 180 L 195 180 L 195 240 L 155 240 Z',
  },
  {
    id: 'pelvic_floor',
    label: 'Pelvic floor',
    pathData: 'M 135 195 Q 150 205 165 195 L 165 215 Q 150 225 135 215 Z',
  },
  {
    id: 'lower_back',
    label: 'Lower back',
    pathData: '', // Shown in back view only
    pathDataBack: 'M 110 55 Q 150 45 190 55 L 195 135 Q 185 155 150 160 Q 115 155 105 135 Z',
  },
];

export const REGION_IDS = BODY_REGIONS.map((r) => r.id);

// ─── Colors ──────────────────────────────────────────────────────────

const INTENSITY_COLORS: Record<number, string> = {
  0: 'transparent',
  1: '#FDE8E8',
  2: '#FCD5D5',
  3: '#F8B4B4',
  4: '#F59494',
  5: '#F07070',
  6: '#E84D4D',
  7: '#DC2626',
  8: '#B91C1C',
  9: '#991B1B',
  10: '#7F1D1D',
};

function intensityColor(intensity: number): string {
  const level = Math.round(intensity);
  return INTENSITY_COLORS[level] ?? INTENSITY_COLORS[0];
}

function intensityOpacity(intensity: number): number {
  if (intensity <= 0) return 0;
  return Math.min(1, 0.15 + intensity * 0.085);
}

// ─── Props ───────────────────────────────────────────────────────────

interface BodyMapProps {
  selectedRegions: { region: string; intensity: number }[];
  onRegionChange: (regionId: string, intensity: number) => void;
  onRegionRemove: (regionId: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────

export default function BodyMap({
  selectedRegions,
  onRegionChange,
  onRegionRemove,
}: BodyMapProps) {
  const [activeRegion, setActiveRegion] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [editingRegion, setEditingRegion] = useState<string | null>(null);

  const selectedMap = new Map(
    selectedRegions.map((r) => [r.region, r.intensity])
  );

  const handleRegionTap = useCallback(
    (regionId: string) => {
      setEditingRegion(regionId);
      setActiveRegion(regionId);
    },
    []
  );

  const handleIntensityChange = useCallback(
    (value: number) => {
      if (editingRegion) {
        onRegionChange(editingRegion, value);
      }
    },
    [editingRegion, onRegionChange]
  );

  const handleClearRegion = useCallback(() => {
    if (editingRegion) {
      onRegionRemove(editingRegion);
      setEditingRegion(null);
      setActiveRegion(null);
    }
  }, [editingRegion, onRegionRemove]);

  const handleDoneEditing = useCallback(() => {
    setEditingRegion(null);
    setActiveRegion(null);
  }, []);

  const viewRegions = BODY_REGIONS.filter((r) => {
    if (showBack && r.id === 'lower_back') return true;
    if (!showBack && r.id !== 'lower_back') return true;
    return false;
  });

  const activeRegionLabel = activeRegion
    ? BODY_REGIONS.find((r) => r.id === activeRegion)?.label ?? activeRegion
    : '';

  const activeIntensity = editingRegion
    ? selectedMap.get(editingRegion) ?? 0
    : 0;

  const hasBackView = selectedMap.has('lower_back') && selectedMap.get('lower_back')! > 0;

  return (
    <View style={styles.container}>
      {/* View toggle */}
      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.viewToggleBtn, !showBack && styles.viewToggleActive]}
          onPress={() => setShowBack(false)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.viewToggleText,
              !showBack && styles.viewToggleTextActive,
            ]}
          >
            Front
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.viewToggleBtn,
            showBack && styles.viewToggleActive,
            hasBackView && styles.viewToggleHasData,
          ]}
          onPress={() => setShowBack(true)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.viewToggleText,
              showBack && styles.viewToggleTextActive,
            ]}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>

      {/* SVG Body Map */}
      <View style={styles.svgContainer}>
        <Svg
          viewBox="0 0 300 250"
          width="100%"
          height="100%"
          style={styles.svg}
        >
          {/* Body outline */}
          <Path
            d={
              showBack
                ? 'M 110 55 Q 150 40 190 55 L 200 135 Q 205 160 150 170 Q 95 160 100 135 Z'
                : 'M 115 55 Q 150 40 185 55 L 200 135 Q 205 160 150 175 Q 95 160 100 135 Z'
            }
            fill="#F9F5FF"
            stroke="#D4C5E8"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Tappable regions */}
          <G>
            {viewRegions.map((region) => {
              const pathD = showBack && region.pathDataBack
                ? region.pathDataBack
                : region.pathData;
              if (!pathD) return null;

              const intensity = selectedMap.get(region.id) ?? 0;
              const isActive = activeRegion === region.id;

              return (
                <G key={region.id}>
                  {/* Hit area (invisible, larger) */}
                  <Path
                    d={pathD}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={14}
                    onPress={() => handleRegionTap(region.id)}
                  />
                  {/* Visual fill */}
                  <Path
                    d={pathD}
                    fill={intensityColor(intensity)}
                    fillOpacity={intensityOpacity(intensity)}
                    stroke={isActive ? '#7C3AED' : '#D4C5E8'}
                    strokeWidth={isActive ? 2.5 : 1}
                    strokeLinejoin="round"
                    onPress={() => handleRegionTap(region.id)}
                  />
                </G>
              );
            })}

            {/* "During sex" indicator — small circle near pelvic area */}
            {!showBack && (
              <G>
                <Path
                  d="M 235 160 A 12 12 0 1 1 235 161 Z"
                  fill={
                    selectedMap.has('during_sex')
                      ? intensityColor(selectedMap.get('during_sex')!)
                      : '#F9F5FF'
                  }
                  fillOpacity={
                    selectedMap.has('during_sex')
                      ? intensityOpacity(selectedMap.get('during_sex')!)
                      : 0
                  }
                  stroke={
                    activeRegion === 'during_sex' ? '#7C3AED' : '#D4C5E8'
                  }
                  strokeWidth={activeRegion === 'during_sex' ? 2.5 : 1.5}
                  strokeDasharray={selectedMap.has('during_sex') ? '0' : '4 3'}
                  onPress={() => handleRegionTap('during_sex')}
                />
                <Path
                  d="M 233 157 L 237 163 M 237 157 L 233 163"
                  stroke="#D4C5E8"
                  strokeWidth={0.8}
                  fill="none"
                />
              </G>
            )}
          </G>
        </Svg>

        {/* "During sex" label */}
        {!showBack && (
          <View style={styles.duringSexLabel}>
            <Text style={styles.duringSexText}>✧ During sex</Text>
          </View>
        )}
      </View>

      {/* Intensity editor modal */}
      <Modal
        visible={editingRegion !== null}
        transparent
        animationType="fade"
        onRequestClose={handleDoneEditing}
      >
        <Pressable style={styles.modalOverlay} onPress={handleDoneEditing}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {activeRegionLabel} — Pain Intensity
            </Text>

            {/* Intensity dots */}
            <View style={styles.intensityRow}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.intensityDot,
                    {
                      backgroundColor:
                        n <= activeIntensity ? '#7C3AED' : '#E8E0F0',
                      transform: [{ scale: n === activeIntensity ? 1.35 : 1 }],
                    },
                  ]}
                  onPress={() => handleIntensityChange(n)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.intensityDotText,
                      {
                        color: n <= activeIntensity ? '#FFFFFF' : '#9B8AB5',
                      },
                    ]}
                  >
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.intensityLabel}>
              {activeIntensity === 0
                ? 'No pain'
                : activeIntensity <= 3
                  ? 'Mild'
                  : activeIntensity <= 6
                    ? 'Moderate'
                    : activeIntensity <= 8
                      ? 'Severe'
                      : 'Very severe'}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={handleClearRegion}
                activeOpacity={0.7}
              >
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={handleDoneEditing}
                activeOpacity={0.7}
              >
                <Text style={styles.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Selected regions summary */}
      {selectedRegions.length > 0 && (
        <View style={styles.selectedRow}>
          {selectedRegions.map((r) => (
            <TouchableOpacity
              key={r.region}
              style={styles.selectedChip}
              onPress={() => handleRegionTap(r.region)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.selectedDot,
                  { backgroundColor: intensityColor(r.intensity) },
                ]}
              />
              <Text style={styles.selectedText} numberOfLines={1}>
                {BODY_REGIONS.find((br) => br.id === r.region)?.label ??
                  r.region === 'during_sex'
                    ? 'During sex'
                    : r.region}{' '}
                ({r.intensity})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E8E0F0',
    padding: 16,
  },
  viewToggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#F5F0FF',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  viewToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  viewToggleActive: {
    backgroundColor: '#7C3AED',
  },
  viewToggleHasData: {
    backgroundColor: '#EDE4FA',
  },
  viewToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9B8AB5',
  },
  viewToggleTextActive: {
    color: '#FFFFFF',
  },
  svgContainer: {
    height: 200,
    position: 'relative',
  },
  svg: {
    backgroundColor: 'transparent',
  },
  duringSexLabel: {
    position: 'absolute',
    right: -4,
    top: 115,
    backgroundColor: '#F9F5FF',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  duringSexText: {
    fontSize: 9,
    color: '#9B8AB5',
    fontWeight: '600',
  },
  // ─── Modal ───────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 27, 105, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D1B69',
    marginBottom: 20,
    textAlign: 'center',
  },
  intensityRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 6,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  intensityDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intensityDotText: {
    fontSize: 12,
    fontWeight: '700',
  },
  intensityLabel: {
    fontSize: 14,
    color: '#6B5B8A',
    fontWeight: '600',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  clearBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9B8AB5',
  },
  doneBtn: {
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#7C3AED',
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // ─── Selected regions ────────────────────────────────────────────
  selectedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F0FF',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8E0F0',
  },
  selectedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  selectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C4A7A',
    maxWidth: 120,
  },
});
