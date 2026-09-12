import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { 
  QrCode, Camera, AlertCircle, CheckCircle, Search, Clock, 
  HelpCircle, UserCheck, Loader2, RefreshCw, Smartphone, Award,
  Wifi, WifiOff, DatabaseBackup, Zap, ZapOff, Focus, User, X
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { Student, Verification, SholatType, UserProfile } from '../types';
import { getJakartaDate, getJakartaTimeAndSholat, formatToJakartaDateTime, generateDailyToken } from '../lib/utils';

interface ScannerTabProps {
  currentUser: UserProfile;
}

export default function ScannerTab({ currentUser }: ScannerTabProps) {
  const [activeSholat, setActiveSholat] = useState<SholatType>('dhuhur');
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);

  // Offline-capabilities states
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<Verification[]>(() => {
    const stored = localStorage.getItem('sistem_verifikasi_offline_queue');
    return stored ? JSON.parse(stored) : [];
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success'>('idle');
  
  // Manual Verification states
  const [searchId, setSearchId] = useState('');
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Scan Status feedback
  const [scanStatus, setScanStatus] = useState<{
    type: 'success' | 'error' | 'idle';
    message: string;
    student?: Student;
    sholat?: SholatType;
  }>({ type: 'idle', message: '' });

  // Interactive verify pop-up candidate student
  const [candidateStudent, setCandidateStudent] = useState<Student | null>(null);

  // History states
  const [todayScans, setTodayScans] = useState<Verification[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const qrRegionId = "qr-reader-element";
  const html5QrcodeScannerRef = useRef<any | null>(null);

  // Prefetch students database for 100% offline scanning capability
  useEffect(() => {
    const fetchAndCacheStudents = async () => {
      try {
        if (navigator.onLine) {
          const studentsRef = collection(db, 'students');
          const snap = await getDocs(studentsRef);
          const cached: Record<string, Student> = {};
          snap.forEach((doc) => {
            const s = doc.data() as Student;
            cached[s.id] = s;
          });
          localStorage.setItem('sistem_verifikasi_students_cache', JSON.stringify(cached));
          console.log('Successfully cached students database for offline scanning.');
        }
      } catch (err) {
        console.warn('Could not cache students database for offline mode:', err);
      }
    };

    fetchAndCacheStudents();
  }, []);

  // Monitor connectivity state and handle background synchronization
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial background sync check
    if (navigator.onLine) {
      triggerSync();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const triggerSync = async () => {
    const stored = localStorage.getItem('sistem_verifikasi_offline_queue');
    if (!stored) return;

    const queue: Verification[] = JSON.parse(stored);
    if (queue.length === 0) return;

    setSyncStatus('syncing');
    try {
      for (const ver of queue) {
        await setDoc(doc(db, 'verifications', ver.id), ver);
      }
      // Successfully synced everything!
      localStorage.setItem('sistem_verifikasi_offline_queue', JSON.stringify([]));
      setOfflineQueue([]);
      setSyncStatus('success');
      loadTodayScans();
      setTimeout(() => setSyncStatus('idle'), 4000);
    } catch (err) {
      console.error('Error in background sync:', err);
      setSyncStatus('idle');
    }
  };

  // Set default sholat based on current Jakarta time
  useEffect(() => {
    const { autoSholat } = getJakartaTimeAndSholat();
    if (autoSholat) {
      setActiveSholat(autoSholat);
    }
    loadTodayScans();
  }, []);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Fetch recent scans today by this officer
  const loadTodayScans = async () => {
    setIsLoadingHistory(true);
    try {
      const today = getJakartaDate();
      const verificationsRef = collection(db, 'verifications');
      // Simple query: verifications where verifiedBy == currentUser.uid & date == today
      const q = query(
        verificationsRef,
        where('verifiedBy', '==', currentUser.uid),
        where('date', '==', today)
      );
      const querySnap = await getDocs(q);
      const list: Verification[] = [];
      querySnap.forEach((doc) => {
        list.push(doc.data() as Verification);
      });
      // Sort manually by verifiedAt desc
      list.sort((a, b) => new Date(b.verifiedAt).getTime() - new Date(a.verifiedAt).getTime());
      setTodayScans(list);
    } catch (err) {
      console.error('Error loading today scans:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const startScanner = async () => {
    setScannerError(null);
    setScanStatus({ type: 'idle', message: '' });
    setIsScanning(true);
    setIsTorchOn(false);
    setHasTorch(false);

    setTimeout(() => {
      try {
        const html5Qrcode = new Html5Qrcode(qrRegionId);
        html5QrcodeScannerRef.current = html5Qrcode;

        html5Qrcode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            // Enable continuous autofocus settings as default constraints
            videoConstraints: {
              facingMode: "environment",
              focusMode: "continuous"
            } as any
          },
          (decodedText) => {
            // Found a QR Code!
            handleDecodedQR(decodedText);
            stopScanner();
          },
          (errorMessage) => {
            // verbose logger bypassed for smooth experience
          }
        ).then(() => {
          // Check if torch/flashlight is supported on the running camera track
          try {
            if (html5QrcodeScannerRef.current) {
              const capabilities = html5QrcodeScannerRef.current.getRunningTrackCapabilities();
              if (capabilities && capabilities.torch) {
                setHasTorch(true);
              }
            }
          } catch (capabilitiesErr) {
            console.warn("Could not retrieve camera capabilities for torch:", capabilitiesErr);
            // Some browsers don't support getRunningTrackCapabilities but might still support torch constraints
            if (html5QrcodeScannerRef.current && typeof html5QrcodeScannerRef.current.getRunningTrackCapabilities !== 'function') {
              setHasTorch(true);
            }
          }
        }).catch(err => {
          console.error("Camera start failed:", err);
          setScannerError("Gagal mengakses kamera. Pastikan memberikan izin kamera atau gunakan fitur Input Manual di bawah.");
          setIsScanning(false);
        });
      } catch (err) {
        console.error("Scanner setup failed:", err);
        setScannerError("Inisialisasi pemindai gagal. Silakan masukkan ID secara manual.");
        setIsScanning(false);
      }
    }, 100);
  };

  const stopScanner = async () => {
    if (html5QrcodeScannerRef.current && html5QrcodeScannerRef.current.isScanning) {
      try {
        await html5QrcodeScannerRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    html5QrcodeScannerRef.current = null;
    setIsScanning(false);
    setIsTorchOn(false);
    setHasTorch(false);
  };

  const toggleTorch = async () => {
    if (!html5QrcodeScannerRef.current) return;
    const nextState = !isTorchOn;
    try {
      await html5QrcodeScannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }]
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.error("Failed to toggle flashlight:", err);
      alert("Gagal mengaktifkan lampu flash pada perangkat ini.");
    }
  };

  const triggerRefocus = async () => {
    if (!html5QrcodeScannerRef.current) return;
    setIsFocusing(true);
    try {
      // Force continuous autofocus constraint to refocus the camera
      await html5QrcodeScannerRef.current.applyVideoConstraints({
        advanced: [{ focusMode: "continuous" as any }]
      });
      // Short delay for user feedback
      setTimeout(() => setIsFocusing(false), 800);
    } catch (err) {
      console.warn("Failed to apply focus constraints:", err);
      setIsFocusing(false);
    }
  };

  // Main QR Code Verification Logic
  const handleDecodedQR = async (qrText: string) => {
    setScanStatus({ type: 'idle', message: 'Memproses verifikasi...' });
    
    // Parse QR code string
    // Format lifetime: LIFETIME:<studentId>:<qrToken>
    // Format harian: DAILY:<studentId>:<date_YMD>:<token_hash>
    const parts = qrText.split(':');
    if (parts.length < 3) {
      setScanStatus({
        type: 'error',
        message: 'Format QR Code tidak sah. Silakan gunakan kartu QR resmi.'
      });
      return;
    }

    const qrType = parts[0];
    const studentId = parts[1];

    try {
      let student: Student | null = null;

      // 1. Check local cache first for speed and offline reliability
      const cachedData = localStorage.getItem('sistem_verifikasi_students_cache');
      if (cachedData) {
        const cachedStudents = JSON.parse(cachedData) as Record<string, Student>;
        if (cachedStudents[studentId]) {
          student = cachedStudents[studentId];
        }
      }

      // 2. Fetch from network as backup if online and not cached
      if (!student && navigator.onLine) {
        const studentDoc = await getDoc(doc(db, 'students', studentId));
        if (studentDoc.exists()) {
          student = studentDoc.data() as Student;
        }
      }

      if (!student) {
        setScanStatus({
          type: 'error',
          message: `Siswa dengan ID ${studentId} tidak terdaftar di sistem sekolah.`
        });
        return;
      }

      // 3. Security validation based on QR Type
      if (qrType === 'LIFETIME') {
        const qrToken = parts[2];
        if (student.qrToken !== qrToken) {
          setScanStatus({
            type: 'error',
            message: 'Kode QR Lifetime tidak valid / tidak sesuai dengan database.'
          });
          return;
        }
      } else if (qrType === 'DAILY') {
        const qrDate = parts[2];
        const qrToken = parts[3];
        const today = getJakartaDate();

        if (qrDate !== today) {
          setScanStatus({
            type: 'error',
            message: `Kode QR Kedaluwarsa. Kode ini dibuat untuk tanggal ${qrDate}, sedangkan hari ini adalah ${today}.`
          });
          return;
        }

        const expectedToken = generateDailyToken(studentId, today);
        if (expectedToken !== qrToken) {
          setScanStatus({
            type: 'error',
            message: 'Token QR Harian tidak valid. Silakan buat ulang QR harian dari panel siswa.'
          });
          return;
        }
      } else {
        setScanStatus({
          type: 'error',
          message: 'Format prefiks QR tidak valid.'
        });
        return;
      }

      // 4. Religion verification
      if (student.religion !== 'Muslim') {
        setScanStatus({
          type: 'error',
          message: `Siswa ${student.name} beragama ${student.religion}. Siswa beragama Non-Muslim dibebaskan dari verifikasi sholat.`,
          student
        });
        return;
      }

      // 5. Show verify confirmation pop-up modal
      setCandidateStudent(student);

    } catch (err) {
      console.error('Error processing verification:', err);
      setScanStatus({
        type: 'error',
        message: 'Gagal melakukan verifikasi sholat karena kendala jaringan.'
      });
    }
  };

  // Submit actual verification doc to firestore (with offline fallback and automatic syncing)
  const submitVerification = async (student: Student) => {
    const today = getJakartaDate();
    const verificationId = `${student.id}_${today}_${activeSholat}`;

    const newVerification: Verification = {
      id: verificationId,
      studentId: student.id,
      studentName: student.name,
      studentClass: student.class,
      date: today,
      sholatType: activeSholat,
      verifiedAt: new Date().toISOString(),
      verifiedBy: currentUser.uid,
      verifiedByName: currentUser.name
    };

    // If device is offline, queue the verification immediately in localStorage
    if (!navigator.onLine) {
      const stored = localStorage.getItem('sistem_verifikasi_offline_queue');
      const queue: Verification[] = stored ? JSON.parse(stored) : [];
      
      if (!queue.some(q => q.id === verificationId)) {
        queue.push(newVerification);
        localStorage.setItem('sistem_verifikasi_offline_queue', JSON.stringify(queue));
        setOfflineQueue(queue);
      }

      // Insert immediately into officer's local log history so they see instant results
      setTodayScans(prev => {
        if (prev.some(p => p.id === verificationId)) return prev;
        return [newVerification, ...prev];
      });

      setScanStatus({
        type: 'success',
        message: `[OFFLINE MODE] Scan Sholat ${activeSholat.toUpperCase()} Tersimpan Lokal!`,
        student,
        sholat: activeSholat
      });
      return;
    }

    try {
      await setDoc(doc(db, 'verifications', verificationId), newVerification);
      
      setScanStatus({
        type: 'success',
        message: `Sholat ${activeSholat.toUpperCase()} Berhasil Diverifikasi!`,
        student,
        sholat: activeSholat
      });

      // Reload log history
      loadTodayScans();
    } catch (err) {
      console.warn('Firestore write failed, fallback to local queue:', err);
      
      const stored = localStorage.getItem('sistem_verifikasi_offline_queue');
      const queue: Verification[] = stored ? JSON.parse(stored) : [];
      
      if (!queue.some(q => q.id === verificationId)) {
        queue.push(newVerification);
        localStorage.setItem('sistem_verifikasi_offline_queue', JSON.stringify(queue));
        setOfflineQueue(queue);
      }

      setTodayScans(prev => {
        if (prev.some(p => p.id === verificationId)) return prev;
        return [newVerification, ...prev];
      });

      setScanStatus({
        type: 'success',
        message: `[OFFLINE] Koneksi Terganggu. Scan Disimpan Lokal!`,
        student,
        sholat: activeSholat
      });
    }
  };

  // Search students for manual trigger
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId.trim()) return;

    setIsSearching(true);
    try {
      const studentsRef = collection(db, 'students');
      
      // Query by exact ID or name matching
      const qById = query(studentsRef, where('id', '==', searchId.trim()));
      const snapById = await getDocs(qById);

      let results: Student[] = [];
      snapById.forEach((doc) => {
        results.push(doc.data() as Student);
      });

      if (results.length === 0) {
        // Query by name prefix if ID match empty
        const qByName = query(
          studentsRef,
          where('name', '>=', searchId.trim()),
          where('name', '<=', searchId.trim() + '\uf8ff'),
          limit(10)
        );
        const snapByName = await getDocs(qByName);
        snapByName.forEach((doc) => {
          results.push(doc.data() as Student);
        });
      }

      setSearchResults(results);
      if (results.length === 0) {
        setScannerError("Siswa tidak ditemukan. Masukkan NISN atau nama lengkap dengan tepat.");
      } else {
        setScannerError(null);
      }
    } catch (err) {
      console.error('Search error:', err);
      setScannerError("Gagal mengambil data siswa.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleManualVerify = async (student: Student) => {
    if (student.religion !== 'Muslim') {
      setScanStatus({
        type: 'error',
        message: `Siswa ${student.name} beragama ${student.religion}. Siswa beragama Non-Muslim dibebaskan dari verifikasi sholat.`,
        student
      });
      return;
    }
    await submitVerification(student);
    // Clear search states
    setSearchId('');
    setSearchResults([]);
  };

  return (
    <div className="space-y-6">
      {/* Offline Status & Sync Reassuring Banner */}
      {(!isOnline || offlineQueue.length > 0 || syncStatus !== 'idle') && (
        <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-2 duration-300 ${
          !isOnline 
            ? 'bg-amber-50 border-amber-150 text-amber-900' 
            : syncStatus === 'syncing'
            ? 'bg-indigo-50 border-indigo-150 text-indigo-900'
            : 'bg-emerald-50 border-emerald-150 text-emerald-900'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              !isOnline 
                ? 'bg-amber-100 text-amber-700' 
                : syncStatus === 'syncing'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {!isOnline ? (
                <WifiOff className="h-5 w-5 animate-pulse" />
              ) : syncStatus === 'syncing' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Wifi className="h-5 w-5" />
              )}
            </div>
            <div>
              <h4 className="font-bold text-sm">
                {!isOnline 
                  ? 'Aplikasi Berjalan dalam Mode Offline' 
                  : syncStatus === 'syncing'
                  ? 'Sedang Mensinkronisasikan Data...'
                  : 'Koneksi Internet Pulih!'}
              </h4>
              <p className="text-xs opacity-90 mt-0.5">
                {!isOnline 
                  ? `Koneksi tidak stabil. Anda masih bisa melakukan scan QR. ${offlineQueue.length} data tersimpan lokal.` 
                  : syncStatus === 'syncing'
                  ? 'Mengirimkan data scan lokal ke server pusat...'
                  : `Sinkronisasi sukses! Berhasil mengirim seluruh data scan lokal ke database.`}
              </p>
            </div>
          </div>
          {isOnline && offlineQueue.length > 0 && syncStatus === 'idle' && (
            <button
              onClick={triggerSync}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0 flex items-center gap-1.5 cursor-pointer"
            >
              <DatabaseBackup className="h-3.5 w-3.5" />
              Sinkronkan Sekarang
            </button>
          )}
        </div>
      )}

      {/* Target Sholat Selector & Time Indicator */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="h-6 w-6 text-indigo-600" />
            Panel Pemindai Kode QR
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pilih sholat yang ingin diverifikasi kemudian scan QR Code siswa
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Sholat Toggle Buttons */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveSholat('dhuhur')}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeSholat === 'dhuhur'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dhuhur
            </button>
            <button
              onClick={() => setActiveSholat('ashar')}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeSholat === 'ashar'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ashar
            </button>
          </div>

          <div className="flex items-center gap-2 text-slate-600 bg-slate-50 border border-slate-150 px-4 py-2 rounded-xl text-sm font-medium w-full sm:w-auto justify-center">
            <Clock className="h-4 w-4 text-slate-400" />
            <span>Zona: Asia/Jakarta</span>
          </div>
        </div>
      </div>

      {/* Main Camera Scan & Manual input Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: QR Scan Area */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col items-center justify-center min-h-[350px]">
          
          {isScanning ? (
            <div className="w-full flex flex-col items-center">
              {/* QR Scan Container & Controls Overlay */}
              <div className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden border-4 border-indigo-500 shadow-inner bg-slate-950 mb-4">
                <div id={qrRegionId} className="w-full h-full"></div>
                
                {/* Floating Torch & Focus Controls */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-white/10 z-10 shadow-lg">
                  {/* Torch Toggle Button */}
                  {hasTorch ? (
                    <button
                      onClick={toggleTorch}
                      className={`p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                        isTorchOn 
                          ? 'bg-amber-500 text-slate-950 scale-110 shadow-md' 
                          : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                      title={isTorchOn ? "Matikan Senter (Flash)" : "Nyalakan Senter (Flash)"}
                    >
                      <Zap className="h-4 w-4 shrink-0" />
                    </button>
                  ) : (
                    <button
                      disabled
                      className="p-2 rounded-xl bg-white/5 text-white/30 cursor-not-allowed"
                      title="Senter tidak didukung pada kamera/perangkat ini"
                    >
                      <ZapOff className="h-4 w-4 shrink-0" />
                    </button>
                  )}

                  <span className="w-[1px] h-4 bg-white/20"></span>

                  {/* Autofocus Assist Button */}
                  <button
                    onClick={triggerRefocus}
                    disabled={isFocusing}
                    className={`p-2 rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                      isFocusing 
                        ? 'bg-indigo-500 text-white' 
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                    title="Fokuskan Kamera (Auto-Focus Assist)"
                  >
                    <Focus className={`h-4 w-4 shrink-0 ${isFocusing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              <button
                onClick={stopScanner}
                className="px-6 py-2 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
              >
                Hentikan Kamera
              </button>
            </div>
          ) : (
            <div className="text-center max-w-md p-4 flex flex-col items-center">
              <div className="h-20 w-20 rounded-2xl bg-indigo-50 flex items-center justify-center mb-6 text-indigo-600">
                <Camera className="h-10 w-10 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                Pemindai Kamera Aktif
              </h3>
              <p className="text-sm text-slate-500 mt-2 mb-6">
                Klik tombol di bawah untuk mengizinkan dan membuka kamera perangkat untuk memindai kartu QR siswa.
              </p>
              <button
                id="btn-start-camera"
                onClick={startScanner}
                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-100 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Camera className="h-4 w-4" />
                Mulai Pemindaian QR
              </button>
              {scannerError && (
                <div className="mt-4 flex items-start gap-2 bg-amber-50 text-amber-800 p-3 rounded-xl border border-amber-100 text-xs text-left">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{scannerError}</span>
                </div>
              )}
            </div>
          )}

          {/* Real-time Scan Status Display */}
          {scanStatus.type !== 'idle' && (
            <div className={`mt-6 w-full p-5 rounded-2xl border flex items-start gap-4 transition-all animate-in fade-in slide-in-from-bottom-2 ${
              scanStatus.type === 'success' 
                ? 'bg-emerald-50 border-emerald-100 text-emerald-900' 
                : 'bg-rose-50 border-rose-100 text-rose-900'
            }`}>
              {scanStatus.type === 'success' ? (
                <CheckCircle className="h-8 w-8 text-emerald-600 shrink-0 mt-1" />
              ) : (
                <AlertCircle className="h-8 w-8 text-rose-600 shrink-0 mt-1" />
              )}
              
              <div className="flex-1 space-y-1">
                <h4 className="font-bold text-base">
                  {scanStatus.message}
                </h4>
                {scanStatus.student && (
                  <div className="text-sm space-y-0.5 opacity-90 mt-2 font-medium">
                    <p>Nama: <span className="font-bold">{scanStatus.student.name}</span></p>
                    <p>Kelas: <span className="font-bold">{scanStatus.student.class}</span></p>
                    <p>Metode QR: <span className="capitalize">{scanStatus.student.qrType}</span></p>
                    <p>Agama: <span>{scanStatus.student.religion}</span></p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Manual Verification Helper & Quick Search */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Manual Input Container */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Search className="h-5 w-5 text-indigo-500" />
              Verifikasi Manual / Pencarian Siswa
            </h3>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Cari nama atau NISN siswa..."
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
              >
                {isSearching ? <Loader2 className="animate-spin h-4 w-4" /> : 'Cari'}
              </button>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-4 border border-slate-150 rounded-xl divide-y divide-slate-100 overflow-hidden bg-slate-50">
                {searchResults.map((student) => (
                  <div key={student.id} className="p-3 flex items-center justify-between text-sm">
                    <div>
                      <p className="font-bold text-slate-800">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.id} • {student.class}</p>
                    </div>
                    <button
                      onClick={() => handleManualVerify(student)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Verifikasi
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Demo Assist Panel */}
          <div className="bg-slate-50 rounded-2xl border border-slate-150 p-6">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Akses Cepat Pengujian Scanner (Simulasi Kartu QR)
            </h3>
            <p className="text-xs text-slate-600 mb-4">
              Silakan klik tombol di bawah untuk menyimulasikan pemindaian QR dari siswa terdaftar:
            </p>

            <div className="space-y-2">
              {/* Daily QR student */}
              <button
                onClick={() => {
                  const today = getJakartaDate();
                  const token = generateDailyToken('2026001', today);
                  handleDecodedQR(`DAILY:2026001:${today}:${token}`);
                }}
                className="w-full text-left px-3 py-2 bg-white hover:bg-indigo-50 hover:text-indigo-900 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-medium text-slate-700 transition-all flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <Smartphone className="h-3.5 w-3.5 text-indigo-500" />
                  Yusuf Al-Fatih (QR Harian - Sesuai Hari Ini)
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-sm">Scan</span>
              </button>

              {/* Lifetime QR student */}
              <button
                onClick={() => handleDecodedQR('LIFETIME:2026002:LT-2026002-FATIMAH')}
                className="w-full text-left px-3 py-2 bg-white hover:bg-indigo-50 hover:text-indigo-900 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs font-medium text-slate-700 transition-all flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  <Award className="h-3.5 w-3.5 text-emerald-500" />
                  Fatimah Az-Zahra (QR Lifetime Kartu Cetak)
                </span>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-sm">Scan</span>
              </button>

              {/* Expired Daily QR Student */}
              <button
                onClick={() => handleDecodedQR('DAILY:2026001:2026-01-01:DAILY-OLD')}
                className="w-full text-left px-3 py-2 bg-white hover:bg-rose-50 hover:text-rose-900 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-medium text-slate-700 transition-all flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-slate-500">
                  <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                  Simulasi QR Kedaluwarsa (Kemarin/Lalu)
                </span>
                <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded-sm">Error</span>
              </button>

              {/* Non-Muslim student (Exempted) */}
              <button
                onClick={() => handleDecodedQR('LIFETIME:2026005:LT-2026005-MICHAEL')}
                className="w-full text-left px-3 py-2 bg-white hover:bg-amber-50 hover:text-amber-950 border border-slate-200 hover:border-amber-200 rounded-xl text-xs font-medium text-slate-700 transition-all flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-amber-500" />
                  Michael Wijaya (Agama Kristen - Non-Muslim)
                </span>
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-sm">Bebas</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Verification Scan History Today */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-500" />
            Riwayat Verifikasi Saya Hari Ini ({todayScans.length})
          </h3>
          <button
            onClick={loadTodayScans}
            className="p-2 hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            title="Muat ulang riwayat"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="animate-spin h-6 w-6 text-indigo-500" />
          </div>
        ) : todayScans.length === 0 ? (
          <p className="text-center py-8 text-sm text-slate-400">
            Belum ada pemindaian yang dicatat oleh Anda hari ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <th className="p-3">Nama Siswa</th>
                  <th className="p-3">Kelas</th>
                  <th className="p-3">Sholat</th>
                  <th className="p-3">Waktu Verifikasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {todayScans.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold">{v.studentName}</td>
                    <td className="p-3">{v.studentClass}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                        v.sholatType === 'dhuhur' ? 'bg-indigo-50 text-indigo-700' : 'bg-violet-50 text-violet-700'
                      }`}>
                        {v.sholatType}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {formatToJakartaDateTime(v.verifiedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pop-up Data Siswa untuk Verifikasi oleh Petugas */}
      {candidateStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-250">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-indigo-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Konfirmasi Kehadiran</h3>
                  <p className="text-xs text-indigo-700 font-semibold">Pemindaian QR Berhasil</p>
                </div>
              </div>
              <button
                onClick={() => setCandidateStudent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 text-center">
              {/* Photo Area / Foto Siswa */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className={`h-28 w-28 rounded-full border-4 border-white shadow-md flex items-center justify-center overflow-hidden ${
                    candidateStudent.gender === 'Perempuan' ? 'bg-pink-100 text-pink-600' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    <User className="h-16 w-16" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 bg-emerald-550 border-2 border-white rounded-full flex items-center justify-center text-white" title="Status Aktif">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                </div>
              </div>

              {/* Student Details / Data Siswa */}
              <div className="space-y-2">
                <h4 className="text-lg font-bold text-slate-800 leading-tight">
                  {candidateStudent.name}
                </h4>
                <div className="flex flex-col gap-1 items-center justify-center">
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 font-bold text-xs">
                    Kelas {candidateStudent.class}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold text-xs mt-1">
                    NIS: {candidateStudent.id}
                  </span>
                </div>
              </div>

              {/* Target Sholat Status indicator */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs text-slate-600 flex justify-between items-center">
                <span className="font-semibold text-slate-500">Target Verifikasi:</span>
                <span className="font-bold text-indigo-700 uppercase bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  SHOLAT {activeSholat}
                </span>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button
                onClick={() => setCandidateStudent(null)}
                className="flex-1 py-3 border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  await submitVerification(candidateStudent);
                  setCandidateStudent(null);
                }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors"
              >
                Hadir
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
