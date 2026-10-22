// Minimal ambient declarations for the Google Identity Services (GIS) token
// client and the Google Picker library (loaded lazily at runtime).
export {};

declare global {
  namespace google {
    namespace picker {
      const ViewId: {
        DOCS: string;
        PDFS: string;
        DOCUMENTS: string;
        SPREADSHEETS: string;
        PRESENTATIONS: string;
      };
      const Feature: {
        MULTISELECT_ENABLED: string;
        NAV_HIDDEN: string;
        SUPPORT_DRIVES: string;
      };
      const Action: {
        PICKED: string;
        CANCEL: string;
      };
      const Response: {
        DOCUMENTS_SELECTED: string;
      };
      class View {
        constructor(viewId: string);
        setMimeTypes(mimeTypes: string): this;
        setIncludeFolders(include: boolean): this;
        setSelectFolderEnabled(enabled: boolean): this;
      }
      class PickerBuilder {
        addView(view: View | string): this;
        enableFeature(feature: string): this;
        setLocale(locale: string): this;
        setOAuthToken(token: string): this;
        setApiKey(apiKey: string): this;
        setAppId(appId: string): this;
        setCallback(callback: (response: PickerResponse) => void): this;
        build(): Picker;
      }
      interface Picker {
        setVisible(visible: boolean): void;
        dispose(): void;
      }
      interface PickerDocument {
        id: string;
        name: string;
        mimeType: string;
        url?: string;
        lastUpdated?: string;
        sizeBytes?: string;
        type?: string;
      }
      interface PickerResponse {
        action: string;
        docs?: PickerDocument[];
        viewId?: string;
      }
    }
    namespace accounts {
      namespace oauth2 {
        interface TokenClientConfig {
          client_id: string;
          scope: string;
          callback: (response: TokenResponse) => void;
          error_callback?: (error: { type?: string; message?: string }) => void;
        }
        interface TokenResponse {
          access_token: string;
          expires_in: number;
          scope: string;
        }
        interface TokenClient {
          requestAccessToken(overrides?: { prompt?: string }): void;
        }
        function initTokenClient(config: TokenClientConfig): TokenClient;
      }
      namespace id {
        interface IdConfiguration {
          client_id: string;
          callback: (response: CredentialResponse) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
          context?: string;
        }
        interface CredentialResponse {
          credential: string;
          select_by?: string;
        }
        interface GsiButtonConfiguration {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          shape?: 'rectangular' | 'pill' | 'circle' | 'square';
          logo_alignment?: 'left' | 'center';
          width?: number | string;
          locale?: string;
        }
        function initialize(config: IdConfiguration): void;
        function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
        function prompt(momentListener?: (notification: any) => void): void;
        function disableAutoSelect(): void;
      }
    }
  }

  interface Window {
    gapi?: {
      load: (api: string, options: { callback: () => void }) => void;
    };
    google?: {
      picker?: typeof google['picker'];
      accounts?: {
        oauth2?: {
          initTokenClient: typeof google.accounts.oauth2.initTokenClient;
        };
        id?: typeof google.accounts.id;
      };
    };
  }
}
