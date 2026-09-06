import React, { useState, useEffect } from 'react';
import { DatabaseService } from '../dbMock';
import { translations } from '../locales';
import { KeyRound, User, LogIn, Sparkles, Globe, Moon, Sun, X, ShieldAlert, Eye, EyeOff, ShieldCheck, RefreshCw, Mail } from 'lucide-react';
import { Language, UserRole, Seller } from '../types';
import { AuthService } from '../utils/AuthService';
import { isFirebaseConfigured } from '../firebase';

interface Props {
  lang: Language;
  setLang: (lang: Language) => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  firestoreError?: string | null;
}

// Helper to convert Arabic/Indic or Persian numerals to standard Western digits
function normalizeDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
}

export default function LoginScreen({ lang, setLang, toast, darkMode, setDarkMode, firestoreError }: Props) {
  const [usernameInput, setUsernameInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Forgot / Reset Password state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetAccount, setResetAccount] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Pre-fill username/email from non-sensitive deep-link parameter (e.g. ?seller=abdellah or ?email=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uParam = params.get('seller') || params.get('u') || params.get('email') || params.get('username') || params.get('name');
    if (uParam) {
      setUsernameInput(decodeURIComponent(uParam));
    }
  }, []);

  const t = translations[lang];

  // Quick Account Selection for Ouaddou Abdellah (Owner) - Prompts for authenticated password
  const handleQuickAdminLogin = async () => {
    const adminEmail = 'ouaddou.abdellah.topo@gmail.com';
    setUsernameInput(adminEmail);
    const cleanPass = normalizeDigits(passcodeInput).trim();

    if (!cleanPass) {
      toast(
        lang === 'ar'
          ? 'يرجى إدخال كلمة المرور الخاصة بحساب المدير العام للمتابعة.'
          : 'Veuillez saisir votre mot de passe pour le compte Administrateur.',
        'info'
      );
      document.getElementById('login-passcode')?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const { seller } = await AuthService.signIn(adminEmail, cleanPass);
      toast(
        lang === 'ar'
          ? `✅ مرحباً بك يا مدير عام: ${seller.name}`
          : `✅ Bienvenue Directeur : ${seller.name}`,
        'success'
      );
    } catch (err: any) {
      console.warn('Quick login error:', err);
      let errMsg = lang === 'ar'
        ? '❌ فشل تسجيل الدخول. يرجى التأكد من صحة كلمة المرور.'
        : '❌ Échec de connexion. Veuillez vérifier votre mot de passe.';
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        errMsg = lang === 'ar'
          ? '❌ كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور أو استخدام "نسيت كلمة المرور".'
          : '❌ Mot de passe incorrect.';
      }
      toast(errMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password reset via Firebase Authentication
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAccount = normalizeDigits(resetAccount).trim().toLowerCase();

    if (!cleanAccount) {
      toast(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني' : 'Veuillez saisir l\'email ou nom d\'utilisateur', 'error');
      return;
    }

    setIsResetting(true);
    try {
      await AuthService.sendPasswordReset(cleanAccount);
      toast(
        lang === 'ar'
          ? '✅ تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح. يرجى مراجعة صندوق الوارد.'
          : '✅ Un lien de réinitialisation du mot de passe a été envoyé par email avec succès.',
        'success'
      );
      setShowResetModal(false);
    } catch (err: any) {
      console.error('Password reset error:', err);
      let msg = lang === 'ar' ? '❌ فشل إرسال رابط الاستعادة. تأكد من صحة البريد الإلكتروني.' : '❌ Échec de la réinitialisation.';
      if (err?.code === 'auth/user-not-found') {
        msg = lang === 'ar' ? '❌ الحساب غير مسجل في Firebase Auth.' : '❌ Compte non trouvé dans Firebase Auth.';
      }
      toast(msg, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Main Login Form Submission via Firebase Authentication
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const rawInput = normalizeDigits(usernameInput).trim();
    const pInput = normalizeDigits(passcodeInput).trim();

    if (!rawInput) {
      toast(lang === 'ar' ? 'يرجى إدخال البريد الإلكتروني' : 'Veuillez saisir l\'identifiant', 'error');
      setIsLoading(false);
      return;
    }
    if (!pInput) {
      toast(lang === 'ar' ? 'يرجى إدخال كلمة المرور' : 'Veuillez saisir le mot de passe', 'error');
      setIsLoading(false);
      return;
    }

    try {
      const { seller } = await AuthService.signIn(rawInput, pInput);

      if (seller.active === false) {
        await AuthService.signOut();
        throw new Error(lang === 'ar' ? '⚠️ هذا الحساب معطل حالياً من طرف المدير.' : '⚠️ Ce compte est actuellement désactivé.');
      }

      const assignedRole = seller.role || 'SELLER';

      let successMsg = '';
      if (assignedRole === 'ADMIN') {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك المدير العام: ${seller.name}`
          : `✅ Connexion réussie en tant que Directeur : ${seller.name}`;
      } else if (assignedRole === 'DEPUTY') {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك نائب المدير: ${seller.name}`
          : `✅ Connexion réussie en tant que d'adjoint : ${seller.name}`;
      } else if (assignedRole === 'SUPERVISOR') {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك المشرف المعتمد: ${seller.name}`
          : `✅ Connexion réussie en tant que Superviseur : ${seller.name}`;
      } else {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك البائع: ${seller.name}`
          : `✅ Connexion réussie en tant que vendeur : ${seller.name}`;
      }

      toast(successMsg, 'success');
    } catch (err: any) {
      console.warn('Login error details:', err);
      let errMsg = lang === 'ar' ? '❌ فشل تسجيل الدخول. يرجى مراجعة البيانات.' : '❌ Identifiants invalides ou erreur de connexion.';

      const code = err?.code;
      if (code === 'auth/user-not-found') {
        errMsg = lang === 'ar' ? '❌ الحساب غير مسجل في النظام.' : '❌ Compte non répertorié.';
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        errMsg = lang === 'ar' ? '❌ كلمة المرور غير صحيحة. يرجى التأكد من كلمة المرور أو استخدام "نسيت كلمة المرور".' : '❌ Mot de passe incorrect.';
      } else if (code === 'auth/missing-password') {
        errMsg = lang === 'ar' ? '❌ يرجى إدخال كلمة المرور للمتابعة.' : '❌ Veuillez saisir le mot de passe.';
      } else if (code === 'auth/too-many-requests') {
        errMsg = lang === 'ar' ? '⚠️ تم تجميد تسجيل الدخول مؤقتاً بسبب كثرة المحاولات. يرجى المحاولة لاحقاً.' : '⚠️ Trop de tentatives. Veuillez réessayer plus tard.';
      } else if (err.message && (err.message.includes('معطل') || err.message.includes('désactivé') || err.message.includes('غير مسجل'))) {
        errMsg = err.message;
      }

      toast(errMsg, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden transition-colors duration-200 font-sans">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-400/10 dark:bg-blue-900/10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-400/10 dark:bg-indigo-900/10 blur-3xl pointer-events-none"></div>

      {/* Top Header Navigation */}
      <div className="w-full max-w-md flex justify-between items-center mb-6 z-10">
        {/* Brand Display */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <span className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider">
            Smart CRM
          </span>
        </div>

        {/* Adjust Controls */}
        <div className="flex items-center gap-2">
          {/* Lang */}
          <button
            onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}
            className="cursor-pointer p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-xs flex items-center gap-1.5 text-xs font-bold"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'Fr' : 'عربي'}</span>
          </button>
          {/* Dark Mode */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="cursor-pointer p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-xs"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Login Card Form */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl z-10 transition-colors duration-250">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-normal">
            {lang === 'ar' ? '🔒 بوابة تسجيل الدخول الآمن' : '🔒 Portail de Connexion'}
          </h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1.5">
            {lang === 'ar'
              ? 'أدخل البريد الإلكتروني وكلمة مرور حسابك للولوج.'
              : 'Saisissez vos identifiants pour accéder à votre espace.'
            }
          </p>
        </div>

        {firestoreError && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs text-start">
              <p className="font-extrabold text-red-800 dark:text-red-300">
                {lang === 'ar' ? '⚠️ خطأ في الاتصال بالسحابة (Firestore)' : '⚠️ Erreur de connexion Firestore'}
              </p>
              <p className="text-[11px] text-red-600 dark:text-red-400 font-bold mt-1 leading-relaxed">
                {firestoreError}
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Email Input */}
          <div>
            <label className="block text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              📧 {lang === 'ar' ? 'البريد الإلكتروني' : 'Adresse Email'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </span>
              <input
                id="login-username"
                type="text"
                required
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                placeholder={lang === 'ar' ? 'مثال: abdellah أو ouaddou.abdellah.topo@gmail.com' : 'Ex: abdellah ou ouaddou.abdellah.topo@gmail.com'}
                className="w-full text-sm bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-3 ps-11 pe-4 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600 placeholder-slate-400 dark:placeholder-slate-500 font-mono transition"
              />
            </div>
          </div>

          {/* Password Input with show/hide toggle */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                🔑 {lang === 'ar' ? 'كلمة المرور' : 'Mot de passe sécurisé'}
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetAccount(usernameInput || 'ouaddou.abdellah.topo@gmail.com');
                  setShowResetModal(true);
                }}
                className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                {lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Mot de passe oublié ?'}
              </button>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400 pointer-events-none">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                id="login-passcode"
                type={showPassword ? 'text' : 'password'}
                required
                value={passcodeInput}
                onChange={e => setPasscodeInput(e.target.value)}
                placeholder={lang === 'ar' ? 'كلمة المرور الخاصة بك' : 'Votre mot de passe'}
                className="w-full text-center tracking-widest text-sm bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-3 ps-11 pe-11 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600 placeholder-slate-400 font-mono transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {isFirebaseConfigured ? (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 text-start font-medium flex items-center gap-1">
                🔒 {lang === 'ar' ? 'مصادقة مشفرة عبر Firebase Authentication' : 'Authentification chiffrée via Firebase Auth'}
              </p>
            ) : (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5 text-start font-medium flex items-center gap-1">
                ⚡ {lang === 'ar' ? 'المصادقة نشطة ومباشرة (الوضع المحلي المتكامل)' : 'Authentification active (Mode local opérationnel)'}
              </p>
            )}
          </div>

          {/* Login Action Button */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={isLoading}
            className={`w-full cursor-pointer bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl py-3 text-sm font-black flex items-center justify-center gap-2 shadow-md transition-all ${
              isLoading ? 'opacity-80 cursor-wait' : 'hover:scale-[1.01]'
            }`}
          >
            {isLoading ? (
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
            ) : (
              <>
                <LogIn className="w-4 h-4 shrink-0" />
                <span>{lang === 'ar' ? 'ولوج آمن وحماية البيانات' : 'Connexion Sécurisée'}</span>
              </>
            )}
          </button>

          {/* One-Click Direct Admin Quick Login */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <button
              type="button"
              onClick={handleQuickAdminLogin}
              disabled={isLoading}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                {!isFirebaseConfigured
                  ? (lang === 'ar' ? '⚡ الدخول المباشر كمدير عام (Abdellah)' : '⚡ Connexion directe Directeur (Abdellah)')
                  : (lang === 'ar' ? '⚡ تحديد حساب المدير العام (Abdellah)' : '⚡ Sélectionner le compte Directeur (Abdellah)')}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* Forgot / Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
                  {lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Réinitialiser le mot de passe'}
                </h3>
              </div>
              <button
                onClick={() => setShowResetModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-start">
              {lang === 'ar'
                ? 'أدخل البريد الإلكتروني لتلقي رابط إعادة تعيين كلمة المرور الآمن عبر Firebase Authentication.'
                : 'Saisissez votre email ou nom d\'utilisateur pour recevoir un lien sécurisé de réinitialisation via Firebase Auth.'}
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3 text-start">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                  📧 {lang === 'ar' ? 'البريد الإلكتروني أو اسم المستخدم' : 'Email ou Nom d\'utilisateur'}
                </label>
                <input
                  type="text"
                  required
                  value={resetAccount}
                  onChange={e => setResetAccount(e.target.value)}
                  placeholder="ouaddou.abdellah.topo@gmail.com"
                  className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {lang === 'ar' ? 'إلغاء' : 'Annuler'}
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition"
                >
                  {isResetting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5" />
                      <span>{lang === 'ar' ? 'إرسال رابط الاستعادة' : 'Envoyer le lien'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer Branding display */}
      <span className="text-[10px] font-black tracking-wider text-slate-400 dark:text-slate-600 mt-6 block uppercase">
        ⚡ Smart CRM Dashboard • Secure System
      </span>
    </div>
  );
}
