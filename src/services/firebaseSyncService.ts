import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  onSnapshot,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { handleFirestoreError, OperationType } from '../firebase/errors';
import {
  Contact,
  LedgerEntry,
  PurchaseRecord,
  GoldStockMovement,
  CurrencyStockMovement,
  Partner,
  Partnership,
  PartnershipLoan,
  PurchaseFormulaConfig,
  SaleRecord,
} from '../types';

export const FirebaseSyncService = {
  async clearBusinessData(): Promise<void> {
    const documentRefs = [
      doc(db, 'accounts', 'main_balances'),
      doc(db, 'accounts', 'currency_state'),
      doc(db, 'settings', 'purchase_formula'),
    ];
    for (const collectionName of [
      'contacts',
      'operations',
      'purchases',
      'stock_movements',
      'sales',
      'tasks',
    ]) {
      const snapshot = await getDocs(collection(db, collectionName));
      documentRefs.push(...snapshot.docs.map((documentSnapshot) => documentSnapshot.ref));
    }

    for (let index = 0; index < documentRefs.length; index += 500) {
      const batch = writeBatch(db);
      documentRefs.slice(index, index + 500).forEach((documentRef) => batch.delete(documentRef));
      await batch.commit();
    }
  },

  // Save entire purchase
  async savePurchase(purchase: PurchaseRecord): Promise<void> {
    try {
      await setDoc(doc(db, 'purchases', purchase.id), {
        ...JSON.parse(JSON.stringify(purchase)),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Firebase savePurchase fallback to local:', error);
    }
  },

  async deletePurchase(purchaseId: string): Promise<void> {
    try {
      if (!purchaseId) return;
      await deleteDoc(doc(db, 'purchases', purchaseId));
    } catch (error) {
      console.warn('Firebase deletePurchase error:', error);
    }
  },

  // Save stock movement
  async saveStockMovement(movement: GoldStockMovement): Promise<void> {
    try {
      await setDoc(doc(db, 'stock_movements', movement.id), {
        ...movement,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Firebase saveStockMovement fallback to local:', error);
    }
  },

  // Save sale record
  async saveSaleRecord(saleDoc: {
    id: string;
    description: string;
    profit: number;
    revenue: number;
    weightGrams: number;
    karat: string;
    category?: string;
    targetAccount?: string;
    date: string;
  }): Promise<void> {
    try {
      await setDoc(doc(db, 'sales', saleDoc.id), {
        ...saleDoc,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Firebase saveSaleRecord fallback to local:', error);
    }
  },

  async saveFullSaleRecord(sale: SaleRecord): Promise<void> {
    try {
      const payload = JSON.parse(JSON.stringify(sale));
      await setDoc(doc(db, 'sales', sale.id), {
        ...payload,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      console.warn('Firebase saveFullSaleRecord fallback to local:', error);
    }
  },

  async deleteSaleRecord(saleId: string): Promise<void> {
    try {
      if (!saleId) return;
      await deleteDoc(doc(db, 'sales', saleId));
    } catch (error) {
      console.warn('Firebase deleteSaleRecord error:', error);
    }
  },

  // Save bank accounts / caisse state
  async saveBankBalances(balances: Record<string, number>): Promise<void> {
    try {
      await setDoc(doc(db, 'accounts', 'main_balances'), {
        balances,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Firebase saveBankBalances fallback to local:', error);
    }
  },

  // Save formula config
  async saveFormulaConfig(config: PurchaseFormulaConfig): Promise<void> {
    try {
      await setDoc(doc(db, 'settings', 'purchase_formula'), {
        ...config,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('Firebase saveFormulaConfig fallback to local:', error);
    }
  },

  async saveCurrencyState(state: {
    currencyBalances?: Record<string, number>;
    goldCurrencyBalances?: Record<string, number>;
    currencyStockMovements?: CurrencyStockMovement[];
    goldCurrencyMovements?: CurrencyStockMovement[];
  }): Promise<void> {
    try {
      const payload = JSON.parse(
        JSON.stringify({
          ...state,
          updatedAt: new Date().toISOString(),
        })
      );
      await setDoc(doc(db, 'accounts', 'currency_state'), payload, { merge: true });
    } catch (error) {
      console.warn('Firebase saveCurrencyState fallback to local:', error);
    }
  },

  subscribeCurrencyState(
    onData: (state: {
      currencyBalances?: Record<string, number>;
      goldCurrencyBalances?: Record<string, number>;
      currencyStockMovements?: CurrencyStockMovement[];
      goldCurrencyMovements?: CurrencyStockMovement[];
      updatedAt?: string;
    } | null, fromCache: boolean) => void
  ): () => void {
    try {
      return onSnapshot(
        doc(db, 'accounts', 'currency_state'),
        { includeMetadataChanges: true },
        (docSnap) => {
          if (docSnap.exists()) {
            onData(
              docSnap.data() as {
                currencyBalances?: Record<string, number>;
                goldCurrencyBalances?: Record<string, number>;
                currencyStockMovements?: CurrencyStockMovement[];
                goldCurrencyMovements?: CurrencyStockMovement[];
                updatedAt?: string;
              },
              docSnap.metadata.fromCache
            );
          } else {
            onData(null, docSnap.metadata.fromCache);
          }
        },
        (error) => {
          console.warn('Firestore onSnapshot currency_state error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  // Listen to remote changes
  subscribeToPurchases(onData: (purchases: PurchaseRecord[], fromCache: boolean) => void): () => void {
    try {
      return onSnapshot(
        collection(db, 'purchases'),
        { includeMetadataChanges: true },
        (snapshot) => {
          const list: PurchaseRecord[] = [];
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as PurchaseRecord);
          });
          list.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
          onData(list, snapshot.metadata.fromCache);
        },
        (error) => {
          console.warn('Firestore onSnapshot purchases error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  subscribeToStockMovements(onData: (movements: GoldStockMovement[], fromCache: boolean) => void): () => void {
    try {
      return onSnapshot(
        collection(db, 'stock_movements'),
        { includeMetadataChanges: true },
        (snapshot) => {
          const list: GoldStockMovement[] = [];
          snapshot.forEach((docSnap) => {
            list.push(docSnap.data() as GoldStockMovement);
          });
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          onData(list, snapshot.metadata.fromCache);
        },
        (error) => {
          console.warn('Firestore onSnapshot stock_movements error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  subscribeToAccounts(onData: (balances: Record<string, number> | null, fromCache: boolean) => void): () => void {
    try {
      return onSnapshot(
        doc(db, 'accounts', 'main_balances'),
        { includeMetadataChanges: true },
        (docSnap) => {
          onData(
            docSnap.exists() ? docSnap.data().balances ?? null : null,
            docSnap.metadata.fromCache
          );
        },
        (error) => {
          console.warn('Firestore onSnapshot accounts error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  subscribeToFormulaConfig(onData: (config: PurchaseFormulaConfig | null, fromCache: boolean) => void): () => void {
    try {
      return onSnapshot(
        doc(db, 'settings', 'purchase_formula'),
        { includeMetadataChanges: true },
        (docSnap) => {
          onData(
            docSnap.exists() ? docSnap.data() as PurchaseFormulaConfig : null,
            docSnap.metadata.fromCache
          );
        },
        (error) => {
          console.warn('Firestore onSnapshot settings error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  async saveContact(contact: any) {
    try {
      const id = contact.id || contact.reference;
      if (!id) return;
      await setDoc(doc(db, 'contacts', id), JSON.parse(JSON.stringify(contact)), { merge: true });
    } catch (e) {
      console.error('Firestore saveContact error:', e);
    }
  },

  async deleteContact(contactIdOrRef: string): Promise<void> {
    try {
      if (!contactIdOrRef) return;
      await deleteDoc(doc(db, 'contacts', contactIdOrRef));
    } catch (e) {
      console.error('Firestore deleteContact error:', e);
    }
  },

  subscribeContacts(onUpdate: (items: any[], fromCache: boolean) => void) {
    try {
      return onSnapshot(
        collection(db, 'contacts'),
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          onUpdate(items, snap.metadata.fromCache);
        },
        (error) => {
          console.warn('Firestore onSnapshot contacts error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  async saveOperation(operation: any) {
    try {
      const id = operation.id;
      if (!id) return;
      await setDoc(doc(db, 'operations', id), JSON.parse(JSON.stringify(operation)), { merge: true });
    } catch (e) {
      console.error('Firestore saveOperation error:', e);
    }
  },

  async deleteOperation(operationId: string): Promise<void> {
    try {
      if (!operationId) return;
      await deleteDoc(doc(db, 'operations', operationId));
    } catch (e) {
      console.error('Firestore deleteOperation error:', e);
    }
  },

  subscribeOperations(onUpdate: (items: any[], fromCache: boolean) => void) {
    try {
      return onSnapshot(
        collection(db, 'operations'),
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          onUpdate(items, snap.metadata.fromCache);
        },
        (error) => {
          console.warn('Firestore onSnapshot operations error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  subscribeSaleRecords(onUpdate: (items: any[], fromCache: boolean) => void) {
    try {
      return onSnapshot(
        collection(db, 'sales'),
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          onUpdate(items, snap.metadata.fromCache);
        },
        (error) => {
          console.warn('Firestore onSnapshot sales error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  async saveTask(task: any) {
    try {
      const id = task.id;
      if (!id) return;
      await setDoc(doc(db, 'tasks', id), JSON.parse(JSON.stringify(task)), { merge: true });
    } catch (e) {
      console.error('Firestore saveTask error:', e);
    }
  },

  subscribeTasks(onUpdate: (items: any[], fromCache: boolean) => void) {
    try {
      return onSnapshot(
        collection(db, 'tasks'),
        { includeMetadataChanges: true },
        (snap) => {
          const items = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
          onUpdate(items, snap.metadata.fromCache);
        },
        (error) => {
          console.warn('Firestore onSnapshot tasks error:', error);
        }
      );
    } catch (e) {
      return () => {};
    }
  },

  async saveWhatsAppCampaign(campaign: any): Promise<void> {
    const id = String(campaign?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!id) return;
    const path = `whatsapp_campaigns/${id}`;
    try {
      await setDoc(doc(db, 'whatsapp_campaigns', id), JSON.parse(JSON.stringify(campaign)), {
        merge: true,
      });
    } catch (error) {
      console.warn('Firestore saveWhatsAppCampaign warning:', error);
      if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  },

  async saveWhatsAppMessageLog(logEntry: any): Promise<void> {
    const id = String(logEntry?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!id) return;
    const path = `whatsapp_logs/${id}`;
    try {
      await setDoc(doc(db, 'whatsapp_logs', id), JSON.parse(JSON.stringify(logEntry)), {
        merge: true,
      });
    } catch (error) {
      console.warn('Firestore saveWhatsAppMessageLog warning:', error);
      if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  },

  async saveWhatsAppAuditLog(auditEntry: any): Promise<void> {
    const id = String(auditEntry?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!id) return;
    const path = `whatsapp_audit_logs/${id}`;
    try {
      await setDoc(doc(db, 'whatsapp_audit_logs', id), JSON.parse(JSON.stringify(auditEntry)));
    } catch (error) {
      console.warn('Firestore saveWhatsAppAuditLog warning:', error);
      if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    }
  },
};
