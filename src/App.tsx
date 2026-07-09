import { useState, useEffect } from 'react';
import { DatabaseService } from './dbMock';
import { Order, Language, UserRole, AppNotification } from './types';
import { translations } from './locales';
import { safeStorage } from './utils/safeStorage';
import { FirestoreService } from './utils/FirestoreService';
import { isFirebaseConfigured } from './firebase';

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

  // Notifications states
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [lastViewedNotificationTime, setLastViewedNotificationTime] = useState<number>(() => {
    return Number(safeStorage.getItem('crm_lastViewedNotificationTime') || '0');
  });

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
  const currentSellerProfile = rawSellers.find(s => s.name === currentUser);

  // Filter notifications by hierarchy visibility constraints
  const isNotificationVisible = (notif: AppNotification): boolean => {
    // ADMIN (Manager & General Manager) sees everything
    if (userRole === 'ADMIN') {
      return true;
    }

    // Seller management notifications (seller_created, seller_updated, seller_deleted)
    if (notif.type.startsWith('seller')) {
      // Visible only to DEPUTY and ADMIN (ADMIN is already handled above)
      return userRole === 'DEPUTY';
    }

    // Order notifications (order_created, order_updated, order_deleted)
    if (notif.type.startsWith('order')) {
      if (!currentSellerProfile) {
        return userRole === 'DEPUTY'; // Default fallback for virtual/system logins
      }

      const creatorProfile = rawSellers.find(s => s.name === notif.creatorName);
      if (!creatorProfile) {
        return userRole === 'DEPUTY'; // Fallback if creator is not found
      }

      // Traversal to find all ancestor leaders up the chain (supporting multi-parents)
      const ancestors = new Set<string>();
      const queue = [creatorProfile];
      const visited = new Set<string>([creatorProfile.id]);

      while (queue.length > 0) {
        const currNode = queue.shift()!;
        if (currNode.parentId) {
          ancestors.add(currNode.parentId);
          if (!visited.has(currNode.parentId)) {
            visited.add(currNode.parentId);
            const parent = rawSellers.find(s => s.id === currNode.parentId);
            if (parent) queue.push(parent);
          }
        }
        if (currNode.parentIds) {
          currNode.parentIds.forEach(pId => {
            ancestors.add(pId);
            if (!visited.has(pId)) {
              visited.add(pId);
              const parent = rawSellers.find(s => s.id === pId);
              if (parent) queue.push(parent);
            }
          });
        }
      }

      // The logged-in user can see it if they are an administrative leader in the creator's path
      return ancestors.has(currentSellerProfile.id);
    }

    return false;
  };

  const visibleNotifications = notifications.filter(isNotificationVisible);

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

  // Listen to real-time notifications
  useEffect(() => {
    if (!isLoggedIn || !isFirebaseConfigured) return;

    let initialLoadDone = false;
    const mountTime = Date.now();

    const unsubscribe = FirestoreService.onNotificationsChange((list) => {
      setNotifications(list);

      if (!initialLoadDone) {
        initialLoadDone = true;
        return;
      }

      // Check if there is a new notification added after mountTime
      const newest = list[0];
      if (newest && Date.parse(newest.timestamp) > mountTime) {
        const isSelf = newest.creatorName === currentUser;
        if (!isSelf && isNotificationVisible(newest)) {
          const msg = lang === 'ar' ? newest.detailsAr : lang === 'fr' ? newest.detailsFr : newest.detailsEn;
          addToast(msg, 'info');
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isLoggedIn, lang, currentUser, userRole, currentSellerProfile, rawSellers, dataTrigger]);

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



  let orders = rawOrders;
  if (userRole === 'SELLER') {
    orders = rawOrders.filter(o => o.sellerName === currentUser);
  } else if (userRole === 'SUPERVISOR') {
    if (!currentSellerProfile) {
      orders = rawOrders.filter(o => o.sellerName === currentUser);
    } else {
      const childSellers = rawSellers.filter(s => 
        s.parentId === currentSellerProfile.id || 
        (s.parentIds && s.parentIds.includes(currentSellerProfile.id))
      );
      const childSellerNames = childSellers.map(s => s.name);

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
        // Supervisor can always see their own orders (even if they acts as a seller)
        if (o.sellerName === currentUser) return true;
        // Supervisor can see a child seller's order ONLY if:
        // 1. It belongs to this supervisor (if assignedSupervisorId is specified)
        // 2. The order's product belongs to this supervisor's assigned products
        if (childSellerNames.includes(o.sellerName)) {
          if (o.assignedSupervisorId) {
            if (o.assignedSupervisorId !== currentSellerProfile.id) {
              return false;
            }
          }
          return isProductMatching(o.product, currentSellerProfile.assignedProducts);
        }
        return false;
      });
    }
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
          firestoreError={firestoreError}
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

              {/* Real-time Notifications Bell */}
              <div className="relative" id="notifications-dropdown-wrapper">
                <button
                  onClick={() => {
                    setIsNotificationsOpen(!isNotificationsOpen);
                    if (!isNotificationsOpen) {
                      const now = Date.now();
                      setLastViewedNotificationTime(now);
                      safeStorage.setItem('crm_lastViewedNotificationTime', String(now));
                    }
                  }}
                  className="cursor-pointer p-1.5 sm:p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition relative flex items-center justify-center"
                  title={lang === 'ar' ? 'الإشعارات' : 'Notifications'}
                >
                  <Bell className="w-3.5 h-3.5 sm:w-4 h-4 text-slate-600 dark:text-slate-300" />
                  {visibleNotifications.filter(n => Date.parse(n.timestamp) > lastViewedNotificationTime).length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                    </span>
                  )}
                </button>

                {isNotificationsOpen && (
                  <div className={`absolute ${lang === 'ar' ? 'left-0' : 'right-0'} mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl shadow-xl z-55 animate-in fade-in duration-100 overflow-hidden`}>
                    <div className="p-3 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/45">
                      <span className="font-extrabold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                        🔔 {lang === 'ar' ? 'إشعارات النشاطات بالمتجر' : 'Flux de Notifications'}
                      </span>
                      <button
                        onClick={() => setIsNotificationsOpen(false)}
                        className="cursor-pointer p-1 hover:bg-slate-200 dark:hover:bg-slate-850 rounded-full text-slate-400"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-850">
                      {visibleNotifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400 font-medium">
                          {lang === 'ar' ? 'لا توجد إشعارات حالياً' : 'Aucune notification pour le moment'}
                        </div>
                      ) : (
                        visibleNotifications.map((notif) => {
                          const isUnread = Date.parse(notif.timestamp) > lastViewedNotificationTime;
                          const formattedTime = new Date(notif.timestamp).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                          return (
                            <div
                              key={notif.id}
                              className={`p-3 text-[11px] sm:text-xs transition-colors flex items-start gap-2.5 ${
                                isUnread ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-950/20'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {notif.type.startsWith('order') ? (
                                  <div className="w-6 h-6 rounded-md bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center border border-emerald-100/55 dark:border-emerald-800/30">
                                    <span className="text-xs">📦</span>
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center border border-blue-100/55 dark:border-blue-800/30">
                                    <span className="text-xs">👤</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="font-extrabold text-slate-800 dark:text-slate-200 truncate">
                                    {lang === 'ar' ? notif.titleAr : lang === 'fr' ? notif.titleFr : notif.titleEn}
                                  </span>
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold shrink-0">
                                    {formattedTime}
                                  </span>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 leading-normal font-medium text-start">
                                  {lang === 'ar' ? notif.detailsAr : lang === 'fr' ? notif.detailsFr : notif.detailsEn}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
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
                      🚨 {lang === 'ar' ? 'تم حظر اتصال المزامنة السحابية' : 'Accès à la synchronisation Cloud bloqué'}
                    </h4>
                    <p className="text-[11px] text-rose-600 dark:text-rose-400 font-bold mt-1 leading-relaxed text-start">
                      {lang === 'ar'
                        ? `قامت قاعدة بيانات Firestore برفض الطلب بسبب قيود الصلاحيات: "${firestoreError}". هذا يعني أن قواعد الحماية في Firebase (Firestore Rules) تمنع الوصول للبيانات.`
                        : `Le serveur Firestore a rejeté la requête : "${firestoreError}". Veuillez mettre à jour vos règles de sécurité.`}
                    </p>
                    <div className="mt-3 text-[10px] bg-white/70 dark:bg-slate-950/70 border border-rose-200 dark:border-rose-900/30 p-2.5 rounded-xl space-y-1 text-slate-650 dark:text-slate-400 font-semibold leading-normal text-start">
                      <p className="font-bold text-rose-700 dark:text-rose-300">💡 {lang === 'ar' ? 'حل المشكلة لتفعيل المزامنة الفورية بين الأجهزة:' : 'Comment résoudre ce problème pour activer la synchronisation :'}</p>
                      <ul className="list-disc list-inside space-y-1.5 mt-1">
                        {lang === 'ar' ? (
                          <>
                            <li>افتح لوحة تحكم <strong>Firebase Console</strong> الخاصة بك.</li>
                            <li>انتقل إلى <strong>Firestore Database</strong> ثم تبويب <strong>Rules</strong>.</li>
                            <li>قم بتعديل القواعد لتسمح بالقراءة والكتابة للجميع: <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-[10px] text-rose-600 font-mono">allow read, write: if true;</code></li>
                            <li>اضغط على <strong>Publish</strong> وستبدأ المزامنة على كافة الأجهزة فوراً!</li>
                          </>
                        ) : (
                          <>
                            <li>Allez sur votre <strong>Firebase Console</strong>.</li>
                            <li>Sous <strong>Firestore Database</strong>, allez dans l’onglet <strong>Rules</strong>.</li>
                            <li>Autorisez l’accès temporairement en modifiant la règle : <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-[10px] text-rose-600 font-mono">allow read, write: if true;</code></li>
                            <li>Cliquez sur <strong>Publish</strong> pour activer la synchronisation instantanée.</li>
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
