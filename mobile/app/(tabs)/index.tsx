import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
  Dimensions,
  Animated,
  ActivityIndicator,
  Switch,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { calculateRoute } from '@/services/api';
import { searchLocations, geocodeLocation, type GeoSuggestion } from '@/services/geocoding';
import type { RouteRequest, RouteResponse, RouteNode } from '@/types/route';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_FULL = SCREEN_HEIGHT * 0.52;
const SHEET_PEEK = 120;

const BA_REGION: Region = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function haversineM(a: RouteNode, b: RouteNode): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

interface Instruccion { calle: string; distanciaM: number }

function buildInstrucciones(path: RouteNode[]): Instruccion[] {
  const instrucciones: Instruccion[] = [];
  let calleActual: string | null = null;
  let distanciaActual = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const calle = path[i].label || 'Calle sin nombre';
    const distM = haversineM(path[i], path[i + 1]);
    if (calle === calleActual) {
      distanciaActual += distM;
    } else {
      if (calleActual !== null) instrucciones.push({ calle: calleActual, distanciaM: distanciaActual });
      calleActual = calle;
      distanciaActual = distM;
    }
  }
  if (calleActual) instrucciones.push({ calle: calleActual, distanciaM: distanciaActual });
  return instrucciones.filter((i) => i.distanciaM >= 10);
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

interface LocationField {
  value: string;
  selected: GeoSuggestion | null;
  suggestions: GeoSuggestion[];
  showSuggestions: boolean;
}

function initField(val = ''): LocationField {
  return { value: val, selected: null, suggestions: [], showSuggestions: false };
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const sheetY = useRef(new Animated.Value(SHEET_FULL - SHEET_PEEK)).current;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showVehicle, setShowVehicle] = useState(false);

  const [origin, setOrigin] = useState<LocationField>(initField('Villa Devoto, Buenos Aires'));
  const [destination, setDestination] = useState<LocationField>(initField('Chacarita, Buenos Aires'));
  const [activeField, setActiveField] = useState<'origin' | 'destination' | null>(null);

  const [weight, setWeight] = useState('12000');
  const [heightVal, setHeightVal] = useState('4.1');
  const [widthVal, setWidthVal] = useState('2.5');
  const [lengthVal, setLengthVal] = useState('12');
  const [avoidTolls, setAvoidTolls] = useState(true);
  const [preferHighways, setPreferHighways] = useState(true);

  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  const originTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GPS: auto-fill origin on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setOrigin((prev) => {
          if (prev.selected) return prev;
          const { latitude: lat, longitude: lon } = loc.coords;
          return {
            value: 'Mi ubicación',
            selected: { label: 'Mi ubicación', lat, lon, score: 1, source: 'backend' },
            suggestions: [],
            showSuggestions: false,
          };
        });
      } catch {
        // GPS not available, keep default value
      }
    })();
  }, []);

  function openSheet() {
    setSheetOpen(true);
    Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }

  function closeSheet() {
    setSheetOpen(false);
    Animated.spring(sheetY, { toValue: SHEET_FULL - SHEET_PEEK, useNativeDriver: true, tension: 80, friction: 12 }).start();
  }

  function handleInput(
    setField: React.Dispatch<React.SetStateAction<LocationField>>,
    timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    value: string,
    field: 'origin' | 'destination'
  ) {
    setField((f) => ({ ...f, value, selected: null, showSuggestions: false }));
    setActiveField(field);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 3) return;
    timer.current = setTimeout(async () => {
      try {
        const suggestions = await searchLocations(value.trim());
        setField((f) => ({ ...f, suggestions, showSuggestions: suggestions.length > 0 }));
      } catch {
        setField((f) => ({ ...f, suggestions: [], showSuggestions: false }));
      }
    }, 350);
  }

  function handleSelect(
    setField: React.Dispatch<React.SetStateAction<LocationField>>,
    suggestion: GeoSuggestion
  ) {
    setField({ value: suggestion.label, selected: suggestion, suggestions: [], showSuggestions: false });
    setActiveField(null);
  }

  async function resolveField(
    field: LocationField,
    setField: React.Dispatch<React.SetStateAction<LocationField>>
  ): Promise<GeoSuggestion> {
    if (field.selected) return field.selected;
    const resolved = await geocodeLocation(field.value.trim());
    setField({ value: resolved.label, selected: resolved, suggestions: [], showSuggestions: false });
    return resolved;
  }

  const handleSearch = useCallback(async () => {
    if (!origin.value.trim() || !destination.value.trim()) {
      Alert.alert('Falta información', 'Completá origen y destino.');
      return;
    }
    setIsLoading(true);
    setRouteResponse(null);
    setRouteCoords([]);
    try {
      const [o, d] = await Promise.all([
        resolveField(origin, setOrigin),
        resolveField(destination, setDestination),
      ]);
      const payload: RouteRequest = {
        originLabel: o.label,
        destinationLabel: d.label,
        origin: { lat: o.lat, lon: o.lon },
        destination: { lat: d.lat, lon: d.lon },
        vehicle: {
          maxWeightKg: Number(weight),
          maxHeightM: Number(heightVal),
          maxWidthM: Number(widthVal),
          maxLengthM: Number(lengthVal),
        },
        routingOptions: { avoidTolls, preferHighways },
      };
      const response = await calculateRoute(payload);
      setRouteResponse(response);
      if (response.found && response.path.length > 0) {
        const coords = response.path.map((n) => ({ latitude: n.lat, longitude: n.lon }));
        setRouteCoords(coords);
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 80, right: 40, bottom: SHEET_FULL + 40, left: 40 },
          animated: true,
        });
      }
      openSheet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Error al calcular la ruta.');
    } finally {
      setIsLoading(false);
    }
  }, [origin, destination, weight, heightVal, widthVal, lengthVal, avoidTolls, preferHighways]);

  const instrucciones = routeResponse?.found ? buildInstrucciones(routeResponse.path) : [];

  const activeSuggestions =
    activeField === 'origin' && origin.showSuggestions
      ? origin.suggestions
      : activeField === 'destination' && destination.showSuggestions
        ? destination.suggestions
        : [];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={BA_REGION}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {origin.selected && (
          <Marker
            coordinate={{ latitude: origin.selected.lat, longitude: origin.selected.lon }}
            title="Origen"
            pinColor="#1a73e8"
          />
        )}
        {destination.selected && (
          <Marker
            coordinate={{ latitude: destination.selected.lat, longitude: destination.selected.lon }}
            title="Destino"
            pinColor="#e53935"
          />
        )}
        {routeCoords.length > 0 && (
          <Polyline coordinates={routeCoords} strokeColor="#1a73e8" strokeWidth={4} />
        )}
      </MapView>

      {/* Top search card */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.topBar}
        pointerEvents="box-none"
      >
        <View style={styles.searchCard}>
          <View style={styles.inputRow}>
            <View style={[styles.dot, { backgroundColor: '#1a73e8' }]} />
            <TextInput
              style={styles.searchInput}
              value={origin.value}
              onChangeText={(v) => handleInput(setOrigin, originTimer, v, 'origin')}
              onFocus={() => setActiveField('origin')}
              onBlur={() => setTimeout(() => setActiveField((a) => a === 'origin' ? null : a), 200)}
              placeholder="Origen"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.inputRow}>
            <View style={[styles.dot, { backgroundColor: '#e53935' }]} />
            <TextInput
              style={styles.searchInput}
              value={destination.value}
              onChangeText={(v) => handleInput(setDestination, destTimer, v, 'destination')}
              onFocus={() => setActiveField('destination')}
              onBlur={() => setTimeout(() => setActiveField((a) => a === 'destination' ? null : a), 200)}
              placeholder="Destino"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {activeSuggestions.length > 0 && (
            <FlatList
              style={styles.suggestionList}
              data={activeSuggestions}
              keyExtractor={(_, i) => String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestionItem}
                  onPress={() =>
                    activeField === 'origin'
                      ? handleSelect(setOrigin, item)
                      : handleSelect(setDestination, item)
                  }
                >
                  <Text style={styles.suggestionText}>{item.label}</Text>
                  <Text style={styles.suggestionSource}>{item.source}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity style={styles.vehicleToggle} onPress={() => setShowVehicle((v) => !v)}>
            <Text style={styles.vehicleToggleText}>
              {showVehicle ? '▲ Ocultar perfil del camión' : '▼ Perfil del camión y preferencias'}
            </Text>
          </TouchableOpacity>

          {showVehicle && (
            <View style={styles.vehiclePanel}>
              <View style={styles.vehicleGrid}>
                <View style={styles.vehicleField}>
                  <Text style={styles.vehicleLabel}>Peso (kg)</Text>
                  <TextInput style={styles.vehicleInput} value={weight} onChangeText={setWeight} keyboardType="numeric" />
                </View>
                <View style={styles.vehicleField}>
                  <Text style={styles.vehicleLabel}>Altura (m)</Text>
                  <TextInput style={styles.vehicleInput} value={heightVal} onChangeText={setHeightVal} keyboardType="numeric" />
                </View>
                <View style={styles.vehicleField}>
                  <Text style={styles.vehicleLabel}>Ancho (m)</Text>
                  <TextInput style={styles.vehicleInput} value={widthVal} onChangeText={setWidthVal} keyboardType="numeric" />
                </View>
                <View style={styles.vehicleField}>
                  <Text style={styles.vehicleLabel}>Largo (m)</Text>
                  <TextInput style={styles.vehicleInput} value={lengthVal} onChangeText={setLengthVal} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Evitar peajes</Text>
                <Switch value={avoidTolls} onValueChange={setAvoidTolls} trackColor={{ true: '#1a73e8' }} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Preferir corredores</Text>
                <Switch value={preferHighways} onValueChange={setPreferHighways} trackColor={{ true: '#1a73e8' }} />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.searchButton, isLoading && styles.searchButtonDisabled]}
            onPress={handleSearch}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.searchButtonText}>Calcular ruta</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Bottom route sheet */}
      {routeResponse && (
        <Animated.View style={[styles.routeSheet, { transform: [{ translateY: sheetY }] }]}>
          <TouchableOpacity onPress={sheetOpen ? closeSheet : openSheet} style={styles.handleArea}>
            <View style={styles.handle} />
            {!sheetOpen && (
              <Text style={styles.peekTitle} numberOfLines={1}>
                {routeResponse.found
                  ? `${formatDistance(routeResponse.distanceM)} · ${routeResponse.estimatedDurationMin} min`
                  : 'Sin ruta compatible'}
              </Text>
            )}
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.routeLabel}>Ruta sugerida</Text>
            <Text style={styles.routeTitle}>
              {routeResponse.found
                ? `${routeResponse.originLabel} → ${routeResponse.destinationLabel}`
                : 'No se encontró una ruta'}
            </Text>

            {routeResponse.found && (
              <View style={styles.routeMeta}>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaValue}>{formatDistance(routeResponse.distanceM)}</Text>
                  <Text style={styles.metaKey}>distancia</Text>
                </View>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaValue}>{routeResponse.estimatedDurationMin} min</Text>
                  <Text style={styles.metaKey}>estimado</Text>
                </View>
              </View>
            )}

            <Text style={styles.routeSummary}>{routeResponse.routeSummary}</Text>

            {instrucciones.length > 0 && (
              <View style={styles.stepList}>
                <Text style={styles.stepsTitle}>Instrucciones</Text>
                {instrucciones.map((inst, i) => (
                  <View key={i} style={styles.stepItem}>
                    <View style={styles.stepNumber}>
                      <Text style={styles.stepNumberText}>{i + 1}</Text>
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={styles.stepStreet}>{inst.calle}</Text>
                      <Text style={styles.stepDist}>{formatDistance(inst.distanciaM)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {routeResponse.warnings?.length > 0 && (
              <View style={styles.warningList}>
                {routeResponse.warnings.map((w, i) => (
                  <Text key={i} style={styles.warningItem}>⚠ {w}</Text>
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 40,
    left: 12,
    right: 12,
    zIndex: 10,
  },
  searchCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 4,
    marginLeft: 20,
  },
  suggestionList: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 4,
  },
  suggestionItem: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionText: { fontSize: 14, color: '#111827', flex: 1 },
  suggestionSource: { fontSize: 11, color: '#9ca3af', marginLeft: 8 },
  vehicleToggle: { marginTop: 8, paddingVertical: 6 },
  vehicleToggleText: { fontSize: 12, color: '#1a73e8', fontWeight: '500' },
  vehiclePanel: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 8,
  },
  vehicleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  vehicleField: { width: '47%' },
  vehicleLabel: { fontSize: 11, color: '#6b7280', marginBottom: 3 },
  vehicleInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  switchLabel: { fontSize: 13, color: '#374151' },
  searchButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  searchButtonDisabled: { opacity: 0.6 },
  searchButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Route sheet
  routeSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_FULL,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  handleArea: { alignItems: 'center', paddingVertical: 12 },
  handle: { width: 40, height: 4, backgroundColor: '#d1d5db', borderRadius: 2 },
  peekTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
  },
  routeLabel: {
    fontSize: 11,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  routeTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  routeMeta: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metaBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  metaValue: { fontSize: 16, fontWeight: '700', color: '#1a73e8' },
  metaKey: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  routeSummary: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 19,
    marginBottom: 16,
  },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepList: { marginBottom: 16 },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepBody: { flex: 1 },
  stepStreet: { fontSize: 14, color: '#111827', fontWeight: '500' },
  stepDist: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  warningList: { marginTop: 8 },
  warningItem: { fontSize: 13, color: '#d97706', marginBottom: 4, lineHeight: 18 },
});
