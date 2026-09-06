import { 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged, 
  User, 
  UserCredential 
} from 'firebase/auth';
import { 
  doc,
  getDoc 
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { Seller, AuthorizationProfile, WorkspaceRole, RoleContext } from '../types';

/**
 * Normalizes Arabic-Indic (٠-٩) and Persian (۰-۹) numerals to standard Western ASCII digits (0-9)
 */
export function normalizeDigits(str: string): string {
  if (!str) return '';
  return str
    .replace(/[٠-٩]/g, d => String.fromCharCode(d.charCodeAt(0) - 1632 + 48))
    .replace(/[۰-۹]/g, d => String.fromCharCode(d.charCodeAt(0) - 1776 + 48));
}

/**
 * Translates Firebase Auth error codes to user-friendly messages in Arabic / French / English
 */
export function getAuthErrorMessage(code: string, lang: 'ar' | 'fr' | 'en' = 'ar'): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return lang === 'ar'
        ? 'بيانات الاعتماد غير صحيحة. يرجى التأكد من البريد الإلكتروني وكلمة المرور.'
        : lang === 'fr'
        ? 'Identifiants invalides. Veuillez vérifier votre e-mail et votre mot de passe.'
        : 'Invalid credentials. Please verify your email and password.';
    case 'auth/invalid-email':
      return lang === 'ar'
        ? 'صيغة البريد الإلكتروني غير صالحة.'
        : lang === 'fr'
        ? 'Format d\'e-mail invalide.'
        : 'Invalid email address format.';
    case 'auth/missing-password':
      return lang === 'ar'
        ? 'يرجى إدخال كلمة المرور للمتابعة.'
        : lang === 'fr'
        ? 'Veuillez saisir votre mot de passe pour continuer.'
        : 'Please enter your password to continue.';
    case 'auth/user-disabled':
      return lang === 'ar'
        ? 'تم تعطيل هذا الحساب من قِبل إدارة النظام.'
        : lang === 'fr'
        ? 'Ce compte a été désactivé par l\'administration.'
        : 'This account has been disabled by the administrator.';
    case 'auth/too-many-requests':
      return lang === 'ar'
        ? 'تم حظر المحاولات مؤقتاً لكثرة المحاولات غير الناجحة. يرجى المحاولة لاحقاً.'
        : lang === 'fr'
        ? 'Accès temporairement bloqué suite à de trop nombreuses tentatives. Réessayez plus tard.'
        : 'Access temporarily blocked due to too many failed attempts. Try again later.';
    case 'auth/network-request-failed':
      return lang === 'ar'
        ? 'فشل الاتصال بالشبكة. يرجى التحقق من اتصالك بالإنترنت.'
        : lang === 'fr'
        ? 'Échec de connexion réseau. Vérifiez votre connexion internet.'
        : 'Network connection failed. Please check your internet connection.';
    case 'auth/profile-not-found':
      return lang === 'ar'
        ? 'تم التحقق من الحساب ولكن لا يوجد ملف بائع مطابق في قاعدة البيانات.'
        : lang === 'fr'
        ? 'Compte authentifié mais aucun profil vendeur associé n\'existe.'
        : 'Authenticated successfully, but no matching seller profile exists.';
    default:
      return lang === 'ar'
        ? 'حدث خطأ أثناء المصادقة. يرجى إعادة المحاولة.'
        : lang === 'fr'
        ? 'Une erreur est survenue lors de l\'authentification.'
        : 'An error occurred during authentication.';
  }
}

/**
 * Normalize the role declarations stored in an authorization profile.
 * Legacy profiles only have `role`; new multi-role profiles may also expose `roles`.
 * The primary `role` is always retained for backward compatibility until Rules are migrated.
 */
export function normalizeRoleContexts(profile: {
  uid: string;
  sellerId: string;
  name?: string;
  role?: Seller['role'];
  roles?: Seller['roles'];
  active: boolean;
}, seller?: Seller): AuthorizationProfile {
  const primary = profile.role ? (profile.role as WorkspaceRole) : 'SELLER';
  const declared = Array.isArray(profile.roles) ? profile.roles : [];
  const roles = Array.from(new Set<WorkspaceRole>([primary, ...declared]));
  const parentIds = Array.isArray(seller?.parentIds) ? seller!.parentIds.filter(Boolean) : (seller?.parentId ? [seller.parentId] : []);
  const contexts: RoleContext[] = roles.map(role => ({
    role,
    sellerId: profile.sellerId,
    parentId: seller?.parentId || parentIds[0] || undefined,
    parentIds: parentIds.length ? parentIds : undefined,
  }));
  return {
    uid: profile.uid,
    sellerId: profile.sellerId,
    name: profile.name || seller?.name || '',
    role: primary,
    roles,
    roleContexts: contexts,
    active: profile.active === true,
  };
}

export function isMultiRoleProfile(profile: AuthorizationProfile | null | undefined): boolean {
  return !!profile && profile.roles.length > 1;
}

export class AuthService {
  /**
   * Subscribe to Firebase Authentication state changes.
   * 
   * SECURITY PRINCIPLE (Phase S1):
   * Firebase Authentication is the SOLE source of truth for auth state.
   * Local storage is NEVER used to store or simulate authentication sessions.
   */
  static onAuthStateChanged(callback: (user: User | null) => void): () => void {
    if (!isFirebaseConfigured || !auth) {
      // Security boundary: no local/mock authentication is permitted.
      setTimeout(() => callback(null), 0);
      return () => {};
    }
    return onAuthStateChanged(auth, callback);
  }

  /**
   * Authenticate user strictly via Firebase Authentication.
   */
  static async signIn(identifier: string, rawPass: string): Promise<{ user: User; credential: UserCredential; seller: Seller }> {
    const cleanIdentifier = normalizeDigits(identifier).trim();
    const cleanPassword = normalizeDigits(rawPass).trim();

    if (!cleanIdentifier) {
      const err: any = new Error('MISSING_IDENTIFIER');
      err.code = 'auth/missing-identifier';
      throw err;
    }

    if (!cleanPassword) {
      const err: any = new Error('MISSING_PASSWORD');
      err.code = 'auth/missing-password';
      throw err;
    }

    if (!isFirebaseConfigured || !auth) {
      const err: any = new Error('FIREBASE_NOT_CONFIGURED');
      err.code = 'auth/configuration-not-found';
      throw err;
    }

    // PHASE S2: Firestore no longer permits unauthenticated seller lookups.
    // Therefore Firebase mode accepts email only; usernames must not be resolved
    // by reading the sellers collection before authentication.
    if (!cleanIdentifier.includes('@')) {
      const err: any = new Error('EMAIL_REQUIRED');
      err.code = 'auth/invalid-email';
      throw err;
    }

    // Authenticate with Firebase Authentication
    const cred = await signInWithEmailAndPassword(auth, cleanIdentifier, cleanPassword);

    // Primary identity retrieval: Retrieve profile authoritatively using authenticated UID
    const seller = await this.fetchSellerProfile(cred.user);

    if (!seller) {
      const err: any = new Error('PROFILE_NOT_FOUND');
      err.code = 'auth/profile-not-found';
      throw err;
    }

    if (seller.active === false) {
      await signOut(auth);
      const err: any = new Error('ACCOUNT_DISABLED');
      err.code = 'auth/user-disabled';
      throw err;
    }

    return {
      user: cred.user,
      credential: cred,
      seller: seller
    };
  }

  /**
   * Sign out from Firebase Authentication.
   */
  static async signOut(): Promise<void> {
    if (!isFirebaseConfigured || !auth) {
      return;
    }
    await signOut(auth);
  }

  /**
   * Send a password-reset email through Firebase Authentication.
   * Only email identifiers are accepted; no pre-auth Firestore lookup is used.
   */
  static async sendPasswordReset(email: string): Promise<void> {
    const cleanEmail = normalizeDigits(email).trim().toLowerCase();
    if (!cleanEmail) {
      const err: any = new Error('MISSING_EMAIL');
      err.code = 'auth/invalid-email';
      throw err;
    }
    if (!cleanEmail.includes('@')) {
      const err: any = new Error('EMAIL_REQUIRED');
      err.code = 'auth/invalid-email';
      throw err;
    }
    if (!isFirebaseConfigured || !auth) {
      const err: any = new Error('FIREBASE_NOT_CONFIGURED');
      err.code = 'auth/configuration-not-found';
      throw err;
    }
    await sendPasswordResetEmail(auth, cleanEmail);
  }


  static async fetchSellerProfile(userOrUid: User | string, authenticatedEmail?: string): Promise<Seller | null> {
    const authenticatedUid = typeof userOrUid === 'string' ? userOrUid : userOrUid.uid;
    const email = typeof userOrUid === 'string' ? authenticatedEmail : (userOrUid.email || authenticatedEmail);

    if (!isFirebaseConfigured || !db) {
      // Security boundary: profile resolution is never allowed to fall back to
      // local/mock data. Firebase Authentication + Firestore are required.
      throw new Error('Firebase is not configured. Authorization profile resolution is unavailable.');
    }

    try {
      // PHASE S2 authorization profile: UID-keyed document is the authoritative
      // role/active/seller linkage once the S2 migration has populated /users.
      const authProfileRef = doc(db, 'users', authenticatedUid);
      const authProfileSnap = await getDoc(authProfileRef);
      if (authProfileSnap.exists()) {
        const authProfile = authProfileSnap.data() as {
          uid?: string; sellerId?: string; name?: string; role?: Seller['role']; roles?: Seller['roles']; active?: boolean
        };
        if (authProfile.uid !== authenticatedUid || !authProfile.sellerId || !authProfile.role) {
          throw new Error('Invalid authorization profile. Access denied.');
        }
        const sellerRef = doc(db, 'sellers', authProfile.sellerId);
        const sellerSnap = await getDoc(sellerRef);
        if (!sellerSnap.exists()) return null;
        const seller = sellerSnap.data() as Seller;
        if (seller.uid && seller.uid !== authenticatedUid) {
          throw new Error('Seller UID mismatch detected. Access denied.');
        }
        const roles = Array.from(new Set([authProfile.role, ...(Array.isArray(authProfile.roles) ? authProfile.roles : [])].filter(Boolean))) as Seller['roles'];
        return { ...seller, id: seller.id || sellerSnap.id, uid: authenticatedUid, role: authProfile.role, roles, active: authProfile.active !== false, name: authProfile.name || seller.name };
      }

    } catch (err) {
      console.error('Error fetching seller profile from Firestore:', err);
      throw err;
    }

    return null;
  }
}
