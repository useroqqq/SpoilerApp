/**
 * Mock and wrapper for the Webxdc API.
 * This allows the app to work seamlessly inside Delta Chat while
 * providing a mocked development environment here.
 */

export interface WebxdcUpdate<T = any> {
  payload: T;
  info?: string;
  document?: string;
  summary?: string;
}

export interface Webxdc<T = any> {
  sendUpdate: (update: WebxdcUpdate<T>, description: string) => void;
  setUpdateListener: (
    listener: (update: { payload: T; serial: number; max_serial: number; info: string }) => void,
    serial?: number
  ) => Promise<void>;
  sendToChat: (message: { file: { name: string; blob: Blob }; text?: string }) => Promise<void>;
  selfAddr: string;
  selfName: string;
}

declare global {
  interface Window {
    webxdc?: Webxdc;
  }
}

// Global mock state to simulate network
let mockState: any[] = [];
let mockListener: any = null;

export function getWebxdc<T>(): Webxdc<T> {
  if (typeof window !== 'undefined' && window.webxdc) {
    return window.webxdc as Webxdc<T>;
  }
  
  // Return a mock for development environment
  return {
    sendUpdate: (update: WebxdcUpdate<T>, description: string) => {
      console.log("[Webxdc Mock] Sending update:", update, description);
      const newUpdate = {
        payload: update.payload,
        serial: mockState.length + 1,
        max_serial: mockState.length + 1,
        info: description
      };
      mockState.push(newUpdate);
      
      // Simulate network delay and broadcast
      if (mockListener) {
        setTimeout(() => mockListener(newUpdate), 100);
      }
    },
    setUpdateListener: async (listener, serial) => {
      console.log("[Webxdc Mock] Listener attached. Current state size:", mockState.length);
      mockListener = listener;
      // Replay all previous messages in the mock
      mockState.forEach(update => listener(update));
    },
    sendToChat: async (message) => {
      console.log("[Webxdc Mock] sendToChat called with:", message);
      // Create a dummy download link to verify in browser
      const url = URL.createObjectURL(message.file.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = message.file.name;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`В реальном приложении этот файл (${message.file.name}) был бы отправлен в чат. В режиме превью мы скачали его для вас.`);
    },
    selfAddr: "dev@local.host",
    selfName: "Вы (Preview)"
  };
}
