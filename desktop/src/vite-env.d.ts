/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JOONE_DESKTOP_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
