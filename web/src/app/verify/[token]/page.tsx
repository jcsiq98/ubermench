'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_BASE =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api';

type VerificationStep = 'loading' | 'verify' | 'ine-front' | 'ine-back' | 'selfie' | 'liveness' | 'uploading' | 'success' | 'error';

interface ApplicationInfo {
  applicationId: string;
  phone: string;
  name: string | null;
}

export default function VerifyPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [step, setStep] = useState<VerificationStep>('loading');
  const [appInfo, setAppInfo] = useState<ApplicationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{
    ineFront: File | null;
    ineBack: File | null;
    selfie: File | null;
  }>({
    ineFront: null,
    ineBack: null,
    selfie: null,
  });
  const [previews, setPreviews] = useState<{
    ineFront: string | null;
    ineBack: string | null;
    selfie: string | null;
  }>({
    ineFront: null,
    ineBack: null,
    selfie: null,
  });
  const [livenessCompleted, setLivenessCompleted] = useState(false);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setError('Token no válido');
      setStep('error');
      return;
    }

    fetch(`${API_BASE}/onboarding/verify/${token}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('Token inválido o expirado');
        }
        return res.json();
      })
      .then((data) => {
        setAppInfo(data);
        setStep('verify');
      })
      .catch((err) => {
        setError(err.message || 'Error al verificar el token');
        setStep('error');
      });
  }, [token]);

  const handleFileSelect = (
    type: 'ineFront' | 'ineBack' | 'selfie',
    file: File | null,
  ) => {
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Solo se permiten archivos de imagen');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo es demasiado grande (máximo 5MB)');
      return;
    }

    setPhotos((prev) => ({ ...prev, [type]: file }));

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviews((prev) => ({
        ...prev,
        [type]: e.target?.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const capturePhoto = async (type: 'ineFront' | 'ineBack' | 'selfie') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: type === 'selfie' ? 'user' : 'environment' },
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Show video in a modal or overlay
      const container = document.createElement('div');
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.9);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 20px;
      `;

      const videoEl = document.createElement('video');
      videoEl.srcObject = stream;
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.style.cssText = 'max-width: 90vw; max-height: 60vh; border-radius: 8px;';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 10px;';

      const captureBtn = document.createElement('button');
      captureBtn.textContent = '📸 Capturar';
      captureBtn.style.cssText = `
        padding: 12px 24px;
        background: #10b981;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.cssText = `
        padding: 12px 24px;
        background: #6b7280;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
      cursor: pointer;
      `;

      captureBtn.onclick = () => {
        const canvas = document.createElement('canvas');
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoEl, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `photo-${type}.jpg`, {
              type: 'image/jpeg',
            });
            handleFileSelect(type, file);
          }
        }, 'image/jpeg', 0.9);

        stream.getTracks().forEach((track) => track.stop());
        document.body.removeChild(container);
      };

      cancelBtn.onclick = () => {
        stream.getTracks().forEach((track) => track.stop());
        document.body.removeChild(container);
      };

      buttonContainer.appendChild(captureBtn);
      buttonContainer.appendChild(cancelBtn);
      container.appendChild(videoEl);
      container.appendChild(buttonContainer);
      document.body.appendChild(container);
    } catch (err) {
      setError('No se pudo acceder a la cámara. Por favor, permite el acceso.');
    }
  };

  const handleUpload = async () => {
    if (!photos.ineFront || !photos.ineBack || !photos.selfie) {
      setError('Por favor, sube las 3 fotos requeridas');
      return;
    }

    setStep('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('ineFront', photos.ineFront);
      formData.append('ineBack', photos.ineBack);
      formData.append('selfie', photos.selfie);

      const res = await fetch(`${API_BASE}/onboarding/verify/${token}/photos`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al subir las fotos');
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Error al subir las fotos');
      setStep('error');
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verificando token...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Error de verificación
          </h1>
          <p className="text-gray-600 mb-6">{error || 'Token inválido o expirado'}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            ¡Fotos enviadas!
          </h1>
          <p className="text-gray-600 mb-6">
            Hemos recibido tus documentos correctamente. Tu solicitud está en
            revisión y te notificaremos cuando sea aprobada (24-48 horas).
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Verificación de identidad
        </h1>
        {appInfo && (
          <p className="text-gray-600 mb-6">
            Hola <strong>{appInfo.name || appInfo.phone}</strong>, necesitamos
            verificar tu identidad para completar tu registro.
          </p>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Paso {step === 'verify' ? '1' : step === 'ine-front' ? '2' : step === 'ine-back' ? '3' : step === 'selfie' ? '4' : '5'} de 5
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${
                  step === 'verify'
                    ? 20
                    : step === 'ine-front'
                    ? 40
                    : step === 'ine-back'
                    ? 60
                    : step === 'selfie'
                    ? 80
                    : 100
                }%`,
              }}
            ></div>
          </div>
        </div>

        {/* Verification steps */}
        {step === 'verify' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h2 className="font-semibold text-blue-900 mb-2">
                📋 Instrucciones
              </h2>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Foto del frente de tu INE</li>
                <li>Foto del reverso de tu INE</li>
                <li>Una selfie mirando a la cámara</li>
              </ul>
            </div>
            <button
              onClick={() => setStep('ine-front')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
            >
              Comenzar verificación
            </button>
          </div>
        )}

        {step === 'ine-front' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              📄 Paso 1: INE (Frente)
            </h2>
            <p className="text-sm text-gray-600">
              Toma una foto clara del frente de tu INE. Asegúrate de que toda
              la información sea legible.
            </p>
            {previews.ineFront ? (
              <div className="space-y-2">
                <img
                  src={previews.ineFront}
                  alt="INE Frente"
                  className="w-full rounded-lg border border-gray-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => capturePhoto('ineFront')}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300"
                  >
                    📸 Tomar otra foto
                  </button>
                  <button
                    onClick={() => setStep('ine-back')}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => capturePhoto('ineFront')}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                >
                  📸 Tomar foto con cámara
                </button>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      handleFileSelect('ineFront', e.target.files?.[0] || null)
                    }
                    className="hidden"
                  />
                  <span className="block w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-medium text-center cursor-pointer hover:bg-gray-300">
                    📁 Seleccionar desde galería
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {step === 'ine-back' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              📄 Paso 2: INE (Reverso)
            </h2>
            <p className="text-sm text-gray-600">
              Ahora toma una foto del reverso de tu INE.
            </p>
            {previews.ineBack ? (
              <div className="space-y-2">
                <img
                  src={previews.ineBack}
                  alt="INE Reverso"
                  className="w-full rounded-lg border border-gray-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => capturePhoto('ineBack')}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300"
                  >
                    📸 Tomar otra foto
                  </button>
                  <button
                    onClick={() => setStep('selfie')}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => capturePhoto('ineBack')}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                >
                  📸 Tomar foto con cámara
                </button>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) =>
                      handleFileSelect('ineBack', e.target.files?.[0] || null)
                    }
                    className="hidden"
                  />
                  <span className="block w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-medium text-center cursor-pointer hover:bg-gray-300">
                    📁 Seleccionar desde galería
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {step === 'selfie' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              📸 Paso 3: Selfie
            </h2>
            <p className="text-sm text-gray-600">
              Tómate una selfie mirando directamente a la cámara. Asegúrate de
              que tu rostro esté bien iluminado y visible.
            </p>
            {previews.selfie ? (
              <div className="space-y-2">
                <img
                  src={previews.selfie}
                  alt="Selfie"
                  className="w-full rounded-lg border border-gray-300"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => capturePhoto('selfie')}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300"
                  >
                    📸 Tomar otra foto
                  </button>
                  <button
                    onClick={() => setStep('liveness')}
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
                  >
                    Continuar →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => capturePhoto('selfie')}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                >
                  📸 Tomar selfie con cámara
                </button>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={(e) =>
                      handleFileSelect('selfie', e.target.files?.[0] || null)
                    }
                    className="hidden"
                  />
                  <span className="block w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-medium text-center cursor-pointer hover:bg-gray-300">
                    📁 Seleccionar desde galería
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {step === 'liveness' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              👁️ Paso 4: Verificación de vida (Liveness)
            </h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800 mb-3">
                Para asegurarnos de que eres una persona real, por favor sigue
                estas instrucciones:
              </p>
              <ol className="text-sm text-yellow-800 space-y-2 list-decimal list-inside">
                <li>Mira directamente a la cámara</li>
                <li>Parpadea 2 veces lentamente</li>
                <li>Gira tu cabeza suavemente hacia la derecha y luego hacia la izquierda</li>
              </ol>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep('selfie')}
                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-medium hover:bg-gray-300"
              >
                ← Volver
              </button>
              <button
                onClick={() => {
                  setLivenessCompleted(true);
                  handleUpload();
                }}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700"
              >
                ✅ Confirmar y enviar
              </button>
            </div>
          </div>
        )}

        {step === 'uploading' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Subiendo fotos...</p>
          </div>
        )}
      </div>
    </div>
  );
}

