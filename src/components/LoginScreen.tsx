import React, { useState, useEffect } from 'react';
import { DatabaseService } from '../dbMock';
import { translations } from '../locales';
import { KeyRound, User, LogIn, Sparkles, Globe, Moon, Sun, X, ShieldAlert } from 'lucide-react';
import { Language, UserRole, Seller } from '../types';
import { db, isFirebaseConfigured } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { FirestoreService } from '../utils/FirestoreService';

interface Props {
  lang: Language;
  setLang: (lang: Language) => void;
  onLogin: (role: UserRole, username: string) => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
  darkMode: boolean;
  setDarkMode: (val: boolean) => void;
  firestoreError?: string | null;
}

export default function LoginScreen({ lang, setLang, onLogin, toast, darkMode, setDarkMode, firestoreError }: Props) {
  const [usernameInput, setUsernameInput] = useState('');
  const [passcodeInput, setPasscodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Pre-fill credentials or auto-login sellers with customized login links (e.g. ?seller=amoumousanae&pass=123456)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uParam = params.get('seller') || params.get('u') || params.get('email') || params.get('username') || params.get('name');
    const pParam = params.get('pass') || params.get('p') || params.get('password');
    if (uParam) {
      setUsernameInput(decodeURIComponent(uParam));
    }
    if (pParam) {
      setPasscodeInput(decodeURIComponent(pParam));
    }
    if (uParam && pParam) {
      const tid = setTimeout(() => {
        const btn = document.getElementById('login-submit-btn');
        if (btn) {
          btn.click();
        }
      }, 500);
      return () => clearTimeout(tid);
    }
  }, []);

  const t = translations[lang];

  // Robust function to convert Arabic/Indic numerals or alternate script numbers to standard digits
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const rawInput = usernameInput.trim().toLowerCase();
    const pInput = passcodeInput.trim();

    let uInput = rawInput;

    // Suffix dynamic formats
    if (!uInput.includes('@')) {
      if (uInput === 'admin' || uInput === 'abdellah' || uInput === 'عبد الله' || uInput === 'عبدالله' || uInput === 'ouaddou') {
        uInput = 'ouaddou.abdellah.topo@gmail.com';
      } else if (uInput) {
        uInput = `${uInput}@gmail.com`;
      }
    }

    try {
      let matchedSeller: Seller | undefined;

      let sellers = DatabaseService.getSellers();

      // Ensure default/seeded records exist first if online
      if (isFirebaseConfigured) {
        await FirestoreService.verifyAndSeedDatabase();
        try {
          const freshSellers = await FirestoreService.getSellersOnce();
          if (freshSellers && freshSellers.length > 0) {
            sellers = freshSellers;
          }
        } catch (fetchErr) {
          console.warn("Failed to fetch fresh sellers directly from Firestore, falling back to cache:", fetchErr);
        }
      }

      // Flexible lookup: Match either against the email, the username, or the name with multiple fallback combinations
      matchedSeller = sellers.find(s => {
        const dbEmail = (s.email || s.username || '').trim().toLowerCase();
        const dbUsername = (s.username || '').trim().toLowerCase();
        const dbName = s.name.trim().toLowerCase();
        
        return (
          dbEmail === uInput || 
          dbUsername === uInput || 
          dbName === uInput ||
          dbEmail === rawInput ||
          dbUsername === rawInput ||
          dbName === rawInput ||
          dbEmail.split('@')[0] === rawInput
        );
      });

      if (!matchedSeller) {
        throw new Error(lang === 'ar' ? 'العضو غير مسجل في قاعدة البيانات!' : 'Utilisateur non répertorié dans la base !');
      }

      if (!matchedSeller.active) {
        toast(lang === 'ar' ? '⚠️ هذا الحساب معطل حالياً من طرف المدير.' : '⚠️ Ce compte est actuellement désactivé.', 'error');
        setIsLoading(false);
        return;
      }

      const loginEmail = matchedSeller.email || uInput;
      console.log('LOGIN EMAIL=', loginEmail);

      // Secure and immediate password check using the password stored right inside the Firestore collection
      // Strict matching is now enforced with the actual password stored in Firestore.
      // Default / fallback passes and backdoor developer passcodes ('123', '123456', 'admin') have been fully disabled.
      const storedPassword = matchedSeller.password ? matchedSeller.password.trim() : '';
      const enteredPassword = pInput.trim();

      const isMatch = enteredPassword === storedPassword && storedPassword !== '';

      if (!isMatch) {
        throw new Error(lang === 'ar'
          ? `كلمة المرور غير صحيحة للحساب: [ ${loginEmail} ]. يرجى إدخال كلمة المرور المسجلة بشكل صحيح في لوحة التحكم.`
          : `Mot de passe incorrect pour le compte [ ${loginEmail} ].`
        );
      }

      const assignedRole = matchedSeller.role || 'SELLER';
      onLogin(assignedRole, matchedSeller.name);
      
      let successMsg = '';
      if (assignedRole === 'ADMIN') {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك المدير العام: ${matchedSeller.name}`
          : `✅ Connexion réussie en tant que Directeur : ${matchedSeller.name}`;
      } else if (assignedRole === 'DEPUTY') {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك نائب المدير: ${matchedSeller.name}`
          : `✅ Connexion réussie en tant que d'adjoint : ${matchedSeller.name}`;
      } else if (assignedRole === 'SUPERVISOR') {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك المشرف المعتمد: ${matchedSeller.name}`
          : `✅ Connexion réussie en tant que Superviseur : ${matchedSeller.name}`;
      } else {
        successMsg = lang === 'ar'
          ? `✅ تم تسجيل الدخول بنجاح بصفتك البائع: ${matchedSeller.name}`
          : `✅ Connexion réussie en tant que vendeur : ${matchedSeller.name}`;
      }
      
      toast(successMsg, 'success');
    } catch (err: any) {
      console.error('Login error details:', err);
      let errMsg = lang === 'ar' ? '❌ فشل تسجيل الدخول. يرجى مراجعة البيانات.' : '❌ Identifiants invalides ou erreur de connexion.';
      if (err.message && (err.message.includes('password') || err.message.includes('العضو') || err.message.includes('كلمة'))) {
        errMsg = `❌ ${err.message}`;
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
            className="cursor-pointer p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs flex items-center gap-1.5 text-xs font-bold"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'Fr' : 'عربي'}</span>
          </button>
          {/* Dark Mode */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="cursor-pointer p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-355 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Login Card Form */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-6 md:p-8 shadow-xl z-10 transition-colors duration-250">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight leading-normal">
            {lang === 'ar' ? '🔒 بوابة تسجيل الدخول الآمن' : '🔒 Portail de Connexion'}
          </h1>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1.5">
            {lang === 'ar' 
              ? 'أدخل البريد الإلكتروني (أو اسم المستخدم) وكلمة مرور حسابك للولوج.'
              : 'Saisissez vos identifiants Firebase pour accéder à votre espace.'
            }
          </p>
        </div>

        {firestoreError && (
          <div className="mb-4 p-3 bg-red-55 dark:bg-red-955/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-red-605 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1 text-xs text-start">
              <p className="font-extrabold text-red-800 dark:text-red-300">
                {lang === 'ar' ? '⚠️ خطأ في الاتصال بالسحابة (Firestore)' : '⚠️ Erreur de connexion Firestore'}
              </p>
              <p className="text-[11px] text-red-650 dark:text-red-400 font-bold mt-1 leading-relaxed">
                {firestoreError}
              </p>
              <div className="mt-2 text-[10px] space-y-1.5 text-slate-500 dark:text-slate-450 leading-normal font-semibold">
                <p className="font-bold text-red-700 dark:text-red-300">💡 {lang === 'ar' ? 'السبب المحتمل والحلول:' : 'Origines & solutions possibles :'}</p>
                <ul className="list-disc list-inside space-y-1">
                  {lang === 'ar' ? (
                    <>
                      <li>أدخلت متغيرات بيئة خاطئة أو بها علامات اقتباس مزدوجة في Vercel.</li>
                      <li>قواعد حماية Firestore تمنع الوصول. تأكد من تفعيل <code className="bg-slate-100 dark:bg-slate-850 px-1 py-0.5 rounded text-[9px] font-mono text-rose-600">allow read, write: if true;</code> مؤقتاً للتجربة.</li>
                    </>
                  ) : (
                    <>
                      <li>Les variables d’environnement saisies sur Vercel contiennent des guillemets.</li>
                      <li>Les règles Firestore bloquent l’accès. Activez temporairement <code className="bg-slate-100 dark:bg-slate-850 px-1 py-0.5 rounded text-[9px] font-mono text-rose-600">allow read, write: if true;</code> pour tester.</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {/* Email / Username Input */}
          <div>
            <label className="block text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              📧 {lang === 'ar' ? 'البريد الإلكتروني أو اسم المستخدم' : "Adresse Email ou Nom d'utilisateur"}
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
                placeholder={lang === 'ar' ? 'مثال: abdellah أو ahmed@gmail.com' : 'Ex: abdellah ou ahmed@gmail.com'}
                className="w-full text-sm bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-3 ps-11 pe-4 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600 placeholder-slate-400 dark:placeholder-slate-500 font-mono transition"
              />
            </div>
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
              🔑 {lang === 'ar' ? 'كلمة المرور' : 'Mot de passe sécurisé'}
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400 pointer-events-none">
                <KeyRound className="w-4 h-4" />
              </span>
              <input
                id="login-passcode"
                type="password"
                required
                value={passcodeInput}
                onChange={e => setPasscodeInput(e.target.value)}
                placeholder="••••••"
                className="w-full text-center tracking-widest text-sm bg-slate-50/50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl py-3 ps-11 pe-4 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-600 placeholder-slate-400 font-mono transition"
              />
            </div>
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
        </form>
      </div>

      {/* Footer Branding display */}
      <span className="text-[10px] font-black tracking-wider text-slate-400 dark:text-slate-600 mt-6 block uppercase">
        ⚡ Smart CRM Dashboard • Secure System
      </span>
    </div>
  );
}
