import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { 
  FileText, Download, Calendar, Search, Filter, 
  RotateCw, CheckCircle, BarChart3, AlertCircle, Award, Sparkles
} from 'lucide-react';
import { Student, Verification, SholatType } from '../types';
import { getJakartaDate } from '../lib/utils';

export default function LaporanTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filter States
  const [startDate, setStartDate] = useState(() => {
    // Default to 7 days ago
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  const [selectedClass, setSelectedClass] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadReportData();
  }, [startDate, endDate]);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch all students
      const studentSnap = await getDocs(collection(db, 'students'));
      const studentList: Student[] = [];
      studentSnap.forEach((doc) => {
        studentList.push(doc.data() as Student);
      });
      // Filter Muslim students only for report
      const muslimList = studentList.filter(s => s.religion === 'Muslim');
      muslimList.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(muslimList);

      // 2. Query verifications inside date range
      const verificationsRef = collection(db, 'verifications');
      const q = query(
        verificationsRef,
        where('date', '>=', startDate),
        where('date', '<=', endDate)
      );
      const verSnap = await getDocs(q);
      const verList: Verification[] = [];
      verSnap.forEach((doc) => {
        verList.push(doc.data() as Verification);
      });
      setVerifications(verList);
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Unique classes for dropdown filter
  const classesList = ['Semua', ...Array.from(new Set(students.map((s) => s.class)))].sort();

  // Process data for presentation
  const getDaysDiff = (): number => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diffTime = Math.abs(e.getTime() - s.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
    return diffDays || 1;
  };

  const totalDaysInRange = getDaysDiff();

  // Aggregate stats per student
  const reportRows = students.map((student) => {
    // Filter verifications for this student
    const studentVers = verifications.filter((v) => v.studentId === student.id);
    
    const dhuhurCount = studentVers.filter((v) => v.sholatType === 'dhuhur').length;
    const dhuhurActive = studentVers.filter((v) => v.sholatType === 'dhuhur' && !v.status).length;
    const dhuhurHaid = studentVers.filter((v) => v.sholatType === 'dhuhur' && v.status === 'haid').length;
    const dhuhurSakit = studentVers.filter((v) => v.sholatType === 'dhuhur' && v.status === 'sakit').length;
    const dhuhurIzin = studentVers.filter((v) => v.sholatType === 'dhuhur' && v.status === 'izin').length;

    const asharCount = studentVers.filter((v) => v.sholatType === 'ashar').length;
    const asharActive = studentVers.filter((v) => v.sholatType === 'ashar' && !v.status).length;
    const asharHaid = studentVers.filter((v) => v.sholatType === 'ashar' && v.status === 'haid').length;
    const asharSakit = studentVers.filter((v) => v.sholatType === 'ashar' && v.status === 'sakit').length;
    const asharIzin = studentVers.filter((v) => v.sholatType === 'ashar' && v.status === 'izin').length;

    const totalHaid = dhuhurHaid + asharHaid;
    const totalSakit = dhuhurSakit + asharSakit;
    const totalIzin = dhuhurIzin + asharIzin;
    
    // Total maximum verification points = days * 2 sholats
    const maxPoints = totalDaysInRange * 2;
    const earnedPoints = dhuhurCount + asharCount;
    const completionPercent = maxPoints > 0 ? Math.round((earnedPoints / maxPoints) * 100) : 0;

    return {
      student,
      dhuhurCount,
      dhuhurActive,
      dhuhurHaid,
      dhuhurSakit,
      dhuhurIzin,
      asharCount,
      asharActive,
      asharHaid,
      asharSakit,
      asharIzin,
      totalHaid,
      totalSakit,
      totalIzin,
      completionPercent,
      earnedPoints
    };
  });

  // Apply Search and Class Filter
  const filteredRows = reportRows.filter((row) => {
    const matchesSearch = row.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          row.student.id.includes(searchQuery);
    const matchesClass = selectedClass === 'Semua' || row.student.class === selectedClass;
    return matchesSearch && matchesClass;
  });

  // Overall metrics in selected parameters
  const avgCompletionPercentage = filteredRows.length > 0 
    ? Math.round(filteredRows.reduce((acc, row) => acc + row.completionPercent, 0) / filteredRows.length)
    : 0;

  const totalVerificationsEarned = filteredRows.reduce((acc, row) => acc + row.earnedPoints, 0);

  // Generate and Download CSV File
  const handleExportCSV = () => {
    if (filteredRows.length === 0) {
      alert('Tidak ada data untuk diekspor!');
      return;
    }

    // CSV Header Columns
    const headers = [
      'NISN / ID Siswa',
      'Nama Siswa',
      'Kelas',
      'Rentang Tanggal',
      'Jumlah Hari',
      'Verifikasi Dhuhur',
      'Verifikasi Ashar',
      'Total Halangan (Haid)',
      'Total Sakit',
      'Total Izin',
      'Total Terverifikasi',
      'Persentase Kepatuhan (%)',
      'Keterangan'
    ];

    // CSV Rows conversion
    const rows = filteredRows.map((row) => {
      const totalSesi = totalDaysInRange * 2;
      const tidakHadir = totalSesi - row.earnedPoints;
      
      let keterangan = 'Aktif mengikuti sholat';
      const detailKeterangan: string[] = [];
      if (row.totalHaid > 0) detailKeterangan.push(`Haid: ${row.totalHaid} sesi`);
      if (row.totalSakit > 0) detailKeterangan.push(`Sakit: ${row.totalSakit} sesi`);
      if (row.totalIzin > 0) detailKeterangan.push(`Izin: ${row.totalIzin} sesi`);
      
      if (detailKeterangan.length > 0) {
        if (row.completionPercent === 100) {
          keterangan = `Siswa berhalangan/absen karena: ${detailKeterangan.join(', ')}. Semua sesi aktif diselesaikan secara tertib.`;
        } else {
          keterangan = `Siswa berhalangan/absen karena: ${detailKeterangan.join(', ')}. Sisa ${tidakHadir} sesi absen tanpa keterangan.`;
        }
      } else if (row.completionPercent === 100) {
        keterangan = 'Sempurna (100% Terverifikasi)';
      } else if (tidakHadir > 0) {
        keterangan = `${tidakHadir} sesi absen tanpa keterangan / belum sholat.`;
      }

      return [
        `="${row.student.id}"`, // format as text formula to prevent Excel stripping leading zeros
        row.student.name,
        row.student.class,
        `${startDate} s/d ${endDate}`,
        totalDaysInRange,
        `${row.dhuhurActive} (Haid: ${row.dhuhurHaid}, Sakit: ${row.dhuhurSakit}, Izin: ${row.dhuhurIzin})`,
        `${row.asharActive} (Haid: ${row.asharHaid}, Sakit: ${row.asharSakit}, Izin: ${row.asharIzin})`,
        row.totalHaid,
        row.totalSakit,
        row.totalIzin,
        row.earnedPoints,
        `${row.completionPercent}%`,
        keterangan
      ];
    });

    // Create CSV string separated by semicolons (common standard in Indonesian Excel locales)
    const delimiter = ';';
    const csvContent = [
      headers.join(delimiter),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter))
    ].join('\r\n');

    // Add UTF-8 BOM to guarantee proper character decoding in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download link
    const link = document.createElement('a');
    link.href = url;
    link.download = `Laporan_Sholat_Siswa_${startDate}_ke_${endDate}_${selectedClass}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Search and Filters panel */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <FileText className="h-6 w-6 text-indigo-600" />
          Rekapitulasi & Ekspor Laporan
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Atur rentang tanggal perekaman untuk menghitung persentase kepatuhan ibadah siswa muslim
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          {/* Start date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3 text-indigo-500" /> Tanggal Mulai
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
            />
          </div>

          {/* End date */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
              <Calendar className="h-3 w-3 text-indigo-500" /> Tanggal Selesai
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-800"
            />
          </div>

          {/* Class selector */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
              <Filter className="h-3 w-3 text-indigo-500" /> Saring Kelas
            </label>
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-800 cursor-pointer font-semibold"
            >
              {classesList.map((cls) => (
                <option key={cls} value={cls}>{cls === 'Semua' ? 'Semua Kelas' : `Kelas ${cls}`}</option>
              ))}
            </select>
          </div>

          {/* Export Button */}
          <div className="flex items-end">
            <button
              id="btn-export-csv"
              onClick={handleExportCSV}
              disabled={isLoading || filteredRows.length === 0}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-150 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Download className="h-4.5 w-4.5" />
              Unduh File CSV (Excel)
            </button>
          </div>
        </div>
      </div>

      {/* Aggregate Statistics View */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Compliance Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kepatuhan Rata-Rata</p>
            <h4 className="text-2xl font-bold text-indigo-700 mt-0.5">{avgCompletionPercentage}%</h4>
          </div>
        </div>

        {/* Verifications Count Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Terverifikasi</p>
            <h4 className="text-2xl font-bold text-slate-800 mt-0.5">{totalVerificationsEarned} kali</h4>
          </div>
        </div>

        {/* Duration Days Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Rentang Hari</p>
            <h4 className="text-2xl font-bold text-slate-800 mt-0.5">{totalDaysInRange} Hari Kalender</h4>
          </div>
        </div>

      </div>

      {/* Table view */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Table Search bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari siswa dalam laporan..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-xs text-slate-900 transition-colors"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16">
            <RotateCw className="animate-spin h-8 w-8 text-indigo-500" />
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <h4 className="font-bold text-slate-700">Tidak ada data untuk ditampilkan</h4>
            <p className="text-sm text-slate-400 mt-1">Harap pilih filter atau perpanjang rentang pencarian.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                  <th className="p-4 pl-6">ID / NISN</th>
                  <th className="p-4">Nama Lengkap</th>
                  <th className="p-4">Kelas</th>
                  <th className="p-4 text-center">Dhuhur (Sesi)</th>
                  <th className="p-4 text-center">Ashar (Sesi)</th>
                  <th className="p-4 text-center">Tingkat Kepatuhan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRows.map((row) => (
                  <tr key={row.student.id} className="hover:bg-slate-50/40 transition-colors">
                    <td className="p-4 pl-6 font-mono text-xs text-slate-500">{row.student.id}</td>
                    <td className="p-4">
                      <div>
                        <p className="font-bold text-slate-800 flex items-center gap-1.5">
                          {row.student.name}
                          {row.student.gender === 'Perempuan' && (
                            <span className="text-[9px] px-1 py-0.2 bg-pink-50 text-pink-600 font-extrabold rounded-md">P</span>
                          )}
                        </p>
                        {row.totalHaid > 0 && (
                          <p className="text-[10px] text-pink-600 font-semibold flex items-center gap-1 mt-0.5">
                            <Sparkles className="h-2.5 w-2.5" />
                            {row.totalHaid} kali Halangan (Haid)
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-slate-600">{row.student.class}</td>
                    <td className="p-4 text-center text-slate-600 font-medium">
                      <div>
                        <span>{row.dhuhurCount} / {totalDaysInRange}</span>
                        {row.dhuhurHaid > 0 && (
                          <span className="block text-[10px] text-pink-500 font-bold mt-0.5">({row.dhuhurHaid} Haid)</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-center text-slate-600 font-medium">
                      <div>
                        <span>{row.asharCount} / {totalDaysInRange}</span>
                        {row.asharHaid > 0 && (
                          <span className="block text-[10px] text-pink-500 font-bold mt-0.5">({row.asharHaid} Haid)</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden shrink-0">
                          <div 
                            className={`h-full rounded-full ${
                              row.completionPercent >= 80 
                                ? 'bg-emerald-500' 
                                : row.completionPercent >= 50 
                                ? 'bg-indigo-500' 
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${row.completionPercent}%` }}
                          />
                        </div>
                        <span className={`font-mono text-xs font-bold ${
                          row.completionPercent >= 80 
                            ? 'text-emerald-600' 
                            : row.completionPercent >= 50 
                            ? 'text-indigo-600' 
                            : 'text-rose-600'
                        }`}>
                          {row.completionPercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
