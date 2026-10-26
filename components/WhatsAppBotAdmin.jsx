'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import BackgroundSwitcher from './BackgroundSwitcher';

const EMPTY_USER = { name: '', phone: '', role: 'User', active: true, folderIds: [] };

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusText(env) {
  if (!env) return 'Memuat';
  if (env.configured) return 'Siap';
  const missing = [];
  if (!env.hasAccessToken) missing.push('token');
  if (!env.hasPhoneNumberId) missing.push('phone number ID');
  return `Belum lengkap: ${missing.join(', ')}`;
}

export default function WhatsAppBotAdmin({ username }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [data, setData] = useState({ settings: {}, users: [], logs: [], folders: [], env: {} });
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [simulator, setSimulator] = useState({ from: '', text: '/help', replies: [] });

  const settings = data.settings || {};
  const folders = data.folders || [];
  const users = data.users || [];
  const logs = data.logs || [];

  const defaultFolderName = useMemo(() => {
    if (!settings.defaultUploadFolderId) return 'Belum dipilih';
    return folders.find((folder) => folder.id === settings.defaultUploadFolderId)?.name || settings.defaultUploadFolderName || settings.defaultUploadFolderId;
  }, [folders, settings.defaultUploadFolderId, settings.defaultUploadFolderName]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/bot/admin');
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Gagal membaca data bot.');
      setData(payload);
      if (!simulator.from && payload.users?.[0]?.phone) setSimulator((prev) => ({ ...prev, from: payload.users[0].phone }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function updateSettings(name, value) {
    setData((prev) => ({ ...prev, settings: { ...(prev.settings || {}), [name]: value } }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const selectedFolder = folders.find((folder) => folder.id === settings.defaultUploadFolderId);
      const response = await fetch('/api/bot/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { ...settings, defaultUploadFolderName: selectedFolder?.name || settings.defaultUploadFolderName || '' } })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Gagal menyimpan pengaturan bot.');
      setData((prev) => ({ ...prev, settings: payload.settings || prev.settings }));
      setMessage('Pengaturan WhatsApp Bot berhasil disimpan.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/bot/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userForm })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Gagal menyimpan pengguna.');
      setData((prev) => ({ ...prev, users: payload.users || prev.users }));
      setUserForm(EMPTY_USER);
      setMessage('Pengguna bot berhasil disimpan.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(phone) {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch(`/api/bot/admin?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Gagal menghapus pengguna.');
      setData((prev) => ({ ...prev, users: payload.users || prev.users }));
      setMessage('Pengguna bot berhasil dihapus.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function runSimulator(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: simulator.from, text: simulator.text })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Simulasi gagal.');
      setSimulator((prev) => ({ ...prev, replies: payload.replies || [] }));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function clearLogs() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/bot/admin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearLogs' })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.message || 'Gagal menghapus log.');
      setData((prev) => ({ ...prev, logs: [] }));
      setMessage('Log aktivitas bot berhasil dikosongkan.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleUserFolder(folderId) {
    setUserForm((prev) => {
      const current = Array.isArray(prev.folderIds) ? prev.folderIds : [];
      return { ...prev, folderIds: current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId] };
    });
  }

  return (
    <main className="app-shell settings-shell bot-shell">
      <div className="animated-wallpaper" />
      <aside className="sidebar glass-card desktop-sidebar">
        <div className="brand-row official-brand">
          <img className="tanah-logo" src="/branding/tanah-bumbu-logo.png" alt="Logo Tanah Bumbu" loading="eager" decoding="async" />
          <div>
            <span>SUB Administrasi</span>
            <strong>WhatsApp Bot</strong>
            <small>Drive Command Center</small>
          </div>
        </div>
        <nav className="side-nav">
          <Link href="/dashboard">Dashboard Drive</Link>
          <Link href="/bot" className="active">WhatsApp Bot</Link>
          <Link href="/settings">Admin Settings</Link>
        </nav>
      </aside>

      <section className="content-area bot-content">
        <header className="topbar glass-card">
          <div>
            <p className="eyebrow">Integrasi Bot</p>
            <h1>WhatsApp Bot Manajemen Google Drive</h1>
          </div>
          <div className="settings-top-actions">
            <BackgroundSwitcher onToast={(text, type) => (type === 'error' ? setError(text) : setMessage(text))} />
            <Link className="ghost-button" href="/dashboard">Kembali</Link>
          </div>
        </header>

        {loading ? <div className="settings-card glass-card"><div className="skeleton-block tall" /></div> : null}
        {error ? <div className="alert error-alert">{error}</div> : null}
        {message ? <div className="alert success-alert">{message}</div> : null}

        {!loading ? (
          <div className="bot-grid">
            <section className="bot-card glass-card reveal-card bot-span-2">
              <div className="bot-card-head">
                <div>
                  <p className="eyebrow">Status</p>
                  <h2>Koneksi Bot</h2>
                </div>
                <button className="ghost-button" onClick={load} disabled={saving}>Refresh</button>
              </div>
              <div className="bot-status-grid">
                <div className="stat-card glass-card"><span>WhatsApp Bot</span><strong>{settings.enabled ? 'Aktif' : 'Nonaktif'}</strong></div>
                <div className="stat-card glass-card"><span>Cloud API</span><strong>{statusText(data.env)}</strong></div>
                <div className="stat-card glass-card"><span>Webhook Verify</span><strong>{data.env?.hasVerifyToken ? 'Siap' : 'Belum'}</strong></div>
                <div className="stat-card glass-card"><span>Folder Upload</span><strong>{defaultFolderName}</strong></div>
              </div>
              <div className="settings-note bot-note">
                <strong>Webhook URL</strong>
                <span>/api/bot/webhook</span>
              </div>
            </section>

            <form className="bot-card glass-card reveal-card" onSubmit={saveSettings}>
              <div className="bot-card-head">
                <div>
                  <p className="eyebrow">Pengaturan</p>
                  <h2>Kontrol Bot</h2>
                </div>
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={Boolean(settings.enabled)} onChange={(event) => updateSettings('enabled', event.target.checked)} />
                <span>Aktifkan WhatsApp Bot</span>
              </label>
              <label className="field-label">
                Folder default upload
                <select value={settings.defaultUploadFolderId || ''} onChange={(event) => updateSettings('defaultUploadFolderId', event.target.value)}>
                  <option value="">Belum dipilih</option>
                  {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                </select>
              </label>
              <label className="field-label">
                Batas kirim file langsung (MB)
                <input type="number" min="1" max="100" value={settings.maxDirectSendMb || 20} onChange={(event) => updateSettings('maxDirectSendMb', Number(event.target.value))} />
              </label>
              <label className="field-label">
                Jumlah data per balasan
                <input type="number" min="5" max="50" value={settings.pageSize || 20} onChange={(event) => updateSettings('pageSize', Number(event.target.value))} />
              </label>
              <label className="field-label">
                Nomor admin untuk notifikasi
                <input value={settings.notifyAdminNumber || ''} onChange={(event) => updateSettings('notifyAdminNumber', event.target.value)} placeholder="62812xxxx" />
              </label>
              <button className="primary-button" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Pengaturan Bot'}</button>
            </form>

            <section className="bot-card glass-card reveal-card">
              <div className="bot-card-head">
                <div>
                  <p className="eyebrow">Perintah</p>
                  <h2>Command WhatsApp</h2>
                </div>
              </div>
              <div className="command-list">
                <code>/start</code><span>Memulai bot</span>
                <code>/help</code><span>Melihat panduan</span>
                <code>/folder</code><span>Daftar folder utama</span>
                <code>/isi 1</code><span>Isi folder tertentu</span>
                <code>/ambil 1</code><span>Kirim file dari Drive</span>
                <code>/cari tender</code><span>Cari file</span>
                <code>/simpan 1</code><span>Simpan media WA ke Drive</span>
                <code>/status</code><span>Status koneksi</span>
              </div>
            </section>

            <form className="bot-card glass-card reveal-card bot-span-2" onSubmit={saveUser}>
              <div className="bot-card-head">
                <div>
                  <p className="eyebrow">Akses Pengguna</p>
                  <h2>Nomor WhatsApp yang Diizinkan</h2>
                </div>
              </div>
              <div className="bot-form-grid">
                <label className="field-label">Nama pengguna<input value={userForm.name} onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nama SKPD/Admin" required /></label>
                <label className="field-label">Nomor WhatsApp<input value={userForm.phone} onChange={(event) => setUserForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="62812xxxx" required /></label>
                <label className="field-label">Role<select value={userForm.role} onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value }))}><option>Super Admin</option><option>Admin</option><option>User</option><option>Guest</option></select></label>
                <label className="toggle-row compact"><input type="checkbox" checked={Boolean(userForm.active)} onChange={(event) => setUserForm((prev) => ({ ...prev, active: event.target.checked }))} /><span>Aktif</span></label>
              </div>
              <div className="folder-access-box">
                <strong>Akses folder</strong>
                <p>Kosongkan pilihan folder agar pengguna dapat melihat semua folder yang diizinkan aplikasi.</p>
                <div className="folder-chip-grid">
                  {folders.map((folder) => (
                    <button type="button" key={folder.id} className={userForm.folderIds.includes(folder.id) ? 'active' : ''} onClick={() => toggleUserFolder(folder.id)}>{folder.name}</button>
                  ))}
                </div>
              </div>
              <button className="primary-button" disabled={saving}>{saving ? 'Menyimpan...' : 'Tambah / Update Pengguna'}</button>
              <div className="bot-table-wrap">
                <table className="bot-table">
                  <thead><tr><th>Nama</th><th>Nomor</th><th>Role</th><th>Status</th><th>Akses</th><th>Aksi</th></tr></thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={`${user.phone}-${user.source || 'db'}`}>
                        <td>{user.name}</td>
                        <td>{user.phone}</td>
                        <td>{user.role}</td>
                        <td>{user.active ? 'Aktif' : 'Nonaktif'}</td>
                        <td>{user.folderIds?.length ? `${user.folderIds.length} folder` : 'Semua folder'}</td>
                        <td>
                          <button type="button" className="ghost-mini" onClick={() => setUserForm({ name: user.name, phone: user.phone, role: user.role, active: user.active, folderIds: user.folderIds || [] })}>Edit</button>
                          {user.source === 'env' ? <span className="muted-mini">ENV</span> : <button type="button" className="ghost-mini danger" onClick={() => deleteUser(user.phone)}>Hapus</button>}
                        </td>
                      </tr>
                    ))}
                    {!users.length ? <tr><td colSpan="6">Belum ada nomor pengguna bot.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </form>

            <form className="bot-card glass-card reveal-card" onSubmit={runSimulator}>
              <div className="bot-card-head">
                <div>
                  <p className="eyebrow">Uji Coba</p>
                  <h2>Simulator Chat Bot</h2>
                </div>
              </div>
              <label className="field-label">Nomor pengirim<input value={simulator.from} onChange={(event) => setSimulator((prev) => ({ ...prev, from: event.target.value }))} placeholder="62812xxxx" required /></label>
              <label className="field-label">Perintah<textarea value={simulator.text} onChange={(event) => setSimulator((prev) => ({ ...prev, text: event.target.value }))} rows="4" /></label>
              <button className="primary-button" disabled={saving}>{saving ? 'Memproses...' : 'Jalankan Simulasi'}</button>
              {simulator.replies?.length ? <div className="bot-reply-box">{simulator.replies.map((reply, index) => <pre key={index}>{reply}</pre>)}</div> : null}
            </form>

            <section className="bot-card glass-card reveal-card bot-span-2">
              <div className="bot-card-head">
                <div>
                  <p className="eyebrow">Riwayat</p>
                  <h2>Log Aktivitas Bot</h2>
                </div>
                <button className="ghost-button" onClick={clearLogs} disabled={saving}>Kosongkan Log</button>
              </div>
              <div className="bot-table-wrap">
                <table className="bot-table">
                  <thead><tr><th>Waktu</th><th>Nomor</th><th>Aktivitas</th><th>Target</th><th>Status</th><th>Keterangan</th></tr></thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDate(log.createdAt)}</td>
                        <td>{log.phone || '-'}</td>
                        <td>{log.activity}</td>
                        <td>{log.target || '-'}</td>
                        <td>{log.status}</td>
                        <td>{log.message || '-'}</td>
                      </tr>
                    ))}
                    {!logs.length ? <tr><td colSpan="6">Belum ada aktivitas bot.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
