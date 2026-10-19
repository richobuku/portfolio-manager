import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Box, Typography, Button, TextField, InputAdornment,
  Checkbox, Chip, List, ListItemButton, ListItemIcon,
  ListItemText, Grid, FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  Search, Clear, Done,
  CheckCircle, Business, LocationOn,
} from '@mui/icons-material';
import { BRAND } from '../theme';

const SelectSessionMsmesDialog = ({
  open,
  onClose,
  selectedMsmeIds = [],
  onApply,
  msmes = [],
  cohorts = [],
  bgeGroups = [],
  programmeGroups = [],
}) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [cohortFilter, setCohortFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [districtFilter, setDistrictFilter] = useState('');

  // Sync internal selection with prop on open
  useEffect(() => {
    if (open) {
      setSelectedIds(selectedMsmeIds || []);
      setSearchText('');
      setCohortFilter('');
      setGroupFilter('');
      setDistrictFilter('');
    }
  }, [open, selectedMsmeIds]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Extract distinct districts from MSMEs for filter dropdown
  const districtOptions = useMemo(() => {
    const set = new Set();
    msmes.forEach((m) => {
      const d = m.district || m.city;
      if (d && d.trim()) set.add(d.trim());
    });
    return Array.from(set).sort();
  }, [msmes]);

  // Filtered MSMEs list based on search and dropdowns
  const filteredMsmes = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return msmes.filter((m) => {
      if (cohortFilter && String(m.cohort || m.cohort_id || '') !== String(cohortFilter)) {
        return false;
      }
      if (groupFilter) {
        // Can match programme_groups or assigned_group
        const pGroups = (m.programme_groups || []).map(g => String(typeof g === 'object' ? g.id : g));
        const bGroup = String(m.assigned_group || m.assigned_group_id || '');
        if (!pGroups.includes(String(groupFilter)) && bGroup !== String(groupFilter)) {
          return false;
        }
      }
      if (districtFilter) {
        const d = (m.district || m.city || '').trim().toLowerCase();
        if (d !== districtFilter.toLowerCase()) return false;
      }
      if (q) {
        const bName = (m.business_name || '').toLowerCase();
        const oName = (m.owner_name || '').toLowerCase();
        const code = (m.msme_code || '').toLowerCase();
        const dist = (m.district || m.city || '').toLowerCase();
        const sec = (m.sector || '').toLowerCase();
        if (!bName.includes(q) && !oName.includes(q) && !code.includes(q) && !dist.includes(q) && !sec.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [msmes, searchText, cohortFilter, groupFilter, districtFilter]);

  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  const selectAllFiltered = useCallback(() => {
    const newIds = new Set(selectedIds);
    filteredMsmes.forEach((m) => newIds.add(m.id));
    setSelectedIds(Array.from(newIds));
  }, [filteredMsmes, selectedIds]);

  const deselectFiltered = useCallback(() => {
    const filteredIdSet = new Set(filteredMsmes.map((m) => m.id));
    setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
  }, [filteredMsmes]);

  const clearAll = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleApply = () => {
    onApply(selectedIds);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <Box sx={{ height: 4, background: 'linear-gradient(90deg, #E2001A 0%, #E2001A 50%, #F5A623 50%, #F5A623 100%)' }} />
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography variant="h6" fontWeight={700}>
              Select Attendee MSMEs
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Filter by cohort, group, or district and select enterprises to participate in this session.
            </Typography>
          </Box>
          <Chip
            color="primary"
            variant="outlined"
            icon={<CheckCircle fontSize="small" />}
            label={`${selectedIds.length} Selected`}
            sx={{ fontWeight: 600, fontSize: 13 }}
          />
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 2 }}>
        {/* Filter controls */}
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search business, owner, code…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: searchText ? (
                  <InputAdornment position="end">
                    <Clear fontSize="small" sx={{ cursor: 'pointer' }} onClick={() => setSearchText('')} />
                  </InputAdornment>
                ) : null,
              }}
            />
          </Grid>
          <Grid item xs={6} sm={2.6}>
            <FormControl fullWidth size="small">
              <InputLabel>Cohort</InputLabel>
              <Select
                value={cohortFilter}
                label="Cohort"
                onChange={(e) => setCohortFilter(e.target.value)}
              >
                <MenuItem value="">— All Cohorts —</MenuItem>
                {cohorts.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name || `Cohort ${c.number || c.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} sm={2.7}>
            <FormControl fullWidth size="small">
              <InputLabel>Group</InputLabel>
              <Select
                value={groupFilter}
                label="Group"
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <MenuItem value="">— All Groups —</MenuItem>
                {programmeGroups.length > 0 && [
                  <MenuItem key="pg-header" disabled sx={{ fontWeight: 700, fontSize: 11, color: 'text.secondary' }}>
                    PROGRAMME GROUPS
                  </MenuItem>,
                  ...programmeGroups.map((g) => (
                    <MenuItem key={`pg-${g.id}`} value={g.id}>
                      {g.name}
                    </MenuItem>
                  )),
                ]}
                {bgeGroups.length > 0 && [
                  <MenuItem key="bg-header" disabled sx={{ fontWeight: 700, fontSize: 11, color: 'text.secondary' }}>
                    BGE GROUPS
                  </MenuItem>,
                  ...bgeGroups.map((g) => (
                    <MenuItem key={`bg-${g.id}`} value={g.id}>
                      {g.name}
                    </MenuItem>
                  )),
                ]}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2.7}>
            <FormControl fullWidth size="small">
              <InputLabel>District</InputLabel>
              <Select
                value={districtFilter}
                label="District"
                onChange={(e) => setDistrictFilter(e.target.value)}
              >
                <MenuItem value="">— All Districts —</MenuItem>
                {districtOptions.map((d) => (
                  <MenuItem key={d} value={d}>
                    {d}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Quick Batch Actions & Counter */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={500}>
            Showing <strong>{filteredMsmes.length}</strong> of {msmes.length} MSMEs
            {filteredMsmes.length > 0 && ` (${filteredMsmes.filter(m => selectedSet.has(m.id)).length} selected in view)`}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={selectAllFiltered}
              disabled={filteredMsmes.length === 0}
              sx={{ textTransform: 'none', py: 0.25, fontSize: 12 }}
            >
              Select All Filtered
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              onClick={deselectFiltered}
              disabled={filteredMsmes.length === 0}
              sx={{ textTransform: 'none', py: 0.25, fontSize: 12 }}
            >
              Deselect Filtered
            </Button>
            <Button
              size="small"
              color="error"
              onClick={clearAll}
              disabled={selectedIds.length === 0}
              sx={{ textTransform: 'none', py: 0.25, fontSize: 12 }}
            >
              Clear All
            </Button>
          </Box>
        </Box>

        {/* MSME List */}
        <Box sx={{ maxHeight: 380, overflowY: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {filteredMsmes.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
              <Business sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2">No MSMEs match the selected filters or search query.</Typography>
            </Box>
          ) : (
            <List dense disablePadding>
              {filteredMsmes.map((m) => {
                const isChecked = selectedSet.has(m.id);
                return (
                  <ListItemButton
                    key={m.id}
                    onClick={() => toggleSelect(m.id)}
                    sx={{
                      py: 0.75,
                      borderBottom: '1px solid #F1F5F9',
                      bgcolor: isChecked ? 'rgba(25, 118, 210, 0.06)' : 'transparent',
                      '&:hover': {
                        bgcolor: isChecked ? 'rgba(25, 118, 210, 0.12)' : 'rgba(0,0,0,0.03)',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        edge="start"
                        checked={isChecked}
                        tabIndex={-1}
                        disableRipple
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" fontWeight={isChecked ? 600 : 500}>
                            {m.business_name}
                          </Typography>
                          {m.msme_code && (
                            <Chip
                              label={m.msme_code}
                              size="small"
                              sx={{ height: 18, fontSize: 10, bgcolor: '#E2E8F0', color: '#334155', fontWeight: 600 }}
                            />
                          )}
                          {m.sector && (
                            <Chip
                              label={m.sector}
                              size="small"
                              variant="outlined"
                              sx={{ height: 18, fontSize: 10, color: 'text.secondary' }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.25, fontSize: 11, color: 'text.secondary' }}>
                          {m.owner_name && (
                            <span>Owner: {m.owner_name} {m.phone ? `(${m.phone})` : ''}</span>
                          )}
                          {(m.district || m.city) && (
                            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                              <LocationOn sx={{ fontSize: 12, mr: 0.25 }} />
                              {m.district || m.city}
                            </span>
                          )}
                        </Box>
                      }
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          startIcon={<Done />}
          sx={{
            bgcolor: BRAND.primaryMain || '#1976d2',
            fontWeight: 600,
            '&:hover': { bgcolor: BRAND.primaryDark || '#115293' },
          }}
        >
          Apply Selection ({selectedIds.length} MSMEs)
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SelectSessionMsmesDialog;
