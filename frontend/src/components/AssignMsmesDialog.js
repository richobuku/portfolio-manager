import React from 'react';
import {
  Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, List, ListItemButton, ListItemIcon,
  ListItemText, TextField, Alert, Typography,
} from '@mui/material';
import { Search, Assignment, Warning } from '@mui/icons-material';
import axios from 'axios';
import { API_ENDPOINTS } from '../config';

const STATUS_CONFIG = {
  active:             { label: 'Active',             color: 'success', bgcolor: '#E8F5E9', textColor: '#2E7D32', border: '#A5D6A7' },
  temporarily_closed: { label: 'Temporarily Closed', color: 'warning', bgcolor: '#FFF3E0', textColor: '#E65100', border: '#FFE082' },
  out_of_business:    { label: 'Out of Business',    color: 'error',   bgcolor: '#FFEBEE', textColor: '#C62828', border: '#EF9A9A' },
  unavailable:        { label: 'Unavailable',        color: 'default', bgcolor: '#F3E5F5', textColor: '#6A1B9A', border: '#CE93D8' },
};

const getStatusInfo = (status) => STATUS_CONFIG[status] || {
  label: (status || 'Active').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  color: 'default',
  bgcolor: '#F5F5F5',
  textColor: '#616161',
  border: '#E0E0E0',
};

// Each row is its own memoised component. With React.memo, a row only
// re-renders when its specific props change (its msme, its checked state, or
// the onToggle callback). So when the user types into the search box and only
// `searchText` changes (not `filtered`, not `selectedSet`), zero rows re-render.
const AssignMsmeRow = React.memo(function AssignMsmeRow({
  msme, checked, otherGroup, otherGroupName, groupId, onToggle,
}) {
  const isInactive = msme.status && msme.status !== 'active';
  const sInfo = getStatusInfo(msme.status);

  return (
    <ListItemButton
      onClick={() => onToggle(msme.id)}
      dense
      sx={{
        bgcolor: isInactive && checked ? 'rgba(255, 152, 0, 0.08)' : 'inherit',
        borderLeft: isInactive ? `3px solid ${sInfo.border}` : '3px solid transparent',
      }}
    >
      <ListItemIcon>
        <Checkbox checked={checked} size="small" disableRipple tabIndex={-1} />
      </ListItemIcon>
      <ListItemText
        primary={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" fontWeight={checked ? 600 : 400}>
              {msme.business_name}
            </Typography>
            {isInactive && (
              <Chip
                label={sInfo.label}
                size="small"
                sx={{
                  height: 18,
                  fontSize: 10,
                  fontWeight: 600,
                  bgcolor: sInfo.bgcolor,
                  color: sInfo.textColor,
                  border: `1px solid ${sInfo.border}`,
                }}
              />
            )}
          </Box>
        }
        secondary={`${msme.owner_name || '—'} · ${msme.city || msme.state || '—'}${otherGroup ? ` · already in ${otherGroupName || ''}` : ''}`}
      />
      {msme.assigned_group_name && (
        <Chip
          label={msme.assigned_group_name}
          size="small"
          color={msme.assigned_group === groupId ? 'success' : 'default'}
        />
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
const AssignMsmesDialog = React.memo(function AssignMsmesDialog({
  assignMsmeGroup, setAssignMsmeGroup, msmes, headers, notify, fetchAll,
}) {
  const [assignedGroupMsmeIds, setAssignedGroupMsmeIds] = React.useState([]);
  const [groupMsmeSession, setGroupMsmeSession] = React.useState('');
  const [groupMsmeSaving, setGroupMsmeSaving] = React.useState(false);
  const [inactiveConfirmOpen, setInactiveConfirmOpen] = React.useState(false);

  const [searchText, setSearchText] = React.useState('');

  // Reset state when a different group's dialog opens, and load current assignments.
  React.useEffect(() => {
    if (!assignMsmeGroup) return;
    setSearchText('');
    setGroupMsmeSession('');
    setAssignedGroupMsmeIds([]);
    setInactiveConfirmOpen(false);
    axios.get(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/msmes/`, { headers })
      .then(r => {
        const ids = (Array.isArray(r.data) ? r.data : (r.data.results || [])).map(m => m.id);
        setAssignedGroupMsmeIds(ids);
      })
      .catch(() => setAssignedGroupMsmeIds([]));
  }, [assignMsmeGroup?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  React.useEffect(() => {
    const h = setTimeout(() => React.startTransition(() => setDebouncedSearch(searchText)), 150);
    return () => clearTimeout(h);
  }, [searchText]);

  const [listReady, setListReady] = React.useState(false);
  React.useEffect(() => {
    if (!assignMsmeGroup) { setListReady(false); return; }
    const h = setTimeout(() => setListReady(true), 32);
    return () => clearTimeout(h);
  }, [assignMsmeGroup]);

  const groupId = assignMsmeGroup?.id;

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

  const selectedSet = React.useMemo(
    () => new Set(assignedGroupMsmeIds),
    [assignedGroupMsmeIds]
  );

  // Inactive MSMEs selected
  const selectedInactiveMsmes = React.useMemo(() => {
    return msmes.filter(m => selectedSet.has(m.id) && m.status && m.status !== 'active');
  }, [msmes, selectedSet]);

  const toggleGroupMsme = React.useCallback((msmeId) => {
    setAssignedGroupMsmeIds(prev =>
      prev.includes(msmeId) ? prev.filter(id => id !== msmeId) : [...prev, msmeId]
    );
  }, []);

  const executeGroupSave = React.useCallback(async (forceConfirm = false) => {
    if (!assignMsmeGroup) return;
    setGroupMsmeSaving(true);
    try {
      await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/unassign-msmes/`, {}, { headers });
      if (assignedGroupMsmeIds.length > 0) {
        const payload = {
          msme_ids: assignedGroupMsmeIds,
          confirm_inactive: forceConfirm,
        };
        if (groupMsmeSession) payload.session_number = parseInt(groupMsmeSession, 10);
        await axios.post(`${API_ENDPOINTS.BGE_GROUPS}${assignMsmeGroup.id}/assign-msmes/`, payload, { headers });
      }
      notify(`${assignedGroupMsmeIds.length} MSME${assignedGroupMsmeIds.length === 1 ? '' : 's'} assigned to ${assignMsmeGroup.name}`);
      setInactiveConfirmOpen(false);
      setAssignMsmeGroup(null);
      fetchAll();
    } catch (e) {
      if (e.response?.data?.requires_confirmation) {
        setInactiveConfirmOpen(true);
      } else {
        notify(e.response?.data?.error || 'Failed to assign MSMEs', 'error');
      }
    } finally {
      setGroupMsmeSaving(false);
    }
  }, [assignMsmeGroup, assignedGroupMsmeIds, groupMsmeSession, headers, notify, fetchAll, setAssignMsmeGroup]);

  const handleSaveClick = React.useCallback(() => {
    if (selectedInactiveMsmes.length > 0) {
      setInactiveConfirmOpen(true);
    } else {
      executeGroupSave(false);
    }
  }, [selectedInactiveMsmes, executeGroupSave]);

  const onToggle = React.useCallback((id) => toggleGroupMsme(id), [toggleGroupMsme]);
  const onClose  = React.useCallback(() => setAssignMsmeGroup(null), [setAssignMsmeGroup]);
  const onClear  = React.useCallback(() => setAssignedGroupMsmeIds([]), []);

  return (
    <>
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

          {/* Inactive MSME Selection Warning Banner */}
          {selectedInactiveMsmes.length > 0 && (
            <Alert severity="warning" icon={<Warning fontSize="small" />} sx={{ mb: 2 }}>
              <Typography variant="caption" fontWeight={700} display="block">
                ⚠️ Inactive MSMEs Selected ({selectedInactiveMsmes.length}):
              </Typography>
              <Typography variant="caption">
                {selectedInactiveMsmes.map(m => `${m.business_name} (${getStatusInfo(m.status).label})`).join(', ')}.
                Group deployments to inactive businesses will require confirmation.
              </Typography>
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
          <Button variant="contained" onClick={handleSaveClick} disabled={groupMsmeSaving}>
            {groupMsmeSaving ? 'Saving…' : 'Save Assignments'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Modal for assigning inactive MSMEs to group */}
      <Dialog
        open={inactiveConfirmOpen}
        onClose={() => setInactiveConfirmOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'warning.dark' }}>
          <Warning color="warning" /> Confirm Inactive MSME Assignment
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            You have selected <strong>{selectedInactiveMsmes.length}</strong> inactive MSME(s):
          </Typography>
          <Box sx={{ p: 1.5, bgcolor: '#FFF3E0', borderRadius: 1, mb: 2, border: '1px solid #FFE082' }}>
            {selectedInactiveMsmes.map(m => (
              <Typography key={m.id} variant="caption" display="block" fontWeight={600} color="#E65100">
                • {m.business_name} — <em>{getStatusInfo(m.status).label}</em>
              </Typography>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Assigning inactive or closed businesses to this BGE Group may cause unfulfilled visits. Are you sure you want to proceed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInactiveConfirmOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => executeGroupSave(true)}
            disabled={groupMsmeSaving}
          >
            {groupMsmeSaving ? 'Saving…' : 'Assign Inactive MSMEs Anyway'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
});

export default AssignMsmesDialog;
