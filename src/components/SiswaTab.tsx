import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  UserPlus, Search, Edit2, Trash2, Download, QrCode, 
  X, Check, AlertTriangle, Eye, Loader2, Award, Smartphone
} from 'lucide-react';
import { Student, QrType, ReligionType } from '../types';
import { getJakartaDate, generateDailyToken } from '../lib/utils';
import QRCode from 'qrcode';

export default function SiswaTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterReligion, setFilterReligion] = useState<'All' | ReligionType>('All');

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formClass, setFormClass] = useState('');
  const [formReligion, setFormReligion] = useState<ReligionType>('Muslim');
  const [formGender, setFormGender] = useState<'Laki-laki' | 'Perempuan'>('Laki-laki');
  const [formQrType, setFormQrType] = useState<QrType>('lifetime');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Selected student for QR generator preview
  const [selectedStudentForQr, setSelectedStudentForQr] = useState<Student | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Custom modal state for deletion
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);

  useEffect(() => {
    loadStudents();
  }, []);

  // Redraw QR code when selected student changes
  useEffect(() => {
    if (selectedStudentForQr) {
      renderQrCode();
    }
  }, [selectedStudentForQr]);

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'students'));
      const list: Student[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as Student);
      });
      // Sort alphabetically
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(list);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getQrPayload = (student: Student): string => {
    if (student.qrType === 'lifetime') {
      return `LIFETIME:${student.id}:${student.qrToken}`;
    } else {
      const today = getJakartaDate();
      const dailyToken = generateDailyToken(student.id, today);
      return `DAILY:${student.id}:${today}:${dailyToken}`;
    }
  };

  const renderQrCode = async () => {
    if (!selectedStudentForQr || !canvasRef.current) return;

    try {
      const payload = getQrPayload(selectedStudentForQr);
      await QRCode.toCanvas(canvasRef.current, payload, {
        width: 200,
        margin: 2,
        color: {
          dark: '#1e293b', // Slate-800
          light: '#ffffff'
        }
      });
    } catch (err) {
      console.error('QR code generation failed:', err);
    }
  };

  const downloadQrCard = () => {
    if (!selectedStudentForQr) return;

    // Create a temporary beautiful card layout on a virtual canvas for download
    const cardCanvas = document.createElement('canvas');
    const ctx = cardCanvas.getContext('2d');
    if (!ctx) return;

    cardCanvas.width = 400;
    cardCanvas.height = 600;

    // Background Gradient (Sophisticated light mode)
    const grad = ctx.createLinearGradient(0, 0, 400, 600);
    grad.addColorStop(0, '#f8fafc'); // slate-50
    grad.addColorStop(1, '#e2e8f0'); // slate-200
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 600);

    // Decorative Borders
    ctx.strokeStyle = '#4f46e5'; // Indigo-600
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, 380, 580);

    // Header Title
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KARTU VERIFIKASI SHOLAT', 200, 50);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('KEDISIPLINAN IBADAH SEKOLAH', 200, 75);

    // Divider line
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 95);
    ctx.lineTo(370, 95);
    ctx.stroke();

    // Student Information Section
    ctx.fillStyle = '#334155';
    ctx.font = '12px sans-serif';
    ctx.fillText('NAMA SISWA', 200, 125);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(selectedStudentForQr.name.toUpperCase(), 200, 150);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(`ID / NISN: ${selectedStudentForQr.id}`, 200, 180);
    ctx.fillText(`KELAS: ${selectedStudentForQr.class}`, 200, 205);

    // Stamp method
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(50, 235, 300, 320);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(50, 235, 300, 320);

    // Draw QR code onto the virtual canvas
    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 100, 255, 200, 200);
    }

    // QR Type Indicator
    ctx.fillStyle = '#4f46e5';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('KARTU QR: LIFETIME (CETAK)', 200, 485);

    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 10px sans-serif';
    ctx.fillText('*Simpan kartu cetak ini dengan baik*', 200, 515);

    // Convert and Trigger Download
    try {
      const url = cardCanvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `QR_Card_${selectedStudentForQr.id}_${selectedStudentForQr.name}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error generating card download image:', err);
    }
  };

  const handleOpenAddForm = () => {
    setIsEditing(false);
    setFormId('');
    setFormName('');
    setFormClass('');
    setFormReligion('Muslim');
    setFormGender('Laki-laki');
    setFormQrType('lifetime');
    setFormError('');
    setShowForm(true);
  };

  const handleOpenEditForm = (student: Student) => {
    setIsEditing(true);
    setFormId(student.id);
    setFormName(student.name);
    setFormClass(student.class);
    setFormReligion(student.religion);
    setFormGender(student.gender || 'Laki-laki');
    setFormQrType(student.qrType);
    setFormError('');
    setShowForm(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formId.trim() || !formName.trim() || !formClass.trim()) {
      setFormError('Semua field wajib diisi');
      return;
    }

    // Character validation for Firestore ID restrictions
    const idPattern = /^[a-zA-Z0-9_\-]+$/;
    if (!idPattern.test(formId)) {
      setFormError('ID / NISN hanya boleh mengandung huruf, angka, minus (-), dan underscore (_)');
      return;
    }

    setFormLoading(true);
    try {
      // Create new token if not editing or if ID changes
      const qrToken = `LT-${formId.trim()}-${formName.trim().replace(/\s+/g, '-').toUpperCase()}`;

      const studentData: Student = {
        id: formId.trim(),
        name: formName.trim(),
        class: formClass.trim(),
        religion: formReligion,
        gender: formGender,
        qrType: formQrType,
        qrToken,
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'students', formId.trim()), studentData);
      
      // Clear form & reload
      setShowForm(false);
      loadStudents();
    } catch (err) {
      console.error('Error saving student:', err);
      setFormError('Gagal menyimpan data siswa ke Firestore.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteStudent = (student: Student) => {
    setStudentToDelete(student);
  };

  const executeDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
      await deleteDoc(doc(db, 'students', studentToDelete.id));
      loadStudents();
      if (selectedStudentForQr?.id === studentToDelete.id) {
        setSelectedStudentForQr(null);
      }
    } catch (err) {
      console.error('Error deleting student:', err);
    } finally {
      setStudentToDelete(null);
    }
  };

  // Filter students based on search query and religion select
  const filteredStudents = students.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.id.includes(searchQuery);
    const matchesReligion = filterReligion === 'All' || s.religion === filterReligion;
    return matchesSearch && matchesReligion;
  });

  return (
    <div className="space-y-6">
      
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
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

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Religion filter */}
          <select
            value={filterReligion}
            onChange={(e) => setFilterReligion(e.target.value as any)}
            className="px-3 py-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 cursor-pointer"
          >
            <option value="All">Semua Agama</option>
            <option value="Muslim">Muslim</option>
            <option value="Non-Muslim">Non-Muslim</option>
          </select>

          <button
            id="btn-add-student"
            onClick={handleOpenAddForm}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Tambah Siswa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Students Table */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-20">
              <AlertTriangle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <h4 className="font-bold text-slate-700">Tidak ada siswa ditemukan</h4>
              <p className="text-sm text-slate-400 mt-1">Ubah kata kunci pencarian Anda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                    <th className="p-4 pl-6">ID / NISN</th>
                    <th className="p-4">Nama Lengkap</th>
                    <th className="p-4">Kelas</th>
                    <th className="p-4">L/P</th>
                    <th className="p-4">Agama</th>
                    <th className="p-4">Dukungan QR</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredStudents.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/30 transition-colors">
                      <td className="p-4 pl-6 font-mono text-xs text-slate-500">{s.id}</td>
                      <td className="p-4 font-bold text-slate-800">{s.name}</td>
                      <td className="p-4 font-semibold text-slate-600">{s.class}</td>
                      <td className="p-4 text-xs font-bold text-slate-500">
                        {s.gender === 'Perempuan' ? (
                          <span className="text-pink-600 bg-pink-50 px-2 py-0.5 rounded-md">P</span>
                        ) : (
                          <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">L</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          s.religion === 'Muslim' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {s.religion}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-[11px] font-bold">
                          <QrCode className="h-3 w-3" />
                          <span>Harian & Lifetime</span>
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedStudentForQr(s)}
                            className="p-1.5 hover:bg-slate-100 text-indigo-600 hover:text-indigo-800 rounded-lg transition-colors cursor-pointer"
                            title="Tampilkan Kartu QR"
                          >
                            <QrCode className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditForm(s)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-850 rounded-lg transition-colors cursor-pointer"
                            title="Edit Data"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteStudent(s)}
                            className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                            title="Hapus"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Form / QR Generator Side View */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Create/Edit Student Form */}
          {showForm && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 relative animate-in fade-in slide-in-from-right-3">
              <button
                onClick={() => setShowForm(false)}
                className="absolute right-4 top-4 p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-base font-bold text-slate-800 mb-4">
                {isEditing ? 'Edit Data Siswa' : 'Tambah Siswa Baru'}
              </h3>

              {formError && (
                <div className="mb-4 bg-red-50 text-red-800 p-3 rounded-xl border border-red-100 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleSaveStudent} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ID / NISN</label>
                  <input
                    type="text"
                    required
                    disabled={isEditing}
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="Contoh: 2026001"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nama Lengkap Siswa"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Kelas</label>
                  <input
                    type="text"
                    required
                    value={formClass}
                    onChange={(e) => setFormClass(e.target.value)}
                    placeholder="Contoh: X-MIPA-1"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors"
                  />
                </div>

                 <div className="grid grid-cols-2 gap-3">
                   <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Agama</label>
                     <select
                       value={formReligion}
                       onChange={(e) => setFormReligion(e.target.value as ReligionType)}
                       className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm"
                     >
                       <option value="Muslim">Muslim</option>
                       <option value="Non-Muslim">Non-Muslim</option>
                     </select>
                   </div>

                   <div>
                     <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Jenis Kelamin</label>
                     <select
                       value={formGender}
                       onChange={(e) => setFormGender(e.target.value as 'Laki-laki' | 'Perempuan')}
                       className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm"
                     >
                       <option value="Laki-laki">Laki-laki</option>
                       <option value="Perempuan">Perempuan</option>
                     </select>
                   </div>
                 </div>

                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full mt-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {formLoading ? <Loader2 className="animate-spin h-5 w-5" /> : <Check className="h-5 w-5" />}
                  Simpan Siswa
                </button>
              </form>
            </div>
          )}

          {/* QR Code Card Generator Preview */}
          {selectedStudentForQr ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 relative flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-3">
              <button
                onClick={() => setSelectedStudentForQr(null)}
                className="absolute right-4 top-4 p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>

              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
                Kartu Identitas QR
              </h3>
              
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl w-full flex flex-col items-center mt-2 mb-4">
                <canvas ref={canvasRef} className="bg-white p-2 rounded-xl border border-slate-200 shadow-xs mb-4" />
                
                <h4 className="font-extrabold text-slate-800 text-base">{selectedStudentForQr.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">ID: {selectedStudentForQr.id} • {selectedStudentForQr.class}</p>
                
                <div className="mt-3 flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
                  {selectedStudentForQr.qrType === 'harian' ? (
                    <>
                      <Smartphone className="h-3.5 w-3.5" />
                      Dynamic Daily QR (Hari Ini)
                    </>
                  ) : (
                    <>
                      <Award className="h-3.5 w-3.5" />
                      Static Lifetime QR
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={downloadQrCard}
                className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Download className="h-4.5 w-4.5" />
                Unduh Kartu Cetak PNG
              </button>
              
              <p className="text-[10px] text-slate-400 mt-2">
                Format PNG siap cetak berukuran 400x600px dengan identitas lengkap siswa.
              </p>

            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
              <Eye className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-xs">Klik tombol ikon QR (<QrCode className="h-3.5 w-3.5 inline text-indigo-500" />) pada tabel siswa untuk memunculkan panel generator, visualisasi kartu identitas, dan mendownload file gambar PNG.</p>
            </div>
          )}

        </div>

      </div>

      {/* Delete Student Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setStudentToDelete(null)}
          />
          {/* Modal Content */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 max-w-sm w-full relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-650 mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Hapus Data Siswa</h3>
              <p className="text-sm text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus data siswa <strong className="text-slate-800">"{studentToDelete.name}"</strong>? Semua data kartu QR dan verifikasi kehadiran sholat siswa bersangkutan akan terpengaruh secara permanen.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStudentToDelete(null)}
                className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeDeleteStudent}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm shadow-xs transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
