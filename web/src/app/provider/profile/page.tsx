'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { providerApi, type ProviderProfileData } from '../../../lib/api';
import { useAuth } from '../../../lib/auth-context';

export default function ProviderProfilePage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [profile, setProfile] = useState<ProviderProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    providerApi.getProfile()
      .then((data) => {
        setProfile(data);
        setEditName(data.name || '');
        setEditBio(data.bio || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await providerApi.updateProfile({ name: editName, bio: editBio });
      const updated = await providerApi.getProfile();
      setProfile(updated);
      setEditing(false);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async () => {
    if (!profile) return;
    try {
      await providerApi.updateProfile({ isAvailable: !profile.isAvailable });
      setProfile({ ...profile, isAvailable: !profile.isAvailable });
    } catch {
      /* ignore */
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-5 text-center">
        <p className="text-sm text-gray-500">No se encontró el perfil</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Avatar & Name */}
      <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            (profile.name || '?')[0]
          )}
        </div>
        {editing ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-center outline-none focus:border-indigo-400"
            />
            <textarea
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Tu bio profesional..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                onClick={() => { setEditing(false); setEditName(profile.name || ''); setEditBio(profile.bio || ''); }}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-800">{profile.name || 'Sin nombre'}</h2>
            <p className="text-sm text-gray-500 mt-1">{profile.bio || 'Sin bio'}</p>
            <button
              onClick={() => setEditing(true)}
              className="mt-2 text-xs text-indigo-600 font-medium"
            >
              ✏️ Editar perfil
            </button>
          </>
        )}
      </div>

      {/* Tier */}
      <TierProgress
        tier={profile.tier ?? 1}
        totalJobs={profile.totalJobs}
        ratingAverage={profile.ratingAverage}
        isVerified={profile.isVerified}
        trustScore={profile.trustScore}
      />

      {/* Stats */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">📊 Estadísticas</h3>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-xl font-bold text-gray-800">{profile.ratingAverage.toFixed(1)}</p>
            <p className="text-xs text-gray-500">⭐ Rating ({profile.ratingCount})</p>
          </div>
          <div>
            <p className="text-xl font-bold text-gray-800">{profile.totalJobs}</p>
            <p className="text-xs text-gray-500">🔧 Trabajos</p>
          </div>
        </div>
      </div>

      {/* Availability toggle */}
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Disponibilidad</p>
            <p className="text-xs text-gray-500">
              {profile.isAvailable ? 'Estás recibiendo solicitudes' : 'No recibirás solicitudes'}
            </p>
          </div>
          <button
            onClick={toggleAvailability}
            className={`w-14 h-7 rounded-full transition-colors relative ${
              profile.isAvailable ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                profile.isAvailable ? 'translate-x-7' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">📋 Información</h3>
        <InfoRow label="Teléfono" value={profile.phone} />
        <InfoRow label="Email" value={profile.email || 'No configurado'} />
        <InfoRow label="Verificado" value={profile.isVerified ? '✅ Sí' : '❌ No'} />
        <InfoRow
          label="Servicios"
          value={Array.isArray(profile.serviceTypes) ? (profile.serviceTypes as string[]).join(', ') : '-'}
        />
        <InfoRow
          label="Zonas"
          value={profile.zones.map((z) => `${z.name}, ${z.city}`).join(' · ') || 'Sin zonas'}
        />
        <InfoRow
          label="Miembro desde"
          value={new Date(profile.memberSince).toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })}
        />
      </div>

      {/* Settings links */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => router.push('/settings/notifications')}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="text-lg">🔔</span>
          <span className="text-sm font-medium text-gray-800 flex-1">Configurar notificaciones</span>
          <span className="text-gray-400 text-sm">→</span>
        </button>
        <div className="border-t border-gray-100" />
        <button
          onClick={() => router.push('/settings/emergency')}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <span className="text-lg">🆘</span>
          <span className="text-sm font-medium text-gray-800 flex-1">Contactos de emergencia</span>
          <span className="text-gray-400 text-sm">→</span>
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 bg-red-50 text-red-600 rounded-2xl text-sm font-semibold hover:bg-red-100 transition-colors"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-xs text-gray-800 text-right max-w-[60%]">{value}</p>
    </div>
  );
}

const TIERS = [
  { tier: 1, name: 'Basic', badge: '⬜', color: 'from-gray-300 to-gray-400' },
  { tier: 2, name: 'Verified', badge: '✅', color: 'from-blue-400 to-blue-600' },
  { tier: 3, name: 'Pro', badge: '⭐', color: 'from-yellow-400 to-yellow-600' },
  { tier: 4, name: 'Elite', badge: '🏆', color: 'from-purple-400 to-purple-600' },
];

function TierProgress({
  tier,
  totalJobs,
  ratingAverage,
  isVerified,
  trustScore,
}: {
  tier: number;
  totalJobs: number;
  ratingAverage: number;
  isVerified: boolean;
  trustScore: number | null;
}) {
  const currentTier = TIERS.find((t) => t.tier === tier) || TIERS[0];
  const nextTier = TIERS.find((t) => t.tier === tier + 1);

  const requirements: { label: string; met: boolean; detail: string }[] = [];

  if (tier === 1) {
    requirements.push({
      label: 'INE validada',
      met: isVerified,
      detail: isVerified ? 'Completado' : 'Sube tu INE',
    });
  } else if (tier === 2) {
    requirements.push(
      {
        label: '10 trabajos completados',
        met: totalJobs >= 10,
        detail: `${totalJobs}/10`,
      },
      {
        label: 'Trust Score > 60',
        met: (trustScore ?? 0) > 60,
        detail: trustScore !== null ? `${trustScore.toFixed(0)}/60` : 'N/A',
      },
    );
  } else if (tier === 3) {
    requirements.push(
      {
        label: 'Rating 4.7+',
        met: ratingAverage >= 4.7,
        detail: `${ratingAverage.toFixed(1)}/4.7`,
      },
      {
        label: '50 trabajos completados',
        met: totalJobs >= 50,
        detail: `${totalJobs}/50`,
      },
      {
        label: 'Trust Score > 80',
        met: (trustScore ?? 0) > 80,
        detail: trustScore !== null ? `${trustScore.toFixed(0)}/80` : 'N/A',
      },
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{currentTier.badge}</span>
        <div>
          <p className="text-sm font-semibold text-gray-800">
            Tier {currentTier.tier} — {currentTier.name}
          </p>
          {nextTier && (
            <p className="text-xs text-gray-500">
              Siguiente: {nextTier.badge} {nextTier.name}
            </p>
          )}
        </div>
      </div>

      {/* Tier track */}
      <div className="flex items-center gap-1 mb-4">
        {TIERS.map((t) => (
          <div
            key={t.tier}
            className={`flex-1 h-2 rounded-full ${
              t.tier <= tier
                ? `bg-gradient-to-r ${t.color}`
                : 'bg-gray-100'
            }`}
          />
        ))}
      </div>

      {/* Next tier requirements */}
      {nextTier && requirements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">
            Requisitos para {nextTier.badge} {nextTier.name}:
          </p>
          {requirements.map((req, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-sm ${req.met ? 'text-green-500' : 'text-gray-300'}`}>
                  {req.met ? '✅' : '⬜'}
                </span>
                <span className={`text-xs ${req.met ? 'text-gray-700' : 'text-gray-500'}`}>
                  {req.label}
                </span>
              </div>
              <span className="text-xs text-gray-400">{req.detail}</span>
            </div>
          ))}
        </div>
      )}

      {tier === 4 && (
        <p className="text-xs text-purple-600 font-medium text-center">
          🏆 ¡Eres Elite! El nivel más alto en Handy.
        </p>
      )}
    </div>
  );
}
