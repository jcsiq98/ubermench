'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { safetyApi, type EmergencyContact } from '../../../lib/api';

export default function EmergencyContactsPage() {
  const router = useRouter();
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', relation: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadContacts = useCallback(async () => {
    try {
      const data = await safetyApi.getEmergencyContacts();
      setContacts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated) loadContacts();
  }, [isAuthenticated, loadContacts]);

  const handleAdd = async () => {
    if (!form.name || !form.phone) return;
    setSaving(true);
    setError('');
    try {
      await safetyApi.addEmergencyContact({
        name: form.name,
        phone: form.phone,
        relation: form.relation || undefined,
      });
      setForm({ name: '', phone: '', relation: '' });
      setShowAdd(false);
      loadContacts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al agregar');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await safetyApi.removeEmergencyContact(id);
      loadContacts();
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || !isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white px-5 pt-12 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              Contactos de emergencia
            </h1>
            <p className="text-xs text-gray-400">
              Se notificarán cuando actives el botón SOS
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 py-5 space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <>
            {contacts.length === 0 && !showAdd && (
              <div className="text-center py-8">
                <span className="text-4xl block mb-3">🆘</span>
                <p className="text-gray-600 font-medium mb-1">
                  Sin contactos de emergencia
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  Agrega hasta 3 contactos que serán notificados en caso de
                  emergencia
                </p>
              </div>
            )}

            {contacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-white rounded-2xl p-4 border border-gray-100 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-lg">
                  🆘
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-800">
                    {contact.name}
                  </p>
                  <p className="text-xs text-gray-500">{contact.phone}</p>
                  {contact.relation && (
                    <p className="text-xs text-gray-400">{contact.relation}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRemove(contact.id)}
                  className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 text-sm"
                >
                  ×
                </button>
              </div>
            ))}

            {contacts.length < 3 && !showAdd && (
              <button
                onClick={() => setShowAdd(true)}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm active:scale-95 transition-transform"
              >
                + Agregar contacto
              </button>
            )}

            {showAdd && (
              <div className="bg-white rounded-2xl p-5 border border-gray-100 space-y-4">
                <h3 className="font-semibold text-gray-800">
                  Nuevo contacto de emergencia
                </h3>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                <input
                  type="text"
                  placeholder="Nombre"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <input
                  type="tel"
                  placeholder="Teléfono (ej: +5215551234567)"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <input
                  type="text"
                  placeholder="Relación (opcional, ej: Mamá, Pareja)"
                  value={form.relation}
                  onChange={(e) => setForm((f) => ({ ...f, relation: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleAdd}
                    disabled={!form.name || !form.phone || saving}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAdd(false);
                      setForm({ name: '', phone: '', relation: '' });
                    }}
                    className="py-3 px-4 bg-gray-100 text-gray-600 rounded-xl text-sm"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="bg-blue-50 rounded-xl p-4 mt-6">
              <p className="text-xs text-blue-700">
                <strong>Cómo funciona el SOS:</strong> Durante un servicio
                activo, podrás presionar el botón de emergencia. Se enviará tu
                ubicación actual a todos tus contactos de emergencia por
                WhatsApp.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
