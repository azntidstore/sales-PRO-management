import { Seller } from '../types';

export function cleanSellerName(name: string | undefined | null): string {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
}

export function isSameSellerName(name1: string | undefined | null, name2: string | undefined | null): boolean {
  if (!name1 || !name2) return false;
  if (name1 === name2) return true;
  const c1 = cleanSellerName(name1);
  const c2 = cleanSellerName(name2);
  if (c1 === c2) return true;
  return c1.includes(c2) || c2.includes(c1);
}

export function findSellerByName(sellers: Seller[], name: string | undefined | null): Seller | undefined {
  if (!name || !sellers || sellers.length === 0) return undefined;
  
  // 1. Direct match
  let found = sellers.find(s => s.name === name);
  if (found) return found;

  // 2. Cleaned match
  const cName = cleanSellerName(name);
  found = sellers.find(s => cleanSellerName(s.name) === cName);
  if (found) return found;

  // 3. Substring match
  found = sellers.find(s => {
    const cs = cleanSellerName(s.name);
    return cs && cName && (cs.includes(cName) || cName.includes(cs));
  });

  return found;
}
