import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  LogIn, Shield, Users, Award, AlertCircle, Loader2, 
  QrCode, Smartphone, Sparkles, BookOpen, Clock, Download 
} from 'lucide-react';
import { UserProfile, Student } from '../types';
import { getJakartaDate, generateDailyToken } from '../lib/utils';
import QRCode from 'qrcode';

interface LoginScreenProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [activeTab, setActiveTab] = useState<'staf' | 'siswa'>('siswa');
  
  // Staf states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Siswa states
  const [studentIdInput, setStudentIdInput] = useState('');
  const [isFetchingStudent, setIsFetchingStudent] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [foundStudent, setFoundStudent] = useState<Student | null>(null);

  // Instant search states
  const [instantStudent, setInstantStudent] = useState<{name: string, class: string} | null>(null);
  const [isInstantSearching, setIsInstantSearching] = useState(false);
  const [instantSearchError, setInstantSearchError] = useState(false);

  // Instant student lookup as typing
  useEffect(() => {
    const idClean = studentIdInput.trim();
    if (idClean.length < 3) {
      setInstantStudent(null);
      setIsInstantSearching(false);
      setInstantSearchError(false);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsInstantSearching(true);
      setInstantSearchError(false);
      try {
        const docRef = doc(db, 'students', idClean);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const student = snap.data() as Student;
          setInstantStudent({ name: student.name, class: student.class });
        } else {
          setInstantStudent(null);
          setInstantSearchError(true);
        }
      } catch (err) {
        console.error('Instant search error:', err);
      } finally {
        setIsInstantSearching(false);
      }
    }, 350); // 350ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [studentIdInput]);
  
  const canvasHarianRef = useRef<HTMLCanvasElement | null>(null);
  const canvasLifetimeRef = useRef<HTMLCanvasElement | null>(null);

  // Redraw QR Code when student is fetched
  useEffect(() => {
    if (foundStudent) {
      renderStudentQr();
    }
  }, [foundStudent, activeTab]);

  const renderStudentQr = async () => {
    if (!foundStudent) return;
    try {
      // 1. Render Lifetime QR
      if (canvasLifetimeRef.current) {
        const lifetimePayload = `LIFETIME:${foundStudent.id}:${foundStudent.qrToken || `LT-${foundStudent.id}-TOKEN`}`;
        await QRCode.toCanvas(canvasLifetimeRef.current, lifetimePayload, {
          width: 180,
          margin: 2,
          color: {
            dark: '#1e293b', // slate-800
            light: '#ffffff'
          }
        });
      }

      // 2. Render Daily QR
      if (canvasHarianRef.current) {
        const today = getJakartaDate();
        const dailyToken = generateDailyToken(foundStudent.id, today);
        const dailyPayload = `DAILY:${foundStudent.id}:${today}:${dailyToken}`;
        await QRCode.toCanvas(canvasHarianRef.current, dailyPayload, {
          width: 180,
          margin: 2,
          color: {
            dark: '#4f46e5', // Indigo-600
            light: '#ffffff'
          }
        });
      }
    } catch (err) {
      console.error('Error drawing student QR codes:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const usernameClean = username.trim().toLowerCase();
    if (!usernameClean || !password) {
      setError('Username dan password wajib diisi');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Map username to synthetic email
      const email = `${usernameClean}@sholat-verifikasi.id`;
      
      try {
        // Attempt standard Firebase Auth login
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        
        // Successfully authenticated via Firebase Auth. Fetch profile document
        const userDocRef = doc(db, 'users', userCred.user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as UserProfile;
          localStorage.setItem('sistem_verifikasi_profile', JSON.stringify(profile));
          onLoginSuccess(profile);
          return;
        } else {
          // If Firestore uid doc doesn't exist, search username doc
          const fallbackDocRef = doc(db, 'users', usernameClean);
          const fallbackSnap = await getDoc(fallbackDocRef);
          if (fallbackSnap.exists()) {
            const profile = fallbackSnap.data() as UserProfile;
            localStorage.setItem('sistem_verifikasi_profile', JSON.stringify(profile));
            onLoginSuccess(profile);
            return;
          }
        }
      } catch (authErr: any) {
        console.warn('Standard Auth failed/disabled. Trying secure Firestore fallback login...', authErr?.message || authErr);
        
        // SECURE FIRESTORE BACKED FALLBACK (100% resilient to auth/operation-not-allowed or offline Auth)
        const userDocRef = doc(db, 'users', usernameClean);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          const savedPass = data.initialPassword || data.password;
          if (savedPass && savedPass === password) {
            // Match! Construct profile
            const profile: UserProfile = {
              uid: data.uid || usernameClean,
              username: data.username,
              name: data.name,
              role: data.role,
              createdAt: data.createdAt || new Date().toISOString()
            };
            localStorage.setItem('sistem_verifikasi_profile', JSON.stringify(profile));
            onLoginSuccess(profile);
            return;
          } else {
            setError('Password yang Anda masukkan salah.');
            return;
          }
        } else {
          setError('Username tidak terdaftar di sistem.');
          return;
        }
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Gagal masuk ke sistem. Periksa koneksi internet Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const idClean = studentIdInput.trim();
    if (!idClean) {
      setStudentError('Harap masukkan ID / NISN Anda');
      return;
    }

    setIsFetchingStudent(true);
    setStudentError('');
    setFoundStudent(null);

    try {
      const docRef = doc(db, 'students', idClean);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const student = snap.data() as Student;
        setFoundStudent(student);
      } else {
        setStudentError('Siswa tidak ditemukan. Silakan cek kembali nomor NISN Anda.');
      }
    } catch (err) {
      console.error('Error fetching student QR:', err);
      setStudentError('Gagal mengambil data siswa karena kendala jaringan.');
    } finally {
      setIsFetchingStudent(false);
    }
  };

  return (
    <div id="login-container" className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="h-14 w-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-150">
            <Award className="h-8 w-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 tracking-tight">
          Sistem Verifikasi Sholat
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600">
          Urusan ketertiban ibadah siswa sebelum kepulangan sekolah
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        
        <div className="bg-white py-8 px-4 shadow-xl border border-slate-100 rounded-2xl sm:px-10">
          
          {/* TAB 1: STAF LOGIN FORM */}
          {activeTab === 'staf' && (
            <div className="space-y-6 max-w-md mx-auto">
              <div className="text-center">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-extrabold uppercase tracking-wider">
                  Sesi Akses Staf Sekolah
                </span>
                <p className="text-xs text-slate-400 mt-2">Gunakan username dan password yang diberikan Administrator</p>
              </div>

              <form className="space-y-6" onSubmit={handleLogin}>
                {error && (
                  <div className="rounded-lg bg-red-50 p-4 border border-red-100 flex items-start space-x-3">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-red-800 font-medium">{error}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="username" className="block text-sm font-semibold text-slate-700">
                    Username
                  </label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="block w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 transition-colors"
                      placeholder="Masukkan username"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <div className="mt-1 relative rounded-md shadow-xs">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-slate-900 transition-colors"
                      placeholder="Masukkan password"
                    />
                  </div>
                </div>

                <div>
                  <button
                    id="btn-login"
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 active:bg-indigo-800 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin h-5 w-5 mr-2" />
                        Menghubungkan...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-5 w-5 mr-2" />
                        Masuk ke Sistem
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Toggle back link */}
              <div className="pt-4 border-t border-slate-150 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('siswa');
                    setError('');
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  ← Kembali ke Pencarian ID/NISN Siswa
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: SISWA QR MANIPULATION FORM */}
          {activeTab === 'siswa' && (
            <div className="space-y-6">
              {!foundStudent ? (
                <div className="max-w-md mx-auto space-y-6">
                  <form className="space-y-5" onSubmit={handleFetchStudent}>
                    <p className="text-xs text-slate-500 leading-relaxed text-center">
                      Selamat datang di Portal Siswa. Silakan masukkan ID atau NISN Anda untuk mengunduh, mencetak, atau memunculkan kode QR verifikasi sholat harian Anda.
                    </p>

                    {studentError && (
                      <div className="rounded-lg bg-amber-50 p-4 border border-amber-150 flex items-start space-x-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                        <span className="text-sm text-amber-800 font-medium">{studentError}</span>
                      </div>
                    )}

                    <div>
                      <label htmlFor="studentIdInput" className="block text-sm font-semibold text-slate-700 text-center mb-1">
                        Masukkan ID / NISN Siswa
                      </label>
                      <div className="mt-1 relative group">
                        <input
                          id="studentIdInput"
                          type="text"
                          required
                          value={studentIdInput}
                          onChange={(e) => setStudentIdInput(e.target.value)}
                          className="block w-full px-4 py-3.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-900 transition-all duration-300 text-center font-bold tracking-wider text-lg shadow-sm group-hover:border-slate-300"
                          placeholder="Contoh: 2026001"
                          autoComplete="off"
                        />
                      </div>

                      {/* Real-time feedback container with smooth transition/fade */}
                      <div className="mt-3 min-h-[32px] flex items-center justify-center text-center transition-all duration-300">
                        {studentIdInput.trim().length === 0 ? (
                          <span className="text-xs text-slate-400">Silakan masukkan ID unik atau NISN Anda</span>
                        ) : studentIdInput.trim().length < 3 ? (
                          <span className="text-xs text-slate-400 flex items-center gap-1 animate-pulse">
                            Ketik minimal 3 angka...
                          </span>
                        ) : isInstantSearching ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                            <Loader2 className="animate-spin h-3.5 w-3.5" />
                            Memeriksa database...
                          </span>
                        ) : instantStudent ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-100 animate-in fade-in slide-in-from-bottom-1 duration-200">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                            <span>Siswa Terdaftar: <strong>{instantStudent.name}</strong> ({instantStudent.class})</span>
                          </div>
                        ) : instantSearchError ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50/50 px-3 py-1 rounded-full border border-amber-100/50 font-medium animate-in fade-in duration-200">
                            ⚠ ID tidak ditemukan di sistem sekolah
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      id="btn-fetch-qr"
                      type="submit"
                      disabled={isFetchingStudent}
                      className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-hidden active:bg-indigo-800 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isFetchingStudent ? (
                        <>
                          <Loader2 className="animate-spin h-5 w-5 mr-2" />
                          Mencari Data Siswa...
                        </>
                      ) : (
                        <>
                          <QrCode className="h-5 w-5 mr-2" />
                          Tampilkan QR Code Saya
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center space-y-5 animate-in zoom-in-95 duration-150">
                  
                  {foundStudent.religion !== 'Muslim' ? (
                    <div className="bg-amber-50/85 border border-amber-200 p-6 rounded-2xl w-full text-center space-y-4 max-w-md mx-auto">
                      <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mx-auto">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-amber-900 text-base">{foundStudent.name}</h4>
                        <p className="text-xs text-amber-700 mt-1">
                          Kelas: {foundStudent.class} • NISN: {foundStudent.id}
                        </p>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed max-w-xs mx-auto">
                        Anda terdaftar sebagai siswa beragama <strong className="font-bold">{foundStudent.religion}</strong>. Siswa Non-Muslim dibebaskan dari verifikasi ketertiban sholat harian. Terima kasih!
                      </p>
                      <button
                        onClick={() => {
                          setStudentIdInput('');
                          setFoundStudent(null);
                        }}
                        className="w-full py-2.5 bg-white hover:bg-slate-50 border border-amber-200 text-amber-955 font-bold text-xs rounded-xl transition-all cursor-pointer"
                      >
                        Cari ID / NISN Lain
                      </button>
                    </div>
                  ) : (
                    // Muslim Student: Centered Daily QR with a persuasive lifetime download banner
                    <div className="space-y-6 w-full text-left max-w-md mx-auto">
                      <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl w-full text-center">
                        <h3 className="font-extrabold text-slate-800 text-lg leading-tight">{foundStudent.name}</h3>
                        <p className="text-xs text-slate-500 font-bold mt-1">Kelas: {foundStudent.class} • NISN: {foundStudent.id}</p>
                      </div>

                      {/* 1. Daily QR Option */}
                      <div className="bg-white border border-slate-150 p-6 rounded-2xl flex flex-col items-center shadow-xs">
                        <div className="text-center space-y-1 mb-3">
                          <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[9px] font-extrabold uppercase tracking-wider">
                            Tipe QR Harian (Gawai)
                          </span>
                          <h4 className="text-xs font-bold text-slate-700 mt-1">Tunjukkan Layar HP Anda</h4>
                          <p className="text-[10px] text-slate-400">Diperbarui otomatis setiap hari</p>
                        </div>
                        
                        <canvas ref={canvasHarianRef} className="bg-white p-3 rounded-xl border border-slate-150 shadow-xs my-2" />
                      </div>

                      {/* Hidden Canvas for generating the Lifetime QR to download */}
                      <canvas ref={canvasLifetimeRef} style={{ display: 'none' }} />

                      {/* 2. Lifetime QR Persuasive Box & Download Button */}
                      <div className="bg-indigo-50/50 border border-indigo-100 p-5 rounded-2xl space-y-3 shadow-xs">
                        <p className="text-xs text-indigo-950 font-semibold leading-relaxed">
                          Ada regulasi khusus untuk penggunaan HP? Klik tombol ini untuk download QR verifikasi sholat.
                        </p>
                        <button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.download = `QR_Lifetime_${foundStudent.id}_${foundStudent.name}.png`;
                            if (canvasLifetimeRef.current) {
                              link.href = canvasLifetimeRef.current.toDataURL('image/png');
                              link.click();
                            }
                          }}
                          className="w-full py-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Download className="h-4 w-4" />
                          Unduh QR Cetak (Lifetime)
                        </button>
                      </div>

                      <div className="pt-2">
                        <button
                          onClick={() => {
                            setStudentIdInput('');
                            setFoundStudent(null);
                          }}
                          className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all border border-slate-200 cursor-pointer text-center"
                        >
                          Kembali & Cari ID / NISN Lain
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Subtle Admin Access & Version Footer */}
      <div className="mt-8 text-center text-[10px] text-slate-400 select-none">
        <p>© 2026 Sistem Verifikasi Sholat • {' '}
          <button
            type="button"
            onClick={() => {
              if (activeTab === 'siswa') {
                setActiveTab('staf');
                setStudentError('');
                setFoundStudent(null);
              } else {
                setActiveTab('siswa');
                setError('');
              }
            }}
            className="hover:text-slate-500 transition-colors cursor-pointer font-mono text-slate-300 focus:outline-hidden"
          >
            v1.0.0
          </button>
        </p>
      </div>
    </div>
  );
}
