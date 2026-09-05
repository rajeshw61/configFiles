import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import LZString from 'lz-string';
import { ToolTab } from '../types/suite';
import { CspDirectives, CspExportFormat } from '../types/csp';
import { NGINX_PRESETS } from '../engines/nginx/presets';
import { CSP_PRESETS } from '../engines/csp/presets';
import { generateNginxConf, DEFAULT_NGINX_STATE } from '../engines/nginx/generator';
import { applyNginxDirectiveMutation, applyNginxPresetToContent, ParsedNginxToggles } from '../engines/nginx/mutator';

const DEFAULT_DOCKERFILE = `# Production Node.js Web Service Dockerfile
FROM node:latest

# Working Directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm run build

# Copy remaining source files
ADD . .

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start"]
`;

export const DEFAULT_NGINX_CONFIG = generateNginxConf(DEFAULT_NGINX_STATE);
const INITIAL_CSP_DIRECTIVES: CspDirectives = { ...CSP_PRESETS[0].directives } as CspDirectives;

interface SuiteStore {
  activeTool: ToolTab;
  setActiveTool: (tool: ToolTab) => void;

  // Unified Nginx state — Single Source of Truth
  activeNginxContent: string;
  setActiveNginxContent: (content: string) => void;
  uploadNginxFile: (content: string) => void;
  toggleNginxDirective: (key: keyof ParsedNginxToggles, enabled: boolean) => void;
  applyNginxPreset: (presetId: string) => void;
  resetNginxToDefault: () => void;

  // Dockerfile state
  dockerfileContent: string;
  setDockerfileContent: (content: string) => void;
  resetDockerfile: () => void;

  // CSP state
  cspDirectives: CspDirectives;
  cspExportFormat: CspExportFormat;
  setCspDirectives: (updater: Partial<CspDirectives>) => void;
  setCspExportFormat: (format: CspExportFormat) => void;
  applyCspPreset: (presetId: string) => void;

  // URL Hash Sync
  serializeToUrlHash: () => string;
  loadFromUrlHash: (customHash?: string) => boolean;
}

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // safe fallback
    }
    return null;
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // safe fallback
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // safe fallback
    }
  },
};

export const useSuiteStore = create<SuiteStore>()(
  persist(
    (set, get) => ({
      activeTool: 'nginx',
      setActiveTool: (tool) => set({ activeTool: tool }),

      // Unified Nginx file state
      activeNginxContent: DEFAULT_NGINX_CONFIG,

      setActiveNginxContent: (content) => set({ activeNginxContent: content }),

      uploadNginxFile: (content) => set({ activeNginxContent: content }),

      toggleNginxDirective: (key, enabled) => {
        const current = get().activeNginxContent;
        const updated = applyNginxDirectiveMutation(current, key, enabled);
        set({ activeNginxContent: updated });
      },

      applyNginxPreset: (presetId) => {
        const current = get().activeNginxContent;
        const preset = NGINX_PRESETS.find((p) => p.id === presetId);
        if (!preset) return;

        if (!current || current.trim() === '' || current === DEFAULT_NGINX_CONFIG) {
          // Boilerplate template mode
          const generated = generateNginxConf(preset.config);
          set({ activeNginxContent: generated });
        } else {
          // In-place hardening on user's active file
          const updated = applyNginxPresetToContent(current, presetId);
          set({ activeNginxContent: updated });
        }
      },

      resetNginxToDefault: () => set({ activeNginxContent: DEFAULT_NGINX_CONFIG }),

      // Dockerfile
      dockerfileContent: DEFAULT_DOCKERFILE,
      setDockerfileContent: (content) => set({ dockerfileContent: content }),
      resetDockerfile: () => set({ dockerfileContent: DEFAULT_DOCKERFILE }),

      // CSP
      cspDirectives: INITIAL_CSP_DIRECTIVES,
      cspExportFormat: 'nginx',
      setCspDirectives: (updater) =>
        set((state) => ({
          cspDirectives: { ...state.cspDirectives, ...updater },
        })),
      setCspExportFormat: (format) => set({ cspExportFormat: format }),
      applyCspPreset: (presetId) => {
        const preset = CSP_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          set((state) => ({
            cspDirectives: { ...state.cspDirectives, ...preset.directives } as CspDirectives,
          }));
        }
      },

      // State Serialization
      serializeToUrlHash: () => {
        const { activeTool, activeNginxContent, dockerfileContent, cspDirectives } = get();
        const payload = { activeTool, activeNginxContent, dockerfileContent, cspDirectives };
        const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
        if (typeof window !== 'undefined' && window.location) {
          window.location.hash = compressed;
        }
        return compressed;
      },

      loadFromUrlHash: (customHash?: string) => {
        try {
          let hash = customHash;
          if (hash === undefined) {
            if (typeof window === 'undefined' || !window.location) return false;
            hash = window.location.hash;
          }
          const cleanHash = (hash || '').replace(/^#\/?/, '').trim();
          if (!cleanHash) return false;

          const validTools: ToolTab[] = ['nginx', 'dockerfile', 'csp', 'topology'];

          // 1. Direct tool route navigation (e.g. #nginx, #dockerfile, #csp, #topology)
          const lowerHash = cleanHash.toLowerCase();
          const directMatch = validTools.find((t) => t === lowerHash);
          if (directMatch) {
            set({ activeTool: directMatch });
            return true;
          }

          // 2. LZString compressed full workspace state payload
          const decompressed = LZString.decompressFromEncodedURIComponent(cleanHash);
          if (!decompressed) return false;
          const parsed = JSON.parse(decompressed);
          if (parsed.activeTool && validTools.includes(parsed.activeTool)) {
            set({ activeTool: parsed.activeTool });
          }
          if (parsed.activeNginxContent !== undefined) set({ activeNginxContent: parsed.activeNginxContent });
          if (parsed.dockerfileContent !== undefined) set({ dockerfileContent: parsed.dockerfileContent });
          if (parsed.cspDirectives) set({ cspDirectives: parsed.cspDirectives });
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: 'opshardener_suite_state',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        activeTool: state.activeTool,
        activeNginxContent: state.activeNginxContent,
        dockerfileContent: state.dockerfileContent,
        cspDirectives: state.cspDirectives,
        cspExportFormat: state.cspExportFormat,
      }),
    }
  )
);
