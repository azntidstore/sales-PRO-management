import React, { useState, useEffect } from 'react';
import { DatabaseService } from '../dbMock';
import { Seller, Language, UserRole } from '../types';
import { translations } from '../locales';
import { UserPlus, Edit2, Trash2, CheckCircle, XCircle, Phone, Save, X, Network, GitPullRequest, ArrowDown } from 'lucide-react';

interface Props {
  lang: Language;
  role: UserRole;
  currentUser?: string;
  onDataChange: () => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function SellersManager({ lang, role, currentUser, onDataChange, toast }: Props) {
  const t = translations[lang];
  const isReadOnly = role === 'PUBLIC';
  
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [allSellersListFull, setAllSellersListFull] = useState<Seller[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sellerRole, setSellerRole] = useState<'SELLER' | 'SUPERVISOR' | 'DEPUTY' | 'ADMIN'>('SELLER');
  const [parentId, setParentId] = useState('');

  const refreshSellers = () => {
    const rawSellers = DatabaseService.getSellers();
    setAllSellersListFull(rawSellers);
    
    if (role === 'SUPERVISOR' && currentUser) {
      const supervisor = rawSellers.find(s => s.name === currentUser);
      if (supervisor) {
        setSellers(rawSellers.filter(s => s.parentId === supervisor.id));
      } else {
        setSellers([]);
      }
    } else {
      setSellers(rawSellers);
    }
  };

  useEffect(() => {
    refreshSellers();
  }, [role, currentUser]);

  const resetForm = () => {
    setName('');
    setPhone('');
    setActive(true);
    setEmail('');
    setPassword('');
    setSellerRole('SELLER');
    setParentId('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  const getTranslatedRole = (r: string | undefined) => {
    if (!r) return lang === 'ar' ? 'بائع مخصص' : 'Vendeur';
    switch (r) {
      case 'ADMIN':
        return lang === 'ar' ? 'المدير' : lang === 'fr' ? 'Directeur' : 'Director';
      case 'DEPUTY':
        return lang === 'ar' ? 'نائب المدير' : lang === 'fr' ? 'Adjoint' : 'Deputy Admin';
      case 'SUPERVISOR':
        return lang === 'ar' ? 'مشرف' : lang === 'fr' ? 'Superviseur' : 'Supervisor';
      case 'SELLER':
      default:
        return lang === 'ar' ? 'بائع عادي' : lang === 'fr' ? 'Vendeur' : 'Seller';
    }
  };

  const getEligibleSuperiors = () => {
    if (sellerRole === 'SELLER') {
      return allSellersListFull.filter(s => s.role === 'SUPERVISOR' && s.id !== editingId);
    }
    if (sellerRole === 'SUPERVISOR') {
      return allSellersListFull.filter(s => s.role === 'DEPUTY' && s.id !== editingId);
    }
    if (sellerRole === 'DEPUTY') {
      return allSellersListFull.filter(s => s.role === 'ADMIN' && s.id !== editingId);
    }
    return [];
  };

  const handleCreateOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (!name.trim()) {
      toast(t.fieldRequired, 'error');
      return;
    }

    const fullSellers = [...DatabaseService.getSellers()];

    let finalEmail = email.trim().toLowerCase();
    if (finalEmail && !finalEmail.includes('@')) {
      finalEmail = `${finalEmail}@gmail.com`;
    } else if (!finalEmail) {
      finalEmail = `${name.trim().toLowerCase().replace(/\s+/g, '_')}@gmail.com`;
    }
    const assignedPassword = password.trim() || '123456';

    if (editingId) {
      // Update
      const index = fullSellers.findIndex(s => s.id === editingId);
      if (index !== -1) {
        fullSellers[index] = {
          ...fullSellers[index],
          name: name.trim(),
          phone: phone.trim(),
          active,
          username: finalEmail,
          email: finalEmail,
          role: sellerRole,
          parentId: sellerRole === 'ADMIN' ? '' : parentId,
          password: assignedPassword
        };
        DatabaseService.saveSellers(fullSellers);
        toast(t.sellerUpdatedSuccess, 'success');
      }
    } else {
      // Create
      const newSeller: Seller = {
        id: 'sel_' + Date.now(),
        name: name.trim(),
        phone: phone.trim(),
        active,
        createdAt: new Date().toISOString(),
        username: finalEmail,
        email: finalEmail,
        role: sellerRole,
        parentId: sellerRole === 'ADMIN' ? '' : parentId,
        password: assignedPassword
      };
      fullSellers.push(newSeller);
      DatabaseService.saveSellers(fullSellers);
      toast(t.sellerCreatedSuccess, 'success');
    }

    onDataChange();
    resetForm();
    refreshSellers();
  };

  const handleEditInit = (seller: Seller) => {
    setEditingId(seller.id);
    setName(seller.name);
    setPhone(seller.phone);
    setActive(seller.active);
    setEmail(seller.email || seller.username || '');
    setPassword(seller.password || ''); // Fallback credentials support stored in Firestore document
    setSellerRole(seller.role || 'SELLER');
    setParentId(seller.parentId || '');
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (isReadOnly) {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (deleteConfirmId === id) {
      const fullSellers = DatabaseService.getSellers();
      const filtered = fullSellers.filter(s => s.id !== id);
      DatabaseService.saveSellers(filtered);
      toast(t.sellerDeletedSuccess, 'success');
      onDataChange();
      setDeleteConfirmId(null);
      refreshSellers();
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => {
        setDeleteConfirmId(current => current === id ? null : current);
      }, 3000);
    }
  };

  const toggleActiveState = (seller: Seller) => {
    if (isReadOnly) {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    const fullSellers = DatabaseService.getSellers();
    const updated = fullSellers.map(s => {
      if (s.id === seller.id) {
        return { ...s, active: !s.active };
      }
      return s;
    });
    DatabaseService.saveSellers(updated);
    toast(t.sellerUpdatedSuccess, 'success');
    onDataChange();
    refreshSellers();
  };

  const getManagerDisplay = (seller: Seller) => {
    if (seller.role === 'ADMIN') {
      return lang === 'ar' ? '👑 رئيس الهيكل التنظيمي (المدير)' : '🏆 Sommet de la Hiérarchie';
    }
    if (!seller.parentId) {
      if (seller.role === 'DEPUTY') {
        return lang === 'ar' ? '👑 تحت قيادة المدير عبد الله مباشرة' : '👑 Sous la direction d\'Abdellah';
      }
      return lang === 'ar' ? '⚠️ غير مربوط برئيس مباشر' : '⚠️ Non affecté';
    }
    const mgr = allSellersListFull.find(s => s.id === seller.parentId);
    return mgr ? `${mgr.name} (${getTranslatedRole(mgr.role)})` : `⚠️ ${lang === 'ar' ? 'غير مباشر' : 'Non affecté'}`;
  };

  const renderHierarchyTree = () => {
    const dbSellers = allSellersListFull;
    
    // Find all Admin roles
    const dbAdmins = dbSellers.filter(s => s.role === 'ADMIN');
    
    // If no db admins, let's make a virtual one
    const directors = dbAdmins.length > 0 
      ? dbAdmins 
      : [{ id: 'abdellah', name: lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)', role: 'ADMIN' as const, phone: '', active: true, createdAt: '' }];

    return (
      <div className="space-y-6">
        {directors.map(director => {
          // Find deputies reporting to this director
          // If director is the virtual 'abdellah', deputies with parentId === '' or false or 'abdellah' can be shown!
          const deputies = dbSellers.filter(s => 
            s.role === 'DEPUTY' && 
            (s.parentId === director.id || (director.id === 'abdellah' && (!s.parentId || s.parentId === 'abdellah')))
          );

          return (
            <div key={director.id} className="bg-slate-50/50 dark:bg-slate-950/20 border border-slate-150 dark:border-slate-850/60 rounded-xl p-5 shadow-2xs">
              {/* Director Card */}
              <div className="flex items-center gap-3 bg-red-50/50 dark:bg-red-955/20 border border-red-100/40 dark:border-rose-900/45 rounded-xl p-3 max-w-md">
                <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center font-black shadow-md shrink-0">
                  👑
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">{director.name}</h4>
                  <span className="text-[10px] text-red-700 dark:text-red-400 font-extrabold uppercase tracking-wider block">
                    {lang === 'ar' ? 'المدير العام' : 'Directeur Général'}
                  </span>
                </div>
              </div>

              {/* Render Deputy tree */}
              {deputies.length === 0 ? (
                <div className="ms-12 mt-3 text-xs italic text-slate-400">
                  {lang === 'ar' ? '⚠️ لا يوجد نواب مدير مربوطين به حالياً' : 'Aucun adjoint lié'}
                </div>
              ) : (
                <div className="ms-6 md:ms-10 mt-4 border-s-2 border-dashed border-slate-200 dark:border-slate-800 ps-4 md:ps-6 space-y-4">
                  {deputies.map(deputy => {
                    // Find supervisors reporting to this deputy
                    const supervisors = dbSellers.filter(s => s.role === 'SUPERVISOR' && s.parentId === deputy.id);

                    return (
                      <div key={deputy.id} className="relative">
                        {/* Tree connector */}
                        <div className="absolute top-5 h-0 w-4 border-t-2 border-dashed border-slate-200 dark:border-slate-800 -start-4 md:-start-6"></div>
                        
                        {/* Deputy Card */}
                        <div className="flex items-center gap-3 bg-purple-50/50 dark:bg-purple-955/20 border border-purple-100/40 dark:border-purple-900/40 rounded-xl p-3 max-w-md">
                          <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-black shadow-sm shrink-0">
                            🛡️
                          </div>
                          <div>
                            <h5 className="font-bold text-slate-800 dark:text-slate-100 text-xs">{deputy.name}</h5>
                            <span className="text-[10px] text-purple-700 dark:text-purple-400 font-extrabold block">
                              {lang === 'ar' ? 'نائب المدير' : 'Adjoint de Direction'}
                            </span>
                          </div>
                        </div>

                        {/* Render Supervisor tree */}
                        {supervisors.length === 0 ? (
                          <div className="ms-10 mt-2 text-xs italic text-slate-400">
                            {lang === 'ar' ? '⚠️ لا يوجد مشرفون تحت قيادته' : 'Aucun superviseur lié'}
                          </div>
                        ) : (
                          <div className="ms-6 md:ms-8 mt-3 border-s-2 border-dashed border-slate-200 dark:border-slate-800 ps-4 md:ps-6 space-y-4">
                            {supervisors.map(supervisor => {
                              // Find sellers reporting to this supervisor
                              const assignedSellersList = dbSellers.filter(s => s.role === 'SELLER' && s.parentId === supervisor.id);

                              return (
                                <div key={supervisor.id} className="relative">
                                  {/* Tree connector */}
                                  <div className="absolute top-5 h-0 w-4 border-t-2 border-dashed border-slate-200 dark:border-slate-800 -start-4 md:-start-6"></div>
                                  
                                  {/* Supervisor Card */}
                                  <div className="flex items-center gap-3 bg-amber-50/50 dark:bg-amber-955/20 border border-amber-100/40 dark:border-amber-900/40 rounded-xl p-3 max-w-md">
                                    <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-black shadow-sm shrink-0">
                                      👥
                                    </div>
                                    <div>
                                      <h6 className="font-bold text-slate-800 dark:text-slate-100 text-xs">{supervisor.name}</h6>
                                      <span className="text-[10px] text-amber-700 dark:text-amber-400 font-extrabold block">
                                        {lang === 'ar' ? `مشرف مجموعة (${assignedSellersList.length} بائع)` : `Superviseur (${assignedSellersList.length} vendeurs)`}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Render Seller list */}
                                  {assignedSellersList.length === 0 ? (
                                    <div className="ms-10 mt-2 text-xs italic text-slate-400">
                                      {lang === 'ar' ? '⚠️ لا يوجد بائعون تحت إشرافه' : 'Aucun vendeur sous supervision'}
                                    </div>
                                  ) : (
                                    <div className="ms-6 md:ms-8 mt-2 border-s-2 border-dashed border-slate-200 dark:border-slate-800 ps-4 md:ps-5 space-y-1.5 py-1">
                                      {assignedSellersList.map(item => (
                                        <div key={item.id} className="relative flex items-center gap-2 text-xs font-semibold py-1 px-3 bg-sky-50/45 dark:bg-sky-955/15 border border-sky-100/40 dark:border-sky-900/25 rounded-lg max-w-sm">
                                          {/* Tree connector */}
                                          <div className="absolute top-4.5 h-0 w-4 border-t-2 border-dashed border-slate-200 dark:border-slate-800 -start-4 md:-start-5"></div>
                                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                          <span className="text-slate-705 dark:text-slate-300 font-bold">{item.name}</span>
                                          <span className="text-[10px] text-slate-400 font-bold">({item.phone || '-'})</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Unattached Sellers (Fault-Tolerance display block) */}
        {dbSellers.some(s => s.role === 'SELLER' && !s.parentId) && (
          <div className="mt-4 bg-yellow-50/45 dark:bg-yellow-955/10 border border-yellow-250/30 p-4 rounded-xl">
            <h5 className="text-xs font-extrabold text-amber-800 dark:text-amber-500 mb-2 uppercase tracking-wide">
              ⚠️ {lang === 'ar' ? 'بائعون غير مربوطين بمشرف' : 'Vendeurs orphelins (sans superviseur)'}
            </h5>
            <div className="flex flex-wrap gap-2">
              {dbSellers
                .filter(s => s.role === 'SELLER' && !s.parentId)
                .map(item => (
                  <span key={item.id} className="inline-flex items-center gap-1 bg-yellow-100/50 border border-yellow-200/50 text-amber-900 dark:bg-amber-955/20 dark:text-amber-400 rounded-lg px-2.5 py-1 text-xs font-bold">
                    <span>{item.name}</span>
                    <span className="text-[10px] opacity-75">({item.id})</span>
                  </span>
                ))
              }
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="sellers-manager-section" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs transition-colors mb-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t.sellers}</h2>
          <p className="text-xs text-slate-500 mt-1">{lang === 'ar' ? 'إجمالي عدد البائعين المسجلين' : lang === 'fr' ? 'Total des vendeurs enregistrés' : 'Total registered sellers'}: {sellers.length}</p>
        </div>
        {!isReadOnly && !isFormOpen && (
          <button
            id="add-seller-init-btn"
            onClick={() => setIsFormOpen(true)}
            className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 transition"
          >
            <UserPlus className="w-4 h-4" />
            {t.addSeller}
          </button>
        )}
      </div>

      {isReadOnly && (
        <div className="mb-4 text-xs text-slate-500 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
          {t.publicNotice}
        </div>
      )}

      {isFormOpen && !isReadOnly && (
        <form onSubmit={handleCreateOrUpdate} className="bg-slate-50 dark:bg-slate-950 rounded-xl p-5 border border-slate-200 dark:border-slate-800 mb-6 transition-all duration-200">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">{editingId ? t.editSeller : t.addSeller}</h3>
            <button type="button" onClick={resetForm} className="cursor-pointer text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.sellerName}*</label>
              <input
                id="seller-name-input"
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={lang === 'ar' ? 'كامل الاسم' : 'Nom Complet'}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.phone}</label>
              <input
                id="seller-phone-input"
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={t.phonePlaceholder}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                📧 {lang === 'ar' ? 'البريد الإلكتروني (Firebase Auth)' : "Email de connexion"} *
              </label>
              <input
                id="seller-email-input"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder={lang === 'ar' ? 'example@gmail.com' : 'Ex: example@gmail.com'}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex justify-between">
                <span>🔑 {lang === 'ar' ? 'كلمة المرور' : 'Mot de passe'} *</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold animate-pulse">
                  {lang === 'ar' ? '(🔑 تُحفظ وتعمل تلقائياً فوراً)' : '(🔑 Enregistré et actif immédiatement)'}
                </span>
              </label>
              <input
                id="seller-password-input"
                type="text"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder={lang === 'ar' ? 'كلمة المرور (6 أرقام على الأقل)' : 'Min 6 caractères'}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                🛡️ {lang === 'ar' ? 'صفة وصلاحية البروفايل' : 'Rôle / Type de compte'} *
              </label>
              <select
                id="seller-role-select"
                value={sellerRole}
                onChange={e => {
                  setSellerRole(e.target.value as 'SELLER' | 'SUPERVISOR' | 'DEPUTY' | 'ADMIN');
                  setParentId('');
                }}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-bold"
              >
                <option value="SELLER">💼 {lang === 'ar' ? 'بائع عادي' : 'Vendeur Ordinaire'}</option>
                <option value="SUPERVISOR">👥 {lang === 'ar' ? 'مشرف مجموعة' : 'Superviseur'}</option>
                <option value="DEPUTY">🛡️ {lang === 'ar' ? 'نائب المدير' : 'Adjoint (Vice Admin)'}</option>
                <option value="ADMIN">👑 {lang === 'ar' ? 'المدير العام' : 'Directeur (Admin)'}</option>
              </select>
            </div>
            <div className="flex items-center pt-6">
              <label className="inline-flex items-center cursor-pointer">
                <input
                  id="seller-active-checkbox"
                  type="checkbox"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-10.5 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                <span className="ms-3 text-sm font-medium text-slate-600 dark:text-slate-400">
                  {active ? t.active : t.inactive}
                </span>
              </label>
            </div>
          </div>

          {sellerRole !== 'ADMIN' && (
            <div className="mb-4 bg-blue-50/50 dark:bg-blue-950/20 p-4 rounded-xl border border-blue-100/40 dark:border-blue-900/30">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                ⭐ {lang === 'ar' ? 'رئيس العمل المباشر (التأطير الإداري)' : 'Responsable d\'équipe supérieur'} *
              </label>
              <select
                id="seller-parent-select"
                value={parentId}
                required
                onChange={e => setParentId(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-extrabold"
              >
                <option value="">{lang === 'ar' ? '-- اختر المسؤول المباشر من القائمة --' : '-- Choisir le supérieur d\'équipe --'}</option>
                
                {sellerRole === 'DEPUTY' && (
                  <option value="abdellah">👑 عبد الله (المدير العام الأساسي)</option>
                )}

                {getEligibleSuperiors().map(sup => (
                  <option key={sup.id} value={sup.id}>
                    👤 {sup.name} ({getTranslatedRole(sup.role)})
                  </option>
                ))}
              </select>
              <p className="text-[10.5px] text-blue-600 dark:text-blue-400 font-bold mt-1.5 flex items-center gap-1">
                <span>ℹ️</span>
                {sellerRole === 'SELLER' && (lang === 'ar' ? 'البائع في السلم الهرمي يكون تحت قيادة مشرف المجموعة.' : 'Le vendeur doit rapporter à un superviseur.')}
                {sellerRole === 'SUPERVISOR' && (lang === 'ar' ? 'المشرف في السلم الهرمي يكون تحت قيادة نائب المدير.' : 'Le superviseur doit rapporter à un adjoint.')}
                {sellerRole === 'DEPUTY' && (lang === 'ar' ? 'نائب المدير في السلم الهرمي يكون تحت قيادة المدير العام.' : 'L\'adjoint doit rapporter au Directeur Général.')}
              </p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              id="cancel-seller-form"
              type="button"
              onClick={resetForm}
              className="cursor-pointer bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-semibold transition"
            >
              {t.cancel}
            </button>
            <button
              id="submit-seller-form"
              type="submit"
              className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              {t.save}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
        <table className="w-full text-start text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <th className="py-3.5 px-4 text-start">{t.sellerName}</th>
              <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'بيانات الدخول (البريد الإلكتروني / كلمة المرور)' : "Identifiants (Email / MDP)"}</th>
              <th className="py-3.5 px-4 text-start">{lang === 'ar' ? 'الرئيس المباشر' : "Supérieur direct"}</th>
              <th className="py-3.5 px-4 text-start">{t.phone}</th>
              <th className="py-3.5 px-4 text-start">{t.status}</th>
              <th className="py-3.5 px-4 text-start">{t.orderDate}</th>
              {!isReadOnly && <th className="py-3.5 px-4 text-center">{t.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60">
            {sellers.length === 0 ? (
              <tr>
                <td colSpan={isReadOnly ? 6 : 7} className="py-8 text-center text-slate-400 italic">
                  {t.noData}
                </td>
              </tr>
            ) : (
              sellers.map(seller => (
                <tr key={seller.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 text-slate-700 dark:text-slate-300 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-850 dark:text-slate-150">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{seller.name}</span>
                      {seller.role === 'ADMIN' && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 font-bold rounded bg-red-100 text-red-800 dark:bg-rose-950/45 dark:text-rose-300 border border-rose-200/50">
                          👑 {lang === 'ar' ? 'المدير العام' : 'Directeur'}
                        </span>
                      )}
                      {seller.role === 'DEPUTY' && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 font-bold rounded bg-purple-100/50 text-purple-800 dark:bg-purple-950/45 dark:text-purple-300 border border-purple-200/50">
                          🛡️ {lang === 'ar' ? 'نائب المدير' : 'Adjoint'}
                        </span>
                      )}
                      {seller.role === 'SUPERVISOR' && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-955/25 dark:text-amber-400 border border-amber-200/50">
                          👥 {lang === 'ar' ? 'مشرف' : 'Superviseur'}
                        </span>
                      )}
                      {(seller.role === 'SELLER' || !seller.role) && (
                        <span className="shrink-0 text-[9px] px-1.5 py-0.5 font-semibold rounded bg-sky-100 text-sky-800 dark:bg-sky-950/45 dark:text-sky-300 border border-sky-200/50">
                          💼 {lang === 'ar' ? 'بائع' : 'Vendeur'}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-blue-500 font-extrabold">{seller.id}</div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">
                    <div className="font-black text-slate-750 dark:text-slate-350">📧 {seller.email || seller.username || '-'}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">🔑 ******* (Firebase Auth Secure)</div>
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold text-slate-650 dark:text-slate-350">
                    {getManagerDisplay(seller)}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">
                    {seller.phone ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {seller.phone}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <button
                      id={`toggle-seller-status-${seller.id}`}
                      disabled={isReadOnly}
                      onClick={() => toggleActiveState(seller)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition ${
                        seller.active
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-955/20 dark:text-emerald-450'
                          : 'bg-red-50 text-red-800 dark:bg-red-955/20 dark:text-red-450'
                      } ${isReadOnly ? 'cursor-not-allowed opacity-90' : 'hover:scale-95'}`}
                    >
                      {seller.active ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          {t.active}
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          {t.inactive}
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-400">
                    {new Date(seller.createdAt).toLocaleDateString(lang)}
                  </td>
                  {!isReadOnly && (
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5 justify-center items-center">
                        <button
                          id={`edit-seller-${seller.id}`}
                          onClick={() => handleEditInit(seller)}
                          className="cursor-pointer p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`delete-seller-${seller.id}`}
                          onClick={() => handleDelete(seller.id)}
                          className={`cursor-pointer p-1.5 rounded transition flex items-center justify-center gap-1 text-[10px] font-bold ${
                            deleteConfirmId === seller.id
                              ? 'bg-rose-500 text-white hover:bg-rose-600 px-2'
                              : 'text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {deleteConfirmId === seller.id ? (
                            <>
                              <X className="w-3 h-3 animate-pulse shrink-0" />
                              <span>{lang === 'ar' ? 'تأكيد؟' : 'Confirmer?'}</span>
                            </>
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* VISUAL ADMINISTRATIVE ORGANIGRAM & HIERARCHY TOOL */}
      <div className="mt-10 border-t border-slate-150 dark:border-slate-800/80 pt-8 animate-in fade-in duration-300">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-base font-bold text-slate-850 dark:text-slate-150">
            {lang === 'ar' ? '🌳 الهيكل التنظيمي والتراتبية الإدارية' : '🌳 Organigramme & Hiérarchie Administrative'}
          </h3>
        </div>
        
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-6 leading-relaxed font-semibold">
          {lang === 'ar' 
            ? 'توضح هذه الأداة التفاعلية السلم الوظيفي وهيكلة فرق المبيعات المعتمدة: المدير العام 🡒 نواب المدير 🡒 مشرفو المجموعات 🡒 البائعون.'
            : 'Cet outil interactif illustre la hiérarchie commerciale : Directeur Général 🡒 Adjoints de direction 🡒 Superviseurs de groupe 🡒 Vendeurs.'}
        </p>

        {renderHierarchyTree()}
      </div>
    </div>
  );
}

// Visual layout function for hierarchy mapping
function renderHierarchyTreeForFile() {} // Placeholder for type definitions if needed
