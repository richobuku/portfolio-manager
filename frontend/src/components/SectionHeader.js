import React from 'react';
import { Box, Typography } from '@mui/material';

function SectionHeader({ title, subtitle, children }) {
  return (
    <Box sx={{
      display: 'flex',
      flexDirection: { xs: 'column', sm: 'row' },
      alignItems: { xs: 'stretch', sm: 'flex-start' },
      justifyContent: 'space-between',
      gap: { xs: 1.5, sm: 2 },
      mb: 2.5,
    }}>
      <Box sx={{ minWidth: 0, pl: 1.5, borderLeft: '3.5px solid #F3BB36' }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: '#1A2E42', lineHeight: 1.25 }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
      </Box>
      {children && (
        <Box sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          justifyContent: { xs: 'stretch', sm: 'flex-end' },
          '& > *': { flex: { xs: '1 1 150px', sm: '0 0 auto' } },
        }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

export default SectionHeader;
