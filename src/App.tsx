import { useState, useEffect } from 'react';
import { DatabaseService } from './dbMock';
import { Order, Language, UserRole } from './types';
import { translations } from './locales';
import { safeStorage } from './utils/safeStorage';

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
  LogOut
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

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return safeStorage.getItem('crm_isLoggedIn') === 'true';
  });

  // Multiuser configuration
  const [userRole, setUserRole] = useState<UserRole>(() => {
    return (safeStorage.getItem('crm_userRole') as UserRole) || 'ADMIN';
  });
  const [currentUser, setCurrentUser] = useState<string>(() => {
    return safeStorage.getItem('crm_currentUser') || 'عبد الله (Admin)';
  });

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

  // Initialize Database on application load helper
  useEffect(() => {
    DatabaseService.initialize()
      .then(() => {
        refreshAllData();
      })
      .catch((err) => {
        console.error("Failed to initialize system database:", err);
      });
  }, []);

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

  const handleRoleChange = (role: UserRole, loginName?: string) => {
    // Only accept ADMIN or SELLER. Fallback to ADMIN if PUBLIC is somehow passed.
    const cleanRole: UserRole = role === 'PUBLIC' ? 'SELLER' : role;
    setUserRole(cleanRole);
    safeStorage.setItem('crm_userRole', cleanRole);
    
    let targetUser = '';
    if (cleanRole === 'ADMIN') {
      targetUser = 'عبد الله (Admin)';
    } else {
      targetUser = loginName || 'أحمد الإدريسي (Ahmed)';
      // If switched to Seller, reset tab to dashboard so they don't access hidden pages
      if (activeTab === 'products' || activeTab === 'sellers') {
        setActiveTab('dashboard');
      }
    }
    
    setCurrentUser(targetUser);
    safeStorage.setItem('crm_currentUser', targetUser);
    setDataTrigger(prev => prev + 1);
    addToast(
      lang === 'ar'
        ? `🔐 تم الدخول كـ: ${targetUser.replace(' (Admin)', '')}`
        : `🔐 Connecté en tant que: ${targetUser.replace(' (Admin)', '')}`,
      'success'
    );
  };

  const handleLogin = (role: UserRole, name: string) => {
    setIsLoggedIn(true);
    setUserRole(role);
    setCurrentUser(name);
    safeStorage.setItem('crm_isLoggedIn', 'true');
    safeStorage.setItem('crm_userRole', role);
    safeStorage.setItem('crm_currentUser', name);
    setDataTrigger(prev => prev + 1);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    safeStorage.removeItem('crm_isLoggedIn');
    safeStorage.removeItem('crm_userRole');
    safeStorage.removeItem('crm_currentUser');
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

  const rawOrders = DatabaseService.getOrders();
  const rawSellers = DatabaseService.getSellers();
  const currentSellerProfile = rawSellers.find(s => s.name === currentUser);

  let orders = rawOrders;
  if (userRole === 'SELLER') {
    orders = rawOrders.filter(o => o.sellerName === currentUser);
  } else if (userRole === 'SUPERVISOR' && currentSellerProfile) {
    const childSellerNames = rawSellers
      .filter(s => s.parentId === currentSellerProfile.id)
      .map(s => s.name);
    orders = rawOrders.filter(o => o.sellerName === currentUser || childSellerNames.includes(o.sellerName));
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
          onLogin={handleLogin}
          toast={addToast}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
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
            
            {userRole === 'ADMIN' ? (
              <div className="relative">
                <select
                  id="profile-user-select"
                  value={currentUser}
                  onChange={(e) => {
                    const val = e.target.value;
                    const isAdm = val === 'عبد الله (Admin)';
                    const matched = DatabaseService.getSellers().find(s => s.name === val);
                    const selectedRole = isAdm ? 'ADMIN' : (matched?.role || 'SELLER');
                    handleRoleChange(selectedRole, val);
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 text-[11px] font-extrabold py-2 px-2.5 pr-8 rounded-lg text-slate-750 dark:text-slate-300 focus:outline-hidden cursor-pointer appearance-none shadow-xs transition"
                >
                  <option value="عبد الله (Admin)">
                    👑 {lang === 'ar' ? 'عبد الله (المدير)' : 'Abdellah (Admin)'}
                  </option>
                  {DatabaseService.getSellers()
                    .filter(s => s.active)
                    .map(seller => {
                      const prefix = seller.role === 'ADMIN' ? '👑' : seller.role === 'DEPUTY' ? '🛡️' : seller.role === 'SUPERVISOR' ? '👥' : '💼';
                      const suffix = seller.role === 'ADMIN' 
                        ? (lang === 'ar' ? '(مدير)' : '(Admin)') 
                        : seller.role === 'DEPUTY' 
                        ? (lang === 'ar' ? '(نائب م)' : '(Adjoint)') 
                        : seller.role === 'SUPERVISOR' 
                        ? (lang === 'ar' ? '(مشرف)' : '(Supervisor)') 
                        : (lang === 'ar' ? '(بائع)' : '(Vendeur)');
                      return (
                        <option key={seller.id} value={seller.name}>
                          {prefix} {seller.name} {suffix}
                        </option>
                      );
                    })
                  }
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-lg text-xs font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                <span className="truncate">{currentUser}</span>
              </div>
            )}
            
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
                    {userRole === 'ADMIN' ? (lang === 'ar' ? 'المدير' : 'Admin') : (lang === 'ar' ? 'بائع مخصص' : 'Profil Vendeur')}
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

                      {/* Dropdown profile switcher for admin */}
                      {userRole === 'ADMIN' && (
                        <div className="py-3 border-b border-slate-100 dark:border-slate-800">
                          <label className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider block mb-1.5 ltr:text-left">
                            👤 {lang === 'ar' ? 'تغيير المستخدم / المندوب' : 'Changer l’utilisateur'}
                          </label>
                          <div className="relative">
                            <select
                              id="header-profile-select"
                              value={currentUser}
                              onChange={(e) => {
                                const val = e.target.value;
                                const isAdm = val === 'عبد الله (Admin)';
                                const matched = DatabaseService.getSellers().find(s => s.name === val);
                                const selectedRole = isAdm ? 'ADMIN' : (matched?.role || 'SELLER');
                                handleRoleChange(selectedRole, val);
                                setIsProfileOpen(false);
                              }}
                              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-black py-2 px-2.5 pr-8 rounded-lg text-slate-755 dark:text-slate-300 focus:outline-hidden cursor-pointer appearance-none"
                            >
                              <option value="عبد الله (Admin)">
                                👑 {lang === 'ar' ? 'عبد الله (المدير)' : 'Abdellah (Admin)'}
                              </option>
                              {DatabaseService.getSellers()
                                .filter(s => s.active)
                                .map(seller => {
                                  const prefix = seller.role === 'ADMIN' ? '👑' : seller.role === 'DEPUTY' ? '🛡️' : seller.role === 'SUPERVISOR' ? '👥' : '💼';
                                  const suffix = seller.role === 'ADMIN' 
                                    ? (lang === 'ar' ? '(مدير)' : '(Admin)') 
                                    : seller.role === 'DEPUTY' 
                                    ? (lang === 'ar' ? '(نائب م)' : '(Adjoint)') 
                                    : seller.role === 'SUPERVISOR' 
                                    ? (lang === 'ar' ? '(مشرف)' : '(Supervisor)') 
                                    : (lang === 'ar' ? '(بائع)' : '(Vendeur)');
                                  return (
                                    <option key={seller.id} value={seller.name}>
                                      {prefix} {seller.name} {suffix}
                                    </option>
                                  );
                                })
                              }
                            </select>
                            <div className="absolute inset-y-0 right-0 p-2 pointer-events-none text-slate-400">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Display current permissions shortly */}
                      <div className="py-2.5 text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-semibold ltr:text-left">
                        {userRole === 'ADMIN' 
                          ? (lang === 'ar' ? 'أنت بصلاحية المدير العام الكاملة على جميع البيانات وإصدار التقارير.' : 'Droits complets d’administration CRM.')
                          : (lang === 'ar' ? 'صلاحيات بائع مخصص: معاينة وإدخال طلبيات وإدارة محدودة.' : 'Droits Vendeur : Enregistrement de commandes.')
                        }
                      </div>

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
            
            {/* TABS VIEW CONTROLLER */}
            <div key={dataTrigger} className="space-y-6">
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
                />
              )}

              {activeTab === 'products' && (userRole === 'ADMIN' || userRole === 'DEPUTY' || userRole === 'SUPERVISOR' || userRole === 'SELLER') && (
                <ProductsManager
                  lang={lang}
                  role={userRole}
                  onDataChange={refreshAllData}
                  toast={addToast}
                />
              )}

              {activeTab === 'sellers' && (userRole === 'ADMIN' || userRole === 'SUPERVISOR' || userRole === 'DEPUTY') && (
                <SellersManager
                  lang={lang}
                  role={userRole}
                  currentUser={currentUser}
                  onDataChange={refreshAllData}
                  toast={addToast}
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
