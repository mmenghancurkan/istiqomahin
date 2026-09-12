import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs, query, where } from 'firebase/firestore';
import { 
  Users, CheckCircle2, AlertCircle, Search, Filter, 
  RotateCw, Check, X, ShieldAlert, BookOpen, Clock, LogOut, Bell, Sparkles
} from 'lucide-react';
import { Student, Verification, SholatType, UserProfile } from '../types';
import { getJakartaDate, formatToJakartaDateTime } from '../lib/utils';

interface MonitoringTabProps {
  currentUser: UserProfile;
}

export default function MonitoringTab({ currentUser }: MonitoringTabProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [verifications, setVerifications] = useState<Record<string, Verification>>({}); // Key: `${studentId}_${sholatType}`
  const [isLoading, setIsLoading] = useState(true);
  
  // Real-time toast notification state
  const [latestScanNotification, setLatestScanNotification] = useState<{
    studentName: string;
    studentClass: string;
    sholatType: string;
    time: string;
  } | null>(null);

  const isInitialLoad = useRef(true);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('Semua');
  const [selectedStatus, setSelectedStatus] = useState('Semua'); // Semua, Layak Pulang, Tertahan
  
  // Menstrual cycle predictor and validation states
  const [selectedStudentForCycle, setSelectedStudentForCycle] = useState<Student | null>(null);
  const [studentCycleLogs, setStudentCycleLogs] = useState<Verification[]>([]);
  const [isFetchingLogs, setIsFetchingLogs] = useState(false);

  const today = getJakartaDate();

  // Auto-dismiss the notification after 5 seconds
  useEffect(() => {
    if (latestScanNotification) {
      const timer = setTimeout(() => {
        setLatestScanNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [latestScanNotification]);

  // Listen to students and today's verifications in real-time
  useEffect(() => {
    setIsLoading(true);

    // 1. Listen to students
    const unsubscribeStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const studentList: Student[] = [];
      snapshot.forEach((doc) => {
        studentList.push(doc.data() as Student);
      });
      // Sort alphabetically by name
      studentList.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(studentList);
    }, (error) => {
      console.error("Error listening to students:", error);
    });

    // 2. Listen to today's verifications
    const verificationsQuery = query(
      collection(db, 'verifications'),
      where('date', '==', today)
    );
    const unsubscribeVerifications = onSnapshot(verificationsQuery, (snapshot) => {
      const verMap: Record<string, Verification> = {};
      snapshot.forEach((doc) => {
        const v = doc.data() as Verification;
        verMap[`${v.studentId}_${v.sholatType}`] = v;
      });

      // Show real-time notification for newly added scans
      if (!isInitialLoad.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const v = change.doc.data() as Verification;
            const verifiedTime = v.verifiedAt 
              ? new Date(v.verifiedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) 
              : 'Baru saja';
            
            setLatestScanNotification({
              studentName: v.studentName,
              studentClass: v.studentClass,
              sholatType: v.sholatType === 'dhuhur' ? 'Dhuhur' : 'Ashar',
              time: verifiedTime
            });
          }
        });
      } else {
        isInitialLoad.current = false;
      }

      setVerifications(verMap);
      setIsLoading(false);
    }, (error) => {
      console.error("Error listening to verifications:", error);
      setIsLoading(false);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeVerifications();
    };
  }, [today]);

  // Extract unique classes list for dropdown filter
  const classesList = ['Semua', ...Array.from(new Set(students.map((s) => s.class)))].sort();

  // Filter Muslim students
  const muslimStudents = students.filter((s) => s.religion === 'Muslim');

  // Compute live statistics for summary cards
  const totalMuslim = muslimStudents.length;
  let totalDhuhur = 0;
  let totalAshar = 0;
  let totalLayakPulang = 0;

  muslimStudents.forEach((student) => {
    const isDhuhurVerified = !!verifications[`${student.id}_dhuhur`];
    const isAsharVerified = !!verifications[`${student.id}_ashar`];

    if (isDhuhurVerified) totalDhuhur++;
    if (isAsharVerified) totalAshar++;
    if (isDhuhurVerified && isAsharVerified) totalLayakPulang++;
  });

  const totalTertahan = totalMuslim - totalLayakPulang;

  // Filtered lists for table
  const filteredStudents = muslimStudents.filter((student) => {
    // Search match
    const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          student.id.includes(searchQuery);

    // Class match
    const matchesClass = selectedClass === 'Semua' || student.class === selectedClass;

    // Status match
    const isDhuhurVerified = !!verifications[`${student.id}_dhuhur`];
    const isAsharVerified = !!verifications[`${student.id}_ashar`];
    const isLayakPulang = isDhuhurVerified && isAsharVerified;

    let matchesStatus = true;
    if (selectedStatus === 'Layak Pulang') {
      matchesStatus = isLayakPulang;
    } else if (selectedStatus === 'Tertahan') {
      matchesStatus = !isLayakPulang;
    }

    return matchesSearch && matchesClass && matchesStatus;
  });

  // Admin Override: Toggle verification status manually
  const toggleVerificationAdmin = async (student: Student, sholatType: SholatType) => {
    if (currentUser.role !== 'admin') return;

    const verificationId = `${student.id}_${today}_${sholatType}`;
    const isVerified = !!verifications[`${student.id}_${sholatType}`];

    try {
      if (isVerified) {
        // Delete verification doc
        await deleteDoc(doc(db, 'verifications', verificationId));
      } else {
        // Add verification doc
        const newVerification: Verification = {
          id: verificationId,
          studentId: student.id,
          studentName: student.name,
          studentClass: student.class,
          date: today,
          sholatType,
          verifiedAt: new Date().toISOString(),
          verifiedBy: currentUser.uid,
          verifiedByName: `${currentUser.name} (Override)`
        };
        await setDoc(doc(db, 'verifications', verificationId), newVerification);
      }
    } catch (err) {
      console.error('Failed to override verification:', err);
    }
  };

  // Toggle Absensi (Sakit/Izin) status for any student
  const toggleAbsensiStatus = async (student: Student, type: 'sakit' | 'izin') => {
    if (currentUser.role !== 'admin' && currentUser.role !== 'guru') return;

    const dhuhurId = `${student.id}_${today}_dhuhur`;
    const asharId = `${student.id}_${today}_ashar`;

    const isCurrentlySame = verifications[`${student.id}_dhuhur`]?.status === type;

    try {
      if (isCurrentlySame) {
        // Clear status
        if (verifications[`${student.id}_dhuhur`]?.status === type) {
          await deleteDoc(doc(db, 'verifications', dhuhurId));
        }
        if (verifications[`${student.id}_ashar`]?.status === type) {
          await deleteDoc(doc(db, 'verifications', asharId));
        }
      } else {
        // Clear any old status first
        await deleteDoc(doc(db, 'verifications', dhuhurId)).catch(() => {});
        await deleteDoc(doc(db, 'verifications', asharId)).catch(() => {});

        const timeNow = new Date().toISOString();
        const dhuhurVer: Verification = {
          id: dhuhurId,
          studentId: student.id,
          studentName: student.name,
          studentClass: student.class,
          date: today,
          sholatType: 'dhuhur',
          verifiedAt: timeNow,
          verifiedBy: currentUser.uid,
          verifiedByName: `Sistem (${type === 'sakit' ? 'Sakit' : 'Izin'})`,
          status: type
        };
        const asharVer: Verification = {
          id: asharId,
          studentId: student.id,
          studentName: student.name,
          studentClass: student.class,
          date: today,
          sholatType: 'ashar',
          verifiedAt: timeNow,
          verifiedBy: currentUser.uid,
          verifiedByName: `Sistem (${type === 'sakit' ? 'Sakit' : 'Izin'})`,
          status: type
        };
        await setDoc(doc(db, 'verifications', dhuhurId), dhuhurVer);
        await setDoc(doc(db, 'verifications', asharId), asharVer);
      }
    } catch (err) {
      console.error(`Failed to toggle ${type} status:`, err);
    }
  };

  // Toggle Haid (excused) status for female student
  const toggleHaidStatus = async (student: Student) => {
    if (currentUser.role !== 'admin' && currentUser.role !== 'guru') return;

    const dhuhurId = `${student.id}_${today}_dhuhur`;
    const asharId = `${student.id}_${today}_ashar`;

    const isHaidNow = verifications[`${student.id}_dhuhur`]?.status === 'haid' || verifications[`${student.id}_ashar`]?.status === 'haid';

    try {
      if (isHaidNow) {
        if (verifications[`${student.id}_dhuhur`]?.status === 'haid') {
          await deleteDoc(doc(db, 'verifications', dhuhurId));
        }
        if (verifications[`${student.id}_ashar`]?.status === 'haid') {
          await deleteDoc(doc(db, 'verifications', asharId));
        }
      } else {
        const timeNow = new Date().toISOString();
        const dhuhurHaidVer: Verification = {
          id: dhuhurId,
          studentId: student.id,
          studentName: student.name,
          studentClass: student.class,
          date: today,
          sholatType: 'dhuhur',
          verifiedAt: timeNow,
          verifiedBy: currentUser.uid,
          verifiedByName: 'Sistem (Halangan)',
          status: 'haid'
        };
        const asharHaidVer: Verification = {
          id: asharId,
          studentId: student.id,
          studentName: student.name,
          studentClass: student.class,
          date: today,
          sholatType: 'ashar',
          verifiedAt: timeNow,
          verifiedBy: currentUser.uid,
          verifiedByName: 'Sistem (Halangan)',
          status: 'haid'
        };
        await setDoc(doc(db, 'verifications', dhuhurId), dhuhurHaidVer);
        await setDoc(doc(db, 'verifications', asharId), asharHaidVer);
      }
    } catch (err) {
      console.error('Failed to toggle Haid status:', err);
    }
  };

  // Open Menstrual Cycle Analysis Modal
  const openCycleAnalysis = async (student: Student) => {
    setSelectedStudentForCycle(student);
    setIsFetchingLogs(true);
    try {
      const q = query(
        collection(db, 'verifications'),
        where('studentId', '==', student.id),
        where('status', '==', 'haid')
      );
      const snapshot = await getDocs(q);
      const logs: Verification[] = [];
      snapshot.forEach((doc) => {
        logs.push(doc.data() as Verification);
      });
      
      logs.sort((a, b) => b.date.localeCompare(a.date));
      setStudentCycleLogs(logs);
    } catch (err) {
      console.error("Failed to fetch menstruation logs:", err);
    } finally {
      setIsFetchingLogs(false);
    }
  };

  // Calculate statistics from menstruation logs
  const getCycleAnalysisResult = () => {
    if (studentCycleLogs.length === 0) return null;

    const uniqueDates = Array.from(new Set(studentCycleLogs.map(l => l.date))).sort() as string[];
    if (uniqueDates.length === 0) return null;

    const periods: { start: string; end: string; duration: number }[] = [];
    let currentPeriod: string[] = [];

    for (let i = 0; i < uniqueDates.length; i++) {
      const dateStr = uniqueDates[i];
      if (currentPeriod.length === 0) {
        currentPeriod.push(dateStr);
      } else {
        const lastDate = new Date(currentPeriod[currentPeriod.length - 1]);
        const currDate = new Date(dateStr);
        const diffTime = Math.abs(currDate.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 2) {
          currentPeriod.push(dateStr);
        } else {
          periods.push({
            start: currentPeriod[0],
            end: currentPeriod[currentPeriod.length - 1],
            duration: currentPeriod.length
          });
          currentPeriod = [dateStr];
        }
      }
    }
    
    if (currentPeriod.length > 0) {
      periods.push({
        start: currentPeriod[0],
        end: currentPeriod[currentPeriod.length - 1],
        duration: currentPeriod.length
      });
    }

    periods.reverse();

    const latestPeriod = periods[0];
    let isDurationWarning = false;
    let isGapWarning = false;
    let gapDays = 0;

    if (latestPeriod) {
      if (latestPeriod.duration > 15) {
        isDurationWarning = true;
      }

      if (periods.length > 1) {
        const prevPeriod = periods[1];
        const lastEnd = new Date(prevPeriod.end);
        const currStart = new Date(latestPeriod.start);
        const diffTime = Math.abs(currStart.getTime() - lastEnd.getTime());
        gapDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (gapDays < 15) {
          isGapWarning = true;
        }
      }
    }

    return {
      periods,
      latestPeriod,
      isDurationWarning,
      isGapWarning,
      gapDays
    };
  };

  return (
    <div className="space-y-6 relative">
      {/* Real-time Toast Notification */}
      {latestScanNotification && (
        <div id="realtime-toast" className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 flex items-start gap-3.5 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
            <Bell className="h-5 w-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-extrabold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Scan Baru Masuk
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{latestScanNotification.time}</span>
            </div>
            <h4 className="text-sm font-extrabold text-slate-100 mt-2 truncate">
              {latestScanNotification.studentName}
            </h4>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Kelas {latestScanNotification.studentClass} • Berhasil memverifikasi Sholat <strong className="font-bold text-emerald-300">{latestScanNotification.sholatType}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLatestScanNotification(null)}
            className="text-slate-400 hover:text-white transition-colors cursor-pointer rounded-lg p-1 hover:bg-slate-800 focus:outline-hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Title Panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-600" />
            Monitoring Kepulangan Hari Ini
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Status kepulangan siswa beragama Muslim untuk tanggal <span className="font-semibold text-slate-800">{today}</span> (Asia/Jakarta)
          </p>
        </div>
        <div className="flex items-center gap-2 text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl text-sm font-semibold">
          <Clock className="h-4 w-4 animate-pulse" />
          <span>Real-time Aktif</span>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Muslim Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Muslim</p>
            <h4 className="text-2xl font-bold text-slate-800 mt-0.5">{totalMuslim}</h4>
          </div>
        </div>

        {/* Verified Dhuhur Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Dhuhur Selesai</p>
            <h4 className="text-2xl font-bold text-slate-800 mt-0.5">{totalDhuhur}</h4>
          </div>
        </div>

        {/* Verified Ashar Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ashar Selesai</p>
            <h4 className="text-2xl font-bold text-slate-800 mt-0.5">{totalAshar}</h4>
          </div>
        </div>

        {/* Layak Pulang Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <LogOut className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Layak Pulang</p>
            <h4 className="text-2xl font-bold text-emerald-700 mt-0.5">{totalLayakPulang}</h4>
          </div>
        </div>

        {/* Tertahan Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Masih Tertahan</p>
            <h4 className="text-2xl font-bold text-rose-700 mt-0.5">{totalTertahan}</h4>
          </div>
        </div>
      </div>

      {/* Filter and Table Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Filters bar */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4 items-center">
          
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari siswa berdasarkan nama atau NISN..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm text-slate-900 transition-colors"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {/* Class filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="text-sm bg-transparent outline-hidden text-slate-700 font-semibold pr-4 cursor-pointer"
              >
                {classesList.map((cls) => (
                  <option key={cls} value={cls}>{cls === 'Semua' ? 'Semua Kelas' : `Kelas ${cls}`}</option>
                ))}
              </select>
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-sm bg-transparent outline-hidden text-slate-700 font-semibold pr-4 cursor-pointer"
              >
                <option value="Semua">Semua Status</option>
                <option value="Layak Pulang">Layak Pulang</option>
                <option value="Tertahan">Masih Tertahan</option>
              </select>
            </div>
          </div>

        </div>

        {/* Table list */}
        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <RotateCw className="animate-spin h-8 w-8 text-indigo-500" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-16">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h4 className="font-bold text-slate-700">Tidak ada siswa cocok</h4>
            <p className="text-sm text-slate-400 mt-1">Gunakan filter atau pencarian lain.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="p-4 pl-6">ID / NISN</th>
                  <th className="p-4">Nama Lengkap</th>
                  <th className="p-4">Kelas</th>
                  <th className="p-4 text-center">Sholat Dhuhur</th>
                  <th className="p-4 text-center">Sholat Ashar</th>
                  <th className="p-4 text-center">Status Kepulangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredStudents.map((student) => {
                  const dhuhurVer = verifications[`${student.id}_dhuhur`];
                  const asharVer = verifications[`${student.id}_ashar`];
                  const isLayakPulang = !!dhuhurVer && !!asharVer;
                  const isAdmin = currentUser.role === 'admin';

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 pl-6 font-mono text-xs text-slate-500">{student.id}</td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800">{student.name}</span>
                            {student.gender === 'Perempuan' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-pink-50 text-pink-600 font-extrabold" title="Perempuan">
                                P
                              </span>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            <span className="text-[10px] text-slate-400 font-semibold uppercase">Tipe: {student.qrType}</span>
                            
                            {/* Toggle Sakit */}
                            {(currentUser.role === 'admin' || currentUser.role === 'guru') && (
                              <button
                                onClick={() => toggleAbsensiStatus(student, 'sakit')}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                                  dhuhurVer?.status === 'sakit'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'text-slate-400 hover:text-amber-700 hover:bg-amber-50 border border-slate-200'
                                }`}
                                title="Tandai siswa Sakit hari ini"
                              >
                                {dhuhurVer?.status === 'sakit' ? '✓ Sakit' : '+ Sakit'}
                              </button>
                            )}

                            {/* Toggle Izin */}
                            {(currentUser.role === 'admin' || currentUser.role === 'guru') && (
                              <button
                                onClick={() => toggleAbsensiStatus(student, 'izin')}
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                                  dhuhurVer?.status === 'izin'
                                    ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                    : 'text-slate-400 hover:text-blue-700 hover:bg-blue-50 border border-slate-200'
                                }`}
                                title="Tandai siswa Izin hari ini"
                              >
                                {dhuhurVer?.status === 'izin' ? '✓ Izin' : '+ Izin'}
                              </button>
                            )}

                            {/* Toggle Haid & Analisis */}
                            {student.gender === 'Perempuan' && (currentUser.role === 'admin' || currentUser.role === 'guru') && (
                              <>
                                {dhuhurVer?.status === 'haid' || asharVer?.status === 'haid' ? (
                                  <button
                                    onClick={() => toggleHaidStatus(student)}
                                    className="text-[10px] font-extrabold text-pink-700 bg-pink-100 hover:bg-pink-200 px-1.5 py-0.5 rounded-md transition-colors cursor-pointer flex items-center gap-1"
                                    title="Klik untuk membatalkan status halangan"
                                  >
                                    <Sparkles className="h-2.5 w-2.5 animate-pulse text-pink-600" />
                                    Halangan (Haid)
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => toggleHaidStatus(student)}
                                    className="text-[10px] font-bold text-slate-400 hover:text-pink-600 hover:bg-pink-50 border border-slate-200 hover:border-pink-200 px-1.5 py-0.5 rounded-md transition-all cursor-pointer"
                                    title="Tandai berhalangan (haid) hari ini"
                                  >
                                    + Haid
                                  </button>
                                )}

                                <button
                                  onClick={() => openCycleAnalysis(student)}
                                  className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md transition-all cursor-pointer flex items-center gap-0.5"
                                  title="Analisis Siklus & Riwayat Menstruasi Siswi"
                                >
                                  🔍 Siklus
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-600">{student.class}</td>
                      
                      {/* Dhuhur Status */}
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          {dhuhurVer ? (
                            dhuhurVer.status === 'haid' ? (
                              <button
                                disabled={currentUser.role !== 'admin' && currentUser.role !== 'guru'}
                                onClick={() => toggleHaidStatus(student)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-50 text-pink-800 border border-pink-100 hover:bg-pink-100 hover:text-pink-900 hover:border-pink-200 cursor-pointer animate-in fade-in zoom-in duration-200"
                                title="Siswa berhalangan (haid) sholat. Klik untuk membatalkan."
                              >
                                <Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-600 animate-pulse" />
                                <span>Halangan</span>
                              </button>
                            ) : dhuhurVer.status === 'sakit' ? (
                              <button
                                disabled={currentUser.role !== 'admin' && currentUser.role !== 'guru'}
                                onClick={() => toggleAbsensiStatus(student, 'sakit')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-100 hover:bg-amber-100 hover:text-amber-900 hover:border-amber-200 cursor-pointer animate-in fade-in zoom-in duration-200"
                                title="Siswa sakit. Klik untuk membatalkan."
                              >
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span>Sakit</span>
                              </button>
                            ) : dhuhurVer.status === 'izin' ? (
                              <button
                                disabled={currentUser.role !== 'admin' && currentUser.role !== 'guru'}
                                onClick={() => toggleAbsensiStatus(student, 'izin')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-800 border border-blue-100 hover:bg-blue-100 hover:text-blue-900 hover:border-blue-200 cursor-pointer animate-in fade-in zoom-in duration-200"
                                title="Siswa izin. Klik untuk membatalkan."
                              >
                                <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                <span>Izin</span>
                              </button>
                            ) : (
                              <button
                                disabled={!isAdmin}
                                onClick={() => toggleVerificationAdmin(student, 'dhuhur')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-100 ${
                                  isAdmin ? 'hover:bg-rose-50 hover:text-rose-800 hover:border-rose-100 cursor-pointer' : ''
                                }`}
                                title={isAdmin ? "Batalkan Verifikasi (Hapus)" : `Diverifikasi oleh ${dhuhurVer.verifiedByName}`}
                              >
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                <span>Selesai</span>
                              </button>
                            )
                          ) : (
                            <button
                              disabled={!isAdmin}
                              onClick={() => toggleVerificationAdmin(student, 'dhuhur')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-100 ${
                                isAdmin ? 'hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-100 cursor-pointer' : ''
                              }`}
                              title={isAdmin ? "Verifikasi Manual (Admin)" : "Belum Sholat"}
                            >
                              <X className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                              <span>Belum</span>
                            </button>
                          )}
                          {dhuhurVer && !dhuhurVer.status && (
                            <span className="text-[10px] text-slate-400 mt-1 font-mono">
                              {dhuhurVer.verifiedAt.split('T')[1].substring(0, 5)} WIB
                            </span>
                          )}
                        </div>
                      </td>
 
                      {/* Ashar Status */}
                      <td className="p-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          {asharVer ? (
                            asharVer.status === 'haid' ? (
                              <button
                                disabled={currentUser.role !== 'admin' && currentUser.role !== 'guru'}
                                onClick={() => toggleHaidStatus(student)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-pink-50 text-pink-800 border border-pink-100 hover:bg-pink-100 hover:text-pink-900 hover:border-pink-200 cursor-pointer animate-in fade-in zoom-in duration-200"
                                title="Siswa berhalangan (haid) sholat. Klik untuk membatalkan."
                              >
                                <Sparkles className="h-3.5 w-3.5 shrink-0 text-pink-600 animate-pulse" />
                                <span>Halangan</span>
                              </button>
                            ) : asharVer.status === 'sakit' ? (
                              <button
                                disabled={currentUser.role !== 'admin' && currentUser.role !== 'guru'}
                                onClick={() => toggleAbsensiStatus(student, 'sakit')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-100 hover:bg-amber-100 hover:text-amber-900 hover:border-amber-200 cursor-pointer animate-in fade-in zoom-in duration-200"
                                title="Siswa sakit. Klik untuk membatalkan."
                              >
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span>Sakit</span>
                              </button>
                            ) : asharVer.status === 'izin' ? (
                              <button
                                disabled={currentUser.role !== 'admin' && currentUser.role !== 'guru'}
                                onClick={() => toggleAbsensiStatus(student, 'izin')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-800 border border-blue-100 hover:bg-blue-100 hover:text-blue-900 hover:border-blue-200 cursor-pointer animate-in fade-in zoom-in duration-200"
                                title="Siswa izin. Klik untuk membatalkan."
                              >
                                <BookOpen className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                <span>Izin</span>
                              </button>
                            ) : (
                              <button
                                disabled={!isAdmin}
                                onClick={() => toggleVerificationAdmin(student, 'ashar')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-100 ${
                                  isAdmin ? 'hover:bg-rose-50 hover:text-rose-800 hover:border-rose-100 cursor-pointer' : ''
                                }`}
                                title={isAdmin ? "Batalkan Verifikasi (Hapus)" : `Diverifikasi oleh ${asharVer.verifiedByName}`}
                              >
                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                <span>Selesai</span>
                              </button>
                            )
                          ) : (
                            <button
                              disabled={!isAdmin}
                              onClick={() => toggleVerificationAdmin(student, 'ashar')}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-100 ${
                                isAdmin ? 'hover:bg-indigo-50 hover:text-indigo-800 hover:border-indigo-100 cursor-pointer' : ''
                              }`}
                              title={isAdmin ? "Verifikasi Manual (Admin)" : "Belum Sholat"}
                            >
                              <X className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                              <span>Belum</span>
                            </button>
                          )}
                          {asharVer && !asharVer.status && (
                            <span className="text-[10px] text-slate-400 mt-1 font-mono">
                              {asharVer.verifiedAt.split('T')[1].substring(0, 5)} WIB
                            </span>
                          )}
                        </div>
                      </td>
 
                      {/* Homecoming Status */}
                      <td className="p-4 text-center">
                        <div className="flex justify-center">
                          {isLayakPulang ? (
                            dhuhurVer?.status === 'sakit' || asharVer?.status === 'sakit' ? (
                              <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-bold shadow-xs">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>SAKIT (DIIZINKAN)</span>
                              </div>
                            ) : dhuhurVer?.status === 'izin' || asharVer?.status === 'izin' ? (
                              <div className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold shadow-xs">
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>IZIN (DIIZINKAN)</span>
                              </div>
                            ) : dhuhurVer?.status === 'haid' || asharVer?.status === 'haid' ? (
                              <div className="flex items-center gap-1.5 px-4 py-2 bg-pink-500 text-white rounded-xl text-xs font-bold shadow-xs">
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>HAID (DIIZINKAN)</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 px-4 py-2 bg-emerald-550 text-white rounded-xl text-xs font-bold shadow-xs">
                                <LogOut className="h-3.5 w-3.5" />
                                <span>LAYAK PULANG</span>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-500 rounded-xl text-xs font-bold border border-slate-200">
                              <Clock className="h-3.5 w-3.5" />
                              <span>TERTAHAN</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Small Admin Disclaimer at bottom */}
        {currentUser.role === 'admin' && (
          <div className="bg-amber-50 p-4 border-t border-slate-100 text-xs text-amber-900 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
            <span>Sebagai <strong>Admin</strong>, Anda diperbolehkan mengklik tombol status <strong>Belum / Selesai</strong> di atas untuk melakukan bypass atau koreksi manual jika terjadi kesalahan scan.</span>
          </div>
        )}

      </div>

      {/* Menstrual Cycle Analysis Modal */}
      {selectedStudentForCycle && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-250">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-pink-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600">
                  <Sparkles className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Analisis Siklus & Riwayat Haid</h3>
                  <p className="text-xs text-pink-700 font-semibold">{selectedStudentForCycle.name} (Kelas {selectedStudentForCycle.class})</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForCycle(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {isFetchingLogs ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <RotateCw className="animate-spin h-8 w-8 text-pink-500 mb-2" />
                  <p className="text-xs text-slate-400 font-semibold">Mengambil riwayat pencatatan...</p>
                </div>
              ) : studentCycleLogs.length === 0 ? (
                <div className="text-center py-10">
                  <div className="h-14 w-14 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mx-auto mb-3 border border-slate-100">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-slate-700 text-sm">Tidak ada riwayat halangan</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Siswa perempuan ini belum pernah dicatat berhalangan sholat (haid) di sistem.</p>
                </div>
              ) : (() => {
                const analysis = getCycleAnalysisResult();
                if (!analysis) return null;

                return (
                  <div className="space-y-5">
                    {/* Highlight Card for Current Cycle */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Siklus Terakhir / Berjalan</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-3 rounded-lg border border-slate-150">
                          <p className="text-[11px] text-slate-400 font-bold">TANGGAL MULAI</p>
                          <p className="font-extrabold text-slate-700 mt-1 text-sm">{analysis.latestPeriod ? new Date(analysis.latestPeriod.start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-150">
                          <p className="text-[11px] text-slate-400 font-bold">TANGGAL SELESAI</p>
                          <p className="font-extrabold text-slate-700 mt-1 text-sm">{analysis.latestPeriod ? new Date(analysis.latestPeriod.end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg border border-slate-150">
                          <p className="text-[11px] text-slate-400 font-bold">DURASI BERJALAN</p>
                          <p className={`font-extrabold mt-1 text-base ${analysis.isDurationWarning ? 'text-rose-600' : 'text-pink-600'}`}>
                            {analysis.latestPeriod ? `${analysis.latestPeriod.duration} Hari` : '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Fikih Syariat Assessment & Warning Boxes */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Hasil Validasi Fikih Sholat (Syariat)</h4>
                      
                      {/* 1. Duration check */}
                      {analysis.isDurationWarning ? (
                        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200/60 text-xs text-rose-900 flex gap-3 items-start">
                          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-extrabold">⚠️ Peringatan: Melebihi Batas Maksimal Haid!</p>
                            <p className="mt-1 leading-relaxed text-rose-800">
                              Siswi tercatat berhalangan selama <strong>{analysis.latestPeriod?.duration} hari berturut-turut</strong>. Menurut kriteria Madzhab Syafi'i, masa maksimal haid adalah 15 hari. Melebihi itu adalah darah penyakit (Istihadhah) di mana siswi <strong>wajib bersuci dan melaksanakan sholat fardhu</strong>. Ada kemungkinan siswi sengaja membolos sholat.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/60 text-xs text-emerald-900 flex gap-3 items-start">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-extrabold">✓ Durasi Siklus Sesuai Syariat</p>
                            <p className="mt-1 leading-relaxed text-emerald-800">
                              Durasi berhalangan ({analysis.latestPeriod?.duration} hari) normal dan masih di bawah batas maksimal 15 hari yang ditetapkan syariat Islam.
                            </p>
                          </div>
                        </div>
                      )}

                      {/* 2. Gap validation box */}
                      {analysis.periods.length > 1 && (
                        analysis.isGapWarning ? (
                          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200/60 text-xs text-amber-900 flex gap-3 items-start">
                            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-extrabold">⚠️ Peringatan: Masa Suci Terlahu Singkat ({analysis.gapDays} Hari)!</p>
                              <p className="mt-1 leading-relaxed text-amber-800">
                                Jarak sejak haid sebelumnya hanya <strong>{analysis.gapDays} hari</strong>. Syariat menetapkan masa suci minimal antar dua haid adalah <strong>15 hari penuh</strong>. Jika kurang dari 15 hari, klaim haid baru ini tidak sah secara fikih (dianggap Istihadhah) atau terindikasi siswi melakukan kebohongan pola haid agar bisa bolos sholat.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200/60 text-xs text-emerald-900 flex gap-3 items-start">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-extrabold">✓ Jeda Masa Suci Terpenuhi</p>
                              <p className="mt-1 leading-relaxed text-emerald-800">
                                Jarak kesucian antara siklus haid terakhir dengan sebelumnya adalah <strong>{analysis.gapDays} hari</strong> (memenuhi syarat suci minimal &ge; 15 hari). Siklus ini valid secara fikih.
                              </p>
                            </div>
                          </div>
                        )
                      )}
                    </div>

                    {/* All Historical Menstruation Blocks */}
                    <div className="space-y-2.5">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Histori Periode Menstruasi</h4>
                      <div className="border border-slate-100 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold">
                              <th className="p-3">Siklus</th>
                              <th className="p-3">Mulai</th>
                              <th className="p-3">Selesai</th>
                              <th className="p-3 text-center">Durasi</th>
                              <th className="p-3">Status Fikih</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-slate-700">
                            {analysis.periods.map((p, idx) => {
                              const isTooLong = p.duration > 15;
                              return (
                                <tr key={p.start} className="hover:bg-slate-50/50">
                                  <td className="p-3 font-semibold text-slate-500">#{analysis.periods.length - idx}</td>
                                  <td className="p-3 font-medium">{new Date(p.start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                                  <td className="p-3 font-medium">{new Date(p.end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</td>
                                  <td className="p-3 text-center font-bold text-slate-800">{p.duration} Hari</td>
                                  <td className="p-3">
                                    {isTooLong ? (
                                      <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-100">Melebihi Batas (Istihadhah)</span>
                                    ) : (
                                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">Normal (Haid)</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedStudentForCycle(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 text-xs font-semibold cursor-pointer transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
