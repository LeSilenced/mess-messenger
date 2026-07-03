import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { readThemeFromUrl } from '../utils/appRoutes';
import {
  THEME_PRESETS,
  THEME_VAR_KEYS,
  defaultThemeVars,
  createEmptyCustomTheme,
} from '../theme/themePresets.js';

const STORAGE_KEY = 'mess_theme_v2';

const DEFAULT_STATE = {
  mode: 'preset',
  preset: 'dark',
  customThemeId: null,
  customThemes: [],
  radius: 12,
  fontScale: 1,
};

function migrateLegacy(raw) {
  if (!raw || raw.v === 2) return raw;
  return {
    v: 2,
    mode: 'preset',
    preset: raw.preset || 'dark',
    customThemeId: null,
    customThemes: [],
    radius: Number(raw.radius) || 12,
    fontScale: Number(raw.fontScale) || 1,
  };
}

function loadTheme() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (raw) return { ...DEFAULT_STATE, ...migrateLegacy(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_STATE };
}

function resolveVars(state) {
  if (state.mode === 'custom' && state.customThemeId) {
    const custom = state.customThemes.find((t) => t.id === state.customThemeId);
    if (custom?.vars) return { ...custom.vars };
  }
  const preset = THEME_PRESETS[state.preset] || THEME_PRESETS.dark;
  return { ...preset.vars };
}

const ThemeContext = createContext(null);

export { THEME_PRESETS, THEME_VAR_KEYS, createEmptyCustomTheme, defaultThemeVars };

export function ThemeProvider({ children }) {
  const [state, setState] = useState(() => {
    const base = loadTheme();
    const fromUrl = readThemeFromUrl();
    if (fromUrl?.v === 2 && fromUrl.mode === 'custom' && fromUrl.customTheme) {
      const id = fromUrl.customTheme.id || `import_${Date.now()}`;
      return {
        ...base,
        mode: 'custom',
        customThemeId: id,
        customThemes: [{ ...fromUrl.customTheme, id }, ...base.customThemes],
      };
    }
    if (fromUrl?.preset && THEME_PRESETS[fromUrl.preset]) {
      return { ...base, mode: 'preset', preset: fromUrl.preset };
    }
    return base;
  });

  const applyVars = useMemo(() => {
    const vars = resolveVars(state);
    vars['--radius'] = `${state.radius}px`;
    return vars;
  }, [state]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(applyVars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });
    root.style.setProperty('--font-scale', String(state.fontScale));
    document.body.style.fontSize = `${16 * state.fontScale}px`;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, v: 2 }));
  }, [applyVars, state.fontScale, state]);

  const setPreset = useCallback((preset) => {
    setState((s) => ({ ...s, mode: 'preset', preset, customThemeId: null }));
  }, []);

  const createTheme = useCallback((name) => {
    const theme = createEmptyCustomTheme(name);
    setState((s) => ({
      ...s,
      mode: 'custom',
      customThemeId: theme.id,
      customThemes: [theme, ...s.customThemes],
    }));
    return theme.id;
  }, []);

  const updateCustomTheme = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      customThemes: s.customThemes.map((t) =>
        t.id === id ? { ...t, ...patch, vars: patch.vars ? { ...t.vars, ...patch.vars } : t.vars } : t
      ),
    }));
  }, []);

  const deleteCustomTheme = useCallback((id) => {
    setState((s) => {
      const rest = s.customThemes.filter((t) => t.id !== id);
      const next =
        s.customThemeId === id
          ? { mode: 'preset', preset: s.preset, customThemeId: null }
          : { customThemeId: s.customThemeId };
      return { ...s, ...next, customThemes: rest };
    });
  }, []);

  const applyCustomTheme = useCallback((id) => {
    setState((s) => ({ ...s, mode: 'custom', customThemeId: id }));
  }, []);

  const importTheme = useCallback((data) => {
    if (!data || typeof data !== 'object') return false;
    if (data.mode === 'custom' && data.customTheme?.vars) {
      const id = data.customTheme.id || `import_${Date.now()}`;
      const theme = {
        id,
        name: data.customTheme.name || 'Импорт',
        vars: { ...defaultThemeVars('dark'), ...data.customTheme.vars },
      };
      setState((s) => ({
        ...s,
        mode: 'custom',
        customThemeId: id,
        customThemes: [theme, ...s.customThemes.filter((t) => t.id !== id)],
      }));
      return true;
    }
    if (data.preset && THEME_PRESETS[data.preset]) {
      setState((s) => ({
        ...s,
        mode: 'preset',
        preset: data.preset,
        customThemeId: null,
        radius: Number(data.radius) || s.radius,
        fontScale: Number(data.fontScale) || s.fontScale,
      }));
      return true;
    }
    return false;
  }, []);

  const exportTheme = useCallback(() => {
    if (state.mode === 'custom' && state.customThemeId) {
      const custom = state.customThemes.find((t) => t.id === state.customThemeId);
      return { v: 2, mode: 'custom', customTheme: custom, radius: state.radius, fontScale: state.fontScale };
    }
    return {
      v: 2,
      mode: 'preset',
      preset: state.preset,
      radius: state.radius,
      fontScale: state.fontScale,
    };
  }, [state]);

  const resetTheme = useCallback(() => setState({ ...DEFAULT_STATE }), []);

  const activeCustom =
    state.mode === 'custom'
      ? state.customThemes.find((t) => t.id === state.customThemeId)
      : null;

  const value = {
    state,
    settings: state,
    setPreset,
    setRadius: (radius) => setState((s) => ({ ...s, radius })),
    setFontScale: (fontScale) => setState((s) => ({ ...s, fontScale })),
    resetTheme,
    importTheme,
    exportTheme,
    createTheme,
    updateCustomTheme,
    deleteCustomTheme,
    applyCustomTheme,
    activeCustom,
    currentPreset: THEME_PRESETS[state.preset] || THEME_PRESETS.dark,
    isCustomMode: state.mode === 'custom',
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
