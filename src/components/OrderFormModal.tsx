import React, { useState, useEffect } from 'react';
import { Seller, Product, Order, OrderStatus, Language, UserRole } from '../types';
import { DatabaseService, calculateOrderProfit } from '../dbMock';
import { translations } from '../locales';
import { X, Calendar, User, Phone, MapPin, Layers, ShoppingBag, DollarSign, StickyNote, Activity, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  role: UserRole;
  currentUser: string; // The active user persona name
  editingOrder: Order | null;
  onSave: () => void;
  toast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function OrderFormModal({
  isOpen,
  onClose,
  lang,
  role,
  currentUser,
  editingOrder,
  onSave,
  toast
}: Props) {
  const t = translations[lang];

  // Load masters
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Form payload states
  const [orderDate, setOrderDate] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [quantity, setQuantity] = useState<string>(''); // empty by default
  const [productId, setProductId] = useState('');
  const [deliveryCost, setDeliveryCost] = useState<string>('35');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('PENDING');
  const [assignedSupervisorId, setAssignedSupervisorId] = useState<string>('');

  const getEligibleSupervisors = (): Seller[] => {
    if (!sellerName) return [];
    const activeSellers = DatabaseService.getSellers();
    const selectedSeller = activeSellers.find(s => s.name === sellerName);
    if (!selectedSeller) return [];

    const directParentIds = new Set<string>();
    if (selectedSeller.parentId) directParentIds.add(selectedSeller.parentId);
    if (selectedSeller.parentIds) {
      selectedSeller.parentIds.forEach(id => directParentIds.add(id));
    }

    const eligible = activeSellers.filter(s => directParentIds.has(s.id));
    if (directParentIds.has('admin_1') && !eligible.some(e => e.id === 'admin_1')) {
      eligible.push({
        id: 'admin_1',
        name: lang === 'ar' ? 'عبد الله (المدير العام)' : 'Abdellah (Directeur)',
        role: 'ADMIN',
        phone: '',
        active: true,
        createdAt: ''
      });
    }
    return eligible;
  };

  const handleSellerChange = (newSellerName: string) => {
    setSellerName(newSellerName);
    const sellersList = DatabaseService.getSellers();
    const selectedSeller = sellersList.find(s => s.name === newSellerName);
    if (selectedSeller) {
      const directParentIds: string[] = [];
      if (selectedSeller.parentId) directParentIds.push(selectedSeller.parentId);
      if (selectedSeller.parentIds) {
        selectedSeller.parentIds.forEach(id => {
          if (!directParentIds.includes(id)) directParentIds.push(id);
        });
      }
      if (directParentIds.length > 0) {
        setAssignedSupervisorId(directParentIds[0]);
      } else {
        setAssignedSupervisorId('');
      }
    } else {
      setAssignedSupervisorId('');
    }
  };

  useEffect(() => {
    // Collect active sellers/products
    setSellers(DatabaseService.getSellers().filter(s => s.active));
    setProducts(DatabaseService.getProducts().filter(p => p.active));
  }, [isOpen]);

  useEffect(() => {
    if (editingOrder) {
      setOrderDate(editingOrder.orderDate);
      setSellerName(editingOrder.sellerName);
      setCustomerName(editingOrder.customerName);
      setPhone(editingOrder.phone);
      setCity(editingOrder.city);
      setAddress(editingOrder.address);
      setQuantity(editingOrder.quantity.toString());
      setNotes(editingOrder.notes);
      setOrderStatus(editingOrder.orderStatus);
      setDeliveryCost(editingOrder.deliveryCost.toString());
      setTotalAmount(editingOrder.totalAmount.toString());
      setAssignedSupervisorId(editingOrder.assignedSupervisorId || '');

      // Match product name to find ProductID if needed
      const foundProd = DatabaseService.getProducts().find(p => p.productName === editingOrder.product);
      if (foundProd) {
        setProductId(foundProd.id);
      } else {
        setProductId('');
      }
    } else {
      // Create defaults
      const today = new Date().toISOString().split('T')[0];
      setOrderDate(today);
      setCustomerName('');
      setPhone('');
      setCity('');
      setAddress('');
      setQuantity(''); // Empty default as requested
      setNotes('');
      setOrderStatus('PENDING');
      setDeliveryCost('35'); // standard default
      setTotalAmount('');
      
      // Auto select current seller if seller is logged in
      const sellersList = DatabaseService.getSellers().filter(s => s.active);
      const activeSellersObj = sellersList.find(s => s.name === currentUser);
      let selName = '';
      if (activeSellersObj) {
        selName = activeSellersObj.name;
        setSellerName(activeSellersObj.name);
      } else if (sellersList.length > 0) {
        selName = sellersList[0].name;
        setSellerName(sellersList[0].name);
      } else {
        setSellerName('');
      }

      // Automatically select the first eligible supervisor
      if (selName) {
        const selectedSeller = sellersList.find(s => s.name === selName);
        if (selectedSeller) {
          const directParentIds: string[] = [];
          if (selectedSeller.parentId) directParentIds.push(selectedSeller.parentId);
          if (selectedSeller.parentIds) {
            selectedSeller.parentIds.forEach(id => {
              if (!directParentIds.includes(id)) directParentIds.push(id);
            });
          }
          if (directParentIds.length > 0) {
            setAssignedSupervisorId(directParentIds[0]);
          } else {
            setAssignedSupervisorId('');
          }
        } else {
          setAssignedSupervisorId('');
        }
      } else {
        setAssignedSupervisorId('');
      }

      // Auto select first active product
      const activeProds = DatabaseService.getProducts().filter(p => p.active);
      if (activeProds.length > 0) {
        setProductId(activeProds[0].id);
      } else {
        setProductId('');
      }
    }
  }, [editingOrder, isOpen, currentUser]);

  // Handle default total calculation once when Product changes (only in Create mode to suggest a default)
  useEffect(() => {
    if (!editingOrder && productId) {
      const selectedProduct = DatabaseService.getProducts().find(p => p.id === productId);
      if (selectedProduct) {
        const qty = parseFloat(quantity) || 0;
        const dCost = parseFloat(deliveryCost) || 0;
        const basePrice = selectedProduct.sellingPrice * qty;
        if (qty > 0) {
          setTotalAmount((basePrice + dCost).toString());
        } else {
          setTotalAmount('');
        }
      }
    }
  }, [productId, quantity, deliveryCost, editingOrder]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Permissions check
    if (role === 'PUBLIC') {
      toast(t.permissionDeniedError, 'error');
      return;
    }

    if (role === 'SELLER' && editingOrder) {
      toast(lang === 'ar' ? '⚠️ غير مسموح للبائعين بتعديل الطلبيات.' : '⚠️ Les vendeurs ne sont pas autorisés à modifier les commandes.', 'error');
      return;
    }

    // Input validations
    if (!customerName.trim() || !phone.trim() || !city.trim() || !productId) {
      toast(t.fieldRequired, 'error');
      return;
    }

    const parsedQty = parseInt(quantity) || 0;
    if (parsedQty <= 0) {
      toast(lang === 'ar' ? '⚠️ يرجى إدخال كمية صالحة أكبر من 0' : '⚠️ Veuillez entrer une quantité valide supérieure à 0', 'error');
      return;
    }

    const parsedDelivery = parseFloat(deliveryCost) || 0;
    const parsedTotal = parseFloat(totalAmount) || 0;

    const currentProducts = DatabaseService.getProducts();
    const selectedProd = currentProducts.find(p => p.id === productId);
    if (!selectedProd) {
      toast(lang === 'ar' ? 'يرجى اختيار منتج صالح' : 'Sélectionnez un produit valide', 'error');
      return;
    }

    // Profit calculation: 
    // Profit = TotalAmount - DeliveryCost - (WholesalePrice * Quantity) if Delivered, else 0
    const profit = calculateOrderProfit(
      selectedProd.wholesalePrice,
      selectedProd.sellingPrice,
      parsedQty,
      parsedDelivery,
      parsedTotal,
      orderStatus
    );

    const orders = DatabaseService.getOrders();
    const orderDateClean = orderDate || new Date().toISOString().split('T')[0];

    if (editingOrder) {
      // Edit mode
      const updatedOrders = orders.map(o => {
        if (o.id === editingOrder.id) {
          return {
            ...o,
            orderDate: orderDateClean,
            sellerName,
            customerName: customerName.trim(),
            phone: phone.trim(),
            city: city.trim(),
            address: address.trim(),
            quantity: parsedQty,
            product: selectedProd.productName,
            deliveryCost: parsedDelivery,
            totalAmount: parsedTotal,
            notes: notes.trim(),
            orderStatus,
            profit,
            assignedSupervisorId: assignedSupervisorId || undefined,
            updatedAt: new Date().toISOString()
          };
        }
        return o;
      });

      DatabaseService.saveOrders(updatedOrders);
      DatabaseService.triggerNotification('order_updated', currentUser, {
        titleAr: 'تحديث طلبية',
        titleFr: 'Commande mise à jour',
        titleEn: 'Order Updated',
        ar: `قام المستخدم "${currentUser}" بتعديل الطلبية الخاصة بالزبون "${customerName.trim()}". الحالة الحالية: ${orderStatus}.`,
        fr: `L'utilisateur "${currentUser}" a mis à jour la commande du client "${customerName.trim()}". Statut actuel: ${orderStatus}.`,
        en: `User "${currentUser}" updated the order for client "${customerName.trim()}". Current status: ${orderStatus}.`
      });
      toast(t.orderUpdatedSuccess, 'success');
    } else {
      // Create mode
      const newOrder: Order = {
        id: 'ord_' + Date.now(),
        orderDate: orderDateClean,
        sellerName,
        customerName: customerName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        address: address.trim(),
        quantity: parsedQty,
        product: selectedProd.productName,
        deliveryCost: parsedDelivery,
        totalAmount: parsedTotal,
        notes: notes.trim(),
        orderStatus,
        profit,
        createdBy: currentUser,
        assignedSupervisorId: assignedSupervisorId || undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      orders.push(newOrder);
      DatabaseService.saveOrders(orders);
      DatabaseService.triggerNotification('order_created', currentUser, {
        titleAr: 'إضافة طلبية جديدة',
        titleFr: 'Nouvelle commande créée',
        titleEn: 'New Order Created',
        ar: `تم تسجيل طلبية جديدة للزبون "${customerName.trim()}" بقيمة ${parsedTotal} MAD بواسطة "${currentUser}".`,
        fr: `Une nouvelle commande pour le client "${customerName.trim()}" d'une valeur de ${parsedTotal} MAD a été créée par "${currentUser}".`,
        en: `A new order for client "${customerName.trim()}" worth ${parsedTotal} MAD was created by "${currentUser}".`
      });
      toast(t.orderCreatedSuccess, 'success');
    }

    onSave();
    onClose();
  };



  return (
    <div id="order-form-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200 overflow-y-auto">
      <div id="order-form-container" className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-6 md:p-8 animate-in fade-in zoom-in-95 duration-150 my-8">
        
        {/* Header */}
        <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
              {editingOrder ? t.editOrder : t.addOrder}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {lang === 'ar' ? 'نموذج إدخال وتعديل بيانات الطلب' : 'Formulaire d’informations de la commande'}
            </p>
          </div>
          <button
            id="close-order-modal-btn"
            onClick={onClose}
            className="cursor-pointer p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Order Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {t.orderDate}*
              </label>
              <input
                id="order-date-input"
                type="date"
                required
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Seller Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {t.sellerName}*
              </label>
              <select
                id="order-seller-select"
                disabled={role === 'SELLER'} // Sellers cannot change the order seller attribution
                value={sellerName}
                onChange={e => handleSellerChange(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {sellers.length === 0 ? (
                  <option value="">{lang === 'ar' ? 'لا يوجد بائعون نشطون' : 'Aucun vendeur actif'}</option>
                ) : (
                  sellers.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Supervisor Selection if there are eligible supervisors */}
          {getEligibleSupervisors().length > 0 && (
            <div className="bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100 dark:border-blue-900/30 p-4 rounded-xl space-y-2">
              <label className="block text-xs font-bold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
                {lang === 'ar' ? 'المشرف المسؤول عن هذه الطلبية' : 'Superviseur responsable de cette commande'}*
              </label>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold">
                {lang === 'ar' 
                  ? 'بما أن البائع مرتبط بأكثر من مشرف واحد، يرجى تحديد المشرف المسؤول عن هذه الطلبية لتوجيهها إليه وتجنب تكرارها لدى البقية.'
                  : 'Puisque le vendeur est lié à plusieurs superviseurs, veuillez spécifier le superviseur responsable de cette commande.'}
              </p>
              <select
                id="order-supervisor-select"
                required
                disabled={!!editingOrder && role !== 'ADMIN' && role !== 'DEPUTY'}
                value={assignedSupervisorId}
                onChange={e => setAssignedSupervisorId(e.target.value)}
                className="w-full text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                <option value="">{lang === 'ar' ? '-- اختر المشرف --' : '-- Choisir le superviseur --'}</option>
                {getEligibleSupervisors().map(sup => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name} ({sup.role === 'ADMIN' ? (lang === 'ar' ? 'مدير' : 'Directeur') : (lang === 'ar' ? 'مشرف' : 'Superviseur')})
                  </option>
                ))}
              </select>
              {(!!editingOrder && role !== 'ADMIN' && role !== 'DEPUTY') && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                  ⚠️ {lang === 'ar' 
                    ? 'تعديل المشرف المسؤول متاح فقط لنائب المدير أو المدير العام.' 
                    : 'La modification du superviseur est réservée au directeur adjoint ou supérieur.'}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Customer name */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {t.customerName}*
              </label>
              <input
                id="order-customer-input"
                type="text"
                required
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={lang === 'ar' ? 'اسم المشتري' : 'Nom du client'}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {t.phone}*
              </label>
              <input
                id="order-phone-input"
                type="tel"
                inputMode="tel"
                required
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={t.phonePlaceholder}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* City */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {t.city}*
              </label>
              <input
                id="order-city-input"
                type="text"
                required
                value={city}
                onChange={e => setCity(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={lang === 'ar' ? 'مثلا الدار البيضاء، الرباط...' : 'Ex: Casablanca, Paris'}
              />
            </div>

            {/* Full Address */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {t.address}
              </label>
              <input
                id="order-address-input"
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                placeholder={lang === 'ar' ? 'العنوان السكني التفصيلي' : 'Adresse de livraison'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Product selection */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-slate-400" />
                {t.product}*
              </label>
              <select
                id="order-product-select"
                required
                value={productId}
                onChange={e => setProductId(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {products.length === 0 ? (
                  <option value="">{lang === 'ar' ? 'لا يوجد منتجات نشطة' : 'Aucun produit actif'}</option>
                ) : (
                  products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.productName} ({p.sellingPrice.toLocaleString()} MAD)
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                {t.quantity}*
              </label>
              <input
                id="order-quantity-input"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder={lang === 'ar' ? 'الكمية صالحة' : 'Ex: 1'}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-850">
            {/* Delivery cost */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-slate-400" />
                {t.deliveryCost} (MAD)*
              </label>
              <input
                id="order-delivery-cost-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                required
                value={deliveryCost}
                onChange={e => setDeliveryCost(e.target.value)}
                placeholder="0.00"
                className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-md py-1.5 px-2.5 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-semibold"
              />
            </div>

            {/* Manual Total amount input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3 text-slate-400" />
                {t.totalAmount} (MAD)*
              </label>
              <input
                id="order-total-amount-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                required
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-805 rounded-md py-1.5 px-2.5 text-blue-600 dark:text-blue-400 font-bold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Notes */}
            <div className={editingOrder ? "sm:col-span-2" : "sm:col-span-3"}>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-slate-400" />
                {t.notes}
              </label>
              <textarea
                id="order-notes-input"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2 px-3 text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder={lang === 'ar' ? 'أي ملاحظات خاصة للزبون أو التوصيل' : 'Notes complémentaires...'}
              />
            </div>

            {/* Order Status - Only visible when editing exists */}
            {editingOrder && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-slate-400" />
                  {t.status}*
                </label>
                <select
                  id="order-status-select"
                  value={orderStatus}
                  onChange={e => setOrderStatus(e.target.value as OrderStatus)}
                  className="w-full text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg py-2.5 px-3 text-slate-850 dark:text-slate-150 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer text-xs font-semibold uppercase"
                >
                  <option value="PENDING">🕒 {t.PENDING}</option>
                  <option value="DELIVERED">✅ {t.DELIVERED}</option>
                  <option value="DELAYED">⏳ {t.DELAYED}</option>
                  <option value="REJECTED">❌ {t.REJECTED}</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end border-t border-slate-100 dark:border-slate-800 pt-5 mt-6">
            <button
              id="cancel-order-modal-btn"
              type="button"
              onClick={onClose}
              className="cursor-pointer bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2.5 rounded-lg text-sm font-semibold transition"
            >
              {t.cancel}
            </button>
            <button
              id="submit-order-modal-btn"
              type="submit"
              className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 transition"
            >
              <DollarSign className="w-4 h-4" />
              {t.save}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
