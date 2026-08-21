import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Button,
  Chip,
  IconButton,
  Paper,
  Divider,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from '@mui/material';
import {
  Search,
  Refresh,
  CheckCircle,
  Warning,
  Close,
  Place,
  Navigation,
} from '@mui/icons-material';
import LocationPickerModal, { NORTHERN_UGANDA_PRESETS } from './LocationPickerModal';

// Center of Northern Uganda (Gulu / Acholi / Lango / West Nile central axis)
const NORTHERN_UGANDA_CENTER = [2.80, 32.50];
const NORTHERN_UGANDA_ZOOM = 8;

// Sector Color Palette
const SECTOR_COLORS = {
  'Agriculture': '#2E7D32',
  'Agribusiness': '#388E3C',
  'Agro-processing': '#43A047',
  'Manufacturing': '#E65100',
  'Trade & Commerce': '#1976D2',
  'Trade': '#1976D2',
  'Services': '#0288D1',
  'Tourism & Hospitality': '#00897B',
  'Renewable Energy & Waste': '#00796B',
  'Green Business': '#00C853',
  'Technology': '#512DA8',
  'ICT & Digital': '#512DA8',
  'Healthcare': '#C2185B',
  'Education': '#D84315',
  'Construction': '#6D4C41',
  'default': '#7B1FA2',
};

const getSectorColor = (sector) => {
  if (!sector) return SECTOR_COLORS.default;
  for (const [key, color] of Object.entries(SECTOR_COLORS)) {
    if (sector.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return SECTOR_COLORS.default;
};

// Create a custom SVG Leaflet DivIcon
const createCustomMarkerIcon = (msme) => {
  const color = getSectorColor(msme.sector);
  const isCoAssigned = (msme.co_assigned_bge_names || []).length > 0;
  const isAssigned = !!msme.assigned_bge;

  const ringColor = isCoAssigned ? '#7B1FA2' : isAssigned ? '#2E7D32' : '#9E9E9E';

  const html = `
    <div style="position: relative; width: 34px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <svg viewBox="0 0 24 32" width="34" height="42" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.3));">
        <path d="M12 0 C5.37 0 0 5.37 0 12 C0 21 12 32 12 32 C12 32 24 21 24 12 C24 5.37 18.63 0 12 0 Z" fill="${color}"/>
        <circle cx="12" cy="12" r="7" fill="#ffffff"/>
        <circle cx="12" cy="12" r="4.5" fill="${ringColor}"/>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: 'custom-msme-pin',
    html,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -38],
  });
};

export default function MSMEMap({
  msmes = [],
  experts = [],
  cohorts = [],
  programmeGroups = [],
  onOpenMsme,
  onUpdateMsmeLocation,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedBge, setSelectedBge] = useState('all');
  const [selectedCohort, setSelectedCohort] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedGpsFilter, setSelectedGpsFilter] = useState('all');
  const [unplottedDialogOpen, setUnplottedDialogOpen] = useState(false);

  // Location Picker State
  const [pickerTargetMsme, setPickerTargetMsme] = useState(null);

  // Extract distinct districts and sectors for dropdowns
  const distinctDistricts = useMemo(() => {
    const set = new Set();
    msmes.forEach((m) => {
      const d = m.district || m.diag_district || m.state || m.city;
      if (d && typeof d === 'string' && d.trim()) set.add(d.trim());
    });
    return Array.from(set).sort();
  }, [msmes]);

  const distinctSectors = useMemo(() => {
    const set = new Set();
    msmes.forEach((m) => {
      if (m.sector && typeof m.sector === 'string' && m.sector.trim()) set.add(m.sector.trim());
    });
    return Array.from(set).sort();
  }, [msmes]);

  // Valid GPS MSMEs calculation
  const parsedMsmes = useMemo(() => {
    return msmes.map((m) => {
      const lat = m.latitude !== null && m.latitude !== undefined && m.latitude !== '' ? parseFloat(m.latitude) : null;
      const lng = m.longitude !== null && m.longitude !== undefined && m.longitude !== '' ? parseFloat(m.longitude) : null;
      const hasValidGps = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat >= -1.5 && lat <= 4.5 && lng >= 29.5 && lng <= 35.5;

      return {
        ...m,
        parsedLat: hasValidGps ? lat : null,
        parsedLng: hasValidGps ? lng : null,
        hasValidGps,
      };
    });
  }, [msmes]);

  // Filtered MSMEs
  const filteredMsmes = useMemo(() => {
    return parsedMsmes.filter((m) => {
      // Search
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = (m.business_name || '').toLowerCase().includes(q);
        const matchCode = (m.msme_code || '').toLowerCase().includes(q);
        const matchOwner = (m.owner_name || m.contact_name || '').toLowerCase().includes(q);
        const matchCity = (m.city || m.district || m.state || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchOwner && !matchCity) return false;
      }

      // District
      if (selectedDistrict !== 'all') {
        const d = (m.district || m.diag_district || m.state || m.city || '').toLowerCase();
        if (!d.includes(selectedDistrict.toLowerCase())) return false;
      }

      // Sector
      if (selectedSector !== 'all') {
        if ((m.sector || '') !== selectedSector) return false;
      }

      // BGE
      if (selectedBge !== 'all') {
        if (selectedBge === 'unassigned') {
          if (m.assigned_bge) return false;
        } else if (selectedBge === 'co_assigned') {
          if (!(m.co_assigned_bge_names || []).length) return false;
        } else {
          const bgeId = parseInt(selectedBge, 10);
          const isPrimary = m.assigned_bge === bgeId;
          const isCo = (m.co_assigned_bge_names || []).some((b) => b.id === bgeId);
          if (!isPrimary && !isCo) return false;
        }
      }

      // Cohort
      if (selectedCohort !== 'all') {
        if (m.cohort !== parseInt(selectedCohort, 10)) return false;
      }

      // Group
      if (selectedGroup !== 'all') {
        const hasGrp = (m.programme_groups || []).includes(parseInt(selectedGroup, 10));
        if (!hasGrp) return false;
      }

      // GPS Filter
      if (selectedGpsFilter === 'with_gps' && !m.hasValidGps) return false;
      if (selectedGpsFilter === 'without_gps' && m.hasValidGps) return false;

      return true;
    });
  }, [parsedMsmes, searchTerm, selectedDistrict, selectedSector, selectedBge, selectedCohort, selectedGroup, selectedGpsFilter]);

  const plottedMsmes = useMemo(() => filteredMsmes.filter((m) => m.hasValidGps), [filteredMsmes]);
  const unplottedMsmes = useMemo(() => filteredMsmes.filter((m) => !m.hasValidGps), [filteredMsmes]);

  // Total stats
  const stats = useMemo(() => {
    const total = msmes.length;
    const withGps = parsedMsmes.filter((m) => m.hasValidGps).length;
    const withoutGps = total - withGps;
    const plottedCurrent = plottedMsmes.length;
    return { total, withGps, withoutGps, plottedCurrent };
  }, [msmes, parsedMsmes, plottedMsmes]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: NORTHERN_UGANDA_CENTER,
      zoom: NORTHERN_UGANDA_ZOOM,
      minZoom: 6,
      maxZoom: 18,
      zoomControl: true,
    });

    // Clean OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Marker Layer Group
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers on Map when plottedMsmes changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    const markersLayer = markersLayerRef.current;
    markersLayer.clearLayers();

    if (plottedMsmes.length === 0) return;

    plottedMsmes.forEach((msme) => {
      const lat = msme.parsedLat;
      const lng = msme.parsedLng;
      const latLng = [lat, lng];

      const icon = createCustomMarkerIcon(msme);
      const marker = L.marker(latLng, { icon });

      // Popup HTML content
      const sectorColor = getSectorColor(msme.sector);
      const coNames = (msme.co_assigned_bge_names || []).map((b) => b.name).join(', ');

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 240px; max-width: 300px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 14px; color: #1E293B;">${msme.business_name || 'Unnamed Business'}</strong>
            <span style="font-size: 10px; font-weight: 700; background: #F1F5F9; color: #475569; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">
              ${msme.msme_code || 'PRUDEV2'}
            </span>
          </div>

          <div style="margin-bottom: 8px;">
            <span style="display: inline-block; font-size: 11px; font-weight: 600; color: #fff; background: ${sectorColor}; padding: 2px 8px; border-radius: 12px; margin-right: 4px;">
              ${msme.sector || 'General'}
            </span>
            ${msme.business_type ? `<span style="display: inline-block; font-size: 11px; color: #475569; background: #F8FAFC; border: 1px solid #CBD5E1; padding: 1px 6px; border-radius: 12px;">${msme.business_type}</span>` : ''}
          </div>

          <div style="border-top: 1px solid #E2E8F0; padding-top: 6px; margin-bottom: 8px; font-size: 12px; color: #334155;">
            <div>📍 <strong>Location:</strong> ${[msme.city, msme.district || msme.diag_district || msme.state].filter(Boolean).join(', ') || 'Northern Uganda'}</div>
            ${msme.phone ? `<div>📞 <strong>Phone:</strong> ${msme.phone}</div>` : ''}
            <div>👨‍💼 <strong>Primary BGE:</strong> ${msme.assigned_bge_name ? `<span style="color: #2E7D32; font-weight: 600;">${msme.assigned_bge_name}</span>` : '<span style="color: #94A3B8; font-style: italic;">Unassigned</span>'}</div>
            ${coNames ? `<div>🤝 <strong>Co-assigned:</strong> <span style="color: #7B1FA2; font-weight: 600;">${coNames}</span></div>` : ''}
            <div>📊 <strong>Reports:</strong> ${msme.total_reports || 0} visits</div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px; border-top: 1px solid #F1F5F9; pt: 6px;">
            <button id="btn-edit-loc-${msme.id}" style="background: #F1F8E9; color: #1B5E20; border: 1px solid #C8E6C9; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 2px;">
              📍 Edit Pin
            </button>
            <button id="btn-msme-${msme.id}" style="background: #1B5E20; color: #ffffff; border: none; padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
              Manage Details →
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 330 });

      marker.on('popupopen', () => {
        const btnManage = document.getElementById(`btn-msme-${msme.id}`);
        if (btnManage && onOpenMsme) {
          btnManage.onclick = () => {
            onOpenMsme(msme);
          };
        }
        const btnEditLoc = document.getElementById(`btn-edit-loc-${msme.id}`);
        if (btnEditLoc) {
          btnEditLoc.onclick = () => {
            setPickerTargetMsme(msme);
          };
        }
      });

      marker.addTo(markersLayer);
    });
  }, [plottedMsmes, onOpenMsme]);

  // Focus on a specific preset town
  const handleJumpToTown = (townName) => {
    if (!mapInstanceRef.current || !townName) return;
    const preset = NORTHERN_UGANDA_PRESETS.find((p) => p.name === townName);
    if (preset) {
      mapInstanceRef.current.setView([preset.lat, preset.lng], 13, {
        animate: true,
        duration: 0.8,
      });
    }
  };

  // Reset to Northern Uganda
  const focusNorthernUganda = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView(NORTHERN_UGANDA_CENTER, NORTHERN_UGANDA_ZOOM, {
      animate: true,
      duration: 0.8,
    });
  };

  // Fit all plotted markers
  const fitAllMarkers = () => {
    if (!mapInstanceRef.current || plottedMsmes.length === 0) return;
    const bounds = L.latLngBounds(plottedMsmes.map((m) => [m.parsedLat, m.parsedLng]));
    mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  };

  // Reset all filters
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedDistrict('all');
    setSelectedSector('all');
    setSelectedBge('all');
    setSelectedCohort('all');
    setSelectedGroup('all');
    setSelectedGpsFilter('all');
    focusNorthernUganda();
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* ── Summary & Header Bar ── */}
      <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: '#FFFFFF' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: 1.5, bgcolor: '#E8F5E9', color: '#1B5E20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Place />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>
                Northern Uganda MSME Spatial Map
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Spatial GPS visualization across Acholi, Lango, West Nile, and Karamoja sub-regions
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              icon={<CheckCircle sx={{ fontSize: '16px !important' }} />}
              label={`${stats.withGps} with GPS (${stats.total ? Math.round((stats.withGps / stats.total) * 100) : 0}%)`}
              color="success"
              variant="outlined"
              size="small"
            />
            {stats.withoutGps > 0 && (
              <Chip
                icon={<Warning sx={{ fontSize: '16px !important' }} />}
                label={`${stats.withoutGps} Missing GPS`}
                color="warning"
                variant="outlined"
                size="small"
                clickable
                onClick={() => setUnplottedDialogOpen(true)}
              />
            )}
            <Button size="small" variant="outlined" startIcon={<Navigation />} onClick={focusNorthernUganda} sx={{ textTransform: 'none', fontSize: 12 }}>
              Reset North
            </Button>
            {plottedMsmes.length > 0 && (
              <Button size="small" variant="outlined" startIcon={<Refresh />} onClick={fitAllMarkers} sx={{ textTransform: 'none', fontSize: 12 }}>
                Fit Plotted ({plottedMsmes.length})
              </Button>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* ── Filter Controls ── */}
        <Grid container spacing={1.5} alignItems="center">
          {/* Search */}
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search MSME name, code, contact…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: <Search fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} />,
              }}
            />
          </Grid>

          {/* Quick Jump Town */}
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Jump to Town</InputLabel>
              <Select defaultValue="" label="Jump to Town" onChange={(e) => handleJumpToTown(e.target.value)}>
                <MenuItem value=""><em>-- Zoom to Town --</em></MenuItem>
                {NORTHERN_UGANDA_PRESETS.map((p) => (
                  <MenuItem key={p.name} value={p.name}>
                    {p.name} ({p.region})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* District Filter */}
          <Grid item xs={6} sm={3} md={1.75}>
            <FormControl size="small" fullWidth>
              <InputLabel>District</InputLabel>
              <Select value={selectedDistrict} label="District" onChange={(e) => setSelectedDistrict(e.target.value)}>
                <MenuItem value="all">All Districts</MenuItem>
                {distinctDistricts.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Sector Filter */}
          <Grid item xs={6} sm={3} md={1.75}>
            <FormControl size="small" fullWidth>
              <InputLabel>Sector</InputLabel>
              <Select value={selectedSector} label="Sector" onChange={(e) => setSelectedSector(e.target.value)}>
                <MenuItem value="all">All Sectors</MenuItem>
                {distinctSectors.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* BGE Filter */}
          <Grid item xs={6} sm={3} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>BGE Expert</InputLabel>
              <Select value={selectedBge} label="BGE Expert" onChange={(e) => setSelectedBge(e.target.value)}>
                <MenuItem value="all">All BGEs</MenuItem>
                <MenuItem value="unassigned">Unassigned Only</MenuItem>
                <MenuItem value="co_assigned">Joint / Co-assigned Only</MenuItem>
                {experts.map((e) => (
                  <MenuItem key={e.id} value={String(e.id)}>
                    {e.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Reset Filters */}
          <Grid item xs={12} sm={6} md={1.5} sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="text" color="inherit" onClick={resetFilters} sx={{ textTransform: 'none', fontSize: 12 }}>
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* ── Map Display Box ── */}
      <Paper
        sx={{
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          height: '620px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Legend Overlay */}
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 1000,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(4px)',
            maxWidth: 270,
          }}
        >
          <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.75, color: '#1E293B' }}>
            SECTORS & DEPLOYMENT
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#2E7D32' }} />
              <span>Agriculture / Agribusiness</span>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#E65100' }} />
              <span>Manufacturing</span>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#1976D2' }} />
              <span>Trade & Services</span>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#00C853' }} />
              <span>Green Business / Energy</span>
            </Box>
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #7B1FA2' }} />
              <span>Purple Ring = Joint / Co-assigned</span>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #2E7D32' }} />
              <span>Green Ring = Primary BGE Assigned</span>
            </Box>
          </Box>
        </Paper>

        {/* Counter Overlay */}
        <Paper
          elevation={3}
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            py: 0.75,
            px: 1.5,
            borderRadius: 2,
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2" fontWeight={700} color="#1B5E20">
            {plottedMsmes.length}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            MSMEs plotted in view
          </Typography>
        </Paper>
      </Paper>

      {/* ── Dialog: List of Unplotted MSMEs without GPS ── */}
      <Dialog open={unplottedDialogOpen} onClose={() => setUnplottedDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="warning" />
            <Typography variant="h6" fontWeight={700}>
              MSMEs Without GPS Coordinates ({unplottedMsmes.length})
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setUnplottedDialogOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These businesses are currently missing latitude and longitude coordinates. Click "Set GPS Pin" on any row to pick its location on the Northern Uganda map or use quick town presets.
          </Typography>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Business Name</TableCell>
                <TableCell>District / City</TableCell>
                <TableCell>Sector</TableCell>
                <TableCell>Assigned BGE</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {unplottedMsmes.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell sx={{ fontSize: 11, fontWeight: 600 }}>{m.msme_code || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{m.business_name}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{m.city || m.district || m.diag_district || m.state || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{m.sector || '-'}</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{m.assigned_bge_name || 'Unassigned'}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      color="success"
                      startIcon={<Place sx={{ fontSize: 14 }} />}
                      onClick={() => {
                        setPickerTargetMsme(m);
                      }}
                      sx={{ fontSize: 11, py: 0.2, textTransform: 'none' }}
                    >
                      Set GPS Pin
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUnplottedDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Interactive Location Picker Modal ── */}
      {pickerTargetMsme && (
        <LocationPickerModal
          open={!!pickerTargetMsme}
          onClose={() => setPickerTargetMsme(null)}
          initialLatitude={pickerTargetMsme.latitude}
          initialLongitude={pickerTargetMsme.longitude}
          initialBusinessName={pickerTargetMsme.business_name}
          onLocationSelected={(locationData) => {
            if (onUpdateMsmeLocation) {
              onUpdateMsmeLocation(pickerTargetMsme, locationData);
            }
            setPickerTargetMsme(null);
          }}
        />
      )}
    </Box>
  );
}
