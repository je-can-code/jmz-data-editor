import React, {
  useEffect,
  useState,
  useRef
} from 'react';
import {
  AppBar,
  Autocomplete,
  Box,
  InputAdornment,
  Slide,
  TextField,
  Typography
} from '@mui/material';
import { Search, KeyboardReturn } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { SearchResult, useGlobalSearch } from '@presentation/hooks/useGlobalSearch.ts';

/**
 * A bottom bar containing a global search input.
 * Toggled via Ctrl+F.
 */
const GlobalBottomBar = () =>
{
  const [ isVisible, setIsVisible ] = useState(false);
  const { allData } = useGlobalSearch();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() =>
  {
    const handleKeyDown = (event: KeyboardEvent) =>
    {
      if (event.ctrlKey && event.key === 'f')
      {
        event.preventDefault();
        setIsVisible(prev => !prev);
      }

      if (event.key === 'Escape' && isVisible)
      {
        setIsVisible(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ isVisible ]);

  useEffect(() =>
  {
    if (isVisible && inputRef.current)
    {
      // focus the search input when the bar appears.
      inputRef.current.focus();
    }
  }, [ isVisible ]);

  const handleSelect = (
    _: any,
    value: SearchResult | null
  ) =>
  {
    if (value)
    {
      navigate(`${value.path}?${value.type}=${value.id}`);
      setIsVisible(false);
    }
  };

  return (
    <Slide direction="up" in={isVisible} mountOnEnter unmountOnExit>
      <AppBar
        position="fixed"
        color="primary"
        sx={{
          top: 'auto',
          bottom: 0,
          background: 'linear-gradient(90deg, #1a1a1a 0%, #2c2c2c 100%)',
          borderTop: '1px solid rgba(255, 255, 255, 0.12)',
          height: 60,
          display: 'flex',
          justifyContent: 'center',
          paddingX: 2,
        }}
      >
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <Autocomplete
            fullWidth
            size="small"
            options={allData.filter(option => option.name && !option.name.startsWith('=='))}
            groupBy={(option) => option.category}
            getOptionKey={(option) => `${option.category}-${option.id}-${option.name}`}
            getOptionLabel={(option) => option.name}
            onChange={handleSelect}
            renderInput={(params) => (
              <TextField
                {...params}
                inputRef={inputRef}
                placeholder="Global Search (Enemies, Items, Quests...)"
                variant="outlined"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search/>
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography variant="caption" sx={{
                        opacity: 0.5,
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        <KeyboardReturn fontSize="inherit"/> Enter to Jump
                      </Typography>
                    </InputAdornment>
                  ),
                }}
              />
            )}
            renderOption={(
              props,
              option
            ) =>
            {
              const {
                key,
                ...optionProps
              } = props;
              return (
                <li key={key} {...optionProps}>
                  <Box sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    width: '100%'
                  }}>
                    <Typography variant="body2">{option.name}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.5 }}>{option.category}</Typography>
                  </Box>
                </li>
              );
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                '& fieldset': { borderColor: 'transparent' },
                '&:hover fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                '&.Mui-focused fieldset': { borderColor: 'primary.main' },
              },
            }}
          />
          <Typography variant="caption" sx={{
            minWidth: 100,
            opacity: 0.7
          }}>
            Press <strong>ESC</strong> to hide
          </Typography>
        </Box>
      </AppBar>
    </Slide>
  );
};

export default GlobalBottomBar;
