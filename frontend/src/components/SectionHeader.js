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
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" fontWeight={700}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
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
