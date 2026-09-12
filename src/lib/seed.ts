import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, writeBatch, collection, getDocs, limit, query } from 'firebase/firestore';
import { Student, UserProfile } from '../types';

const SEED_USERS = [
  { username: 'admin', name: 'Ahmad Admin, S.Pd.', role: 'admin', email: 'admin@sholat-verifikasi.id', pass: 'admin123' },
  { username: 'guru', name: 'Ibu Hartati, S.Ag. (Wali Kelas)', role: 'guru', email: 'guru@sholat-verifikasi.id', pass: 'guru123' },
  { username: 'petugas', name: 'M. Farhan (Ketua Rohis)', role: 'petugas', email: 'petugas@sholat-verifikasi.id', pass: 'petugas123' }
];

const SEED_STUDENTS: Student[] = [
  { id: '2026001', name: 'Yusuf Al-Fatih', class: 'X-MIPA-1', religion: 'Muslim', qrType: 'harian', qrToken: 'LT-2026001-YUSUF', createdAt: new Date().toISOString() },
  { id: '2026002', name: 'Fatimah Az-Zahra', class: 'X-MIPA-1', religion: 'Muslim', qrType: 'lifetime', qrToken: 'LT-2026002-FATIMAH', createdAt: new Date().toISOString() },
  { id: '2026003', name: 'Budi Santoso', class: 'X-MIPA-1', religion: 'Muslim', qrType: 'lifetime', qrToken: 'LT-2026003-BUDI', createdAt: new Date().toISOString() },
  { id: '2026004', name: 'Siti Aminah', class: 'X-MIPA-2', religion: 'Muslim', qrType: 'harian', qrToken: 'LT-2026004-SITI', createdAt: new Date().toISOString() },
  { id: '2026005', name: 'Michael Wijaya', class: 'X-MIPA-2', religion: 'Non-Muslim', qrType: 'lifetime', qrToken: 'LT-2026005-MICHAEL', createdAt: new Date().toISOString() },
  { id: '2026006', name: 'Muhammad Ali', class: 'X-MIPA-2', religion: 'Muslim', qrType: 'harian', qrToken: 'LT-2026006-ALI', createdAt: new Date().toISOString() },
  { id: '2026007', name: 'Zahra Salsabila', class: 'XI-IPS-1', religion: 'Muslim', qrType: 'lifetime', qrToken: 'LT-2026007-ZAHRA', createdAt: new Date().toISOString() },
  { id: '2026008', name: 'Christian David', class: 'XI-IPS-1', religion: 'Non-Muslim', qrType: 'lifetime', qrToken: 'LT-2026008-DAVID', createdAt: new Date().toISOString() },
  { id: '2026009', name: 'Syamil Basayev', class: 'XI-IPS-1', religion: 'Muslim', qrType: 'harian', qrToken: 'LT-2026009-SYAMIL', createdAt: new Date().toISOString() }
];

export async function isDatabaseSeeded(): Promise<boolean> {
  try {
    const q = query(collection(db, 'students'), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      return false;
    }

    // Ensure all default users exist in Firestore as fallbacks
    for (const u of SEED_USERS) {
      const uSnap = await getDoc(doc(db, 'users', u.username));
      if (!uSnap.exists()) {
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('Error checking seed status:', err);
    return false;
  }
}

export async function seedDatabase(onProgress?: (msg: string) => void): Promise<void> {
  onProgress?.('Memeriksa database...');
  const seeded = await isDatabaseSeeded();
  if (seeded) {
    onProgress?.('Database sudah memiliki data.');
    return;
  }

  onProgress?.('Mulai seeding data awal...');

  // 1. Seed Users (Auth + Firestore)
  for (const u of SEED_USERS) {
    onProgress?.(`Membuat akun ${u.username}...`);
    try {
      let uid = u.username; // Fallback to username as uid if auth is disabled
      
      // Try to create Firebase Auth user, but catch errors silently (e.g. auth/operation-not-allowed)
      try {
        let userCred;
        try {
          userCred = await signInWithEmailAndPassword(auth, u.email, u.pass);
          uid = userCred.user.uid;
        } catch (err: any) {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            userCred = await createUserWithEmailAndPassword(auth, u.email, u.pass);
            uid = userCred.user.uid;
          } else {
            throw err;
          }
        }
      } catch (authErr: any) {
        console.warn(`Auth provider bypassed/disabled for ${u.username}:`, authErr?.message || authErr);
      }

      // Create /users document
      const userProfile = {
        uid,
        username: u.username,
        name: u.name,
        role: u.role,
        initialPassword: u.pass, // Plaintext password stored inside Firestore as fallback authentication
        createdAt: new Date().toISOString()
      };
      
      // Save under UID document (if uid is resolved differently from username)
      if (uid !== u.username) {
        await setDoc(doc(db, 'users', uid), userProfile);
      }
      
      // Always write under username document so direct fallback lookup always works
      await setDoc(doc(db, 'users', u.username), userProfile);
    } catch (err) {
      console.error(`Gagal membuat user ${u.username}:`, err);
    }
  }

  // 2. Seed Students
  onProgress?.('Membuat data siswa awal...');
  const batch = writeBatch(db);
  for (const s of SEED_STUDENTS) {
    const sDocRef = doc(db, 'students', s.id);
    batch.set(sDocRef, s);
  }
  await batch.commit();

  onProgress?.('Database berhasil di-seed!');
}
