import React from 'react';
import {
  Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, List, ListItemButton, ListItemIcon,
  ListItemText, TextField, Alert, Typography,
} from '@mui/material';
import { Search, Assignment } from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';

// Each row is its own memoised component. With React.memo, a row only
// re-renders when its specific props change (its msme, its checked state, or
// the onToggle callback). So when the user types into the search box and only
// `searchText` changes (not `filtered`, not `selectedSet`), zero rows re-render.
const AssignMsmeRow = React.memo(function AssignMsmeRow({
  msme, checked, otherGroup, otherGroupName, groupId, onToggle,
}) {
  return (
    <ListItemButton onClick={() => onToggle(msme.id)} dense>
      <ListItemIcon>
        <Checkbox checked={checked} size="small" disableRipple tabIndex={-1} />
      </ListItemIcon>
      <ListItemText
        primary={msme.business_name}
        secondary={`${msme.owner_name || '—'} · ${msme.city || msme.state || '—'}${otherGroup ? ` · already in ${otherGroupName || ''}` : ''}`}
      />
      {msme.assigned_group_name && (
        <Chip label={msme.assigned_group_name} size="small"
              color={msme.assigned_group === groupId ? 'success' : 'default'} />
      )}
    </ListItemButton>
  );
});

// Wrap the entire row list in its own memo'd component so the parent dialog's
// keystroke-driven re-renders don't re-create the row array unless its inputs
// (filtered, selectedSet, groupId, onToggle) actually changed.
const AssignMsmeRows = React.memo(function AssignMsmeRows({
  filtered, selectedSet, groupId, onToggle,
}) {
  return (
    <>
      {filtered.map(m => (
        <AssignMsmeRow
          key={m.id}
          msme={m}
          checked={selectedSet.has(m.id)}
          otherGroup={!!(m.assigned_group && m.assigned_group !== groupId)}
          otherGroupName={m.assigned_group_name}
          groupId={groupId}
          onToggle={onToggle}
        />
      ))}
    </>
  );
});

// ── AssignMsmesDialog ─────────────────────────────────────────────────────
// Extracted as a memoised component because rendering 200+ MSMEs inside the
// Dashboard's main render cycle made the search input lock up (browser fired
// "Page Unresponsive" after ~5s of blocked main thread). Optimisations:
//
//  1. Debounce the search box (200ms) so the filter only re-runs when the
//     user pauses typing, instead of on every keystroke.
//  2. Wrap the filter result in useMemo keyed on [msmes, debouncedSearch,
//     groupId] — keystrokes that don't change the debounced value don't
//     re-filter at all.
//  3. Convert assignedGroupMsmeIds (Array.includes is O(N) per row) into a
//     Set (O(1) per row) — turns the row-render from O(N²) into O(N).
//  4. Stable onClick handlers via useCallback so React skips re-rendering
//     unchanged rows.
const AssignMsmesDialog = React.memo(function AssignMsmesDialog({
  assignMsmeGroup, setAssignMsmeGroup, msmes, headers, notify, fetchAll,
}) {
  // All mutable state for this dialog lives here — so checkbox toggles only
  // re-render this component, not the entire 4500-line Dashboard tree.
  const [assignedGroupMsmeIds, setAssignedGroupMsmeIds] = React.useState([]);
  const [groupMsmeSession, setGroupMsmeSession] = React.useState('');
  const [groupMsmeSaving, setGroupMsmeSaving] = React.useState(false);

  // Search state lives INSIDE the dialog. This is critical — when it lived on
  // the parent Dashboard component (a ~4500-line tree), every keystroke
  // re-rendered the whole tree which blocked the main thread for ~230ms. Now
  // keystrokes only re-render this dialog.
  const [searchText, setSearchText] = React.useState('');

  // Reset state when a different group's dialog opens, and load current assignments.
  React.useEffect(() => {
    if (!assignMsmeGroup) return;
    setSearchText('');
    setGroupMsmeSession('');
    setAssignedGroupMsmeIds([]);
    axios.get(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/msmes/`, { headers })
      .then(r => {
        const ids = (Array.isArray(r.data) ? r.data : (r.data.results || [])).map(m => m.id);
        setAssignedGroupMsmeIds(ids);
      })
      .catch(() => setAssignedGroupMsmeIds([]));
  }, [assignMsmeGroup?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced copy — the filter reads this.
  // Wrapped in startTransition so React treats the 280-row reconciliation as
  // a low-priority update; the browser paints the typed character first and
  // the list refilter happens without blocking the input (fixes INP ~392ms).
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const h = setTimeout(() => React.startTransition(() => setDebouncedSearch(searchText)), 150);
    return () => clearTimeout(h);
  }, [searchText]);

  // Defer mounting the (potentially huge) MSME list until *after* the dialog's
  // open animation finishes.
  const [listReady, setListReady] = React.useState(false);
  React.useEffect(() => {
    if (!assignMsmeGroup) { setListReady(false); return; }
    const h = setTimeout(() => setListReady(true), 32);
    return () => clearTimeout(h);
  }, [assignMsmeGroup]);

  const groupId = assignMsmeGroup?.id;

  // useDeferredValue lets React render with the stale list first so the input
  // stays responsive, then re-renders with the updated filter in the background.
  const deferredSearch = React.useDeferredValue(debouncedSearch);

  const filtered = React.useMemo(() => {
    if (!deferredSearch) return msmes;
    const q = deferredSearch.toLowerCase();
    return msmes.filter(m =>
      (m.business_name || '').toLowerCase().includes(q) ||
      (m.owner_name    || '').toLowerCase().includes(q) ||
      (m.city          || '').toLowerCase().includes(q) ||
      (m.state         || '').toLowerCase().includes(q)
    );
  }, [msmes, deferredSearch]);

  // O(1) membership check inside the row map.
  const selectedSet = React.useMemo(
    () => new Set(assignedGroupMsmeIds),
    [assignedGroupMsmeIds]
  );

  const toggleGroupMsme = React.useCallback((msmeId) => {
    setAssignedGroupMsmeIds(prev =>
      prev.includes(msmeId) ? prev.filter(id => id !== msmeId) : [...prev, msmeId]
    );
  }, []);

  const saveGroupMsmeAssignments = React.useCallback(async () => {
    if (!assignMsmeGroup) return;
    setGroupMsmeSaving(true);
    try {
      await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/unassign-msmes/`, {}, { headers });
      if (assignedGroupMsmeIds.length > 0) {
        const payload = { msme_ids: assignedGroupMsmeIds };
        if (groupMsmeSession) payload.session_number = parseInt(groupMsmeSession, 10);
        await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/assign-msmes/`, payload, { headers });
      }
      notify(`${assignedGroupMsmeIds.length} MSME${assignedGroupMsmeIds.length === 1 ? '' : 's'} assigned to ${assignMsmeGroup.name}`);
      setAssignMsmeGroup(null);
      fetchAll();
    } catch (e) {
      notify(e.response?.data?.error || 'Failed to assign MSMEs', 'error');
    } finally {
      setGroupMsmeSaving(false);
    }
  }, [assignMsmeGroup, assignedGroupMsmeIds, groupMsmeSession, headers, notify, fetchAll, setAssignMsmeGroup]);

  const onToggle = React.useCallback((id) => toggleGroupMsme(id), [toggleGroupMsme]);
  const onClose  = React.useCallback(() => setAssignMsmeGroup(null), [setAssignMsmeGroup]);
  const onClear  = React.useCallback(() => setAssignedGroupMsmeIds([]), []);

  return (
    <Dialog open={!!assignMsmeGroup} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Assign MSMEs — {assignMsmeGroup?.name}
        <Typography variant="caption" display="block" color="text.secondary">
          Select MSMEs to assign to this BGE group. Every group member will see them in their dashboard.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {assignMsmeGroup?.objectives && (
          <Alert severity="info" sx={{ mb: 2 }} icon={<Assignment fontSize="small" />}>
            <Typography variant="caption" fontWeight={600} display="block">Group objectives (inherited by each MSME):</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{assignMsmeGroup.objectives}</Typography>
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small" placeholder="Search MSMEs..." value={searchText}
            onChange={e => setSearchText(e.target.value)}
            InputProps={{ startAdornment: <Search fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <TextField
            size="small" label="Session # (optional)" type="number"
            value={groupMsmeSession} onChange={e => setGroupMsmeSession(e.target.value)}
            sx={{ width: 160 }} inputProps={{ min: 1, max: 10 }}
          />
          <Chip label={`${assignedGroupMsmeIds.length} selected`} color="primary" />
          <Chip
            label={deferredSearch ? `${filtered.length} match${filtered.length === 1 ? '' : 'es'}` : `${msmes.length} MSMEs`}
            size="small" variant="outlined"
          />
          <Button size="small" onClick={onClear} disabled={assignedGroupMsmeIds.length === 0}>
            Clear all
          </Button>
        </Box>
        <Box sx={{ maxHeight: 480, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {!listReady ? (
            <Box sx={{ p: 6, textAlign: 'center', color: 'text.secondary' }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <List dense>
              <AssignMsmeRows
                filtered={filtered}
                selectedSet={selectedSet}
                groupId={groupId}
                onToggle={onToggle}
              />
              {msmes.length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>No MSMEs available</Box>
              )}
              {msmes.length > 0 && filtered.length === 0 && (
                <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                  No MSMEs match "{deferredSearch}"
                </Box>
              )}
            </List>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={saveGroupMsmeAssignments} disabled={groupMsmeSaving}>
          {groupMsmeSaving ? 'Saving…' : 'Save Assignments'}
        </Button>

      </DialogActions>
    </Dialog>
  );
});

export default AssignMsmesDialog;
