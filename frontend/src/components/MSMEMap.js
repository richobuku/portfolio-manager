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
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
} from '@mui/material';
import {
  Search,
  Refresh,
  CheckCircle,
  Warning,
  Close,
  Place,
  Navigation,
  Business,
  People,
  PersonPin,
} from '@mui/icons-material';

// Center of Northern Uganda (Gulu / Acholi / Lango / West Nile central axis)
const NORTHERN_UGANDA_CENTER = [2.80, 32.50];
const NORTHERN_UGANDA_ZOOM = 8;

// Northern Uganda town coordinates for quick zoom
export const NORTHERN_UGANDA_TOWNS = [
  { name: 'Gulu City', district: 'Gulu', region: 'Acholi', lat: 2.774950, lng: 32.299110 },
  { name: 'Lira City', district: 'Lira', region: 'Lango', lat: 2.247200, lng: 32.899800 },
  { name: 'Arua City', district: 'Arua', region: 'West Nile', lat: 3.030300, lng: 30.910700 },
  { name: 'Kitgum Municipality', district: 'Kitgum', region: 'Acholi', lat: 3.284800, lng: 32.883700 },
  { name: 'Nebbi Municipality', district: 'Nebbi', region: 'West Nile', lat: 2.478300, lng: 31.088900 },
  { name: 'Koboko Municipality', district: 'Koboko', region: 'West Nile', lat: 3.413600, lng: 30.960000 },
  { name: 'Moroto Municipality', district: 'Moroto', region: 'Karamoja', lat: 2.534500, lng: 34.666600 },
  { name: 'Nwoya / Anaka', district: 'Nwoya', region: 'Acholi', lat: 2.600000, lng: 31.950000 },
  { name: 'Oyam / Anyeke', district: 'Oyam', region: 'Lango', lat: 2.381100, lng: 32.500800 },
  { name: 'Apac Municipality', district: 'Apac', region: 'Lango', lat: 1.975600, lng: 32.538600 },
  { name: 'Dokolo Town', district: 'Dokolo', region: 'Lango', lat: 1.918900, lng: 33.176400 },
  { name: 'Pader Town', district: 'Pader', region: 'Acholi', lat: 2.824200, lng: 32.814400 },
  { name: 'Yumbe Town', district: 'Yumbe', region: 'West Nile', lat: 3.465100, lng: 31.246900 },
  { name: 'Adjumani Town', district: 'Adjumani', region: 'West Nile', lat: 3.377800, lng: 31.790900 },
  { name: 'Moyo Town', district: 'Moyo', region: 'West Nile', lat: 3.650000, lng: 31.720000 },
];

// Sector Color Palette for MSMEs
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

// Create custom MSME Leaflet DivIcon
const createMsmeMarkerIcon = (msme) => {
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

// Create custom BGE Expert Leaflet DivIcon
const createBgeMarkerIcon = (expert) => {
  const html = `
    <div style="position: relative; width: 38px; height: 46px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <svg viewBox="0 0 24 32" width="38" height="46" style="filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));">
        <path d="M12 0 C5.37 0 0 5.37 0 12 C0 21 12 32 12 32 C12 32 24 21 24 12 C24 5.37 18.63 0 12 0 Z" fill="#0D47A1"/>
        <circle cx="12" cy="12" r="8" fill="#FFD54F"/>
        <circle cx="12" cy="12" r="5" fill="#0D47A1"/>
      </svg>
      <div style="position: absolute; top: 7px; color: #FFFFFF; font-size: 9px; font-weight: 900; pointer-events: none;">
        ★
      </div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-bge-pin',
    html,
    iconSize: [38, 46],
    iconAnchor: [19, 46],
    popupAnchor: [0, -42],
  });
};

export default function MSMEMap({
  msmes = [],
  experts = [],
  cohorts = [],
  programmeGroups = [],
  onOpenMsme,
  onOpenExpert,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const msmeLayerRef = useRef(null);
  const bgeLayerRef = useRef(null);

  // Filter & Display States
  const [displayLayer, setDisplayLayer] = useState('all'); // 'all' | 'msmes' | 'experts'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedSector, setSelectedSector] = useState('all');
  const [selectedBge, setSelectedBge] = useState('all');
  const [selectedCohort, setSelectedCohort] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [unplottedDialogOpen, setUnplottedDialogOpen] = useState(false);

  // Extract distinct districts and sectors for dropdowns
  const distinctDistricts = useMemo(() => {
    const set = new Set();
    msmes.forEach((m) => {
      const d = m.district || m.diag_district || m.state || m.city;
      if (d && typeof d === 'string' && d.trim()) set.add(d.trim());
    });
    experts.forEach((e) => {
      if (e.location && typeof e.location === 'string' && e.location.trim()) set.add(e.location.trim());
    });
    return Array.from(set).sort();
  }, [msmes, experts]);

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

  // Valid GPS BGE Experts calculation
  const parsedExperts = useMemo(() => {
    return experts.map((e) => {
      const lat = e.latitude !== null && e.latitude !== undefined && e.latitude !== '' ? parseFloat(e.latitude) : null;
      const lng = e.longitude !== null && e.longitude !== undefined && e.longitude !== '' ? parseFloat(e.longitude) : null;
      const hasValidGps = lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng) && lat >= -1.5 && lat <= 4.5 && lng >= 29.5 && lng <= 35.5;

      return {
        ...e,
        parsedLat: hasValidGps ? lat : null,
        parsedLng: hasValidGps ? lng : null,
        hasValidGps,
      };
    });
  }, [experts]);

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

      return true;
    });
  }, [parsedMsmes, searchTerm, selectedDistrict, selectedSector, selectedBge, selectedCohort, selectedGroup]);

  // Filtered BGE Experts
  const filteredExperts = useMemo(() => {
    return parsedExperts.filter((e) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = (e.name || '').toLowerCase().includes(q);
        const matchCode = (e.bge_code || '').toLowerCase().includes(q);
        const matchLoc  = (e.location || '').toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchLoc) return false;
      }
      if (selectedDistrict !== 'all') {
        const d = (e.location || '').toLowerCase();
        if (!d.includes(selectedDistrict.toLowerCase())) return false;
      }
      return true;
    });
  }, [parsedExperts, searchTerm, selectedDistrict]);

  const plottedMsmes = useMemo(() => filteredMsmes.filter((m) => m.hasValidGps), [filteredMsmes]);
  const unplottedMsmes = useMemo(() => filteredMsmes.filter((m) => !m.hasValidGps), [filteredMsmes]);
  const plottedExperts = useMemo(() => filteredExperts.filter((e) => e.hasValidGps), [filteredExperts]);

  // Total stats
  const stats = useMemo(() => {
    const totalMsmes = msmes.length;
    const withGpsMsmes = parsedMsmes.filter((m) => m.hasValidGps).length;
    const withoutGpsMsmes = totalMsmes - withGpsMsmes;
    const totalExperts = experts.length;
    const withGpsExperts = parsedExperts.filter((e) => e.hasValidGps).length;
    return { totalMsmes, withGpsMsmes, withoutGpsMsmes, totalExperts, withGpsExperts };
  }, [msmes, parsedMsmes, experts, parsedExperts]);

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

    // Layer Groups
    const msmeLayer = L.layerGroup().addTo(map);
    const bgeLayer = L.layerGroup().addTo(map);
    msmeLayerRef.current = msmeLayer;
    bgeLayerRef.current = bgeLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update MSME Markers on Map
  useEffect(() => {
    if (!mapInstanceRef.current || !msmeLayerRef.current) return;

    const layer = msmeLayerRef.current;
    layer.clearLayers();

    if (displayLayer === 'experts') return;
    if (plottedMsmes.length === 0) return;

    plottedMsmes.forEach((msme) => {
      const lat = msme.parsedLat;
      const lng = msme.parsedLng;
      const latLng = [lat, lng];

      const icon = createMsmeMarkerIcon(msme);
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

          <div style="text-align: right; border-top: 1px solid #F1F5F9; padding-top: 6px;">
            <button id="btn-msme-${msme.id}" style="background: #1B5E20; color: #ffffff; border: none; padding: 5px 14px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
              Manage Business →
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
      });

      marker.addTo(layer);
    });
  }, [plottedMsmes, displayLayer, onOpenMsme]);

  // Update BGE Expert Markers on Map
  useEffect(() => {
    if (!mapInstanceRef.current || !bgeLayerRef.current) return;

    const layer = bgeLayerRef.current;
    layer.clearLayers();

    if (displayLayer === 'msmes') return;
    if (plottedExperts.length === 0) return;

    plottedExperts.forEach((expert) => {
      const lat = expert.parsedLat;
      const lng = expert.parsedLng;
      const latLng = [lat, lng];

      const icon = createBgeMarkerIcon(expert);
      const marker = L.marker(latLng, { icon });

      const popupHtml = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 240px; max-width: 300px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 14px; color: #0D47A1;">${expert.name || 'BGE Expert'}</strong>
            <span style="font-size: 10px; font-weight: 700; background: #FFF8E1; color: #F57F17; border: 1px solid #FFE082; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">
              ${expert.bge_code || 'BGE'}
            </span>
          </div>

          <div style="margin-bottom: 8px;">
            <span style="display: inline-block; font-size: 11px; font-weight: 700; color: #fff; background: #0D47A1; padding: 2px 8px; border-radius: 12px; margin-right: 4px;">
              ★ BGE Expert
            </span>
            ${expert.location ? `<span style="display: inline-block; font-size: 11px; color: #475569; background: #F8FAFC; border: 1px solid #CBD5E1; padding: 1px 6px; border-radius: 12px;">${expert.location}</span>` : ''}
          </div>

          <div style="border-top: 1px solid #E2E8F0; padding-top: 6px; margin-bottom: 8px; font-size: 12px; color: #334155;">
            ${expert.phone ? `<div>📞 <strong>Phone:</strong> ${expert.phone}</div>` : ''}
            ${expert.email ? `<div>✉️ <strong>Email:</strong> ${expert.email}</div>` : ''}
            <div>🏢 <strong>Assigned MSMEs:</strong> <span style="color: #2E7D32; font-weight: 700;">${expert.assigned_msme_count || 0} MSMEs</span></div>
            ${expert.top_skills ? `<div>🎯 <strong>Skills:</strong> ${expert.top_skills}</div>` : ''}
          </div>

          <div style="text-align: right; border-top: 1px solid #F1F5F9; padding-top: 6px;">
            <button id="btn-expert-${expert.id}" style="background: #0D47A1; color: #ffffff; border: none; padding: 5px 14px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
              View Expert Profile →
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { maxWidth: 330 });

      marker.on('popupopen', () => {
        const btnView = document.getElementById(`btn-expert-${expert.id}`);
        if (btnView && onOpenExpert) {
          btnView.onclick = () => {
            onOpenExpert(expert);
          };
        }
      });

      marker.addTo(layer);
    });
  }, [plottedExperts, displayLayer, onOpenExpert]);

  // Focus on a specific preset town
  const handleJumpToTown = (townName) => {
    if (!mapInstanceRef.current || !townName) return;
    const preset = NORTHERN_UGANDA_TOWNS.find((p) => p.name === townName);
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
    if (!mapInstanceRef.current) return;
    const allCoords = [];
    if (displayLayer !== 'experts') {
      plottedMsmes.forEach((m) => allCoords.push([m.parsedLat, m.parsedLng]));
    }
    if (displayLayer !== 'msmes') {
      plottedExperts.forEach((e) => allCoords.push([e.parsedLat, e.parsedLng]));
    }
    if (allCoords.length === 0) return;
    const bounds = L.latLngBounds(allCoords);
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
    focusNorthernUganda();
  };

  const totalPlottedCount = (displayLayer !== 'experts' ? plottedMsmes.length : 0) +
                            (displayLayer !== 'msmes' ? plottedExperts.length : 0);

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
                Northern Uganda Spatial Location Map
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Spatial view of MSMEs and BGE Experts across Acholi, Lango, West Nile, and Karamoja sub-regions
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {/* Layer Filter Toggle */}
            <ToggleButtonGroup
              size="small"
              value={displayLayer}
              exclusive
              onChange={(_, val) => val && setDisplayLayer(val)}
              sx={{ bgcolor: '#F8FAFC' }}
            >
              <ToggleButton value="all" sx={{ fontSize: 11, py: 0.3, px: 1.2, textTransform: 'none' }}>
                All Pins ({plottedMsmes.length + plottedExperts.length})
              </ToggleButton>
              <ToggleButton value="msmes" sx={{ fontSize: 11, py: 0.3, px: 1.2, textTransform: 'none' }}>
                <Business sx={{ fontSize: 14, mr: 0.5, color: '#2E7D32' }} />
                MSMEs ({plottedMsmes.length})
              </ToggleButton>
              <ToggleButton value="experts" sx={{ fontSize: 11, py: 0.3, px: 1.2, textTransform: 'none' }}>
                <People sx={{ fontSize: 14, mr: 0.5, color: '#0D47A1' }} />
                BGE Experts ({plottedExperts.length})
              </ToggleButton>
            </ToggleButtonGroup>

            <Chip
              icon={<CheckCircle sx={{ fontSize: '16px !important' }} />}
              label={`${stats.withGpsMsmes} MSMEs with Location`}
              color="success"
              variant="outlined"
              size="small"
            />

            {stats.withoutGpsMsmes > 0 && (
              <Chip
                icon={<Warning sx={{ fontSize: '16px !important' }} />}
                label={`${stats.withoutGpsMsmes} Missing GPS`}
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
            {totalPlottedCount > 0 && (
              <Button size="small" variant="outlined" startIcon={<Refresh />} onClick={fitAllMarkers} sx={{ textTransform: 'none', fontSize: 12 }}>
                Fit Plotted ({totalPlottedCount})
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
              placeholder="Search name, code, contact…"
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
              <InputLabel>Zoom to Town</InputLabel>
              <Select defaultValue="" label="Zoom to Town" onChange={(e) => handleJumpToTown(e.target.value)}>
                <MenuItem value=""><em>-- Select Town --</em></MenuItem>
                {NORTHERN_UGANDA_TOWNS.map((p) => (
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
              <InputLabel>District / Location</InputLabel>
              <Select value={selectedDistrict} label="District / Location" onChange={(e) => setSelectedDistrict(e.target.value)}>
                <MenuItem value="all">All Locations</MenuItem>
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
          <Grid item xs={12} sm={6} md={1.5}>
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
          height: '640px',
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
            maxWidth: 280,
          }}
        >
          <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.75, color: '#1E293B' }}>
            MAP KEY & DEPLOYMENT
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#0D47A1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFD54F', fontSize: 8, fontWeight: 900 }}>★</Box>
              <strong style={{ color: '#0D47A1' }}>BGE Expert Pin (Field Base)</strong>
            </Box>
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#2E7D32' }} />
              <span>MSME: Agriculture / Agribusiness</span>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#E65100' }} />
              <span>MSME: Manufacturing</span>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 11 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#1976D2' }} />
              <span>MSME: Trade & Services</span>
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
            gap: 1.5,
          }}
        >
          {displayLayer !== 'experts' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Business sx={{ fontSize: 16, color: '#2E7D32' }} />
              <Typography variant="body2" fontWeight={700} color="#2E7D32">
                {plottedMsmes.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">MSMEs</Typography>
            </Box>
          )}
          {displayLayer !== 'msmes' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <PersonPin sx={{ fontSize: 16, color: '#0D47A1' }} />
              <Typography variant="body2" fontWeight={700} color="#0D47A1">
                {plottedExperts.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">BGEs</Typography>
            </Box>
          )}
        </Paper>
      </Paper>

      {/* ── Dialog: List of Unplotted MSMEs without GPS ── */}
      <Dialog open={unplottedDialogOpen} onClose={() => setUnplottedDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Warning color="warning" />
            <Typography variant="h6" fontWeight={700}>
              MSMEs Without Captured GPS Coordinates ({unplottedMsmes.length})
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setUnplottedDialogOpen(false)}>
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            These businesses are currently missing latitude and longitude coordinates. Their coordinates can be captured directly via the MSME edit form or automatically during BGE field visit check-ins.
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
                      color="primary"
                      onClick={() => {
                        setUnplottedDialogOpen(false);
                        if (onOpenMsme) onOpenMsme(m);
                      }}
                      sx={{ fontSize: 11, py: 0.2, textTransform: 'none' }}
                    >
                      View MSME
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
    </Box>
  );
}
