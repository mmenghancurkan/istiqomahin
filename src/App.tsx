import { useState, useEffect } from 'react';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { seedDatabase, isDatabaseSeeded } from './lib/seed';
import { UserProfile, UserRole } from './types';
import LoginScreen from './components/LoginScreen';
import MonitoringTab from './components/MonitoringTab';
import ScannerTab from './components/ScannerTab';
import SiswaTab from './components/SiswaTab';
import UsersTab from './components/UsersTab';
import LaporanTab from './components/LaporanTab';
import { 
  Award, LogOut, Shield, Users, Clock, Loader2, BookOpen, 
  QrCode, FileText, CheckCircle 
} from 'lucide-react';
import { formatToJakartaDateTime } from './lib/utils';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedProgressMsg, setSeedProgressMsg] = useState('');
  
  // Navigation
  const [activeTab, setActiveTab] = useState<string>('');

  // Logout confirmation
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Clock
  const [timeStr, setTimeStr] = useState('');

  // Live ticking Jakarta Clock helper
  useEffect(() => {
    const updateClock = () => {
      const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      try {
        setTimeStr(formatter.format(new Date()) + ' WIB');
      } catch {
        setTimeStr(new Date().toLocaleTimeString() + ' WIB');
      }
    };
    
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // System Seeding and Initialization
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const seeded = await isDatabaseSeeded();
        if (!seeded) {
          setIsSeeding(true);
          await seedDatabase((msg) => setSeedProgressMsg(msg));
          setIsSeeding(false);
        }
      } catch (err) {
        console.error('Initial seeding failure:', err);
        setIsSeeding(false);
      }

      // Check local storage session first (for fallback)
      const storedProfileStr = localStorage.getItem('sistem_verifikasi_profile');
      let loadedFromLocal = false;
      if (storedProfileStr) {
        try {
          const storedProfile = JSON.parse(storedProfileStr);
          if (storedProfile && storedProfile.uid) {
            setProfile(storedProfile);
            setUser({ uid: storedProfile.uid, email: `${storedProfile.username}@sholat-verifikasi.id` });
            if (storedProfile.role === 'petugas') {
              setActiveTab('scan');
            } else {
              setActiveTab('monitoring');
            }
            loadedFromLocal = true;
          }
        } catch (e) {
          console.error('Error parsing stored profile', e);
        }
      }

      // Check current Auth Session
      onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          try {
            const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
            if (userDocSnap.exists()) {
              const userProfile = userDocSnap.data() as UserProfile;
              setProfile(userProfile);
              localStorage.setItem('sistem_verifikasi_profile', JSON.stringify(userProfile));
              // Set default tab based on role
              if (userProfile.role === 'petugas') {
                setActiveTab('scan');
              } else {
                setActiveTab('monitoring');
              }
            } else {
              console.error('Profile not found in Firestore for auth UID:', currentUser.uid);
              // fallback
              const fallbackProfile: UserProfile = {
                uid: currentUser.uid,
                username: currentUser.email?.split('@')[0] || 'user',
                name: currentUser.email?.split('@')[0] || 'Staff',
                role: 'petugas',
                createdAt: new Date().toISOString()
              };
              setProfile(fallbackProfile);
              localStorage.setItem('sistem_verifikasi_profile', JSON.stringify(fallbackProfile));
              setActiveTab('scan');
            }
          } catch (err) {
            console.error('Error fetching user profile:', err);
          }
        } else {
          // Fallback check to keep manual logins active
          const stored = localStorage.getItem('sistem_verifikasi_profile');
          if (stored) {
            try {
              const storedProfile = JSON.parse(stored);
              if (storedProfile && storedProfile.uid) {
                setProfile(storedProfile);
                setUser({ uid: storedProfile.uid, email: `${storedProfile.username}@sholat-verifikasi.id` });
                if (!activeTab) {
                  setActiveTab(storedProfile.role === 'petugas' ? 'scan' : 'monitoring');
                }
              }
            } catch (e) {
              console.error(e);
            }
          } else {
            setUser(null);
            setProfile(null);
            setActiveTab('');
          }
        }
        setIsInitializing(false);
      });
    };

    initializeApp();
  }, []);

  const executeLogout = async () => {
    localStorage.removeItem('sistem_verifikasi_profile');
    try {
      await signOut(auth);
    } catch (e) {
      console.error('Logout error:', e);
    }
    setUser(null);
    setProfile(null);
    setActiveTab('');
    setShowLogoutConfirm(false);
  };

  const renderActiveTabContent = () => {
    if (!profile) return null;

    switch (activeTab) {
      case 'monitoring':
        return <MonitoringTab currentUser={profile} />;
      case 'scan':
        return <ScannerTab currentUser={profile} />;
      case 'siswa':
        return <SiswaTab />;
      case 'users':
        return <UsersTab />;
      case 'laporan':
        return <LaporanTab />;
      default:
        return (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100">
            <Loader2 className="animate-spin h-8 w-8 text-indigo-500 mx-auto" />
            <p className="text-sm text-slate-500 mt-2">Memuat halaman...</p>
          </div>
        );
    }
  };

  const getNavigationTabs = (): { id: string; label: string; icon: any }[] => {
    if (!profile) return [];

    const tabs = [];

    // All except petugas can view Monitoring
    if (profile.role === 'admin' || profile.role === 'guru') {
      tabs.push({ id: 'monitoring', label: 'Daftar Kepulangan', icon: BookOpen });
    }

    // All except guru can scan QR
    if (profile.role === 'admin' || profile.role === 'petugas') {
      tabs.push({ id: 'scan', label: 'Scan Verifikasi', icon: QrCode });
    }

    // Only admin can manage students and users
    if (profile.role === 'admin') {
      tabs.push({ id: 'siswa', label: 'Kelola Siswa', icon: Users });
      tabs.push({ id: 'users', label: 'Kelola Pengguna', icon: Shield });
    }

    // Admin and Guru can view reports
    if (profile.role === 'admin' || profile.role === 'guru') {
      tabs.push({ id: 'laporan', label: 'Laporan CSV', icon: FileText });
    }

    return tabs;
  };

  // Seeding Loader Screen
  if (isSeeding) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full text-center space-y-6">
          <div className="h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mx-auto">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-lg">Inisialisasi Sistem</h3>
            <p className="text-xs text-slate-400 mt-1">Sistem sedang dikonfigurasi untuk pertama kali</p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl text-xs font-mono text-slate-600">
            {seedProgressMsg}
          </div>
        </div>
      </div>
    );
  }

  // Auth Initialization Loader
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex justify-center items-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
          <p className="text-sm text-slate-500 font-medium">Memuat sistem verifikasi...</p>
        </div>
      </div>
    );
  }

  // Not logged in -> Show Login
  if (!user || !profile) {
    return (
      <LoginScreen 
        onLoginSuccess={(profile) => {
          setProfile(profile);
          setUser({ uid: profile.uid, email: `${profile.username}@sholat-verifikasi.id` });
          if (profile.role === 'petugas') {
            setActiveTab('scan');
          } else {
            setActiveTab('monitoring');
          }
        }} 
      />
    );
  }

  const tabs = getNavigationTabs();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      
      {/* Dynamic Global Top Header */}
      <header className="bg-white border-b border-slate-100 shadow-xs shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          {/* Logo & School Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-150">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">Sistem Verifikasi Sholat</h1>
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-0.5">Kedisiplinan Keagamaan Sekolah</p>
            </div>
          </div>

          {/* Right Clock and Logged-in Meta */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3 sm:gap-6 text-sm">
            
            {/* Clock Widget */}
            <div className="flex items-center gap-2 text-slate-500 font-mono text-xs font-semibold bg-slate-50 border border-slate-150 px-3 py-1.5 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{timeStr}</span>
            </div>

            {/* Profile Info */}
            <div className="flex items-center gap-2.5">
              <div className="text-right">
                <p className="font-extrabold text-slate-800 leading-tight text-xs sm:text-sm">{profile.name}</p>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${
                    profile.role === 'admin' 
                      ? 'bg-indigo-50 text-indigo-700' 
                      : profile.role === 'guru' 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {profile.role}
                  </span>
                </div>
              </div>

              {/* Log Out Trigger */}
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="p-2.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-100 rounded-xl transition-all cursor-pointer"
                title="Keluar dari sistem"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>

          </div>

        </div>
      </header>

      {/* Main Tab Navigation Chrome */}
      <nav className="bg-white border-b border-slate-150 shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-4 overflow-x-auto no-scrollbar py-2 sm:py-0">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 border-b-2 text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive 
                      ? 'border-indigo-600 text-indigo-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-850 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Work Area Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto">
        {renderActiveTabContent()}
      </main>

      {/* Footer Branding */}
      <footer className="bg-white border-t border-slate-100 py-3 text-center text-[10px] text-slate-400 shrink-0 font-medium">
        &copy; 2026 Sistem Verifikasi Sholat Siswa • Berjalan di Zona Waktu Asia/Jakarta • Didukung oleh Google AI Studio
      </footer>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setShowLogoutConfirm(false)}
          />
          {/* Modal Content */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 max-w-sm w-full relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600 mx-auto">
              <LogOut className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Keluar Sistem</h3>
              <p className="text-sm text-slate-500 mt-1">
                Apakah Anda yakin ingin keluar dari Sistem Verifikasi Sholat? Sesi kerja Anda sebagai petugas akan diakhiri.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeLogout}
                className="flex-1 py-2.5 bg-rose-650 hover:bg-rose-700 text-white font-bold rounded-xl text-sm shadow-xs transition-colors cursor-pointer"
              >
                Ya, Keluar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
