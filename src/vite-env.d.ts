/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_STORY_PROVIDER_URL?: string;
  readonly VITE_LOCAL_LLM_MODEL?: string;
  readonly VITE_LOCAL_LLM_REQUEST_FORMAT?: string;
  readonly VITE_LOCAL_LLM_TEMPERATURE?: string;
  readonly VITE_LOCAL_COMFY_URL?: string;
  readonly VITE_PLAYWRIGHT_SKIP_WELCOME?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
