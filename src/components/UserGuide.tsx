import React, { useState } from "react";
import { 
  BookOpen, 
  Search, 
  HelpCircle, 
  CheckCircle2, 
  Globe, 
  Layers, 
  FileText, 
  MapPin, 
  Settings, 
  Printer, 
  ExternalLink,
  Info,
  Camera,
  MousePointer,
  UploadCloud,
  Eye,
  Check,
  ChevronRight,
  ArrowRight,
  Sparkles,
  RefreshCw,
  PlusCircle,
  FileSpreadsheet
} from "lucide-react";

interface UserGuideProps {
  lang: "ar" | "fr";
}

export function UserGuide({ lang: initialLang }: UserGuideProps) {
  const [guideLang, setGuideLang] = useState<"ar" | "fr">(initialLang);
  const [activeTab, setActiveTab] = useState<"visual" | "detailed">("visual");
  const [searchQuery, setSearchQuery] = useState("");

  const isAr = guideLang === "ar";

  const sectionsAr = [
    {
      id: "intro",
      title: "1. مقدمة شاملة وبنية التطبيق",
      icon: <Info className="w-5 h-5 text-indigo-400" />,
      content: "تطبيق Parcel Layout Designer هو منصة متكاملة مخصصة لمهندسي المساحة والطبوعربيا (IGT) لتصميم الملفات التقنية ومخططات التحديد المعتمدة لدى مصالح الوكالة الوطنية للمحافظة العقارية والمسح العقاري والخرائطية (ANCFCC). يدمج التطبيق بين لوحة تحكم تفاعلية للتعديل الهندسي المباشر، ومحاكي الخرائط الجغرافية النشط، واستوديو التوليد التلقائي لملفات الطباعة بجودة A4."
    },
    {
      id: "live_preview",
      title: "2. أداة المعاينة الحية وتحريك نقاط الحدود",
      icon: <Eye className="w-5 h-5 text-emerald-400" />,
      content: `يوفر التطبيق خريطة تفاعلية متطورة للمعاينة الحية تتيح لك:
• رؤية القطعة الأرضية في موقعها الجغرافي الحقيقي متراكبة مع الصور الجوية عالية الدقة (Orthophotoplan).
• سحب وإزاحة نقاط الحدود (Drag-and-Drop Vertices) مباشرة باستخدام الفأرة على الخريطة لتصحيح موقع أي رأس من الرؤوس.
• تحديث جدول الإحداثيات (X, Y) والمساحة والمحيط بشكل فوري وتزامني في نفس لحظة تحريك النقطة.
• التبديل بين طبقات الخريطة المختلفة من صندوق الاختيار السفلي (صورة فضائية هجينة، خريطة طرقية كلاسيكية، أو طبقة بيضاء لبيان التخطيط الهندسي الصرف).`
    },
    {
      id: "modify_drawing",
      title: "3. كيفية تعديل الرسم وإضافة نقاط جديدة",
      icon: <PlusCircle className="w-5 h-5 text-amber-400" />,
      content: `يمكنك التحكم التام بالرسم مضلع الحدود وتغيير تصميمه عبر طريقتين:
• التعديل العددي المباشر: من خلال "جدول إحداثيات النقط (القمم)" باللوحة الجانبية، يمكنك النقر على خانة إحداثي X (Est) أو Y (Nord) أو Z (Altitude) وإدخال القيمة العددية يدوياً بالدقة المطلوبة لتعديل موضع النقطة فوراً.
• إضافة نقطة جديدة للمضلع:
  1. انتقل إلى نموذج "إضافة نقطة جديدة للمضلع" أسفل جدول الإحداثيات.
  2. أدخل الإحداثي الشرقي (X) والإحداثي الشمالي (Y) والارتفاع (Z).
  3. انقر على زر "إضافة نقطة" ليتم إدراج الرأس الجديد في نهاية المضلع وحساب المساحة الجديدة فوراً.
• حذف النقاط: يمكنك إزالة أي نقطة بالضغط على زر الحذف الأحمر بجانب النقطة في الجدول لإعادة تشكيل المضلع.`
    },
    {
      id: "import_data",
      title: "4. استيراد الرفع الطبوغرافي الرقمي",
      icon: <UploadCloud className="w-5 h-5 text-sky-400" />,
      content: `يدعم التطبيق استيراد الرفع الطبوغرافي الخارجي بطريقة مرنة وسهلة:
• سحب وإسقاط أو تصفح الملفات بصيغ: DXF (أوتوكاد)، KML/KMZ (جوجل إيرث)، GPX، CSV، أو ملفات Excel (.xlsx).
• تحديد نظام الإحداثيات المرجعي للملف المستورد (Source CRS) للتأكد من إسقاطه الرياضي الصحيح.
• بعد رفع الملف، يتعرف التطبيق تلقائياً على المضلع المغلق، ويرسمه على الخريطة مع استيراد جدول النقاط بالكامل.
• ميزة مطابقة الأسماء: يمكنك اختيار العمود المناسب من جدول البيانات المستورد ليكون هو مسمى نقاط الحدود الرسمية.`
    },
    {
      id: "layout_setup",
      title: "5. إعداد المخطط وملء البيانات الأساسية وتخصيص الكتابة",
      icon: <Settings className="w-5 h-5 text-blue-400" />,
      content: `لتهيئة رأسية الملف الفني وتخصيص طريقة وأحجام كتابة نقاط الحدود، املأ الحقول في لوحة التحكم الجانبية:
• البيانات الإدارية: رقم الملف التقني (Dossier N°)، اسم المالك (Propriétaire)، الإقليم/العمالة، الجماعة الترابية، والمدينة أو الدائرة.
• تحديد مقياس الرسم (Echelle) : يمكنك ترك النظام يحسب السلم الأنسب تلقائياً لملء الصفحة، أو تحديد مقياس يدوي محدد ليتلائم مع قياسات الورقة.
• تسمية المجاورين (Riverains): لكل ضلع ممتد بين نقطتين، قم بكتابة اسم المجاور الفعلي لتظهر التسميات بشكل موازٍ للأضلاع على المخطط الهندسي وفي جدول الحدود.
• تخصيص بادئة نقاط الحدود (Prefix): يمكنك اختيار الحرف الأول لتسمية نقط الحدود: الحرف P (افتراضي)، الحرف B (بورن/Borne)، بدون حرف (أرقام فقط)، أو كتابة بادئة مخصصة من اختيارك (مثل T أو S). وسيتم تحيين كامل المخطط والجداول فوراً وفق الخيار المعتمد.
• التحكم في حجم الخط والمسافات (Font & Offset): تمنحك اللوحة الجانبية إمكانية التحكم الدقيق عبر مؤشرات سحب تفاعلية في:
  1. حجم خط كتابة النقط (القمم) على المخطط والخريطة.
  2. حجم خط كتابة المسافات والتعليقات والحدود والمجاورين.
  3. المسافة الفاصلة (Offset) بين كتابة المسافات/التعليقات والضلع المقابل لها لتفادي تداخل النصوص وتحقيق وضوح هندسي تام.
• فواصل شبكة الإحداثيات: اضبط فاصل الشبكة بالمتر (مثلاً: 50م، 100م) للتحكم بكثافة خطوط الإحداثيات المتراكبة.`
    },
    {
      id: "print_choice",
      title: "6. التبديل بين أنماط الطباعة وحفظ الملفات",
      icon: <Printer className="w-5 h-5 text-rose-500" />,
      content: `تم تجميع خيارات الطباعة وتطويرها في لوحة معاينة موحدة ومباشرة لتسهيل العمل:
• نمط 'الطباعة مرفوقة بصفحة الغلاف' (طباعة 1 سابقاً):
  - وثيقة رسمية متكاملة من صفحتين بحجم A4.
  - الصفحة الأولى عبارة عن غلاف فني رسمي (Page de Garde) يحتوي على المعلومات الإدارية، جدول الإحداثيات الكامل مع الارتفاعات، ونافذة مدمجة للصورة الجوية (Orthophotoplan) لدعم المعاينة البصرية لموقع العقار مع إمكانية إظهار 'سهم المشروع الأحمر'.
  - الصفحة الثانية مخصصة للمخطط الطبوغرافي الرسمي مع مقياس الرسم وسهم الشمال والرياح، وجدول المسافات والمجاورين المفصل.

• نمط 'الطباعة بدون صفحة الغلاف' (طباعة 2 سابقاً):
  - وثيقة هندسية مدمجة في صفحة واحدة أفقية (Landscape) مخصصة فقط للمخطط الطبوغرافي (Plan Parcellaire).
  - تتميز بوجود عنوان بارز في الأعلى 'PLAN PARCELLAIRE'، مع إدراج شارة رسمية ومطورة في حاشية الخريطة توضح المساحة الكلية للعقار بالتفصيل والتقسيم المغربي التقليدي (هكتار . آر . سنتيار) مثل: SURFACE : 2 H . 14 A . 35 Ca.

• طريقة الحفظ كـ PDF:
  - اضغط على زر 'طباعة / Générer PDF'.
  - في إعدادات الطباعة للمتصفح: اختر حفظ بتنسيق PDF، الحجم A4، تفعيل 'رسومات الخلفية' (مهم لإظهار الخرائط والصور الجوية)، وإلغاء تفعيل 'الهوامش الرأسية والتذييلات'.`
    }
  ];

  const sectionsFr = [
    {
      id: "intro",
      title: "1. Introduction Globale & Architecture",
      icon: <Info className="w-5 h-5 text-indigo-400" />,
      content: "L'application Parcel Layout Designer est un outil SaaS de pointe, conçu pour aider les Ingénieurs Géomètres Topographes (IGT) au Maroc à concevoir des plans de délimitation conformes aux normes administratives de l'ANCFCC. L'application intègre un espace d'édition géométrique temps réel, un moteur de rendu de cartes interactives et un studio d'impression automatisé A4."
    },
    {
      id: "live_preview",
      title: "2. Outil de Prévisualisation Interactive de la Carte",
      icon: <Eye className="w-5 h-5 text-emerald-400" />,
      content: `La carte interactive de prévisualisation en temps réel vous permet de :
• Localiser géographiquement la parcelle sur une imagerie satellite de haute précision (Orthophotoplan).
• Faire glisser et déplacer les sommets de la parcelle directement sur l'écran pour réajuster visuellement l'emprise.
• Recalculer instantanément les coordonnées Lambert (X, Y), la surface totale et le périmètre à chaque déplacement de point.
• Basculer entre différents fonds de carte (Imagerie Hybride, Carte routière vectorielle classique ou canevas neutre blanc d'ingénierie).`
    },
    {
      id: "modify_drawing",
      title: "3. Édition du Polygone & Ajout de Sommets",
      icon: <PlusCircle className="w-5 h-5 text-amber-400" />,
      content: `Vous pouvez modifier et enrichir la géométrie parcellaires de deux façons complémentaires :
• Édition numérique directe : Modifiez directement les valeurs de l'Est (X), du Nord (Y) ou de l'Altitude (Z) dans le tableau des sommets. L'emprise de la parcelle s'adapte immédiatement sur la carte.
• Ajout de nouveaux points :
  1. Utilisez le formulaire 'Ajouter un point au polygone' sous le tableau.
  2. Saisissez les coordonnées de départ X, Y et l'altitude Z.
  3. Cliquez sur 'Ajouter un point' pour insérer le nouveau sommet et mettre à jour la surface projetée.
• Suppression de sommets : Supprimez n'importe quel point superflu d'un clic sur l'icône de corbeille rouge pour simplifier le mouchard géométrique.`
    },
    {
      id: "import_data",
      title: "4. Importation Simplifiée des Levés Topographiques",
      icon: <UploadCloud className="w-5 h-5 text-sky-400" />,
      content: `Gagnez du temps en important des données brutes récoltées sur le terrain :
• Formats pris en charge : AutoCAD DXF (lignes ou points), Google Earth KML/KMZ, fichiers d'arpentage GPX, feuilles de calcul Excel (.xlsx) et fichiers CSV.
• Indiquez la projection d'origine (Source CRS) de votre fichier pour assurer une projection conforme lors du traitement.
• Après le chargement, le système extrait automatiquement les contours fermés, trace la parcelle sur la carte de localisation et remplit la table des sommets (P1, P2...).`
    },
    {
      id: "layout_setup",
      title: "5. Configuration de la Mise en Page & Personnalisation des Textes",
      icon: <Settings className="w-5 h-5 text-blue-400" />,
      content: `Pour configurer le cartouche et personnaliser le rendu visuel des textes et des sommets, utilisez le formulaire de contrôle latéral :
• Métadonnées de l'affaire : Saisissez le numéro de dossier technique, le nom du propriétaire, la province/préfecture, la commune et la localité.
• Gestion de l'Échelle : Laissez le système calculer l'échelle optimale automatique ou spécifiez une échelle manuelle standardisée pour respecter les dimensions de la feuille.
• Saisie des Riverains : Renseignez le riverain attenant (ex: Route Nationale, Propriété Privée...) pour l'afficher le long des limites sur le plan et dans le carnet des limites.
• Préfixe de Sommet Personnalisé : Choisissez la lettre de départ pour désigner les sommets : la lettre P (Par défaut), la lettre B (Borne), sans lettre (chiffres seuls) ou saisissez un préfixe personnalisé de votre choix (ex: T, S). Le plan et les tables se mettent instantanément à jour.
• Tailles et Position des Textes (Polices & Décalage) : Ajustez finement le rendu visuel de votre plan à l'aide de curseurs interactifs :
  1. Taille de police des sommets pour augmenter/diminuer la visibilité des noms des points.
  2. Taille de police des étiquettes pour les longueurs des côtés et les noms des riverains.
  3. Distance de décalage (Offset) des étiquettes par rapport aux segments de limites pour éviter les superpositions d'écritures et aérer votre plan technique.
• Maillage des Coordonnées : Ajustez l'intervalle de la grille en mètres (Grille) pour adapter le quadrillage (carroyage) sur le plan.`
    },
    {
      id: "print_choice",
      title: "6. Choix d'Impression & Exportation PDF",
      icon: <Printer className="w-5 h-5 text-rose-500" />,
      content: `Nous avons réuni les configurations d'impression dans un même atelier de visualisation interactif :
• Mode 'Impression avec page de garde' (anciennement Impression 1) :
  - Génère un dossier administratif complet de deux pages A4.
  - Page 1 : Page de garde officielle comprenant le cartouche administratif, le carnet de coordonnées complet (avec altitudes) et un extrait d'orthophotoplan aérien (avec flèche rouge 'Projet' activable).
  - Page 2 : Plan topographique officiel à l'échelle avec grille de coordonnées, boussole d'orientation et tableau des limites et riverains.

• Mode 'Impression sans page de garde' (anciennement Impression 2) :
  - Produit un livrable condensé en une seule page horizontale (paysage) contenant le Plan Parcellaire seul.
  - Comprend le titre officiel centré 'PLAN PARCELLAIRE', et intègre un badge élégant en bas de carte affichant la surface de la parcelle sous le format traditionnel marocain (Hectares . Ares . Centiares) : SURFACE : 1 H . 12 A . 40 Ca.

• Conseils d'enregistrement PDF :
  - Cliquez sur 'Générer le PDF / Imprimer' dans la barre d'outils.
  - Dans la boîte de dialogue d'impression de votre navigateur, veillez à cocher l'option 'Graphiques d'arrière-plan' pour inclure l'imagerie aérienne et les couleurs, et désélectionnez l'option 'En-têtes et pieds de page'.`
    }
  ];

  // Expanded Visual Step-by-Step with precise interactive mockup representations
  const visualSteps = [
    {
      step: "1",
      titleAr: "المعاينة الحية وتحريك نقاط الحدود",
      titleFr: "Aperçu en direct & Déplacement des points",
      descAr: "عاين القطعة الأرضية فوق الصور الجوية مباشرة. يمكنك سحب أي نقطة حدود بالفأرة وتغيير موقعها، وسيتم تعديل الإحداثيات والمساحة الإجمالية في نفس اللحظة.",
      descFr: "Visualisez la parcelle directement sur l'imagerie satellite. Glissez n'importe quel sommet avec la souris : les coordonnées et la surface se mettent à jour instantanément.",
      captureType: "live_preview_mock",
      badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
    },
    {
      step: "2",
      titleAr: "تعديل المضلع يدوياً وإضافة نقطة",
      titleFr: "Modification manuelle & Ajout de point",
      descAr: "اضغط على أي حقل إحداثي (Est / Nord) لتعديل قيمته بدقة هندسية، أو أدخل إحداثيات نقطة جديدة في حقول الإضافة السريعة لتوسيع مضلع القطعة.",
      descFr: "Cliquez sur une coordonnée (Est / Nord) pour modifier sa valeur numérique, ou utilisez les champs d'ajout rapide pour insérer de nouveaux sommets au tracé.",
      captureType: "add_point_mock",
      badgeColor: "bg-amber-500/10 text-amber-400 border-amber-500/20"
    },
    {
      step: "3",
      titleAr: "تخصيص تسميات النقط والكتابة على الخريطة",
      titleFr: "Personnalisation des Sommets & Textes",
      descAr: "اختر بادئة تسمية النقط (P, B، بادئة مخصصة، أو أرقام فقط)، وتحكم بحجم خط كتابة القمم، حجم خط الأطوال والمجاورين، ومسافة تباعدها (Offset) عن الأضلاع لتجنب تداخل النصوص.",
      descFr: "Configurez le préfixe des sommets (P, B, personnalisé, ou chiffres seuls), ajustez la taille des polices des points/étiquettes et la distance de décalage (Offset) pour éviter les superpositions.",
      captureType: "scale_labels_mock",
      badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20"
    },
    {
      step: "4",
      titleAr: "الطباعة مرفوقة بصفحة الغلاف",
      titleFr: "Impression avec page de garde",
      descAr: "النمط الأول: يولد ملفاً متكاملاً من صفحتين بحجم A4. صفحة غلاف رسمية تشمل جدول الإحداثيات وخريطة Orthophotoplan، تليها صفحة المخطط الطبوغرافي الشامل.",
      descFr: "Option 1 : Dossier technique de 2 pages A4. Page 1 : Page de garde officielle avec tableau des sommets et orthophotoplan. Page 2 : Plan de délimitation à l'échelle.",
      captureType: "with_cover_mock",
      badgeColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
    },
    {
      step: "5",
      titleAr: "الطباعة بدون صفحة الغلاف",
      titleFr: "Impression sans page de garde",
      descAr: "النمط الثاني: مخطط هندسي مدمج في صفحة واحدة أفقية (Plan Parcellaire) يحمل عنواناً بارزاً وشارة المساحة الرسمية مقسمة بالهكتار والآر والسنتيار.",
      descFr: "Option 2 : Document de plan parcellaire sur une seule page paysage. Comprend un titre principal clair et un badge de surface traditionnel (Ha . A . Ca) en bas.",
      captureType: "without_cover_mock",
      badgeColor: "bg-pink-500/10 text-pink-400 border-pink-500/20"
    },
    {
      step: "6",
      titleAr: "التصدير النهائي والتثبيت كـ PDF",
      titleFr: "Exportation PDF & Paramètres navigateur",
      descAr: "اضغط على طباعة، وفي إعدادات المتصفح تأكد من تفعيل خيار 'رسومات الخلفية' لحفظ ملف PDF كامل الألوان وبجودة أوتوكاد عالية الدقة.",
      descFr: "Cliquez sur Imprimer. Veillez à activer l'option 'Graphiques d'arrière-plan' pour sauvegarder un document PDF couleur haute définition.",
      captureType: "print_setup_mock",
      badgeColor: "bg-teal-500/10 text-teal-400 border-teal-500/20"
    }
  ];

  const sections = isAr ? sectionsAr : sectionsFr;
  const filteredSections = sections.filter(sec => 
    sec.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    sec.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper function to render a beautiful mock screen capture for the expanded guide
  const renderMockCapture = (type: string) => {
    switch (type) {
      case "live_preview_mock":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-3 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-1.5 right-1.5 bg-slate-900 border border-slate-750/80 px-1 py-0.5 rounded text-[7px] text-emerald-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2 h-2 text-emerald-400 animate-pulse" />
              <span>Live Map Preview</span>
            </div>
            {/* Draw Simulated interactive polygon */}
            <svg className="w-24 h-20 text-emerald-400" viewBox="0 0 100 80">
              <polygon points="20,20 80,15 70,65 30,55" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" strokeWidth="1.5" />
              <circle cx="20" cy="20" r="3.5" fill="#f59e0b" className="animate-ping" />
              <circle cx="20" cy="20" r="2.5" fill="#f59e0b" />
              <circle cx="80" cy="15" r="2.5" fill="#10b981" />
              <circle cx="70" cy="65" r="2.5" fill="#10b981" />
              <circle cx="30" cy="55" r="2.5" fill="#10b981" />
              <text x="12" y="15" fill="#ffffff" style={{ fontSize: "6px" }}>P1 (Drag)</text>
            </svg>
            <div className="text-[7.5px] text-slate-400 mt-1 font-mono text-center">
              Surface: 4 H . 12 A . 08 Ca | Perim: 1,420 m
            </div>
          </div>
        );
      case "add_point_mock":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-3 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-1.5 right-1.5 bg-slate-900 border border-slate-750/80 px-1 py-0.5 rounded text-[7px] text-amber-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2 h-2 text-amber-400" />
              <span>Coordinates Editor</span>
            </div>
            <div className="w-full max-w-[220px] bg-slate-900 border border-slate-800 rounded p-1.5 space-y-1">
              <div className="flex gap-1 text-[7.5px] text-slate-300 font-bold">
                <div className="flex-1">X (Est): <span className="bg-slate-950 px-1 py-0.5 rounded text-amber-400 font-mono">315482.40</span></div>
                <div className="flex-1">Y (Nord): <span className="bg-slate-950 px-1 py-0.5 rounded text-amber-400 font-mono">284195.12</span></div>
              </div>
              <button className="w-full bg-indigo-600/90 text-[7px] text-white py-0.5 rounded font-black flex items-center justify-center gap-1">
                <PlusCircle className="w-2.5 h-2.5" />
                <span>إضافة نقطة جديدة للمضلع</span>
              </button>
            </div>
          </div>
        );
      case "scale_labels_mock":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-2 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-1 right-1 bg-slate-900 border border-slate-750/80 px-1 py-0.5 rounded text-[6px] text-blue-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2 h-2 text-blue-400" />
              <span>Layout Config</span>
            </div>
            <div className="w-full max-w-[240px] space-y-1 text-[7px] mt-2">
              <div className="flex gap-1">
                <div className="flex-1 bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-slate-500 font-bold block">السلم / ÉCHELLE</span>
                  <span className="text-emerald-400 font-black">1/1000 (تلقائي)</span>
                </div>
                <div className="flex-1 bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-slate-500 font-bold block">المجاورين / RIVERAINS</span>
                  <span className="text-slate-200 truncate block">طريق عام بعرض 10م</span>
                </div>
              </div>
              <div className="flex gap-1">
                <div className="flex-1 bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-slate-500 font-bold block">بادئة النقط / PREFIX</span>
                  <span className="text-amber-500 font-black">B1, B2... (Borne)</span>
                </div>
                <div className="flex-1 bg-slate-900 p-1 rounded border border-slate-800">
                  <span className="text-slate-500 font-bold block">الحجم والإزاحة / FONTS & OFFSET</span>
                  <span className="text-indigo-400 font-black">Vertex: 8.5px | Offset: 7m</span>
                </div>
              </div>
            </div>
          </div>
        );
      case "with_cover_mock":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-2 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-1.5 right-1.5 bg-slate-900 border border-slate-750/80 px-1 py-0.5 rounded text-[7px] text-indigo-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2 h-2 text-indigo-400" />
              <span>Impression Type 1</span>
            </div>
            <div className="flex gap-2 items-center">
              {/* Page 1 (Cover) */}
              <div className="w-10 h-14 bg-white border border-slate-400 rounded p-0.5 flex flex-col justify-between">
                <div className="w-full h-1 bg-indigo-600 rounded-xs" />
                <div className="w-full h-3 bg-slate-100 rounded-xs flex items-center justify-center text-[4px] text-slate-800 font-bold">ROYAUME DU MAROC</div>
                <div className="w-6 h-6 bg-slate-200 rounded-xs mx-auto" />
                <div className="w-full h-1 bg-indigo-600 rounded-xs" />
              </div>
              <span className="text-slate-500 text-[10px] font-black">→</span>
              {/* Page 2 (Plan) */}
              <div className="w-10 h-14 bg-white border border-slate-400 rounded p-0.5 flex flex-col justify-between">
                <div className="w-full h-6 bg-slate-100 rounded-xs flex items-center justify-center text-[4px] text-slate-800 font-mono">GRID / MAP</div>
                <div className="w-full h-2 bg-slate-200 rounded-xs" />
              </div>
            </div>
          </div>
        );
      case "without_cover_mock":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-2 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-1.5 right-1.5 bg-slate-900 border border-slate-750/80 px-1 py-0.5 rounded text-[7px] text-pink-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2 h-2 text-pink-400" />
              <span>Impression Type 2</span>
            </div>
            {/* Single Landscape Page */}
            <div className="w-16 h-11 bg-white border border-slate-400 rounded p-1 flex flex-col justify-between">
              <div className="w-full text-center text-[4px] font-black text-slate-950 border-b border-slate-300 pb-0.5">PLAN PARCELLAIRE</div>
              <div className="w-full h-4 bg-slate-100 rounded-xs flex items-center justify-center text-[3px] text-slate-600">MAP PREVIEW WITH GRID LINES</div>
              {/* Area Badge Mock */}
              <div className="bg-stone-50 border border-stone-800 text-[3.5px] font-bold py-0.5 text-center leading-none mt-1">
                SURFACE : 1 H . 24 A . 15 Ca
              </div>
            </div>
          </div>
        );
      case "print_setup_mock":
        return (
          <div className="w-full h-full bg-slate-950/90 border border-slate-800 rounded-xl relative p-3 flex flex-col justify-center items-center font-sans overflow-hidden">
            <div className="absolute top-1.5 right-1.5 bg-slate-900 border border-slate-750/80 px-1 py-0.5 rounded text-[7px] text-teal-400 font-mono flex items-center gap-1 uppercase tracking-wider select-none">
              <Camera className="w-2 h-2 text-teal-400" />
              <span>Browser Settings</span>
            </div>
            <div className="w-full max-w-[210px] space-y-1 bg-slate-900 p-2 rounded text-left text-[7.5px]">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded bg-emerald-500 flex items-center justify-center text-slate-950">
                  <Check className="w-2 h-2 stroke-[3]" />
                </div>
                <span className="text-slate-200 font-bold">Graphiques d'arrière-plan (Background)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded border border-slate-700 bg-slate-950" />
                <span className="text-slate-400">En-têtes et pieds de page (Headers)</span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const openExternalGuide = () => {
    const isArabic = guideLang === "ar";
    const dir = isArabic ? "rtl" : "ltr";
    const title = isArabic ? "دليل الاستعمال المتكامل | Parcel Layout Designer" : "Guide d'Utilisation Intégral | Parcel Layout Designer";
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="${guideLang}" dir="${dir}">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&family=Noto+Sans+Arabic:wght@400;500;700;900&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: ${isArabic ? "'Noto Sans Arabic', 'Inter', sans-serif" : "'Inter', sans-serif"};
            background-color: #f8fafc;
            color: #1e293b;
            padding: 40px 20px;
            margin: 0;
            line-height: 1.8;
          }
          .container {
            max-width: 950px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 4px 25px rgba(0,0,0,0.06);
            padding: 45px;
            border: 1px solid #e2e8f0;
          }
          .title-area {
            text-align: center;
            border-bottom: 3px double #cbd5e1;
            padding-bottom: 28px;
            margin-bottom: 35px;
          }
          h1 {
            color: #0f172a;
            margin: 0;
            font-size: 28px;
            font-weight: 900;
          }
          .subtitle {
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            color: #475569;
            margin-top: 10px;
            font-weight: 700;
          }
          .author {
            font-size: 13px;
            color: #ea580c;
            font-weight: 700;
            margin-top: 8px;
          }
          .visual-step-card {
            background: #fafaf9;
            border: 1px solid #e7e5e4;
            border-radius: 12px;
            padding: 22px;
            margin-bottom: 24px;
            display: flex;
            gap: 20px;
            align-items: flex-start;
          }
          .step-num {
            background: #d97706;
            color: white;
            font-size: 18px;
            font-weight: 900;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .step-desc {
            flex-grow: 1;
          }
          .step-title {
            font-size: 16px;
            font-weight: 900;
            color: #1e293b;
            margin: 0 0 10px 0;
          }
          .step-text {
            font-size: 14px;
            color: #475569;
            margin: 0;
          }
          .section {
            margin-top: 40px;
            margin-bottom: 28px;
            padding: 25px;
            background: #f1f5f9;
            border-left: 6px solid ${isArabic ? "transparent" : "#d97706"};
            border-right: 6px solid ${isArabic ? "#d97706" : "transparent"};
            border-radius: 8px;
          }
          h2 {
            font-size: 18px;
            color: #0f172a;
            margin-top: 0;
            margin-bottom: 12px;
            font-weight: 900;
          }
          .content {
            font-size: 14.5px;
            white-space: pre-line;
            color: #334155;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
            border-top: 1px solid #e2e8f0;
            padding-top: 20px;
            font-weight: 500;
          }
          .button-print {
            display: inline-block;
            margin-bottom: 25px;
            background-color: #d97706;
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 700;
            font-size: 13.5px;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            box-shadow: 0 4px 6px -1px rgba(217, 119, 6, 0.2);
          }
          .button-print:hover {
            background-color: #b45309;
          }
          @media print {
            body { background: white; padding: 0; }
            .container { box-shadow: none; border: none; padding: 20px; }
            .button-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: center;">
          <button class="button-print" onclick="window.print()">${isArabic ? "طباعة الدليل أو الحفظ كـ PDF" : "Imprimer le Guide / Sauvegarder en PDF"}</button>
        </div>
        <div class="container">
          <div class="title-area">
            <h1>${isArabic ? "دليل الاستعمال المصور والشامل - مخصص للرفع وتصميم المخططات" : "MANUEL D'UTILISATION COMPLET & IMAGE"}</h1>
            <div class="subtitle">Parcel Layout Designer / Professional Suite</div>
            <div class="author">${isArabic ? "المهندس الواضع: عبد الله واضو" : "Conçu par : Abdellah Ouaddou"}</div>
          </div>

          <h3>${isArabic ? "أولاً: الدليل البصري التفاعلي (خطوات العمل):" : "I. Guide Visuel Rapide (Étapes clés) :"}</h3>
          ${visualSteps.map(step => `
            <div class="visual-step-card">
              <div class="step-num">${step.step}</div>
              <div class="step-desc">
                <div class="step-title">${isArabic ? step.titleAr : step.titleFr}</div>
                <div class="step-text">${isArabic ? step.descAr : step.descFr}</div>
              </div>
            </div>
          `).join("")}

          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 40px 0;" />

          <h3>${isArabic ? "ثانياً: الشرح المنهجي التفصيلي لوظائف التطبيق:" : "II. Manuel d'utilisation approfondi :"}</h3>
          ${sections.map(sec => `
            <div class="section">
              <h2>${sec.title}</h2>
              <div class="content">${sec.content}</div>
            </div>
          `).join("")}

          <div class="footer">
            © 2026 Parcel Layout Designer - Abdellah Ouaddou. Tous droits réservés.
          </div>
        </div>
      </body>
      </html>
    `;

    try {
      const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
      } else {
        alert(isArabic 
          ? "الرجاء السماح للنوافذ المنبثقة لرؤية الدليل في صفحة مستقلة، أو يمكنك معاينته بالكامل مباشرة في التطبيق بالأسفل." 
          : "Veuillez autoriser les fenêtres contextuelles pour afficher le guide externe, ou utilisez la prévisualisation dans l'application ci-dessous."
        );
      }
    }
  };

  return (
    <div className="w-full bg-slate-800/60 border border-slate-700 rounded-3xl p-6 shadow-xl leading-relaxed select-none overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl pointer-events-none" />
      
      {/* Upper Menu bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-6 mb-6">
        <div>
          <h3 className="text-lg font-black text-amber-500 flex items-center gap-2 tracking-wide">
            <BookOpen className="w-5 h-5 text-amber-500" />
            <span>{isAr ? "دليل الاستعمال المصور والشامل للتطبيق" : "Manuel d'Utilisation Intégral & Illustré"}</span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {isAr 
              ? "دليل كامل خطوة بخطوة يشرح: المعاينة الحية، تعديل الرسم، وإعداد الطباعة مرفوقة أو بدون صفحة الغلاف"
              : "Guide détaillé pas à pas : prévisualisation active, édition, configuration d'échelle et choix de livraison"}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Language Switcher */}
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700/60 text-xs font-bold leading-none">
            <button
              onClick={() => setGuideLang("ar")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                isAr ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setGuideLang("fr")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                !isAr ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Français
            </button>
          </div>

          {/* Browser standalone button */}
          <button
            onClick={openExternalGuide}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-lg shadow transition hover:-translate-y-0.5"
            title={isAr ? "فتح في تبويب مستقل وطباعة" : "Ouvrir dans un nouvel onglet pour impression"}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isAr ? "معاينة بملء الشاشة" : "Ouvrir en plein écran"}</span>
          </button>
        </div>
      </div>

      {/* Tabs Switcher: Visual Guide vs Detailed Chapters */}
      <div className="flex bg-slate-950 p-1.5 rounded-2xl border border-slate-800 mb-6 font-bold text-xs">
        <button
          onClick={() => setActiveTab("visual")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
            activeTab === "visual" 
              ? "bg-gradient-to-tr from-amber-600 to-amber-700 text-white shadow" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>{isAr ? "المرشد المصور (لقطات شاشة توضيحية)" : "Guide Illustré (Captures d'écran)"}</span>
        </button>
        <button
          onClick={() => setActiveTab("detailed")}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all ${
            activeTab === "detailed" 
              ? "bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white shadow" 
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>{isAr ? "الفصول والشروحات المنهجية بالتفصيل" : "Manuel d'Utilisation Détaillé"}</span>
        </button>
      </div>

      {activeTab === "visual" ? (
        /* Visual Steps Grid containing Simulated Screenshot Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {visualSteps.map((step) => (
            <div 
              key={step.step} 
              className="bg-slate-900/50 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700/60 transition duration-150 group relative"
            >
              <div>
                {/* Step Header */}
                <div className={`flex items-center gap-2.5 mb-3.5 ${isAr ? "flex-row-reverse text-right" : "flex-row text-left"}`}>
                  <span className={`w-6 h-6 rounded-full border text-xs font-black flex items-center justify-center select-none ${step.badgeColor}`}>
                    {step.step}
                  </span>
                  <h4 className="text-[13px] font-black text-slate-200 group-hover:text-amber-400 transition-colors">
                    {isAr ? step.titleAr : step.titleFr}
                  </h4>
                </div>
                {/* Description text */}
                <p className={`text-[11px] leading-relaxed text-slate-400 mb-5 ${isAr ? "text-right animate-none" : "text-left"}`}>
                  {isAr ? step.descAr : step.descFr}
                </p>
              </div>

              {/* Simulated UI Capture/Screenshot Card below */}
              <div className="w-full h-36 mt-auto">
                {renderMockCapture(step.captureType)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Detailed Chapters Tab with Search */
        <>
          {/* Chapters Search Area */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-500" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? "البحث في فصول دليل الاستعمال..." : "Rechercher dans les sections du manuel..."}
              className={`w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-750 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium ${
                isAr ? "text-right" : "text-left"
              }`}
            />
          </div>

          {/* Chapters/Sections Render Container (In-app interactive view) */}
          <div className={`space-y-4 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar ${isAr ? "text-right" : "text-left"}`}>
            {filteredSections.length > 0 ? (
              filteredSections.map((sec) => (
                <div 
                  key={sec.id} 
                  className="bg-slate-900/65 border border-slate-800 p-5 rounded-2xl hover:border-slate-700/80 transition-all duration-150 group"
                >
                  <div className={`flex items-center gap-3 mb-3 ${isAr ? "flex-row-reverse" : "flex-row"}`}>
                    <div className="p-2 bg-slate-800 rounded-xl group-hover:scale-105 transition-transform duration-150">
                      {sec.icon}
                    </div>
                    <h4 className="text-[13.5px] font-black text-slate-150 group-hover:text-amber-400 transition-colors">
                      {sec.title}
                    </h4>
                  </div>
                  <div 
                    className={`text-[11.5px] leading-relaxed text-slate-350 font-medium whitespace-pre-wrap ${
                      isAr ? "font-serif pr-1" : "font-sans pl-1"
                    }`}
                  >
                    {sec.content}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-slate-500 text-xs font-bold font-mono">
                {isAr ? "لا توجد نتائج مطابقة لبحثك" : "Aucun résultat ne correspond à votre recherche"}
              </div>
            )}
          </div>
        </>
      )}

      {/* Quick notice block for printing instructions */}
      <div className={`mt-6 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3 text-xs text-amber-400 ${
        isAr ? "flex-row-reverse text-right" : "flex-row text-left"
      }`}>
        <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
        <div>
          <span className="font-extrabold block mb-0.5">{isAr ? "تلميحات هامة لتصميم مضلع القطع:" : "Conseil pour la numérisation :"}</span>
          <span className="text-[10.5px] text-slate-400 font-medium">
            {isAr 
              ? "لتعديل مضلع القطعة، يمكنك سحب النقاط مباشرة على الخريطة لرسم فوري، أو كتابة الإحداثيات في جدول القمم للحصول على الدقة الرياضية، ثم اختيار السلم المناسب ونمط الطباعة بالغطاء أو دونه من شريط خيارات المعاينة قبل تصدير ملف PDF."
              : "Pour éditer votre parcelle, déplacez ses sommets sur la carte interactive, ajustez ses coordonnées dans la table d'arpentage, configurez les riverains et l'échelle, puis basculez entre l'impression avec ou sans page de garde."
            }
          </span>
        </div>
      </div>
    </div>
  );
}
