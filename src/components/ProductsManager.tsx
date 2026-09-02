import React, { useState, useEffect, useMemo } from 'react';
import { DatabaseService } from '../dbMock';
import { Product, Language, UserRole } from '../types';
import { translations } from '../locales';
import { Tag, Edit2, Trash2, CheckCircle, XCircle, Save, X, Search, Filter, RotateCcw } from 'lucide-react';

interface Props {
  lang: Language;
  role: UserRole;
  onDataChange: () => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
  dataTrigger?: number;
}

export default function ProductsManager({ lang, role, onDataChange, toast, dataTrigger }: Props) {
  const t = translations[lang];
  const isReadOnly = role === 'PUBLIC' || role === 'SELLER';

  const [products, setProducts] = useState<Product[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Form states
  const [productName, setProductName] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [sellingPrice, setSellingPrice] = useState<string>('');
  const [active, setActive] = useState(true);

  useEffect(() => {
    setProducts(DatabaseService.getProducts());
  }, [dataTrigger]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = !searchTerm.trim() || 
        p.productName.toLowerCase().includes(searchTerm.trim().toLowerCase());
      
      let matchesStatus = true;
      if (statusFilter === 'ACTIVE') matchesStatus = p.active;
      if (statusFilter === 'INACTIVE') matchesStatus = !p.active;

      return matchesSearch && matchesStatus;
    });
  }, [products, searchTerm, statusFilter]);

  const resetForm = () => {
    setProductName('');
    setWholesalePrice('');
    setSellingPrice('');
    setActive(true);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleCreateOrUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (!productName.trim()) {
      toast(t.fieldRequired, 'error');
      return;
    }

    const parsedWholesale = parseFloat(wholesalePrice) || 0;
    const parsedSelling = parseFloat(sellingPrice) || 0;

    if (parsedWholesale < 0 || parsedSelling < 0) {
      toast(t.valuePositive, 'error');
      return;
    }

    const currentProducts = [...products];

    if (editingId) {
      const idx = currentProducts.findIndex(p => p.id === editingId);
      if (idx !== -1) {
        currentProducts[idx] = {
          ...currentProducts[idx],
          productName: productName.trim(),
          wholesalePrice: parsedWholesale,
          sellingPrice: parsedSelling,
          active
        };
        DatabaseService.saveProducts(currentProducts);
        toast(t.productUpdatedSuccess, 'success');
      }
    } else {
      const newProduct: Product = {
        id: 'prod_' + Date.now(),
        productName: productName.trim(),
        wholesalePrice: parsedWholesale,
        sellingPrice: parsedSelling,
        active,
        createdAt: new Date().toISOString()
      };
      currentProducts.push(newProduct);
      DatabaseService.saveProducts(currentProducts);
      toast(t.productCreatedSuccess, 'success');
    }

    setProducts(currentProducts);
    onDataChange();
    resetForm();
  };

  const handleEditInit = (product: Product) => {
    setEditingId(product.id);
    setProductName(product.productName);
    setWholesalePrice(product.wholesalePrice === 0 ? '' : product.wholesalePrice.toString());
    setSellingPrice(product.sellingPrice === 0 ? '' : product.sellingPrice.toString());
    setActive(product.active);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (isReadOnly) {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (deleteConfirmId === id) {
      const filtered = products.filter(p => p.id !== id);
      DatabaseService.saveProducts(filtered);
      setProducts(filtered);
      toast(t.productDeletedSuccess, 'success');
      onDataChange();
      setDeleteConfirmId(null);
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => {
        setDeleteConfirmId(current => current === id ? null : current);
      }, 3000);
    }
  };

  const toggleActiveState = (product: Product) => {
    if (isReadOnly) {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    const updated = products.map(p => {
      if (p.id === product.id) {
        return { ...p, active: !p.active };
      }
      return p;
    });
    DatabaseService.saveProducts(updated);
    setProducts(updated);
    toast(t.productUpdatedSuccess, 'success');
    onDataChange();
  };

  return (
    <div id="products-manager-section" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs transition-colors">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t.products}</h2>
          <p className="text-xs text-slate-500 mt-1">{lang === 'ar' ? 'عدد المنتجات المسجلة' : lang === 'fr' ? 'Produits enregistrés' : 'Registered products'}: {products.length}</p>
        </div>
        {!isReadOnly && !isFormOpen && (
          <button
            id="add-product-init-btn"
            onClick={() => setIsFormOpen(true)}
            className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-2 transition"
          >
            <Tag className="w-4 h-4" />
            {t.addProduct}
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
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">{editingId ? t.editProduct : t.addProduct}</h3>
            <button type="button" onClick={resetForm} className="cursor-pointer text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.productName}*</label>
              <input
                id="product-name-input"
                type="text"
                required
                value={productName}
                onChange={e => setProductName(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={lang === 'ar' ? 'اسم المنتج التفصيلي' : 'Par exemple: Smartphone F4'}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.wholesalePrice} (MAD)*</label>
              <input
                id="product-wholesale-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                value={wholesalePrice}
                onChange={e => setWholesalePrice(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{t.sellingPrice} (MAD)*</label>
              <input
                id="product-selling-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                required
                value={sellingPrice}
                onChange={e => setSellingPrice(e.target.value)}
                placeholder="0.00"
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-between items-center pt-2">
            <div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  id="product-active-checkbox"
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
            <div className="flex gap-2">
              <button
                id="cancel-product-form"
                type="button"
                onClick={resetForm}
                className="cursor-pointer bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-semibold transition"
              >
                {t.cancel}
              </button>
              <button
                id="submit-product-form"
                type="submit"
                className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
              >
                <Save className="w-4 h-4" />
                {t.save}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search and Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-4 bg-slate-50/70 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-150 dark:border-slate-800/80">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="products-search-input"
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={lang === 'ar' ? 'بحث باسم المنتج...' : lang === 'fr' ? 'Rechercher par nom...' : 'Search by product name...'}
            className="w-full text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-2 ps-9 pe-8 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 self-center sm:self-auto shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`cursor-pointer px-2.5 py-1 rounded-md text-xs font-semibold transition ${
              statusFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {lang === 'ar' ? 'الكل' : lang === 'fr' ? 'Tous' : 'All'} ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ACTIVE')}
            className={`cursor-pointer px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
              statusFilter === 'ACTIVE'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            {lang === 'ar' ? 'نشط' : lang === 'fr' ? 'Actif' : 'Active'} ({products.filter(p => p.active).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('INACTIVE')}
            className={`cursor-pointer px-2.5 py-1 rounded-md text-xs font-semibold transition flex items-center gap-1 ${
              statusFilter === 'INACTIVE'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            {lang === 'ar' ? 'غير نشط' : lang === 'fr' ? 'Inactif' : 'Inactive'} ({products.filter(p => !p.active).length})
          </button>
        </div>

        {/* Reset Filter Button if active filters */}
        {(searchTerm || statusFilter !== 'ALL') && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('ALL');
            }}
            title={lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Réinitialiser les filtres'}
            className="cursor-pointer text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{lang === 'ar' ? 'إعادة ضبط' : 'Réinitialiser'}</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
        <table className="w-full text-start text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
              <th className="py-3.5 px-4 text-start">{t.productName}</th>
              {role !== 'PUBLIC' && <th className="py-3.5 px-4 text-start">{t.wholesalePrice}</th>}
              <th className="py-3.5 px-4 text-start">{t.sellingPrice}</th>
              {role !== 'PUBLIC' && (
                <th className="py-3.5 px-4 text-start">
                  {lang === 'ar' ? 'العائد المتوقع' : lang === 'fr' ? 'Bénéfice estimé' : 'Estimated Margin'}
                </th>
              )}
              <th className="py-3.5 px-4 text-start">{t.status}</th>
              {!isReadOnly && <th className="py-3.5 px-4 text-center">{t.actions}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-150 dark:divide-slate-800/60">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                  {products.length === 0 ? (
                    t.noData
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                      <Search className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                        {lang === 'ar' ? 'لا توجد منتجات تطابق البحث أو الفلتر المحدد' : lang === 'fr' ? 'Aucun produit ne correspond à votre recherche' : 'No products match your search or filter'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm('');
                          setStatusFilter('ALL');
                        }}
                        className="cursor-pointer mt-1 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        {lang === 'ar' ? 'إعادة ضبط فلاتر البحث' : 'Réinitialiser la recherche'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredProducts.map(product => (
                <tr key={product.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 text-slate-700 dark:text-slate-300 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-850 dark:text-slate-150">{product.productName}</td>
                  {role !== 'PUBLIC' && (
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-500">
                      {product.wholesalePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} MAD
                    </td>
                  )}
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {product.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} MAD
                  </td>
                  {role !== 'PUBLIC' && (
                    <td className="py-3 px-4 font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                      +{(product.sellingPrice - product.wholesalePrice).toLocaleString(undefined, { minimumFractionDigits: 2 })} MAD
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <button
                      id={`toggle-prod-status-${product.id}`}
                      disabled={isReadOnly}
                      onClick={() => toggleActiveState(product)}
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer transition ${
                        product.active
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                          : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-400'
                      } ${isReadOnly ? 'cursor-not-allowed opacity-90' : 'hover:scale-95'}`}
                    >
                      {product.active ? (
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
                  {!isReadOnly && (
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5 justify-center items-center">
                        <button
                          id={`edit-prod-${product.id}`}
                          onClick={() => handleEditInit(product)}
                          className="cursor-pointer p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          id={`delete-prod-${product.id}`}
                          onClick={() => handleDelete(product.id)}
                          className={`cursor-pointer p-1.5 rounded transition flex items-center justify-center gap-1 text-[10px] font-bold ${
                            deleteConfirmId === product.id
                              ? 'bg-rose-500 text-white hover:bg-rose-600 px-2'
                              : 'text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {deleteConfirmId === product.id ? (
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
    </div>
  );
}
