export type UserRole = 'admin' | 'guru' | 'petugas';

export interface UserProfile {
  uid: string;
  username: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type QrType = 'lifetime' | 'harian';
export type ReligionType = 'Muslim' | 'Non-Muslim';

export interface Student {
  id: string; // NISN / Student ID
  name: string;
  class: string;
  religion: ReligionType;
  gender?: 'Laki-laki' | 'Perempuan'; // Added gender support for female student menstruation scheduling
  qrType: QrType;
  qrToken: string; // Dynamic or static unique verification token
  createdAt: string;
}

export type SholatType = 'dhuhur' | 'ashar';

export interface Verification {
  id: string; // Format: `${studentId}_${date}_${sholatType}`
  studentId: string;
  studentName: string;
  studentClass: string;
  date: string; // Format: YYYY-MM-DD (Asia/Jakarta timezone)
  sholatType: SholatType;
  verifiedAt: string; // ISO DateTime
  verifiedBy: string; // User UID who scanned
  verifiedByName: string; // User Name who scanned
  status?: 'verified' | 'haid' | 'sakit' | 'izin'; // Added status: 'verified' (default), 'haid' (excused), 'sakit' (excused), or 'izin' (excused)
}

export interface VerificationStats {
  totalMuslim: number;
  totalDhuhurVerified: number;
  totalAsharVerified: number;
  totalCompleted: number; // Completed both
  totalPending: number; // Has at least one pending
}
