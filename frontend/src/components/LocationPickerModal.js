import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  MyLocation,
  Close,
  CheckCircle,
  Place,
  Navigation,
} from '@mui/icons-material';

// Major Northern Uganda Town Presets with Coordinates & Sub-regions
export const NORTHERN_UGANDA_PRESETS = [
  { name: 'Gulu City', district: 'Gulu', region: 'Acholi', lat: 2.774950, lng: 32.299110 },
  { name: 'Lira City', district: 'Lira', region: 'Lango', lat: 2.247200, lng: 32.899800 },
  { name: 'Arua City', district: 'Arua', region: 'West Nile', lat: 3.030300, lng: 30.910700 },
  { name: 'Kitgum Municipality', district: 'Kitgum', region: 'Acholi', lat: 3.284800, lng: 32.883700 },
  { name: 'Nebbi Municipality', district: 'Nebbi', region: 'West Nile', lat: 2.478300, lng: 31.088900 },
  { name: 'Koboko Municipality', district: 'Koboko', region: 'West Nile', lat: 3.413600, lng: 30.960000 },
  { name: 'Moroto Municipality', district: 'Moroto', region: 'Karamoja', lat: 2.534500, lng: 34.666600 },
  { name: 'Nwoya / Anaka', district: 'Nwoya', region: 'Acholi', lat: 2.600000, lng: 31.950000 },
  { name: 'Oyam', district: 'Oyam', region: 'Lango', lat: 2.381100, lng: 32.500800 },
  { name: 'Apac Municipality', district: 'Apac', region: 'Lango', lat: 1.975600, lng: 32.538600 },
  { name: 'Dokolo', district: 'Dokolo', region: 'Lango', lat: 1.916700, lng: 33.166700 },
  { name: 'Pader', district: 'Pader', region: 'Acholi', lat: 2.800000, lng: 33.083300 },
  { name: 'Yumbe', district: 'Yumbe', region: 'West Nile', lat: 3.465100, lng: 31.246900 },
  { name: 'Adjumani', district: 'Adjumani', region: 'West Nile', lat: 3.377900, lng: 31.790900 },
  { name: 'Moyo', district: 'Moyo', region: 'West Nile', lat: 3.658600, lng: 31.724700 },
  { name: 'Amuru', district: 'Amuru', region: 'Acholi', lat: 2.783300, lng: 31.916700 },
  { name: 'Kotido', district: 'Kotido', region: 'Karamoja', lat: 2.980600, lng: 34.133100 },
  { name: 'Kaabong', district: 'Kaabong', region: 'Karamoja', lat: 3.513300, lng: 34.120300 },
  { name: 'Abim', district: 'Abim', region: 'Karamoja', lat: 2.697500, lng: 33.660300 },
  { name: 'Otuke', district: 'Otuke', region: 'Lango', lat: 2.483300, lng: 33.500000 },
  { name: 'Alebtong', district: 'Alebtong', region: 'Lango', lat: 2.250000, lng: 33.300000 },
  { name: 'Kole', district: 'Kole', region: 'Lango', lat: 2.383300, lng: 32.783300 },
  { name: 'Maracha', district: 'Maracha', region: 'West Nile', lat: 3.283300, lng: 30.933300 },
  { name: 'Zombo', district: 'Zombo', region: 'West Nile', lat: 2.516700, lng: 30.900000 },
];

const DEFAULT_CENTER = [2.80, 32.50]; // Central Northern Uganda axis
const DEFAULT_ZOOM = 8;

// Create draggable custom location pin
const createPickerPinIcon = () => {
  const html = `
    <div style="position: relative; width: 38px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: grab;">
      <svg viewBox="0 0 24 32" width="38" height="48" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));">
        <path d="M12 0 C5.37 0 0 5.37 0 12 C0 21 12 32 12 32 C12 32 24 21 24 12 C24 5.37 18.63 0 12 0 Z" fill="#1B5E20"/>
        <circle cx="12" cy="12" r="7.5" fill="#ffffff"/>
        <circle cx="12" cy="12" r="4.5" fill="#E65100"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    className: 'picker-pin',
    html,
    iconSize: [38, 48],
    iconAnchor: [19, 48],
  });
};

export default function LocationPickerModal({
  open,
  onClose,
  initialLatitude,
  initialLongitude,
  initialBusinessName = '',
  onLocationSelected,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Initialise coordinates on open
  useEffect(() => {
    if (!open) return;

    let initLat = initialLatitude !== null && initialLatitude !== undefined && initialLatitude !== ''
      ? parseFloat(initialLatitude) : null;
    let initLng = initialLongitude !== null && initialLongitude !== undefined && initialLongitude !== ''
      ? parseFloat(initialLongitude) : null;

    if (initLat !== null && !isNaN(initLat) && initLng !== null && !isNaN(initLng)) {
      setLat(initLat.toFixed(6));
      setLng(initLng.toFixed(6));
    } else {
      setLat('');
      setLng('');
    }
    setSelectedPreset('');
    setStatusMessage('');
  }, [open, initialLatitude, initialLongitude]);

  // Leaflet Map Initialization
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const currentLat = parseFloat(lat);
      const currentLng = parseFloat(lng);
      const hasCoord = !isNaN(currentLat) && !isNaN(currentLng);
      const center = hasCoord ? [currentLat, currentLng] : DEFAULT_CENTER;
      const zoom = hasCoord ? 14 : DEFAULT_ZOOM;

      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        minZoom: 6,
        maxZoom: 18,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Marker
      if (hasCoord) {
        const marker = L.marker(center, {
          icon: createPickerPinIcon(),
          draggable: true,
        }).addTo(map);

        marker.on('dragend', (e) => {
          const position = e.target.getLatLng();
          setLat(position.lat.toFixed(6));
          setLng(position.lng.toFixed(6));
          setStatusMessage('📍 Pin position updated');
        });

        markerRef.current = marker;
      }

      // Click on map to place/move pin
      map.on('click', (e) => {
        const clickedLat = e.latlng.lat.toFixed(6);
        const clickedLng = e.latlng.lng.toFixed(6);
        setLat(clickedLat);
        setLng(clickedLng);
        setStatusMessage('📍 Selected position from map');

        if (markerRef.current) {
          markerRef.current.setLatLng(e.latlng);
        } else {
          const newMarker = L.marker(e.latlng, {
            icon: createPickerPinIcon(),
            draggable: true,
          }).addTo(map);

          newMarker.on('dragend', (dragEv) => {
            const pos = dragEv.target.getLatLng();
            setLat(pos.lat.toFixed(6));
            setLng(pos.lng.toFixed(6));
            setStatusMessage('📍 Pin position updated');
          });
          markerRef.current = newMarker;
        }
      });

      mapInstanceRef.current = map;
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // When lat/lng change from inputs or presets, update map marker & view
  const updateMapMarker = (newLat, newLng, newZoom = null) => {
    const pLat = parseFloat(newLat);
    const pLng = parseFloat(newLng);
    if (isNaN(pLat) || isNaN(pLng)) return;

    if (mapInstanceRef.current) {
      const latLng = [pLat, pLng];
      if (newZoom) {
        mapInstanceRef.current.setView(latLng, newZoom, { animate: true });
      } else {
        mapInstanceRef.current.panTo(latLng, { animate: true });
      }

      if (markerRef.current) {
        markerRef.current.setLatLng(latLng);
      } else {
        const newMarker = L.marker(latLng, {
          icon: createPickerPinIcon(),
          draggable: true,
        }).addTo(mapInstanceRef.current);

        newMarker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          setLat(pos.lat.toFixed(6));
          setLng(pos.lng.toFixed(6));
          setStatusMessage('📍 Pin position updated');
        });
        markerRef.current = newMarker;
      }
    }
  };

  // Handle Preset Select
  const handlePresetSelect = (presetName) => {
    setSelectedPreset(presetName);
    const preset = NORTHERN_UGANDA_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      const sLat = preset.lat.toFixed(6);
      const sLng = preset.lng.toFixed(6);
      setLat(sLat);
      setLng(sLng);
      setStatusMessage(`📍 Selected preset: ${preset.name} (${preset.district} District)`);
      updateMapMarker(sLat, sLng, 14);
    }
  };

  // Device GPS
  const handleCaptureLiveGps = () => {
    if (!navigator.geolocation) {
      setStatusMessage('⚠️ Geolocation is not supported by your browser');
      return;
    }
    setGpsLoading(true);
    setStatusMessage('📡 Acquiring high-accuracy GPS fix…');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const deviceLat = pos.coords.latitude.toFixed(6);
        const deviceLng = pos.coords.longitude.toFixed(6);
        const accuracy = Math.round(pos.coords.accuracy || 0);

        setLat(deviceLat);
        setLng(deviceLng);
        setGpsLoading(false);
        setStatusMessage(`✅ Live GPS captured (Accuracy: ±${accuracy}m)`);
        updateMapMarker(deviceLat, deviceLng, 16);
      },
      (err) => {
        setGpsLoading(false);
        setStatusMessage(`❌ GPS error: ${err.message || 'Unable to retrieve location'}`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Reset to Northern Uganda center
  const handleResetNorth = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM, { animate: true });
    }
  };

  // Confirm Selection
  const handleSave = () => {
    const pLat = lat !== '' ? parseFloat(lat) : null;
    const pLng = lng !== '' ? parseFloat(lng) : null;

    if (onLocationSelected) {
      onLocationSelected({
        latitude: pLat,
        longitude: pLng,
        presetTown: selectedPreset || null,
      });
    }
    onClose();
  };

  const handleClearLocation = () => {
    setLat('');
    setLng('');
    setSelectedPreset('');
    if (markerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    setStatusMessage('Location cleared');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: '#E8F5E9', color: '#1B5E20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Place />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Capture MSME GPS Location
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {initialBusinessName ? `Setting location for: ${initialBusinessName}` : 'Northern Uganda Spatial Location Capture'}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {/* Controls Row */}
        <Grid container spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
          {/* Northern Uganda Town Presets */}
          <Grid item xs={12} sm={6} md={5}>
            <FormControl size="small" fullWidth>
              <InputLabel>Northern Uganda Town Preset</InputLabel>
              <Select
                value={selectedPreset}
                label="Northern Uganda Town Preset"
                onChange={(e) => handlePresetSelect(e.target.value)}
              >
                <MenuItem value=""><em>-- Choose Town / District --</em></MenuItem>
                {NORTHERN_UGANDA_PRESETS.map((p) => (
                  <MenuItem key={p.name} value={p.name}>
                    {p.name} ({p.district} · {p.region})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12} sm={6} md={7} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={gpsLoading ? <CircularProgress size={14} color="inherit" /> : <MyLocation />}
              disabled={gpsLoading}
              onClick={handleCaptureLiveGps}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              {gpsLoading ? 'Locating…' : 'Capture Live GPS'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Navigation />}
              onClick={handleResetNorth}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              Reset North
            </Button>
            <Button
              variant="text"
              color="error"
              size="small"
              onClick={handleClearLocation}
              sx={{ textTransform: 'none', fontSize: 12 }}
            >
              Clear
            </Button>
          </Grid>
        </Grid>

        {/* Interactive Map Container */}
        <Paper
          sx={{
            position: 'relative',
            height: '380px',
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            mb: 1.5,
          }}
        >
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Map Helper Prompt */}
          <Paper
            elevation={2}
            sx={{
              position: 'absolute',
              top: 10,
              left: 10,
              zIndex: 1000,
              py: 0.5,
              px: 1.25,
              borderRadius: 1.5,
              bgcolor: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <Typography variant="caption" fontWeight={600} color="#1B5E20">
              💡 Click anywhere or drag the pin to pinpoint premises
            </Typography>
          </Paper>
        </Paper>

        {/* Coordinate Display & Manual Inputs */}
        <Grid container spacing={1.5} alignItems="center">
          <Grid item xs={12} sm={6}>
            <TextField
              size="small"
              fullWidth
              label="Latitude"
              type="number"
              inputProps={{ step: 'any' }}
              value={lat}
              onChange={(e) => {
                setLat(e.target.value);
                updateMapMarker(e.target.value, lng);
              }}
              placeholder="e.g. 2.774950"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              size="small"
              fullWidth
              label="Longitude"
              type="number"
              inputProps={{ step: 'any' }}
              value={lng}
              onChange={(e) => {
                setLng(e.target.value);
                updateMapMarker(lat, e.target.value);
              }}
              placeholder="e.g. 32.299110"
            />
          </Grid>
        </Grid>

        {/* Status Message */}
        {statusMessage && (
          <Typography variant="caption" sx={{ mt: 1, display: 'block', color: statusMessage.includes('❌') ? 'error.main' : 'success.main', fontWeight: 600 }}>
            {statusMessage}
          </Typography>
        )}

        {/* Quick Town Chips */}
        <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, fontWeight: 600 }}>
            Quick Presets:
          </Typography>
          {['Gulu City', 'Lira City', 'Arua City', 'Kitgum Municipality', 'Nebbi Municipality', 'Moroto Municipality'].map((city) => (
            <Chip
              key={city}
              label={city.replace(' Municipality', '')}
              size="small"
              variant={selectedPreset === city ? 'filled' : 'outlined'}
              color={selectedPreset === city ? 'success' : 'default'}
              onClick={() => handlePresetSelect(city)}
              sx={{ fontSize: 11, cursor: 'pointer' }}
            />
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSave}
          disabled={lat === '' || lng === ''}
          startIcon={<CheckCircle />}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Apply Coordinates
        </Button>
      </DialogActions>
    </Dialog>
  );
}
