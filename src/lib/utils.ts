/**
 * Utility functions for Sistem Verifikasi Sholat Siswa
 */

// Format CSS classes safely
export function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ');
}

// Get current date in YYYY-MM-DD format for Asia/Jakarta
export function getJakartaDate(): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((p) => p.type === 'year')?.value || '';
  const month = parts.find((p) => p.type === 'month')?.value || '';
  const day = parts.find((p) => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

// Get current time and auto-detect sholat type based on Jakarta time
export function getJakartaTimeAndSholat(): {
  timeStr: string;
  autoSholat: 'dhuhur' | 'ashar' | null;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hourVal = parts.find((p) => p.type === 'hour')?.value || '0';
  const minuteVal = parts.find((p) => p.type === 'minute')?.value || '00';
  const secondVal = parts.find((p) => p.type === 'second')?.value || '00';
  
  const hour = parseInt(hourVal, 10);
  const timeStr = `${hourVal}:${minuteVal}:${secondVal}`;

  // Sholat time boundaries (Jakarta approximation)
  // Dhuhur: 11:30 - 14:30
  // Ashar: 14:45 - 18:00
  let autoSholat: 'dhuhur' | 'ashar' | null = null;
  if (hour >= 11 && hour < 14) {
    autoSholat = 'dhuhur';
  } else if (hour === 14) {
    const minVal = parseInt(minuteVal, 10);
    if (minVal <= 30) {
      autoSholat = 'dhuhur';
    } else {
      autoSholat = 'ashar';
    }
  } else if (hour >= 15 && hour < 18) {
    autoSholat = 'ashar';
  }

  return { timeStr, autoSholat };
}

// Format an ISO string to elegant Indonesian readable datetime
export function formatToJakartaDateTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date) + ' WIB';
  } catch {
    return isoString;
  }
}

// Simple deterministic hash to secure Daily QR verification tokens
export function generateDailyToken(studentId: string, dateStr: string): string {
  // Simple representation: Student ID + Date secret string
  const secretStr = `${studentId}-${dateStr}-sholat-harian-secure-token`;
  // Simple client-side pseudo-hash
  let hash = 0;
  for (let i = 0; i < secretStr.length; i++) {
    const char = secretStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `DAILY-${Math.abs(hash).toString(16).toUpperCase()}`;
}
