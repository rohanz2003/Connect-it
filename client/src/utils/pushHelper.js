export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
export async function subscribeToPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push not supported');
    return null;
  }
  const publicVapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
  if (!publicVapidKey) {
    console.log('VAPID public key not configured');
    return null;
  }
  try {
    let registration;
    const existing = await navigator.serviceWorker.getRegistration('/sw.js');
    if (existing) {
      registration = existing;
    } else {
      registration = await navigator.serviceWorker.register('/sw.js');
    }
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return null;
    }
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
    });
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    await fetch(API_URL + '/api/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, subscription, deviceInfo: navigator.userAgent })
    });
    console.log('Push subscribed');
    return subscription;
  } catch (err) {
    console.error('Push subscription failed:', err.message);
    return null;
  }
}
