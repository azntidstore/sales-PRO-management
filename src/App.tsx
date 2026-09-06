import { useState, useEffect, useRef } from 'react';
import { DatabaseService } from './dbMock';
import { Order, Language, UserRole, AuthStatus, WorkspaceRole } from './types';
import { translations } from './locales';
import { FirestoreService } from './utils/FirestoreService';
import { AuthService } from './utils/AuthService';
import { isFirebaseConfigured } from './firebase';
import { findSellerByName, isSameSellerName } from './utils/sellerUtils';

import SellersManager from './components/SellersManager';
import ProductsManager from './components/ProductsManager';
import OrderFormModal from './components/OrderFormModal';
import OrdersTable from './components/OrdersTable';
import Dashboard from './components/Dashboard';
import LoginScreen from './components/LoginScreen';
import appLogo from './assets/images/app_logo_1781856830506.jpg';

import {
  LayoutDashboard,
  ShoppingCart,
  Tag,
  Users,
  Globe,
  User,
  Shield,
  Eye,
  Sun,
  Moon,
  AlertCircle,
  X,
  Plus,
  LogOut,
  Bell
} from 'lucide-react';

interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  // Locale state
  const [lang, setLang] = useState<Language>('ar');
  const t = translations[lang];

  // Dark/Light State
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // active tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'products' | 'sellers'>('dashboard');

  // Firebase Authentication Source of Truth
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  // In-memory User Session (Derived authoritatively from authenticated Firebase UID)
  const [userRole, setUserRole] = useState<UserRole>('SELLER');
  const [currentUser, setCurrentUser] = useState<string>('');
  const [currentSellerId, setCurrentSellerId] = useState<string>('');
  const [currentSellerRecord, setCurrentSellerRecord] = useState<import('./types').Seller | null>(null);
  // S5-D-C-E1: one Firebase UID may declare multiple role contexts.
  // The active workspace is session/UI state only and must not be used as an authorization source.
  const [availableWorkspaces, setAvailableWorkspaces] = useState<WorkspaceRole[]>(['SELLER']);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceRole>('SELLER');
  const [workspaceReady, setWorkspaceReady] = useState<boolean>(false);
  const [workspaceSwitching, setWorkspaceSwitching] = useState<boolean>(false);

  // Source of Truth: Listen strictly to Firebase Authentication State
  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChanged(async (user) => {
      if (!user) {
        setIsLoggedIn(false);
        setUserRole('SELLER');
        setAvailableWorkspaces(['SELLER']);
        setActiveWorkspace('SELLER');
        setCurrentUser('');
        setCurrentSellerId('');
        setCurrentSellerRecord(null);
        setWorkspaceReady(false);
        setAvailableWorkspaces(['SELLER']);
        setActiveWorkspace('SELLER');
        setAuthStatus('unauthenticated');
        return;
      }

      try {
        const profile = await AuthService.fetchSellerProfile(user.uid, user.email || undefined);
        if (profile) {
          if (profile.active === false) {
            await AuthService.signOut();
            setIsLoggedIn(false);
            setUserRole('SELLER');
            setCurrentUser('');
            setCurrentSellerId('');
            setCurrentSellerRecord(null);
            setWorkspaceReady(false);
            setAuthStatus('unauthenticated');
            addToast(lang === 'ar' ? '⚠️ هذا الحساب معطل حالياً من طرف المدير.' : '⚠️ Ce compte est désactivé.', 'error');
            return;
          }
          const primaryRole = (profile.role || 'SELLER') as WorkspaceRole;
          const declaredRoles = Array.isArray(profile.roles) ? profile.roles : [primaryRole];
          const workspaces = Array.from(new Set<WorkspaceRole>([primaryRole, ...declaredRoles]));
          setAvailableWorkspaces(workspaces);
          setActiveWorkspace(primaryRole);
          setUserRole(primaryRole);
          setCurrentUser(profile.name);
          setCurrentSellerId(profile.id || '');
          setCurrentSellerRecord(profile);
          setWorkspaceReady(workspaces.length <= 1);
          setIsLoggedIn(true);
          setAuthStatus('authenticated');
        } else {
          // No seller profile found matching this authenticated Firebase UID - fail safely
          await AuthService.signOut();
          setIsLoggedIn(false);
          setUserRole('SELLER');
          setCurrentUser('');
          setCurrentSellerId('');
          setCurrentSellerRecord(null);
          setWorkspaceReady(false);
          setAuthStatus('unauthenticated');
          addToast(
            lang === 'ar'
              ? '❌ تم التحقق من الحساب ولكن لا يوجد ملف بائع مطابق في النظام.'
              : '❌ Compte authentifié mais aucun profil vendeur associé trouvé.',
            'error'
          );
        }
      } catch (err: any) {
        console.error('Error resolving profile during auth state change:', err);
        await AuthService.signOut();
        setIsLoggedIn(false);
        setUserRole('SELLER');
        setAvailableWorkspaces(['SELLER']);
        setActiveWorkspace('SELLER');
        setCurrentUser('');
        setCurrentSellerId('');
        setCurrentSellerRecord(null);
        setWorkspaceReady(false);
        setAuthStatus('unauthenticated');
        addToast(
          lang === 'ar'
            ? '❌ حدث خطأ أثناء تحميل بيانات الملف الشخصي.'
            : '❌ Erreur lors du chargement du profil.',
          'error'
        );
      }
    });

    return () => unsubscribe();
  }, [lang]);

  // Master Data Refresh Trigger
  const [dataTrigger, setDataTrigger] = useState(0);

  // Order modal state
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedEditingOrder, setSelectedEditingOrder] = useState<Order | null>(null);

  // Dynamic Toast alerts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Card filter navigation state
  const [initialStatusFilter, setInitialStatusFilter] = useState<string | null>(null);

  // Profile dropdown visibility
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsub = FirestoreService.onConnectionError((err) => {
      setFirestoreError(err);
    });
    return () => unsub();
  }, []);

  const rawOrders = DatabaseService.getOrders();
  const rawSellers = DatabaseService.getSellers();
  const currentSellerProfile = rawSellers.find(s => s.id === currentSellerId) || currentSellerRecord || findSellerByName(rawSellers, currentUser);

  // PHASE S2: Firestore listeners start only after Firebase Auth and the
  // UID-keyed authorization profile have been verified. This prevents an
  // unauthenticated startup read from bypassing the new Firestore rules.
  useEffect(() => {
    if (!isLoggedIn || authStatus !== 'authenticated' || !workspaceReady) return;

    DatabaseService.initialize(activeWorkspace)
      .then(async () => {
        try {
          const syncResult = await DatabaseService.synchronizeOrders();
          console.log('[ORDER FULL SYNC] Completed:', syncResult);
        } catch (syncError) {
          console.error('[ORDER FULL SYNC] Failed:', syncError);
        }

        try {
          const cacheCount = await DatabaseService.loadOrderCacheIntoMemory();
          console.log('[ORDER CACHE] Loaded from IndexedDB:', cacheCount);
        } catch (cacheError) {
          console.error('[ORDER CACHE] Failed to load IndexedDB cache:', cacheError);
        }

        refreshAllData();
      })
      .catch((err) => {
        console.error('Failed to initialize authorized system database:', err);
      });
  }, [isLoggedIn, authStatus, workspaceReady, activeWorkspace]);

  // Configure DOM element classes for RTL and theme support on mounting & change state
  useEffect(() => {
    const html = document.documentElement;
    html.dir = lang === 'ar' ? 'rtl' : 'ltr';
    html.lang = lang;
  }, [lang]);

  useEffect(() => {
    const html = document.documentElement;
    if (darkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [darkMode]);

  // Handle real-time database cache updates
  useEffect(() => {
    DatabaseService.onDataUpdated(() => {
      refreshAllData();
    });
  }, []);

  const addToast = (message: string, type: 'success' | 'error' | 'info') => {
    const id = 'toast_' + Date.now() + Math.random().toString(36).substring(2, 4);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleWorkspaceSwitch = async (nextRole: WorkspaceRole) => {
    if (nextRole === activeWorkspace || !availableWorkspaces.includes(nextRole)) return;
    setWorkspaceSwitching(true);
    setIsProfileOpen(false);
    setInitialStatusFilter(null);
    setSelectedEditingOrder(null);
    setIsOrderModalOpen(false);
    try {
      // E3: switch the scoped Firebase listeners before exposing the new workspace.
      // The same Firebase Auth UID/session is retained; workspace is UI/session state only.
      setWorkspaceReady(false);
      await DatabaseService.switchWorkspace(nextRole);
      setActiveWorkspace(nextRole);
      setWorkspaceReady(true);
      setDataTrigger(prev => prev + 1);
      addToast(
        lang === 'ar'
          ? `تم التبديل إلى مساحة ${nextRole === 'SUPERVISOR' ? 'المشرف' : 'البائع'} دون تسجيل الخروج.`
          : `Espace ${nextRole === 'SUPERVISOR' ? 'Superviseur' : 'Vendeur'} activé sans déconnexion.`,
        'success'
      );
    } catch (err) {
      console.error('Workspace switch failed:', err);
      addToast(
        lang === 'ar' ? 'تعذر تبديل مساحة العمل. لم يتم تغيير الجلسة.' : 'Impossible de changer d’espace. La session reste inchangée.',
        'error'
      );
    } finally {
      setWorkspaceSwitching(false);
    }
  };

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    setIsLoggedIn(false);
    setUserRole('SELLER');
    setCurrentUser('');
    setCurrentSellerId('');
    setCurrentSellerRecord(null);
    setWorkspaceReady(false);
    setAvailableWorkspaces(['SELLER']);
    setActiveWorkspace('SELLER');
    setAuthStatus('unauthenticated');
    addToast(
      lang === 'ar' ? '🔒 تم تسجيل الخروج بنجاح.' : '🔒 Déconnecté avec succès.',
      'info'
    );
  };

  // Callback to refresh database state across all components
  const refreshAllData = () => {
    setDataTrigger(prev => prev + 1);
  };

  // Launch order creation form
  const initAddOrder = () => {
    setSelectedEditingOrder(null);
    setIsOrderModalOpen(true);
  };

  // Launch edit order form
  const initEditOrder = (order: Order) => {
    setSelectedEditingOrder(order);
    setIsOrderModalOpen(true);
  };



  let orders = rawOrders;
  if (userRole === 'SELLER') {
    orders = rawOrders.filter(o => isSameSellerName(o.sellerName, currentUser));
  } else if (userRole === 'SUPERVISOR') {
    if (!currentSellerProfile) {
      orders = rawOrders.filter(o => isSameSellerName(o.sellerName, currentUser));
    } else {
      const childSellers = rawSellers.filter(s => 
        s.parentId === currentSellerProfile.id || 
        (s.parentIds && s.parentIds.includes(currentSellerProfile.id))
      );
      
      const isChildSellerName = (nameStr: string) => {
        return childSellers.some(s => isSameSellerName(s.name, nameStr));
      };

      // Multi-supervisor product assignment matching logic
      const isProductMatching = (orderProductStr: string, assigned: string[] | undefined) => {
        if (!assigned || assigned.length === 0) return true;
        if (assigned.includes(orderProductStr)) return true;
        const matchedProd = DatabaseService.getProducts().find(p => p.id === orderProductStr || p.productName === orderProductStr);
        if (matchedProd) {
          return assigned.includes(matchedProd.id) || assigned.includes(matchedProd.productName);
        }
        return false;
      };

      orders = rawOrders.filter(o => {
        // Supervisor can always see their own orders (even if they act as a seller)
        if (isSameSellerName(o.sellerName, currentUser)) return true;

        // If an order has an assigned supervisor explicitly set:
        if (o.assignedSupervisorId) {
          if (o.assignedSupervisorId === currentSellerProfile.id) {
            return isProductMatching(o.product, currentSellerProfile.assignedProducts);
          }
          // Assigned to a different supervisor -> STRICTLY DO NOT show!
          return false;
        }

        // Fallback for orders without assignedSupervisorId
        if (isChildSellerName(o.sellerName)) {
          const sellerObj = findSellerByName(rawSellers, o.sellerName);
          const parentCount = (sellerObj?.parentIds?.length || 0) + 
            (sellerObj?.parentId && !sellerObj?.parentIds?.includes(sellerObj.parentId) ? 1 : 0);
          
          if (parentCount > 1) {
            return false;
          }

          return isProductMatching(o.product, currentSellerProfile.assignedProducts);
        }
        return false;
      });
    }
  }

  // Splash / Loading screen while Firebase Auth initializes to prevent unauthorized flicker
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg animate-pulse">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></span>
            <span>{lang === 'ar' ? 'جاري التحقق من المصادقة الآمنة...' : 'Vérification de la session...'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
        {/* GLIDE TOAST CONTAINER */}
        <div id="toast-wrapper" className="fixed top-5 right-5 left-5 z-55 pointer-events-none flex flex-col items-center sm:items-end gap-2 max-w-sm ml-auto rtl:mr-auto rtl:ml-0">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={`pointer-events-auto w-full flex items-center justify-between p-4 rounded-xl shadow-lg border text-sm font-semibold animate-in slide-in-from-top duration-300 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300 border-emerald-250'
                  : toast.type === 'error'
                  ? 'bg-red-50 dark:bg-rose-950/90 text-red-800 dark:text-red-300 border-red-250'
                  : 'bg-blue-50 dark:bg-blue-950/90 text-blue-800 dark:text-blue-300 border-blue-250'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="cursor-pointer ml-3 rtl:mr-3 rtl:ml-0 p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <LoginScreen
          lang={lang}
          setLang={setLang}
          toast={addToast}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          firestoreError={firestoreError}
        />
      </div>
    );
  }

  if (isLoggedIn && !workspaceReady && availableWorkspaces.length > 1) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="text-center mb-7">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg mb-4"><Shield className="w-7 h-7" /></div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">{lang === 'ar' ? 'اختر مساحة العمل' : 'Choisissez votre espace'}</h1>
            <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'نفس الحساب ونفس Firebase UID. الاختيار يؤثر على الواجهة فقط.' : 'Même compte et même UID Firebase. Le choix agit uniquement sur l’interface.'}</p>
          </div>
          <div className="grid gap-3">
            {availableWorkspaces.map(role => (
              <button key={role} onClick={() => handleWorkspaceSwitch(role)} disabled={workspaceSwitching}
                className="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-blue-950/20 transition text-right disabled:opacity-60">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">{role === 'SUPERVISOR' ? <Shield className="w-5 h-5 text-amber-600" /> : <User className="w-5 h-5 text-blue-600" />}</div>
                  <div className="flex-1"><div className="font-black text-sm text-slate-800 dark:text-slate-100">{role === 'SUPERVISOR' ? (lang === 'ar' ? 'مساحة المشرف' : 'Espace Superviseur') : (lang === 'ar' ? 'مساحة البائع' : 'Espace Vendeur')}</div><div className="text-[10px] text-slate-500 mt-1">{role === 'SUPERVISOR' ? (lang === 'ar' ? 'إدارة ومتابعة البائعين التابعين لك.' : 'Suivi des vendeurs sous votre responsabilité.') : (lang === 'ar' ? 'طلباتك ومبيعاتك الخاصة.' : 'Vos commandes et ventes.')}</div></div>
                </div>
              </button>
            ))}
          </div>
          <button onClick={handleLogout} className="mt-5 w-full py-2.5 rounded-xl text-xs font-black text-rose-600 bg-rose-50 dark:bg-rose-950/20">{lang === 'ar' ? 'تسجيل الخروج' : 'Se déconnecter'}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-200">
      
      {/* GLIDE TOAST CONTAINER */}
      <div id="toast-wrapper" className="fixed top-5 right-5 left-5 z-55 pointer-events-none flex flex-col items-center sm:items-end gap-2 max-w-sm ml-auto rtl:mr-auto rtl:ml-0">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full flex items-center justify-between p-4 rounded-xl shadow-lg border text-sm font-semibold animate-in slide-in-from-top duration-300 ${
              toast.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/90 text-emerald-800 dark:text-emerald-300 border-emerald-250 dark:border-emerald-800/50'
                : toast.type === 'error'
                ? 'bg-red-50 dark:bg-rose-950/90 text-red-800 dark:text-red-300 border-red-250 dark:border-rose-900/50'
                : 'bg-blue-50 dark:bg-blue-950/90 text-blue-800 dark:text-blue-300 border-blue-250 dark:border-blue-900/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="cursor-pointer ml-3 rtl:mr-3 rtl:ml-0 p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* WEBAPP MASTER LAYOUT */}
      <div className="flex flex-col lg:flex-row min-h-screen">
        
        {/* SIDEBAR NAVIGATION - DESKTOP FIRST */}
        <aside id="sidebar-panel" className="hidden lg:block lg:w-64 bg-white dark:bg-slate-900 lg:border-e border-slate-200 dark:border-slate-850 shrink-0 select-none transition-colors">
          <div className="p-6 border-b border-slate-150 dark:border-slate-850 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                <img 
                  src={appLogo} 
                  alt="App Logo" 
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-xl shadow-md border border-slate-200/65 dark:border-slate-800 object-cover"
                />
              </div>
              <div>
                <span className="font-extrabold text-slate-900 dark:text-slate-100 block tracking-tight text-sm">
                  {t.appName}
                </span>
                <span className="text-[10px] text-blue-500 dark:text-blue-400 block font-bold uppercase tracking-wider">Smart CRM</span>
              </div>
            </div>
          </div>

          {/* USER SESSIONS & PROFILE PORTAL */}
          <div className="mx-4 mt-4 p-3 bg-slate-50 dark:bg-slate-950/40 border border-slate-150/80 dark:border-slate-850/65 rounded-xl transition-all">
            <div className="flex items-center justify-between gap-1 mb-2.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider block">
                👤 {lang === 'ar' ? 'الملف الشخصي النشط' : 'Profil Actif'}
              </span>
              <span className={`shrink-0 text-[10px] px-2 py-0.5 font-black rounded-md uppercase tracking-wider border ${
                userRole === 'ADMIN'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-955/35 dark:text-emerald-450 border-emerald-100/50 dark:border-emerald-900/40'
                  : userRole === 'DEPUTY'
                  ? 'bg-purple-50 text-purple-700 dark:bg-purple-955/35 dark:text-purple-450 border-purple-100/50 dark:border-purple-900/40'
                  : userRole === 'SUPERVISOR'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-955/35 dark:text-amber-450 border-amber-100/50 dark:border-amber-900/40'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-955/35 dark:text-blue-450 border-blue-100/50 dark:border-blue-900/40'
              }`}>
                {userRole === 'ADMIN' 
                  ? (lang === 'ar' ? 'المدير' : 'Admin') 
                  : userRole === 'DEPUTY'
                  ? (lang === 'ar' ? 'نائب المدير' : 'Adjoint')
                  : userRole === 'SUPERVISOR'
                  ? (lang === 'ar' ? 'المشرف' : 'Superviseur')
                  : (lang === 'ar' ? 'البائع' : 'Vendeur')
                }
              </span>
            </div>
            
            <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-lg text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span className="truncate">{currentUser}</span>
            </div>
            
            <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed font-semibold">
              {userRole === 'ADMIN' 
                ? (lang === 'ar' ? 'صلاحيات كاملة لإدارة النظام وعرض أرباح الكل والمزامنة.' : 'Accès total pour la gestion, profits globaux & synchronisation.')
                : userRole === 'DEPUTY'
                ? (lang === 'ar' ? 'صلاحيات نائب المدير: تعديل وإدارة الطلبيات والمنتجات كاملة.' : 'Droits Adjoint : Gestion complète et modification des commandes & articles.')
                : userRole === 'SUPERVISOR'
                ? (lang === 'ar' ? 'صلاحيات المشرف: متابعة مبيعات وحسابات وإصدار إحصائيات بائعي فريقه التابعين له.' : 'Droits Superviseur : Suivi des ventes et statistiques de ses vendeurs affectés.')
                : (lang === 'ar' ? 'إضافة طلبيات جديدة فقط، بدون صلاحية التعديل أو الحذف.' : 'Saisie de commandes uniquement, sans droits de modification ou suppression.')
              }
            </div>

            {/* Logout Trigger button */}
            <button
              onClick={handleLogout}
              className="mt-3.5 w-full cursor-pointer bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/20 dark:hover:bg-rose-950/30 border border-rose-100/45 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg p-2 text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Se déconnecter'}</span>
            </button>
          </div>
        </aside>

        {/* MAIN BODY LAYOUT ENGINE */}
        <main className="flex-1 flex flex-col min-w-0">
          
          {/* ACTIONS AND CONTROL HEADER */}
          <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-850 h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 transition-colors relative z-40">
            
            {/* Left Header Portion */}
            <div className="flex items-center gap-2">
              {/* Mobile View App Branding */}
              <div className="flex items-center gap-2 lg:hidden">
                <img 
                  src={appLogo} 
                  alt="App Logo" 
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-lg shadow-xs border border-slate-200 dark:border-slate-800 object-cover shrink-0"
                />
                <span className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight text-xs">
                  {t.appName}
                </span>
              </div>

              {/* Desktop Session Authorization Display Badge */}
              <div className="hidden lg:flex items-center gap-2">
                <span className="hidden sm:inline-block text-xs font-bold text-slate-400">
                  🔐 {lang === 'ar' ? 'الجلسة النشطة:' : 'Session Actif :'}
                </span>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1 rounded-xl shadow-2xs animate-in fade-in duration-350">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-black text-slate-700 dark:text-slate-350">
                    {currentUser.replace(' (Admin)', '').replace(' (Ahmed)', '')}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md">
                    {userRole === 'ADMIN' ? (lang === 'ar' ? 'المدير' : 'Admin') : userRole === 'DEPUTY' ? (lang === 'ar' ? 'نائب المدير' : 'Adjoint') : userRole === 'SUPERVISOR' ? (lang === 'ar' ? 'المشرف' : 'Superviseur') : (lang === 'ar' ? 'البائع' : 'Vendeur')}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Actions & Utilities (Theme, Lang, Profile Popup) */}
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Language toggler dropdown */}
              <div id="language-switcher" className="relative flex items-center bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 p-1">
                <Globe className="w-3.5 h-3.5 text-slate-400 mx-1 shrink-0" />
                <select
                  id="active-lang-select"
                  value={lang}
                  onChange={e => setLang(e.target.value as Language)}
                  className="bg-transparent border-none text-[11px] sm:text-xs font-bold py-0.5 px-0.5 focus:outline-hidden text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <option value="ar">العربية</option>
                  <option value="fr">Français</option>
                  <option value="en">English (US)</option>
                </select>
              </div>

              {/* Theme toggler */}
              <button
                id="theme-toggler-btn"
                onClick={() => setDarkMode(!darkMode)}
                className="cursor-pointer p-1.5 sm:p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                title={t.lightMode}
              >
                {darkMode ? <Sun className="w-3.5 h-3.5 sm:w-4 h-4 text-amber-500" /> : <Moon className="w-3.5 h-3.5 sm:w-4 h-4 text-indigo-500" />}
              </button>

              {/* Responsive Elegant Profile Popover Button */}
              <div className="relative" id="profile-popover-wrapper">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="cursor-pointer flex items-center gap-1.5 p-1 sm:p-1.5 rounded-full sm:rounded-xl bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-605 text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0 select-none">
                    {currentUser.charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden sm:inline-block text-xs font-bold text-slate-700 dark:text-slate-300 max-w-[80px] truncate">
                    {currentUser.replace(' (Admin)', '')}
                  </span>
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {isProfileOpen && (
                  <>
                    {/* Invisible clickaway listener */}
                    <div className="fixed inset-0 z-40 cursor-default" onClick={() => setIsProfileOpen(false)} />
                    
                    {/* The menu dropdown */}
                    <div className="absolute right-0 rtl:left-0 rtl:right-auto mt-2.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-right rtl:text-right ltr:text-left">
                      
                      {/* Active profile detail section */}
                      <div className="pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center font-black text-sm shrink-0">
                          {currentUser.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {currentUser}
                          </p>
                          <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 font-bold rounded-md uppercase tracking-wider border ${
                            userRole === 'ADMIN'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-955/25 dark:text-emerald-450 border-emerald-100/30'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-955/25 dark:text-blue-450 border-blue-100/30'
                          }`}>
                            {userRole === 'ADMIN' 
                              ? (lang === 'ar' ? 'المدير العام' : 'Admin') 
                              : userRole === 'DEPUTY'
                              ? (lang === 'ar' ? 'نائب المدير' : 'Adjoint')
                              : userRole === 'SUPERVISOR'
                              ? (lang === 'ar' ? 'المشرف' : 'Superviseur')
                              : (lang === 'ar' ? 'البائع مخصص' : 'Vendeur')
                            }
                          </span>
                        </div>
                      </div>

                      {/* Display current permissions shortly */}
                      <div className="py-2.5 text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-semibold ltr:text-left">
                        {userRole === 'ADMIN' 
                          ? (lang === 'ar' ? 'أنت بصلاحية المدير العام الكاملة على جميع البيانات وإصدار التقارير.' : 'Droits complets d’administration CRM.')
                          : (lang === 'ar' ? 'صلاحيات بائع مخصص: معاينة وإدخال طلبيات وإدارة محدودة.' : 'Droits Vendeur : Enregistrement de commandes.')
                        }
                      </div>

                      {availableWorkspaces.length > 1 && (
                        <div className="py-3 border-t border-slate-100 dark:border-slate-800">
                          <div className="text-[10px] font-black text-slate-400 mb-2">{lang === 'ar' ? 'مساحة العمل' : 'Espace de travail'}</div>
                          <div className="grid grid-cols-2 gap-2">
                            {availableWorkspaces.map(role => (
                              <button key={role} disabled={workspaceSwitching || role === activeWorkspace} onClick={() => handleWorkspaceSwitch(role)} className={`p-2 rounded-lg text-[10px] font-black border transition ${role === activeWorkspace ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300' : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-blue-300'}`}>
                                {role === 'SUPERVISOR' ? (lang === 'ar' ? 'المشرف' : 'Superviseur') : role === 'SELLER' ? (lang === 'ar' ? 'البائع' : 'Vendeur') : role}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Logout button */}
                      <button
                        onClick={() => {
                          setIsProfileOpen(false);
                          handleLogout();
                        }}
                        className="mt-2 w-full cursor-pointer bg-rose-50 hover:bg-rose-100 dark:bg-rose-955/20 dark:hover:bg-rose-950/30 border border-rose-100/30 text-rose-600 dark:text-rose-400 rounded-lg p-2 text-[10px] font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 transition"
                      >
                        <LogOut className="w-3.5 h-3.5 shrink-0" />
                        <span>{lang === 'ar' ? 'تسجيل الخروج' : 'Se déconnecter'}</span>
                      </button>

                    </div>
                  </>
                )}
              </div>

            </div>
          </header>

          {/* DYNAMIC SCROLLABLE BODY CONTENT CONTAINER */}
          <div className="flex-1 overflow-y-auto p-6 pb-28 space-y-8">
            
            {/* FIREBASE CONNECTION DIAGNOSTIC MONITOR */}
            {!isFirebaseConfigured ? (
              <div className="bg-amber-50 dark:bg-amber-955/10 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
                <div className="flex gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-800 dark:text-amber-300">
                      ⚠️ {lang === 'ar' ? 'وضع العمل المحلي (غير متصل بالسحابة)' : 'Mode Local Uniquement (Non Synchronisé)'}
                    </h4>
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 leading-relaxed text-start">
                      {lang === 'ar' 
                        ? 'لم يتم تهيئة متغيرات البيئة لـ Firebase في Vercel بشكل كامل بعد أو لم تقم بإعادة بناء المشروع (Redeploy). البيانات تُحفظ حالياً محلياً على هذا الجهاز فقط ولن تظهر في الأجهزة الأخرى.' 
                        : 'Les variables d’environnement Firebase ne sont pas encore configurées sur Vercel, ou vous n’avez pas reconstruit l’application (Redeploy). Les données sont stockées localement sur cet appareil.'}
                    </p>
                  </div>
                </div>
                <div className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-lg font-bold shrink-0 self-end md:self-center">
                  {lang === 'ar' ? 'يحتاج إلى تهيئة Vercel + Redeploy' : 'Config Vercel + Redeploy Requis'}
                </div>
              </div>
            ) : firestoreError ? (
              <div className="bg-rose-50 dark:bg-rose-955/20 border border-rose-250 dark:border-rose-900/40 rounded-2xl p-4 flex flex-col items-start gap-3 shadow-2xs">
                <div className="flex gap-3 w-full">
                  <div className="p-2 bg-rose-100 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400 shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-black text-rose-800 dark:text-rose-350 text-start">
                      🚨 {lang === 'ar' ? 'تنبيه في مزامنة Firestore السحابية' : 'Alerte de synchronisation Cloud Firestore'}
                    </h4>
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-1 leading-relaxed text-start">
                      {lang === 'ar'
                        ? firestoreError.toLowerCase().includes('permission')
                          ? `قامت قاعدة بيانات Firestore برفض الطلب بسبب قيود الصلاحيات: "${firestoreError}". هذا يعني أن قواعد الحماية في Firebase (Firestore Rules) تمنع الوصول للبيانات.`
                          : `حدث خطأ أثناء المزامنة مع Firestore: "${firestoreError}".`
                        : firestoreError.toLowerCase().includes('permission')
                          ? `Le serveur Firestore a rejeté la requête (Règles de sécurité) : "${firestoreError}".`
                          : `Erreur lors de la synchronisation Firestore : "${firestoreError}".`}
                    </p>
                    <div className="mt-3 text-[10px] bg-white/70 dark:bg-slate-950/70 border border-rose-200 dark:border-rose-900/30 p-2.5 rounded-xl space-y-1 text-slate-650 dark:text-slate-400 font-semibold leading-normal text-start">
                      <p className="font-bold text-rose-700 dark:text-rose-300">💡 {lang === 'ar' ? 'حل المشكلة وتفعيل المزامنة بين الأجهزة:' : 'Comment résoudre ce problème :'}</p>
                      <ul className="list-disc list-inside space-y-1.5 mt-1">
                        {lang === 'ar' ? (
                          <>
                            <li>إذا كان الخطأ بسبب الصلاحيات (Permission-denied): افتح <strong>Firebase Console</strong> ⬅️ <strong>Firestore Database</strong> ⬅️ <strong>Rules</strong> واجعلها <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-[10px] text-rose-600 font-mono">allow read, write: if true;</code> ثم اضغط <strong>Publish</strong>.</li>
                            <li>تأكد من إدخال جميع مفتايح البيئة (VITE_FIREBASE_*) في Vercel بدون علامات اقتباس وبناء النسخة من جديد (Redeploy).</li>
                          </>
                        ) : (
                          <>
                            <li>Si l'erreur concerne les permissions, modifiez vos règles dans Firebase Console : <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-[10px] text-rose-600 font-mono">allow read, write: if true;</code> puis cliquez sur Publish.</li>
                            <li>Vérifiez vos variables d'environnement Vercel (sans guillemets) et redéployez l'application.</li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50/50 dark:bg-emerald-955/10 border border-emerald-100/50 dark:border-emerald-900/20 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-450">
                    {lang === 'ar' ? 'مزامنة السحاب نشطة ومتصلة بـ Firebase بنجاح' : 'Synchronisation Cloud Active et Connectée à Firebase'}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                  {lang === 'ar' ? 'جميع الأجهزة متزامنة' : 'Tous les appareils synchronisés'}
                </span>
              </div>
            )}
            
            {/* TABS VIEW CONTROLLER */}
            <div className="space-y-6">
              {activeTab === 'dashboard' && (
                <Dashboard 
                  lang={lang} 
                  role={userRole} 
                  orders={orders} 
                  onCardClick={(status) => {
                    setInitialStatusFilter(status);
                    setActiveTab('orders');
                  }}
                />
              )}

              {activeTab === 'orders' && (
                <OrdersTable
                  lang={lang}
                  role={userRole}
                  currentUser={currentUser}
                  onEditInit={initEditOrder}
                  onDataChange={refreshAllData}
                  toast={addToast}
                  triggerFormOpen={initAddOrder}
                  initialStatusFilter={initialStatusFilter}
                  onClearInitialStatusFilter={() => setInitialStatusFilter(null)}
                  dataTrigger={dataTrigger}
                />
              )}

              {activeTab === 'products' && (userRole === 'ADMIN' || userRole === 'DEPUTY' || userRole === 'SUPERVISOR' || userRole === 'SELLER') && (
                <ProductsManager
                  lang={lang}
                  role={userRole}
                  onDataChange={refreshAllData}
                  toast={addToast}
                  dataTrigger={dataTrigger}
                />
              )}

              {activeTab === 'sellers' && (userRole === 'ADMIN' || userRole === 'SUPERVISOR' || userRole === 'DEPUTY') && (
                <SellersManager
                  lang={lang}
                  role={userRole}
                  currentUser={currentUser}
                  onDataChange={refreshAllData}
                  toast={addToast}
                  dataTrigger={dataTrigger}
                />
              )}
            </div>
          </div>
        </main>
      </div>

      {/* FLOATING GLASS DOCKED HORIZONTAL BOTTOM NAVIGATION */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg z-40">
        <div className="flex items-center justify-around bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/60 p-2.5 rounded-2xl shadow-xl shadow-slate-900/10">
          <button
            id="tab-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition duration-150 cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-blue-600 dark:text-blue-400 font-extrabold scale-105'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-bold">{t.dashboard}</span>
          </button>

          <button
            id="tab-orders"
            onClick={() => setActiveTab('orders')}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition duration-150 cursor-pointer ${
              activeTab === 'orders'
                ? 'text-blue-600 dark:text-blue-400 font-extrabold scale-105'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <ShoppingCart className="w-5 h-5" />
            <span className="text-[10px] font-bold">{t.orders}</span>
          </button>

          <button
            id="tab-products"
            onClick={() => setActiveTab('products')}
            className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition duration-150 cursor-pointer ${
              activeTab === 'products'
                ? 'text-blue-600 dark:text-blue-400 font-extrabold scale-105'
                : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Tag className="w-5 h-5" />
            <span className="text-[10px] font-bold">{t.products}</span>
          </button>

          {(userRole === 'ADMIN' || userRole === 'SUPERVISOR' || userRole === 'DEPUTY') && (
            <button
              id="tab-sellers"
              onClick={() => setActiveTab('sellers')}
              className={`flex flex-col items-center gap-1 py-1.5 px-3 rounded-xl transition duration-150 cursor-pointer ${
                activeTab === 'sellers'
                  ? 'text-blue-600 dark:text-blue-400 font-extrabold scale-105'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[10px] font-bold">{t.sellers}</span>
            </button>
          )}
        </div>
      </div>

      {/* REACT DYNAMIC MODAL - ORDER FORM CREATOR/EDITOR */}
      <OrderFormModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        lang={lang}
        role={userRole}
        currentUser={currentUser}
        editingOrder={selectedEditingOrder}
        onSave={refreshAllData}
        toast={addToast}
      />
    </div>
  );
}
