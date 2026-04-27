import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Modal,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { calculateRoute } from '@/services/api';
import { searchLocations, geocodeLocation, type GeoSuggestion } from '@/services/geocoding';
import type { RouteRequest, RouteResponse, RouteNode } from '@/types/route';
import { Theme, Palette } from '@/constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_FULL = SCREEN_HEIGHT * 0.58;
const SHEET_PEEK = 240;

const BA_REGION: Region = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

type Tab = 'resumen' | 'pasos' | 'restricciones';

interface Instruccion { calle: string; distanciaM: number }

function haversineM(a: RouteNode, b: RouteNode): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

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
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

function computeETA(min: number): string {
  const d = new Date(Date.now() + min * 60_000);
  return d.toTimeString().slice(0, 5);
}

interface LocField {
  value: string;
  selected: GeoSuggestion | null;
  suggestions: GeoSuggestion[];
  showSuggestions: boolean;
}

function initLoc(val = ''): LocField {
  return { value: val, selected: null, suggestions: [], showSuggestions: false };
}

interface VehicleConfig {
  plate: string;
  weightT: string;
  weightKg: string;
  heightM: string;
  widthM: string;
  lengthM: string;
  avoidTolls: boolean;
  preferHighways: boolean;
}

const defaultVehicle: VehicleConfig = {
  plate: 'AB 234 CD',
  weightT: '12',
  weightKg: '12000',
  heightM: '4.1',
  widthM: '2.5',
  lengthM: '12',
  avoidTolls: true,
  preferHighways: true,
};

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const sheetY = useRef(new Animated.Value(SHEET_FULL - SHEET_PEEK)).current;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('resumen');

  const [origin, setOrigin] = useState<LocField>(initLoc('Mi ubicación'));
  const [dest, setDest] = useState<LocField>(initLoc());
  const [activeField, setActiveField] = useState<'origin' | 'dest' | null>(null);
  const [vehicle, setVehicle] = useState<VehicleConfig>(defaultVehicle);

  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);

  const originTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lon } = loc.coords;
        setOrigin((prev) => prev.selected ? prev : ({
          value: 'Mi ubicación',
          selected: { label: 'Mi ubicación', lat, lon, score: 1, source: 'backend' },
          suggestions: [], showSuggestions: false,
        }));
      } catch { /* sin GPS, queda editable */ }
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

  function handleLocInput(
    setField: React.Dispatch<React.SetStateAction<LocField>>,
    timer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    value: string,
  ) {
    setField((f) => ({ ...f, value, selected: null, showSuggestions: false }));
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

  function pickLoc(
    setField: React.Dispatch<React.SetStateAction<LocField>>,
    s: GeoSuggestion,
  ) {
    setField({ value: s.label, selected: s, suggestions: [], showSuggestions: false });
    setActiveField(null);
  }

  async function resolveLoc(
    field: LocField,
    setField: React.Dispatch<React.SetStateAction<LocField>>,
  ): Promise<GeoSuggestion> {
    if (field.selected) return field.selected;
    const r = await geocodeLocation(field.value.trim());
    setField({ value: r.label, selected: r, suggestions: [], showSuggestions: false });
    return r;
  }

  const handleSearch = useCallback(async () => {
    if (!origin.value.trim()) {
      Alert.alert('Falta origen', 'Indicá desde dónde salís.');
      return;
    }
    if (!dest.value.trim()) {
      Alert.alert('Falta destino', 'Buscá una dirección o lugar.');
      return;
    }
    setIsLoading(true);
    setRouteResponse(null);
    setRouteCoords([]);
    try {
      const [o, d] = await Promise.all([
        resolveLoc(origin, setOrigin),
        resolveLoc(dest, setDest),
      ]);

      const payload: RouteRequest = {
        originLabel: o.label,
        destinationLabel: d.label,
        origin: { lat: o.lat, lon: o.lon },
        destination: { lat: d.lat, lon: d.lon },
        vehicle: {
          maxWeightKg: Number(vehicle.weightKg),
          maxHeightM: Number(vehicle.heightM),
          maxWidthM: Number(vehicle.widthM),
          maxLengthM: Number(vehicle.lengthM),
        },
        routingOptions: {
          avoidTolls: vehicle.avoidTolls,
          preferHighways: vehicle.preferHighways,
        },
      };
      const response = await calculateRoute(payload);
      setRouteResponse(response);
      if (response.found && response.path.length > 0) {
        const coords = response.path.map((n) => ({ latitude: n.lat, longitude: n.lon }));
        setRouteCoords(coords);
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 120, right: 60, bottom: SHEET_FULL + 40, left: 60 },
          animated: true,
        });
      }
      setTab('resumen');
      openSheet();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Error al calcular la ruta.');
    } finally {
      setIsLoading(false);
    }
  }, [origin, dest, vehicle]);

  const instrucciones = useMemo(
    () => (routeResponse?.found ? buildInstrucciones(routeResponse.path) : []),
    [routeResponse]
  );

  const recenter = () => {
    if (routeCoords.length > 0) {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 120, right: 60, bottom: SHEET_FULL + 40, left: 60 },
        animated: true,
      });
    } else if (origin.selected) {
      mapRef.current?.animateToRegion(
        { ...BA_REGION, latitude: origin.selected.lat, longitude: origin.selected.lon },
        500,
      );
    }
  };

  const activeSuggestions =
    activeField === 'origin' && origin.showSuggestions ? origin.suggestions
    : activeField === 'dest' && dest.showSuggestions ? dest.suggestions
    : [];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={BA_REGION}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {origin.selected && (
          <Marker coordinate={{ latitude: origin.selected.lat, longitude: origin.selected.lon }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.truckMarker}>
              <MaterialCommunityIcons name="truck" size={18} color={Palette.white} />
            </View>
          </Marker>
        )}
        {dest.selected && (
          <Marker coordinate={{ latitude: dest.selected.lat, longitude: dest.selected.lon }} />
        )}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor={Theme.brand}
            strokeWidth={6}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>

      {/* Top: pill camión activo + botón cuadrado */}
      <View style={styles.topRow} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.activeTruckPill}
          activeOpacity={0.85}
          onPress={() => setVehicleOpen(true)}
        >
          <View style={styles.truckBadge}>
            <MaterialCommunityIcons name="truck" size={18} color={Palette.white} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.activeTruckEyebrow}>CAMIÓN ACTIVO</Text>
            <Text style={styles.activeTruckLine}>
              <Text style={styles.activeTruckPlate}>{vehicle.plate}</Text>
              <Text style={styles.activeTruckMeta}>  ·  {vehicle.weightT} t  ·  {vehicle.heightM} m</Text>
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Theme.textOnDark} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.truckSquare} activeOpacity={0.85} onPress={() => setVehicleOpen(true)}>
          <MaterialCommunityIcons name="truck" size={22} color={Theme.brand} />
        </TouchableOpacity>
      </View>

      {/* FABs derechos */}
      <View style={styles.fabColumn} pointerEvents="box-none">
        <TouchableOpacity style={styles.fabLight}>
          <MaterialCommunityIcons name="layers-outline" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabLight}>
          <Ionicons name="compass-outline" size={20} color={Theme.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fabDark} onPress={recenter}>
          <MaterialCommunityIcons name="crosshairs-gps" size={20} color={Palette.white} />
        </TouchableOpacity>
      </View>

      {/* Bottom sheet */}
      <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
        <TouchableOpacity onPress={sheetOpen ? closeSheet : openSheet} style={styles.handleArea}>
          <View style={styles.handle} />
        </TouchableOpacity>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Origen */}
          <View style={styles.searchRow}>
            <View style={styles.dotOrigin} />
            <TextInput
              style={styles.searchInput}
              value={origin.value}
              onChangeText={(v) => handleLocInput(setOrigin, originTimer, v)}
              onFocus={() => setActiveField('origin')}
              placeholder="Origen"
              placeholderTextColor={Theme.textMuted}
            />
            {origin.value.length > 0 && (
              <TouchableOpacity onPress={() => setOrigin(initLoc())}>
                <Ionicons name="close-circle" size={18} color={Theme.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Destino */}
          <View style={[styles.searchRow, { marginTop: 8 }]}>
            <View style={styles.dotDest} />
            <TextInput
              style={styles.searchInput}
              value={dest.value}
              onChangeText={(v) => handleLocInput(setDest, destTimer, v)}
              onFocus={() => setActiveField('dest')}
              placeholder="Buscá una dirección o lugar"
              placeholderTextColor={Theme.textMuted}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <TouchableOpacity style={styles.micBtn}>
              <Ionicons name="mic" size={16} color={Palette.white} />
            </TouchableOpacity>
          </View>

          {activeSuggestions.length > 0 && (
            <FlatList
              style={styles.suggestList}
              data={activeSuggestions}
              keyExtractor={(_, i) => String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestItem}
                  onPress={() => pickLoc(activeField === 'origin' ? setOrigin : setDest, item)}
                >
                  <Ionicons name="location-outline" size={16} color={Theme.textSecond} />
                  <Text style={styles.suggestText} numberOfLines={1}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          {/* Hero ruta */}
          <View style={styles.routeHero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeEyebrow}>
                RUTA SUGERIDA  ·  <Text style={styles.routeEyebrowSoft}>APTA PARA CAMIÓN</Text>
              </Text>
              {routeResponse?.found ? (
                <>
                  <Text style={styles.routeBig}>
                    <Text style={styles.routeBigNum}>{routeResponse.estimatedDurationMin}</Text>
                    <Text style={styles.routeBigUnit}> min</Text>
                    <Text style={styles.routeBigSep}>  ·  </Text>
                    <Text style={styles.routeBigDist}>{formatKm(routeResponse.distanceM)}</Text>
                  </Text>
                  <Text style={styles.routeSub}>
                    Llegás <Text style={styles.routeSubBold}>{computeETA(routeResponse.estimatedDurationMin)}</Text>
                    {' '}· velocidad camión
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.routeBig}>
                    <Text style={styles.routeBigNum}>—</Text>
                    <Text style={styles.routeBigUnit}> min</Text>
                  </Text>
                  <Text style={styles.routeSub}>Buscá un destino para calcular la ruta</Text>
                </>
              )}
            </View>

            <TouchableOpacity
              style={[styles.startBtn, isLoading && styles.startBtnDisabled]}
              onPress={handleSearch}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading ? (
                <ActivityIndicator color={Palette.white} />
              ) : (
                <>
                  <Ionicons name="arrow-up" size={16} color={Palette.white} />
                  <Text style={styles.startBtnText}>Iniciar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Warnings reales del backend */}
          {routeResponse?.found && (routeResponse.warnings?.length ?? 0) > 0 && (
            <View style={{ marginBottom: Theme.spaceLg }}>
              {routeResponse.warnings.map((w, i) => (
                <View key={i} style={styles.cardWarn}>
                  <View style={styles.cardIconWrapWarn}>
                    <Ionicons name="warning" size={18} color={Theme.warning} />
                  </View>
                  <Text style={[styles.cardTitle, { flex: 1 }]}>{w}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabBar}>
            {(['resumen', 'pasos', 'restricciones'] as Tab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'resumen' ? 'Resumen' : t === 'pasos' ? 'Pasos' : 'Restricciones'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab content */}
          {tab === 'resumen' && routeResponse?.found && (
            <Text style={styles.tabBody}>{routeResponse.routeSummary}</Text>
          )}

          {tab === 'pasos' && (
            <View style={styles.stepList}>
              {instrucciones.length === 0 && (
                <Text style={styles.tabBody}>Aún no hay pasos. Calculá una ruta.</Text>
              )}
              {instrucciones.map((inst, i) => (
                <View key={i} style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepStreet}>{inst.calle}</Text>
                    <Text style={styles.stepDist}>{formatDistance(inst.distanciaM)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === 'restricciones' && (
            <View>
              <View style={styles.restrRow}>
                <Text style={styles.restrKey}>Peso máx.</Text>
                <Text style={styles.restrVal}>{vehicle.weightT} t</Text>
              </View>
              <View style={styles.restrRow}>
                <Text style={styles.restrKey}>Altura</Text>
                <Text style={styles.restrVal}>{vehicle.heightM} m</Text>
              </View>
              <View style={styles.restrRow}>
                <Text style={styles.restrKey}>Ancho</Text>
                <Text style={styles.restrVal}>{vehicle.widthM} m</Text>
              </View>
              <View style={styles.restrRow}>
                <Text style={styles.restrKey}>Largo</Text>
                <Text style={styles.restrVal}>{vehicle.lengthM} m</Text>
              </View>
              <View style={styles.restrRow}>
                <Text style={styles.restrKey}>Evitar peajes</Text>
                <Text style={styles.restrVal}>{vehicle.avoidTolls ? 'Sí' : 'No'}</Text>
              </View>
              <View style={[styles.restrRow, styles.restrRowLast]}>
                <Text style={styles.restrKey}>Preferir corredores</Text>
                <Text style={styles.restrVal}>{vehicle.preferHighways ? 'Sí' : 'No'}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      {/* Modal vehículo */}
      <VehicleModal
        visible={vehicleOpen}
        value={vehicle}
        onClose={() => setVehicleOpen(false)}
        onSave={(v) => {
          setVehicle(v);
          setVehicleOpen(false);
        }}
      />
    </View>
  );
}

interface VehicleModalProps {
  visible: boolean;
  value: VehicleConfig;
  onClose: () => void;
  onSave: (v: VehicleConfig) => void;
}

function VehicleModal({ visible, value, onClose, onSave }: VehicleModalProps) {
  const [draft, setDraft] = useState<VehicleConfig>(value);

  useEffect(() => { setDraft(value); }, [value, visible]);

  const update = <K extends keyof VehicleConfig>(k: K, v: VehicleConfig[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}><Text style={styles.modalCancel}>Cancelar</Text></TouchableOpacity>
          <Text style={styles.modalTitle}>Camión activo</Text>
          <TouchableOpacity onPress={() => {
            const weightKg = String(Math.round(Number(draft.weightT.replace(',', '.')) * 1000));
            onSave({ ...draft, weightKg });
          }}>
            <Text style={styles.modalSave}>Guardar</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: Theme.spaceXl, gap: Theme.spaceLg }}>
          <Field label="Patente" value={draft.plate} onChange={(v) => update('plate', v)} autoCapitalize="characters" />
          <View style={styles.grid}>
            <Field label="Peso (t)" value={draft.weightT} onChange={(v) => update('weightT', v)} keyboard="numeric" half />
            <Field label="Altura (m)" value={draft.heightM} onChange={(v) => update('heightM', v)} keyboard="numeric" half />
            <Field label="Ancho (m)" value={draft.widthM} onChange={(v) => update('widthM', v)} keyboard="numeric" half />
            <Field label="Largo (m)" value={draft.lengthM} onChange={(v) => update('lengthM', v)} keyboard="numeric" half />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Evitar peajes</Text>
            <Switch
              value={draft.avoidTolls}
              onValueChange={(v) => update('avoidTolls', v)}
              trackColor={{ true: Theme.brand, false: Palette.charcoal12 }}
              thumbColor={Palette.white}
            />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Preferir corredores</Text>
            <Switch
              value={draft.preferHighways}
              onValueChange={(v) => update('preferHighways', v)}
              trackColor={{ true: Theme.brand, false: Palette.charcoal12 }}
              thumbColor={Palette.white}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  half?: boolean;
}
function Field({ label, value, onChange, keyboard = 'default', autoCapitalize = 'sentences', half }: FieldProps) {
  return (
    <View style={[styles.fieldWrap, half && { width: '47%' }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.surfaceAlt },

  truckMarker: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Theme.brand, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Palette.white,
    ...Theme.shadow.fab,
  },

  // Top row
  topRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: Theme.spaceLg,
    right: Theme.spaceLg,
    flexDirection: 'row',
    gap: Theme.spaceSm,
    alignItems: 'center',
    zIndex: 10,
  },
  activeTruckPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surfaceDark,
    borderRadius: Theme.radiusPill,
    paddingVertical: 8,
    paddingHorizontal: 8,
    paddingRight: 14,
    ...Theme.shadow.fab,
  },
  truckBadge: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Theme.brand, alignItems: 'center', justifyContent: 'center',
  },
  activeTruckEyebrow: {
    color: Theme.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  activeTruckLine: {
    color: Theme.textOnDark,
    fontSize: 13,
    marginTop: 1,
  },
  activeTruckPlate: { fontWeight: '800', letterSpacing: 0.3 },
  activeTruckMeta: { fontWeight: '500', color: Theme.textMuted },

  truckSquare: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Palette.white,
    alignItems: 'center', justifyContent: 'center',
    ...Theme.shadow.fab,
  },

  // FABs
  fabColumn: {
    position: 'absolute',
    right: Theme.spaceLg,
    top: SCREEN_HEIGHT * 0.32,
    gap: 10,
    zIndex: 9,
  },
  fabLight: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Palette.white,
    alignItems: 'center', justifyContent: 'center',
    ...Theme.shadow.fab,
  },
  fabDark: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: Theme.surfaceDark,
    alignItems: 'center', justifyContent: 'center',
    ...Theme.shadow.fab,
  },

  // Sheet
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SHEET_FULL,
    backgroundColor: Theme.surface,
    borderTopLeftRadius: Theme.radiusXl,
    borderTopRightRadius: Theme.radiusXl,
    ...Theme.shadow.sheet,
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: Theme.border },
  sheetContent: { paddingHorizontal: Theme.spaceXl, paddingBottom: 32 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Theme.surfaceAlt,
    borderRadius: Theme.radiusPill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: Theme.spaceLg,
  },
  searchInput: { flex: 1, fontSize: 15, color: Theme.textPrimary, paddingVertical: 4 },
  dotOrigin: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: Theme.brand,
  },
  dotDest: {
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 2, borderColor: Theme.brand, backgroundColor: 'transparent',
  },
  micBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Theme.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  suggestList: { maxHeight: 220, marginTop: -8, marginBottom: Theme.spaceMd },
  suggestItem: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Theme.border,
  },
  suggestText: { fontSize: 14, color: Theme.textPrimary, flex: 1 },

  // Hero
  routeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spaceMd,
    marginBottom: Theme.spaceLg,
  },
  routeEyebrow: {
    color: Theme.brand,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    marginBottom: 6,
  },
  routeEyebrowSoft: { color: Theme.textSecond, fontWeight: '700' },
  routeBig: { color: Theme.textPrimary },
  routeBigNum: { fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  routeBigUnit: { fontSize: 16, fontWeight: '600', color: Theme.textSecond },
  routeBigSep: { fontSize: 16, color: Theme.textMuted },
  routeBigDist: { fontSize: 18, fontWeight: '700' },
  routeSub: { fontSize: 13, color: Theme.textSecond, marginTop: 4 },
  routeSubBold: { fontWeight: '800', color: Theme.textPrimary },

  startBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Theme.brand,
    paddingVertical: 14, paddingHorizontal: 22,
    borderRadius: Theme.ctaRadius,
    ...Theme.shadow.fab,
  },
  startBtnDisabled: { opacity: 0.6 },
  startBtnText: { color: Palette.white, fontSize: 15, fontWeight: '800' },

  // Cards
  cardWarn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Theme.warningSoft,
    borderRadius: Theme.radiusMd,
    padding: 14,
    marginBottom: Theme.spaceLg,
  },
  cardIconWrapWarn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Palette.white,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: Theme.textPrimary },
  cardSub: { fontSize: 12, color: Theme.textSecond, marginTop: 2 },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Theme.surfaceAlt,
    borderRadius: Theme.radiusPill,
    padding: 4,
    marginTop: Theme.spaceSm,
    marginBottom: Theme.spaceLg,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Theme.radiusPill,
    alignItems: 'center',
  },
  tabBtnActive: { backgroundColor: Palette.white, ...Theme.shadow.fab },
  tabText: { fontSize: 13, fontWeight: '600', color: Theme.textSecond },
  tabTextActive: { color: Theme.textPrimary, fontWeight: '800' },
  tabBody: { fontSize: 13, color: Theme.textSecond, lineHeight: 19 },

  // Steps
  stepList: { gap: 4 },
  stepItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Theme.border,
  },
  stepNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Theme.brand, alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  stepNumberText: { color: Palette.white, fontSize: 12, fontWeight: '800' },
  stepStreet: { fontSize: 14, color: Theme.textPrimary, fontWeight: '600' },
  stepDist: { fontSize: 12, color: Theme.textSecond, marginTop: 2 },

  // Restricciones
  restrRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Theme.border,
  },
  restrRowLast: { borderBottomWidth: 0 },
  restrKey: { fontSize: 13, color: Theme.textSecond },
  restrVal: { fontSize: 14, fontWeight: '700', color: Theme.textPrimary },

  // Modal
  modalRoot: { flex: 1, backgroundColor: Theme.surfaceAlt },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Theme.spaceXl, paddingTop: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: Theme.border,
    backgroundColor: Theme.surface,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Theme.textPrimary },
  modalCancel: { fontSize: 15, color: Theme.textSecond },
  modalSave: { fontSize: 15, color: Theme.brand, fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldWrap: {},
  fieldLabel: { fontSize: 11, color: Theme.textSecond, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  fieldInput: {
    backgroundColor: Theme.surface,
    borderRadius: Theme.radiusMd,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Theme.textPrimary,
    borderWidth: 1, borderColor: Theme.border,
  },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Theme.surface,
    borderRadius: Theme.radiusMd,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: Theme.border,
  },
  switchLabel: { fontSize: 14, color: Theme.textPrimary, fontWeight: '600' },
});
