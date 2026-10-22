/**
 * Client device identification and metadata utilities for multi-device sync
 * and enforcing maximum 2 active devices.
 */

const DEVICE_STORAGE_KEY = 'plan2learn_device_id';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-prerender';
  try {
    let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (!deviceId) {
      deviceId = `dev_${generateUUID().replace(/-/g, '').slice(0, 20)}`;
      localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'fallback_device';
  }
}

export function getDeviceType(): 'mobile' | 'desktop' | 'tablet' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent.toLowerCase();

  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android/i.test(ua) || window.innerWidth < 768) {
    return 'mobile';
  }
  return 'desktop';
}

export function getDeviceName(): string {
  if (typeof window === 'undefined') return 'Desktop Device';
  const ua = navigator.userAgent;
  const uaLower = ua.toLowerCase();

  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/brave/i.test(ua)) browser = 'Brave';
  else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';

  let os = 'Device';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os/i.test(ua)) os = 'Mac';
  else if (/iphone/i.test(ua)) os = 'iPhone';
  else if (/ipad/i.test(ua)) os = 'iPad';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  return `${browser} on ${os}`;
}

export function getDeviceHeaders(): Record<string, string> {
  return {
    'x-device-id': getDeviceId(),
    'x-device-name': getDeviceName(),
    'x-device-type': getDeviceType(),
  };
}
