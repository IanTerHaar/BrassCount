declare module '@env' {
  export const APP_ENV: 'development' | 'staging' | 'production';
  export const API_BASE_URL: string;
  export const API_TIMEOUT_MS: string;
  export const ENABLE_ANALYTICS: string;
}
