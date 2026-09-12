import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { UserPlus, Shield, Users, Award, Trash2, Check, Loader2, AlertCircle } from 'lucide-react';
import { UserProfile, UserRole } from '../types';

export default function UsersTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [formUsername, setFormUsername] = useState('');
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('guru');
  const [formPassword, setFormPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Custom modal state for deletion
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'users'));
      const list: UserProfile[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as UserProfile);
      });
      // Sort: Admin first, then Guru, then Petugas
      const roleOrder = { admin: 1, guru: 2, petugas: 3 };
      list.sort((a, b) => (roleOrder[a.role] || 9) - (roleOrder[b.role] || 9));
      setUsers(list);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const usernameClean = formUsername.trim().toLowerCase();
    if (!usernameClean || !formName.trim() || !formPassword) {
      setFormError('Semua field wajib diisi');
      return;
    }

    if (usernameClean.length < 3) {
      setFormError('Username minimal 3 karakter');
      return;
    }

    if (formPassword.length < 6) {
      setFormError('Password minimal 6 karakter');
      return;
    }

    setFormLoading(true);
    try {
      // Prevent duplicating username
      const existingUser = users.find(u => u.username === usernameClean);
      if (existingUser) {
        setFormError('Username sudah terdaftar');
        setFormLoading(false);
        return;
      }

      // Create pre-auth user document in /users
      // We use the clean username as the initial document ID.
      // The login flow will detect this and provision the Auth account dynamically.
      const newUserDocId = usernameClean;
      const newUserProfile = {
        uid: newUserDocId, // temporary UID equal to username
        username: usernameClean,
        name: formName.trim(),
        role: formRole,
        initialPassword: formPassword, // stored transparently for self-healing auth creation
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', newUserDocId), newUserProfile);

      setShowForm(false);
      setFormUsername('');
      setFormName('');
      setFormPassword('');
      loadUsers();
    } catch (err) {
      console.error('Error creating user profile:', err);
      setFormError('Gagal menyimpan profil pengguna.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteUser = (user: UserProfile) => {
    if (user.username === 'admin') {
      alert('Akun admin utama tidak boleh dihapus!');
      return;
    }
    setUserToDelete(user);
  };

  const executeDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', userToDelete.uid));
      loadUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
    } finally {
      setUserToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title & Action Bar */}
      <div className="flex items-center justify-between bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-600" />
            Kelola Pengguna Sistem
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Daftarkan Guru Wali Kelas atau Petugas Ketertiban Keagamaan baru
          </p>
        </div>

        {!showForm && (
          <button
            id="btn-add-user"
            onClick={() => setShowForm(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Tambah Pengguna
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Users list */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="animate-spin h-8 w-8 text-indigo-500" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold">
                    <th className="p-4 pl-6">Nama Lengkap</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Hak Akses / Peran</th>
                    <th className="p-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {users.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50/40 transition-colors">
                      <td className="p-4 pl-6 font-bold text-slate-800">{u.name}</td>
                      <td className="p-4 font-mono text-xs text-slate-500">{u.username}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                          u.role === 'admin' 
                            ? 'bg-indigo-50 text-indigo-700' 
                            : u.role === 'guru' 
                            ? 'bg-emerald-50 text-emerald-700' 
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {u.role === 'admin' ? (
                            <Shield className="h-3 w-3" />
                          ) : u.role === 'guru' ? (
                            <Users className="h-3 w-3" />
                          ) : (
                            <Award className="h-3 w-3" />
                          )}
                          <span className="capitalize">{u.role}</span>
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {u.username !== 'admin' ? (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Pengguna"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium italic">Sistem Utama</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Add User Form */}
        <div className="lg:col-span-4">
          {showForm ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 relative animate-in fade-in slide-in-from-right-3">
              <h3 className="text-base font-bold text-slate-800 mb-4">
                Pendaftaran Pengguna Baru
              </h3>

              {formError && (
                <div className="mb-4 bg-red-50 text-red-800 p-3 rounded-xl border border-red-100 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleAddUser} className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Nama lengkap beserta gelar"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Username Login</label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="Contoh: petugas_rudi"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Sandi Akses (Min. 6 Karakter)</label>
                  <input
                    type="password"
                    required
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Kata sandi default"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-slate-900 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Peran / Hak Akses</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                  >
                    <option value="guru">Guru (Hanya Memantau & Ekspor)</option>
                    <option value="petugas">Petugas (Hanya Scan QR)</option>
                    <option value="admin">Administrator (Semua Izin)</option>
                  </select>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {formLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <Check className="h-4 w-4" />}
                    Daftarkan
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-indigo-50/40 rounded-2xl p-6 text-indigo-955 border border-indigo-100 text-xs leading-relaxed">
              <Shield className="h-6 w-6 text-indigo-500 mb-2" />
              <p className="font-bold mb-1">Catatan Keamanan Akun:</p>
              <p>Username pendaftaran tidak boleh diduplikasi. Sistem menggunakan email sintesis internal <code>[username]@sholat-verifikasi.id</code> untuk menjaga fungsionalitas Firebase Auth.</p>
              <p className="mt-2">Sandi default yang dicatat Admin dapat langsung digunakan login oleh Guru/Petugas bersangkutan di perangkat mereka masing-masing.</p>
            </div>
          )}
        </div>

      </div>

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" 
            onClick={() => setUserToDelete(null)}
          />
          {/* Modal Content */}
          <div className="bg-white rounded-2xl border border-slate-100 p-6 max-w-sm w-full relative z-10 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-650 mx-auto">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Hapus Pengguna</h3>
              <p className="text-sm text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus akun milik <strong className="text-slate-800">"{userToDelete.name}"</strong>? Pengguna ini tidak akan dapat masuk ke sistem verifikasi lagi.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeDeleteUser}
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
