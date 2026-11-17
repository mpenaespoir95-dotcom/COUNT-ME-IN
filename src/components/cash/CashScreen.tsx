import React, { useState, useMemo, useEffect } from 'react';
import {
  Wallet,
  ArrowLeftRight,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Building,
  CheckCircle2,
  AlertCircle,
  Send,
  Printer,
  FileText,
  User,
  Landmark,
  CreditCard,
  X,
  ExternalLink,
  Calendar,
  BarChart3,
  Filter,
  PieChart,
  Layers,
  Search,
  Edit3,
  Phone,
  Coins,
  Scale,
  Users,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { useAppStore } from '../../context/AppContext';
import { AppPanel, PageHeading, SectionHeading, Modal } from '../common/UIComponents';
import { PurchasesScreen } from '../purchases/PurchasesScreen';
import {
  formatMoney,
  formatDate,
  formatDateTime,
  formatNumber,
  parseLedgerDate,
  TreasuryPeriodMode,
  TreasuryPeriodFilter,
  isDateInPeriod,
  MONTH_NAMES_FR,
  QUARTER_NAMES_FR,
  SEMESTER_NAMES_FR,
} from '../../utils/goldMath';
import {
  LedgerEntry,
  SUPPLIER_ROLES,
  CLIENT_ROLES,
  OTHER_CONTACT_ROLES,
} from '../../types';
import { OfficialBankDepositSlipModal } from '../banks/OfficialBankDepositSlipModal';
import { BankDepositForm } from '../banks/BankDepositForm';

const EXPENSE_CATEGORIES = [
  'Dépense courante',
  'Salaires',
  'Loyer',
  'Eau et Électricité',
  'Marketing',
  'Fournitures de bureau',
  'Assurances',
  'Transport & Logistique',
  'Autres frais administratifs',
] as const;

interface CashScreenProps {
  initialTab?: 'achat' | 'depot_retrait' | 'appro' | 'virement_client' | 'depenses' | 'versements' | 'flux_periodes';
}

export const CashScreen: React.FC<CashScreenProps> = ({ initialTab = 'achat' }) => {
  const store = useAppStore();
  const isAdmin = store.currentRole === 'ADMIN';
  const canNewPurchase = store.canAccessService(1, 'cash.achat_nouvel');
  const canPurchaseList = store.canAccessService(1, 'cash.achat_liste');
  const canAchat = canNewPurchase || canPurchaseList;
  const canDepotRetrait = store.canAccessService(1, 'cash.depot_retrait');
  const canAppro = store.canAccessService(1, 'cash.appro');
  const canDepenses = store.canAccessService(1, 'cash.depenses');
  const canVersements = store.canAccessService(1, 'cash.versements');
  const canFlux = store.canAccessService(1, 'cash.flux_periodes');

  const canCaisse = canDepotRetrait || canDepenses;

  const allowedCashTabs = useMemo(() => {
    const tabs: Array<'achat' | 'depot_retrait' | 'appro' | 'versements' | 'flux_periodes'> = [];
    if (canAchat) tabs.push('achat');
    if (canCaisse) tabs.push('depot_retrait');
    if (canAppro) tabs.push('appro');
    if (canVersements) tabs.push('versements');
    if (canFlux) tabs.push('flux_periodes');
    return tabs;
  }, [canAchat, canCaisse, canAppro, canVersements, canFlux]);

  const normalizedInitial =
    initialTab === 'virement_client'
      ? 'appro'
      : initialTab === 'depenses'
      ? 'depot_retrait'
      : initialTab;
  const [activeTab, setActiveTab] = useState<'achat' | 'depot_retrait' | 'appro' | 'versements' | 'flux_periodes'>(
    allowedCashTabs.includes(normalizedInitial) ? normalizedInitial : (allowedCashTabs[0] || 'achat')
  );
  const [approView, setApproView] = useState<'internal' | 'client'>(
    initialTab === 'virement_client' ? 'client' : 'internal'
  );
  const [isPurchaseFormOpen, setIsPurchaseFormOpen] = useState(false);

  useEffect(() => {
    if (allowedCashTabs.length > 0 && !allowedCashTabs.includes(activeTab)) {
      setActiveTab(allowedCashTabs[0]);
    }
  }, [allowedCashTabs, activeTab]);

  // Compte caisse principal
  const cashAccountName =
    Object.keys(store.bankBalances).find((k) => k.toLowerCase().includes('caisse')) || 'Caisse (espèces)';
  const companyBanks = Object.keys(store.bankBalances).filter((k) => k !== cashAccountName);
  const currentCashBalance = store.bankBalances[cashAccountName] ?? 0;

  // 0. Interface Caisse unifiée (Compte Source, Contact, Montant, Motif, Dépenses OPEX, Dépôt | Retrait)
  const [caisseSourceAccount, setCaisseSourceAccount] = useState<string>(cashAccountName);
  const [caisseContact, setCaisseContact] = useState('');
  const [caisseAmount, setCaisseAmount] = useState('');
  const [caisseMotif, setCaisseMotif] = useState('');
  const [caisseDate, setCaisseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [caisseOpexMode, setCaisseOpexMode] = useState<boolean>(!canDepotRetrait && canDepenses);
  const [caisseOpexCategory, setCaisseOpexCategory] = useState<string>('Dépense courante');
  const [caisseFeedback, setCaisseFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [apercuFilterByContact, setApercuFilterByContact] = useState<boolean>(true);
  const [contactAllAccounts, setContactAllAccounts] = useState<boolean>(true);
  const [historyScope, setHistoryScope] = useState<'account' | 'all'>('account');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'DEPOT' | 'RETRAIT' | 'OPEX' | 'OR' | 'DEVISE'>('ALL');
  const [isCaisseReportPrintOpen, setIsCaisseReportPrintOpen] = useState(false);
  const [sourceRoleFilter, setSourceRoleFilter] = useState<'ALL' | 'SUPPLIER' | 'CLIENT' | 'DEVISE'>('ALL');
  const [sourceStatusFilter, setSourceStatusFilter] = useState<'ALL' | 'CREDITOR' | 'DEBTOR' | 'SETTLED'>('ALL');
  const [directoryGoldTypeFilter, setDirectoryGoldTypeFilter] = useState<'ALL' | 'Or brut' | 'Or fondu' | 'Bijoux'>('ALL');
  const [directorySearchQuery, setDirectorySearchQuery] = useState('');
  const [directorySortBy, setDirectorySortBy] = useState<'magnitude' | 'we_owe' | 'owes_us' | 'name'>('magnitude');

  useEffect(() => {
    if (!Object.prototype.hasOwnProperty.call(store.bankBalances, caisseSourceAccount)) {
      setCaisseSourceAccount(cashAccountName);
    }
  }, [store.bankBalances, caisseSourceAccount, cashAccountName]);

  // Recherche & Modification d'opérations
  const [searchOpQuery, setSearchOpQuery] = useState('');
  const [editingOp, setEditingOp] = useState<LedgerEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubtitle, setEditSubtitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteEditingOp, setConfirmDeleteEditingOp] = useState(false);

  // Admin : Modification & Suppression d'un Compte Source (Client / Fournisseur)
  const [editingSourceAccount, setEditingSourceAccount] = useState<{
    key: string;
    name: string;
    reference?: string;
    phone?: string;
    city?: string;
    roles: string[];
  } | null>(null);
  const [sourceEditName, setSourceEditName] = useState('');
  const [sourceEditPhone, setSourceEditPhone] = useState('');
  const [sourceEditCity, setSourceEditCity] = useState('');
  const [sourceEditRoles, setSourceEditRoles] = useState<string[]>([]);
  const [sourceEditRenameLinked, setSourceEditRenameLinked] = useState(true);
  const [sourceEditError, setSourceEditError] = useState<string | null>(null);
  const [sourceEditSuccess, setSourceEditSuccess] = useState<string | null>(null);
  const [confirmDeleteLinkedOpId, setConfirmDeleteLinkedOpId] = useState<string | null>(null);

  const [deletingSourceAccount, setDeletingSourceAccount] = useState<ContactPosition | null>(null);
  const [sourceDeleteMode, setSourceDeleteMode] = useState<'detach_only' | 'purge_all'>('detach_only');
  const [sourceDeleteError, setSourceDeleteError] = useState<string | null>(null);
  const [sourceActionFeedback, setSourceActionFeedback] = useState<string | null>(null);

  // Lien obligatoire Caisse (Dépôt / Retrait) <-> État des Comptes Sources (Régler solde)
  const [caisseSettlementTarget, setCaisseSettlementTarget] = useState<string>('AUTO');
  const [settlingSourceAccount, setSettlingSourceAccount] = useState<ContactPosition | null>(null);
  const [settleDirection, setSettleDirection] = useState<'pay_out' | 'collect_in'>('pay_out');
  const [settleTargetKey, setSettleTargetKey] = useState<string>('AUTO');
  const [settleMode, setSettleMode] = useState<'cash_movement' | 'compensate_cash_balance'>('cash_movement');
  const [settleAccount, setSettleAccount] = useState<string>(cashAccountName);
  const [settleAmount, setSettleAmount] = useState<string>('');
  const [settleDate, setSettleDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [settleNote, setSettleNote] = useState<string>('');
  const [settleError, setSettleError] = useState<string | null>(null);

  // 1. Appro (Approvisionnement interne de compte à compte)
  const [approFrom, setApproFrom] = useState('Caisse (espèces)');
  const [approTo, setApproTo] = useState('Caisse (espèces)');
  const [approAmount, setApproAmount] = useState('');
  const [approLabel, setApproLabel] = useState('');
  const [approSuccess, setApproSuccess] = useState<string | null>(null);
  const [approError, setApproError] = useState<string | null>(null);

  // 2. Virement Client (Virement de mon compte vers le compte d'un client)
  const [clientTransferFrom, setClientTransferFrom] = useState('Caisse (espèces)');
  const [selectedContactRef, setSelectedContactRef] = useState<string>('');
  const [customClientName, setCustomClientName] = useState('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [clientBank, setClientBank] = useState('');
  const [clientAccountNumber, setClientAccountNumber] = useState('');
  const [clientBankAgency, setClientBankAgency] = useState('');
  const [clientAccountHolder, setClientAccountHolder] = useState('');
  const [clientBankReference, setClientBankReference] = useState('');
  const [clientTransferAmount, setClientTransferAmount] = useState('');
  const [clientTransferFee, setClientTransferFee] = useState('');
  const [clientTransferReason, setClientTransferReason] = useState('');
  const [clientTransferPurchaseId, setClientTransferPurchaseId] = useState<string>('NONE');
  const [clientTransferSuccess, setClientTransferSuccess] = useState<string | null>(null);
  const [clientTransferError, setClientTransferError] = useState<string | null>(null);

  // Modal receipt
  const [receiptEntry, setReceiptEntry] = useState<LedgerEntry | null>(null);

  // 3. Versement en Banque (Versement d'espèces de la Caisse vers un compte bancaire d'entreprise)
  const [versementBank, setVersementBank] = useState<string>(() => companyBanks[0] || 'Ecobank');
  const [versementAmount, setVersementAmount] = useState('');
  const [versementSlip, setVersementSlip] = useState('');
  const [versementDepositor, setVersementDepositor] = useState(store.userName || '');
  const [versementDate, setVersementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [versementNote, setVersementNote] = useState('');
  const [versementSuccess, setVersementSuccess] = useState<string | null>(null);
  const [versementError, setVersementError] = useState<string | null>(null);
  const [selectedDepositReceipt, setSelectedDepositReceipt] = useState<LedgerEntry | null>(null);

  // 4. Périodes Entrées & Sorties (Mois, Trimestre, Semestre, Annuel)
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentQuarter = (Math.floor(currentMonth / 3) + 1) as 1 | 2 | 3 | 4;
  const currentSemester = (currentMonth < 6 ? 1 : 2) as 1 | 2;

  const [periodMode, setPeriodMode] = useState<TreasuryPeriodMode>('month');
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState<1 | 2 | 3 | 4>(currentQuarter);
  const [selectedSemester, setSelectedSemester] = useState<1 | 2>(currentSemester);
  const [operationsTypeFilter, setOperationsTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');

  const periodFilter: TreasuryPeriodFilter = useMemo(
    () => ({
      mode: periodMode,
      year: selectedYear,
      monthIndex: periodMode === 'month' ? selectedMonth : undefined,
      quarterIndex: periodMode === 'quarter' ? selectedQuarter : undefined,
      semesterIndex: periodMode === 'semester' ? selectedSemester : undefined,
    }),
    [periodMode, selectedYear, selectedMonth, selectedQuarter, selectedSemester]
  );

  const periodLabel = useMemo(() => {
    switch (periodMode) {
      case 'month':
        return `${MONTH_NAMES_FR[selectedMonth]} ${selectedYear}`;
      case 'quarter':
        return `${QUARTER_NAMES_FR.find((q) => q.id === selectedQuarter)?.label} ${selectedYear}`;
      case 'semester':
        return `${SEMESTER_NAMES_FR.find((s) => s.id === selectedSemester)?.label} ${selectedYear}`;
      case 'year':
        return `Année ${selectedYear}`;
    }
  }, [periodMode, selectedYear, selectedMonth, selectedQuarter, selectedSemester]);

  // Contacts list (répertoire + contacts détectés dans les mouvements or / devises / caisse)
  const clientContacts = store.contacts;
  const knownSupplierNames = useMemo(() => {
    const existingLower = new Set(store.contacts.map((c) => c.name.trim().toLowerCase()));
    const extra = new Set<string>();
    const addIfNew = (val?: string) => {
      const clean = val?.trim();
      if (!clean) return;
      if (['gérant', 'bénéficiaire', 'client de passage', 'client direct', '—'].includes(clean.toLowerCase())) return;
      if (!existingLower.has(clean.toLowerCase())) extra.add(clean);
    };
    store.purchases.forEach((p) => addIfNew(p.supplier));
    store.currencyStockMovements.forEach((m) => addIfNew(m.contact));
    store.goldCurrencyMovements
      .filter((m) => m.type === 'Achat devise d’or' || m.type === 'Vente devise d’or')
      .forEach((m) => addIfNew(m.contact));
    store.operations.forEach((op) => {
      addIfNew(op.depositor);
      addIfNew(op.beneficiary);
      addIfNew(op.clientTransferDetails?.clientName);
    });
    return Array.from(extra).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [store.contacts, store.purchases, store.currencyStockMovements, store.goldCurrencyMovements, store.operations]);

  const normalizeDigits = (val: string) => val.replace(/\D/g, '');

  const contactSearchContext = useMemo(() => {
    const raw = caisseContact.trim();
    const q = raw.toLowerCase();
    const qDigits = normalizeDigits(raw);

    if (!raw) {
      return {
        hasQuery: false,
        raw: '',
        matchedContact: undefined as (typeof store.contacts)[number] | undefined,
        matchesValue: (_val?: string) => false,
      };
    }

    const exactContact = store.contacts.find((c) => {
      if (c.name.trim().toLowerCase() === q) return true;
      if (c.reference.trim().toLowerCase() === q) return true;
      const phoneDigits = normalizeDigits(c.phone || '');
      if (qDigits.length >= 6 && phoneDigits.length >= 6) {
        return phoneDigits === qDigits || phoneDigits.endsWith(qDigits) || qDigits.endsWith(phoneDigits);
      }
      return false;
    });

    const partialContacts = store.contacts.filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.reference.toLowerCase().includes(q)) return true;
      const phoneDigits = normalizeDigits(c.phone || '');
      if (qDigits.length >= 3 && phoneDigits.includes(qDigits)) return true;
      return false;
    });

    const matchedContact =
      exactContact || (qDigits.length >= 6 && partialContacts.length === 1 ? partialContacts[0] : undefined);

    const textTokens = new Set<string>([q]);
    const digitTokens = new Set<string>();
    if (qDigits.length >= 4) digitTokens.add(qDigits);

    const registerContactTokens = (c: (typeof store.contacts)[number]) => {
      if (c.name.trim()) textTokens.add(c.name.trim().toLowerCase());
      if (c.reference.trim()) textTokens.add(c.reference.trim().toLowerCase());
      if (c.phone.trim()) textTokens.add(c.phone.trim().toLowerCase());
      const pd = normalizeDigits(c.phone || '');
      if (pd.length >= 6) digitTokens.add(pd);
    };

    if (matchedContact) {
      registerContactTokens(matchedContact);
    } else if (q.length >= 3) {
      partialContacts.forEach(registerContactTokens);
    }

    const textList = Array.from(textTokens).filter(Boolean);
    const digitList = Array.from(digitTokens).filter(Boolean);

    const matchesValue = (val?: string): boolean => {
      if (!val) return false;
      const lower = val.trim().toLowerCase();
      if (!lower) return false;
      if (textList.some((tok) => lower.includes(tok))) return true;
      if (digitList.length > 0) {
        const valDigits = normalizeDigits(val);
        if (valDigits.length >= 4 && digitList.some((d) => valDigits.includes(d) || d.includes(valDigits))) {
          return true;
        }
      }
      return false;
    };

    return {
      hasQuery: true,
      raw,
      matchedContact,
      matchesValue,
    };
  }, [caisseContact, store.contacts]);

  interface ContactPosition {
    key: string;
    name: string;
    reference?: string;
    phone?: string;
    city?: string;
    roles: string[];
    isSupplier: boolean;
    isClient: boolean;
    isCurrencyContact: boolean;
    isPartner: boolean;
    cashDepositsXaf: number;
    cashWithdrawalsXaf: number;
    cashDepositNetXaf: number;
    opexXaf: number;
    goldPurchaseCount: number;
    goldTotalWeightGrams: number;
    goldTotalAmountXaf: number;
    goldPaidXaf: number;
    goldRemainingXaf: number;
    saleCount: number;
    salesPureGrams: number;
    salesTotalXaf: number;
    salesPaidXaf: number;
    salesRemainingXaf: number;
    currencyOpsCount: number;
    currencyTotalXaf: number;
    currencyTags: string[];
    currencyWeOweXaf: number;
    currencyOwedToUsXaf: number;
    loansWeOweXaf: number;
    loansOwedToUsXaf: number;
    totalInContactFavorXaf: number;
    totalOwedToUsXaf: number;
    netPositionXaf: number;
    operationsCount: number;
  }

  const allContactPositions = useMemo<ContactPosition[]>(() => {
    const usdToXafFallback = store.purchaseFormulaConfig.officialUsdRate || 606.85;

    const buildPosition = (params: {
      key: string;
      name: string;
      reference?: string;
      phone?: string;
      city?: string;
      roles: string[];
    }): ContactPosition => {
      const textTokens = [params.name, params.reference, params.phone]
        .map((v) => (v || '').trim().toLowerCase())
        .filter((v) => v.length > 0);
      const phoneDigits = normalizeDigits(params.phone || '');

      const matches = (val?: string): boolean => {
        if (!val) return false;
        const lower = val.trim().toLowerCase();
        if (!lower) return false;
        if (textTokens.some((t) => lower.includes(t))) return true;
        if (phoneDigits.length >= 6) {
          const vd = normalizeDigits(val);
          if (vd.length >= 6 && (vd.includes(phoneDigits) || phoneDigits.includes(vd))) return true;
        }
        return false;
      };

      const matchedPurchases = store.purchases.filter(
        (p) => !p.cancelledAt && (matches(p.supplier) || matches(p.reference) || matches(p.description))
      );
      const matchedPurchaseOpIds = new Set(
        store.purchases
          .filter((p) => p.id.startsWith('purch-') && (matches(p.supplier) || matches(p.reference) || matches(p.description)))
          .map((p) => `op-${p.id.slice('purch-'.length)}`)
      );

      const matchedCurrency = [
        ...store.currencyStockMovements,
        ...store.goldCurrencyMovements.filter(
          (m) => m.type === 'Achat devise d’or' || m.type === 'Vente devise d’or'
        ),
      ].filter((m) => matches(m.contact) || matches(m.label));
      const matchedSales = store.saleRecords.filter(
        (s) =>
          matches(s.clientName) ||
          matches(s.clientPhone) ||
          matches(s.clientReference) ||
          (params.reference && s.clientId === params.reference)
      );
      const matchedLoans = store.loans.filter(
        (l) => matches(l.partnerName) || (l.partnerId !== undefined && matches(String(l.partnerId)))
      );

      let cashDepositsXaf = 0;
      let cashWithdrawalsXaf = 0;
      let opexXaf = 0;
      let ledgerOpsCount = 0;

      for (const op of store.operations) {
        if (matchedPurchaseOpIds.has(op.id)) continue;
        if (
          op.id.startsWith('op-purchpay-') ||
          op.id.startsWith('op-salepay-') ||
          op.id.startsWith('op-loanpay-') ||
          op.id.startsWith('op-curbuy-') ||
          op.id.startsWith('op-cursell-') ||
          op.id.startsWith('op-curpay-') ||
          op.id.startsWith('op-gcurbuy-') ||
          op.id.startsWith('op-gcursell-') ||
          op.id.startsWith('op-gcurpay-')
        ) {
          continue;
        }
        if (op.isTransfer && !op.isClientTransfer) continue;
        const opMatched =
          matches(op.depositor) ||
          matches(op.beneficiary) ||
          matches(op.clientTransferDetails?.clientName) ||
          matches(op.title) ||
          matches(op.subtitle) ||
          matches(op.reference);
        if (!opMatched) continue;

        const titleLower = op.title.toLowerCase();
        if (titleLower.startsWith('achat') || titleLower.includes('échange')) continue;

        ledgerOpsCount += 1;
        if (titleLower.startsWith('dépense')) {
          opexXaf += op.amount;
        } else if (op.isIncome) {
          cashDepositsXaf += op.amount;
        } else {
          const settledPurchaseAmt = op.settledPurchaseAmountXaf ? Math.min(op.amount, op.settledPurchaseAmountXaf) : 0;
          cashWithdrawalsXaf += Math.max(0, op.amount - settledPurchaseAmt);
        }
      }

      const cashDepositNetXaf = cashDepositsXaf - cashWithdrawalsXaf;

      const goldPurchaseCount = matchedPurchases.length;
      const goldTotalWeightGrams = matchedPurchases.reduce(
        (sum, p) => sum + (p.netWeightGrams ?? p.grossWeightGrams ?? 0),
        0
      );
      const goldTotalAmountXaf = matchedPurchases.reduce((sum, p) => sum + p.amount, 0);
      const goldPaidXaf = matchedPurchases.reduce(
        (sum, p) => sum + (p.payments || []).reduce((ps, pay) => ps + pay.amount, 0),
        0
      );
      const goldRemainingXaf = Math.max(0, goldTotalAmountXaf - goldPaidXaf);

      const saleCount = matchedSales.length;
      const salesPureGrams = matchedSales.reduce((sum, s) => sum + s.totalPureWeight24kGrams, 0);
      const salesTotalXaf = matchedSales.reduce(
        (sum, s) => sum + (s.grossRevenueXaf ?? Math.round(s.grossRevenueUsd * (s.usdToXafRate || usdToXafFallback))),
        0
      );
      const salesRemainingXaf = matchedSales.reduce(
        (sum, s) =>
          sum +
          (s.balanceRemainingXaf ?? Math.round(s.balanceRemainingUsd * (s.usdToXafRate || usdToXafFallback))),
        0
      );
      const salesPaidXaf = Math.max(0, salesTotalXaf - salesRemainingXaf);

      const currencyOpsCount = matchedCurrency.length;
      const currencyTotalXaf = matchedCurrency.reduce((sum, m) => sum + (m.totalXaf || 0), 0);
      const currencyTags = Array.from(new Set(matchedCurrency.map((m) => m.currency))).filter(Boolean);
      const currencyWeOweXaf = matchedCurrency.reduce((sum, m) => {
        const isBuy = m.type.toLowerCase().startsWith('achat');
        const rem = m.creditStatus === 'settled' ? 0 : m.remainingXaf ?? 0;
        return isBuy && rem > 0 ? sum + rem : sum;
      }, 0);
      const currencyOwedToUsXaf = matchedCurrency.reduce((sum, m) => {
        const isSell = m.type.toLowerCase().startsWith('vente');
        const rem = m.creditStatus === 'settled' ? 0 : m.remainingXaf ?? 0;
        return isSell && rem > 0 ? sum + rem : sum;
      }, 0);

      let loansWeOweXaf = 0;
      let loansOwedToUsXaf = 0;
      for (const l of matchedLoans) {
        const repaid = (l.repayments || []).reduce((sum, r) => sum + r.amountXaf, 0);
        const remaining = Math.max(0, l.principalXaf - repaid);
        if (l.direction === 'companyBorrows') loansWeOweXaf += remaining;
        else loansOwedToUsXaf += remaining;
      }

      const totalInContactFavorXaf =
        Math.max(0, cashDepositNetXaf) + goldRemainingXaf + currencyWeOweXaf + loansWeOweXaf;
      const totalOwedToUsXaf =
        Math.max(0, -cashDepositNetXaf) + salesRemainingXaf + currencyOwedToUsXaf + loansOwedToUsXaf;
      const netPositionXaf = totalInContactFavorXaf - totalOwedToUsXaf;

      const rolesLower = params.roles.map((r) => r.toLowerCase());
      const isSupplier =
        rolesLower.some((r) => r.includes('fournisseur')) || goldPurchaseCount > 0;
      const isClient =
        rolesLower.some((r) => r.includes('client')) || saleCount > 0;
      const isCurrencyContact =
        rolesLower.some((r) => r.includes('devise') || r.includes('échange')) || currencyOpsCount > 0;
      const isPartner =
        rolesLower.some((r) => r.includes('partenaire')) || matchedLoans.length > 0;

      return {
        key: params.key,
        name: params.name,
        reference: params.reference,
        phone: params.phone,
        city: params.city,
        roles: params.roles,
        isSupplier,
        isClient,
        isCurrencyContact,
        isPartner,
        cashDepositsXaf,
        cashWithdrawalsXaf,
        cashDepositNetXaf,
        opexXaf,
        goldPurchaseCount,
        goldTotalWeightGrams,
        goldTotalAmountXaf,
        goldPaidXaf,
        goldRemainingXaf,
        saleCount,
        salesPureGrams,
        salesTotalXaf,
        salesPaidXaf,
        salesRemainingXaf,
        currencyOpsCount,
        currencyTotalXaf,
        currencyTags,
        currencyWeOweXaf,
        currencyOwedToUsXaf,
        loansWeOweXaf,
        loansOwedToUsXaf,
        totalInContactFavorXaf,
        totalOwedToUsXaf,
        netPositionXaf,
        operationsCount:
          ledgerOpsCount + goldPurchaseCount + currencyOpsCount + saleCount + matchedLoans.length,
      };
    };

    const list: ContactPosition[] = store.contacts.map((c) =>
      buildPosition({
        key: c.reference,
        name: c.name,
        reference: c.reference,
        phone: c.phone,
        city: c.city,
        roles: c.roles,
      })
    );

    for (const extraName of knownSupplierNames) {
      list.push(
        buildPosition({
          key: `extra-${extraName}`,
          name: extraName,
          roles: ['Fournisseur / Contact'],
        })
      );
    }

    return list;
  }, [
    store.contacts,
    store.purchases,
    store.currencyStockMovements,
    store.goldCurrencyMovements,
    store.saleRecords,
    store.loans,
    store.operations,
    store.purchaseFormulaConfig.officialUsdRate,
    knownSupplierNames,
  ]);

  const selectedContactPosition = useMemo<ContactPosition | undefined>(() => {
    if (!contactSearchContext.hasQuery) return undefined;
    if (contactSearchContext.matchedContact) {
      return allContactPositions.find(
        (p) => p.reference === contactSearchContext.matchedContact?.reference
      );
    }
    const q = contactSearchContext.raw.toLowerCase();
    return allContactPositions.find((p) => p.name.toLowerCase() === q);
  }, [contactSearchContext, allContactPositions]);

  interface OpenSettlementItem {
    key: string;
    direction: 'pay_out' | 'collect_in';
    targetType: 'gold_purchase' | 'currency_purchase' | 'gold_sale' | 'currency_sale' | 'loan';
    targetId: string;
    label: string;
    sublabel: string;
    remainingXaf: number;
  }

  const getOpenSettlementItems = (pos?: ContactPosition) => {
    if (!pos) {
      return {
        payables: [] as OpenSettlementItem[],
        receivables: [] as OpenSettlementItem[],
        totalPayablesXaf: 0,
        totalReceivablesXaf: 0,
      };
    }

    const textTokens = [pos.name, pos.reference, pos.phone]
      .map((v) => (v || '').trim().toLowerCase())
      .filter((v) => v.length > 0);
    const phoneDigits = normalizeDigits(pos.phone || '');
    const matches = (val?: string): boolean => {
      if (!val) return false;
      const lower = val.trim().toLowerCase();
      if (!lower) return false;
      if (textTokens.some((t) => lower.includes(t))) return true;
      if (phoneDigits.length >= 6) {
        const vd = normalizeDigits(val);
        if (vd.length >= 6 && (vd.includes(phoneDigits) || phoneDigits.includes(vd))) return true;
      }
      return false;
    };

    const payables: OpenSettlementItem[] = [];
    const receivables: OpenSettlementItem[] = [];
    const fallbackRate = store.purchaseFormulaConfig.officialUsdRate || 606.85;

    // 1. Achats d'or impayés (On doit)
    for (const p of store.purchases) {
      if (p.cancelledAt) continue;
      if (!matches(p.supplier) && !matches(p.reference) && !matches(p.description)) continue;
      const paid = (p.payments || []).reduce((s, pay) => s + pay.amount, 0);
      const rem = Math.max(0, p.amount - paid);
      if (rem <= 0) continue;
      const weight = p.netWeightGrams ?? p.grossWeightGrams ?? 0;
      payables.push({
        key: `gold_purchase:${p.id}`,
        direction: 'pay_out',
        targetType: 'gold_purchase',
        targetId: p.id,
        label: `Achat Or · ${p.reference}`,
        sublabel: `${p.goldCategory}${weight > 0 ? ` · ${formatNumber(weight, 1)}g` : ''} · Reste ${formatMoney(rem)} F`,
        remainingXaf: rem,
      });
    }

    // 2. Devises (achats à payer & ventes à encaisser)
    const allCur = [
      ...store.currencyStockMovements,
      ...store.goldCurrencyMovements.filter(
        (m) => m.type === 'Achat devise d’or' || m.type === 'Vente devise d’or'
      ),
    ];
    for (const m of allCur) {
      if (!matches(m.contact) && !matches(m.label)) continue;
      const rem = m.creditStatus === 'settled' ? 0 : m.remainingXaf ?? 0;
      if (rem <= 0) continue;
      if (m.type.toLowerCase().startsWith('achat')) {
        payables.push({
          key: `currency_purchase:${m.id}`,
          direction: 'pay_out',
          targetType: 'currency_purchase',
          targetId: m.id,
          label: `${m.type} · ${formatNumber(Math.abs(m.amount), 2)} ${m.currency}`,
          sublabel: `${formatDate(m.date)} · Reste à payer ${formatMoney(rem)} F`,
          remainingXaf: rem,
        });
      } else if (m.type.toLowerCase().startsWith('vente')) {
        receivables.push({
          key: `currency_sale:${m.id}`,
          direction: 'collect_in',
          targetType: 'currency_sale',
          targetId: m.id,
          label: `${m.type} · ${formatNumber(Math.abs(m.amount), 2)} ${m.currency}`,
          sublabel: `${formatDate(m.date)} · À encaisser ${formatMoney(rem)} F`,
          remainingXaf: rem,
        });
      }
    }

    // 3. Ventes d'or impayées (Client nous doit)
    for (const s of store.saleRecords) {
      const matchedSale =
        (pos.reference && (s.clientReference === pos.reference || s.clientId === pos.reference)) ||
        matches(s.clientName) ||
        matches(s.clientPhone) ||
        matches(s.clientReference);
      if (!matchedSale) continue;
      const rate = s.usdToXafRate && s.usdToXafRate > 0 ? s.usdToXafRate : fallbackRate;
      const rem = s.balanceRemainingXaf ?? Math.round((s.balanceRemainingUsd || 0) * rate);
      if (rem <= 0) continue;
      receivables.push({
        key: `gold_sale:${s.id}`,
        direction: 'collect_in',
        targetType: 'gold_sale',
        targetId: s.id,
        label: `Vente Or · ${s.reference}`,
        sublabel: `${formatNumber(s.totalPureWeight24kGrams, 1)}g 24K · À encaisser ${formatMoney(rem)} F`,
        remainingXaf: rem,
      });
    }

    // 4. Prêts / Emprunts
    for (const l of store.loans) {
      if (!matches(l.partnerName) && !(l.partnerId !== undefined && matches(String(l.partnerId)))) {
        continue;
      }
      const repaid = (l.repayments || []).reduce((sum, r) => sum + r.amountXaf, 0);
      const rem = Math.max(0, l.principalXaf - repaid);
      if (rem <= 0) continue;
      if (l.direction === 'companyBorrows') {
        payables.push({
          key: `loan:${l.id}`,
          direction: 'pay_out',
          targetType: 'loan',
          targetId: l.id,
          label: `Emprunt · ${l.reference}`,
          sublabel: `Reste à rembourser ${formatMoney(rem)} F`,
          remainingXaf: rem,
        });
      } else {
        receivables.push({
          key: `loan:${l.id}`,
          direction: 'collect_in',
          targetType: 'loan',
          targetId: l.id,
          label: `Prêt accordé · ${l.reference}`,
          sublabel: `À recouvrer ${formatMoney(rem)} F`,
          remainingXaf: rem,
        });
      }
    }

    return {
      payables,
      receivables,
      totalPayablesXaf: payables.reduce((sum, i) => sum + i.remainingXaf, 0),
      totalReceivablesXaf: receivables.reduce((sum, i) => sum + i.remainingXaf, 0),
    };
  };

  const selectedContactOpenItems = useMemo(
    () => getOpenSettlementItems(selectedContactPosition),
    [
      selectedContactPosition,
      store.purchases,
      store.currencyStockMovements,
      store.goldCurrencyMovements,
      store.saleRecords,
      store.loans,
      store.purchaseFormulaConfig.officialUsdRate,
    ]
  );

  const settlingOpenItems = useMemo(
    () => getOpenSettlementItems(settlingSourceAccount || undefined),
    [
      settlingSourceAccount,
      store.purchases,
      store.currencyStockMovements,
      store.goldCurrencyMovements,
      store.saleRecords,
      store.loans,
      store.purchaseFormulaConfig.officialUsdRate,
    ]
  );

  useEffect(() => {
    setCaisseSettlementTarget('AUTO');
  }, [caisseContact]);

  const matchesRoleAndStatus = (
    p: ContactPosition,
    roleF: 'ALL' | 'SUPPLIER' | 'CLIENT' | 'DEVISE',
    statusF: 'ALL' | 'CREDITOR' | 'DEBTOR' | 'SETTLED'
  ): boolean => {
    if (roleF === 'SUPPLIER' && !p.isSupplier) return false;
    if (roleF === 'CLIENT' && !p.isClient) return false;
    if (roleF === 'DEVISE' && !p.isCurrencyContact) return false;
    if (statusF === 'CREDITOR' && p.netPositionXaf <= 0) return false;
    if (statusF === 'DEBTOR' && p.netPositionXaf >= 0) return false;
    if (statusF === 'SETTLED' && p.netPositionXaf !== 0) return false;
    return true;
  };

  const filteredSourceContacts = useMemo(() => {
    return allContactPositions
      .filter((p) => matchesRoleAndStatus(p, sourceRoleFilter, sourceStatusFilter))
      .sort((a, b) => Math.abs(b.netPositionXaf) - Math.abs(a.netPositionXaf) || a.name.localeCompare(b.name, 'fr'));
  }, [allContactPositions, sourceRoleFilter, sourceStatusFilter]);

  const globalAccountTotals = useMemo(() => {
    let totalHeldDepositsXaf = 0;
    let totalWeOweXaf = 0;
    let totalOwedToUsXaf = 0;
    let creditorCount = 0;
    let debtorCount = 0;
    for (const p of allContactPositions) {
      if (p.cashDepositNetXaf > 0) totalHeldDepositsXaf += p.cashDepositNetXaf;
      totalWeOweXaf += p.goldRemainingXaf + p.currencyWeOweXaf + p.loansWeOweXaf;
      totalOwedToUsXaf += p.totalOwedToUsXaf;
      if (p.netPositionXaf > 0) creditorCount += 1;
      else if (p.netPositionXaf < 0) debtorCount += 1;
    }
    return {
      totalHeldDepositsXaf,
      totalWeOweXaf,
      totalOwedToUsXaf,
      creditorCount,
      debtorCount,
    };
  }, [allContactPositions]);

  const directoryFilteredPositions = useMemo(() => {
    const q = directorySearchQuery.trim().toLowerCase();
    const qDigits = normalizeDigits(directorySearchQuery);
    const list = allContactPositions.filter((p) => {
      if (!matchesRoleAndStatus(p, sourceRoleFilter, sourceStatusFilter)) return false;
      if (directoryGoldTypeFilter !== 'ALL') {
        const needle = directoryGoldTypeFilter.toLowerCase();
        const hasRole = p.roles.some((r) => r.toLowerCase().includes(needle));
        if (!hasRole) return false;
      }
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          (p.reference?.toLowerCase().includes(q) ?? false) ||
          (p.city?.toLowerCase().includes(q) ?? false) ||
          (p.phone?.toLowerCase().includes(q) ?? false) ||
          p.roles.some((r) => r.toLowerCase().includes(q)) ||
          (qDigits.length >= 3 && normalizeDigits(p.phone || '').includes(qDigits));
        if (!hit) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (directorySortBy === 'we_owe') return b.netPositionXaf - a.netPositionXaf;
      if (directorySortBy === 'owes_us') return a.netPositionXaf - b.netPositionXaf;
      if (directorySortBy === 'name') return a.name.localeCompare(b.name, 'fr');
      return Math.abs(b.netPositionXaf) - Math.abs(a.netPositionXaf) || b.operationsCount - a.operationsCount;
    });
    return list;
  }, [
    allContactPositions,
    sourceRoleFilter,
    sourceStatusFilter,
    directoryGoldTypeFilter,
    directorySearchQuery,
    directorySortBy,
  ]);

  useEffect(() => {
    if (!store.bankBalances[caisseSourceAccount] && store.bankBalances[caisseSourceAccount] !== 0) {
      setCaisseSourceAccount(cashAccountName);
    }
  }, [store.bankBalances, caisseSourceAccount, cashAccountName]);

  // Handle contact select (Appro Virement Client)
  const handleSelectContact = (contactRef: string) => {
    setSelectedContactRef(contactRef);
    setClientTransferPurchaseId('NONE');
    if (!contactRef) {
      setIsNewClient(true);
      return;
    }
    setIsNewClient(false);
    const found = store.contacts.find((c) => c.reference === contactRef);
    if (found) {
      setCustomClientName(found.name);
      if (found.bankName) setClientBank(found.bankName);
      if (found.bankAccountNumber) setClientAccountNumber(found.bankAccountNumber);
    }
  };

  const parseSettlementTargetKey = (
    key: string
  ): {
    targetType:
      | 'auto'
      | 'gold_purchase'
      | 'currency_purchase'
      | 'gold_sale'
      | 'currency_sale'
      | 'loan'
      | 'cash_balance';
    targetId?: string;
  } => {
    if (!key || key === 'AUTO' || key === 'FREE') {
      return { targetType: 'auto' };
    }
    if (key === 'cash_balance') {
      return { targetType: 'cash_balance' };
    }
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) return { targetType: 'auto' };
    const prefix = key.slice(0, colonIdx);
    const id = key.slice(colonIdx + 1);
    if (
      prefix === 'gold_purchase' ||
      prefix === 'currency_purchase' ||
      prefix === 'gold_sale' ||
      prefix === 'currency_sale' ||
      prefix === 'loan'
    ) {
      return { targetType: prefix, targetId: id };
    }
    return { targetType: 'auto' };
  };

  // Exécuter un Dépôt au compte sélectionné (encaissement créance, ou règlement d'achat d'or si sélectionné explicitement)
  const handleCaisseDepot = () => {
    setCaisseFeedback(null);
    if (!canDepotRetrait) {
      setCaisseFeedback({ type: 'error', message: 'Vous n’avez pas accès aux dépôts de caisse.' });
      return;
    }
    const amt = parseFloat(caisseAmount.replace(/\s+/g, '').replace(',', '.') || '0');
    if (amt <= 0 || !Number.isFinite(amt)) {
      setCaisseFeedback({ type: 'error', message: 'Veuillez saisir un montant strictement positif.' });
      return;
    }
    const contactLabel =
      selectedContactPosition?.name ||
      contactSearchContext.matchedContact?.name ||
      caisseContact.trim() ||
      store.userName ||
      'Gérant';
    const motifLabel = caisseMotif.trim() || 'Dépôt au compte';
    const selectedRecItem = selectedContactOpenItems.receivables.find(
      (i) => i.key === caisseSettlementTarget
    );
    const selectedPayItem = selectedContactOpenItems.payables.find(
      (i) => i.key === caisseSettlementTarget
    );
    const shouldLinkSettlement =
      Boolean(selectedContactPosition) &&
      caisseSettlementTarget !== 'FREE' &&
      (selectedRecItem !== undefined ||
        (caisseSettlementTarget === 'AUTO' && selectedContactOpenItems.receivables.length > 0));

    try {
      if (selectedPayItem && selectedContactPosition) {
        const parsed = parseSettlementTargetKey(selectedPayItem.key);
        const res = store.settleSourceAccountFromCash({
          contactName: selectedContactPosition.name,
          reference: selectedContactPosition.reference,
          direction: 'pay_out',
          targetType: parsed.targetType,
          targetId: parsed.targetId,
          amountXaf: amt,
          account: caisseSourceAccount,
          mode: 'cash_movement',
          date: caisseDate || new Date().toISOString().slice(0, 10),
          note: caisseMotif.trim() || 'Dépôt sur compte fournisseur',
          methodLabel: 'Dépôt sur compte fournisseur (Caisse)',
        });
        if (caisseOpexMode) setCaisseOpexMode(false);
        setCaisseFeedback({
          type: 'success',
          message: res.summary,
        });
      } else if (shouldLinkSettlement && selectedContactPosition) {
        const parsed = parseSettlementTargetKey(
          selectedRecItem ? selectedRecItem.key : 'AUTO'
        );
        const res = store.settleSourceAccountFromCash({
          contactName: selectedContactPosition.name,
          reference: selectedContactPosition.reference,
          direction: 'collect_in',
          targetType: parsed.targetType,
          targetId: parsed.targetId,
          amountXaf: amt,
          account: caisseSourceAccount,
          mode: 'cash_movement',
          date: caisseDate || new Date().toISOString().slice(0, 10),
          note: caisseMotif.trim() || undefined,
        });
        if (caisseOpexMode) setCaisseOpexMode(false);
        setCaisseFeedback({
          type: 'success',
          message: res.summary,
        });
      } else {
        store.depositCash({
          account: caisseSourceAccount,
          amount: amt,
          depositorName: contactLabel,
          reason: motifLabel,
          date: caisseDate || new Date().toISOString().slice(0, 10),
        });
        if (caisseOpexMode) setCaisseOpexMode(false);
        setCaisseFeedback({
          type: 'success',
          message: `Dépôt de ${formatMoney(amt)} FCFA crédité sur ${caisseSourceAccount} (${contactLabel}).`,
        });
      }
      setCaisseAmount('');
      setCaisseMotif('');
      setTimeout(() => setCaisseFeedback(null), 4500);
    } catch (err: unknown) {
      setCaisseFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Régler directement un achat d'or brut/bijoux à crédit ou partiel via un dépôt sur compte fournisseur depuis la Caisse
  const handleSettleGoldPurchaseByDeposit = () => {
    setCaisseFeedback(null);
    if (!canDepotRetrait) {
      setCaisseFeedback({ type: 'error', message: 'Vous n’avez pas accès aux règlements depuis la Caisse.' });
      return;
    }
    if (!selectedContactPosition) return;
    const goldPayables = selectedContactOpenItems.payables.filter(
      (i) => i.targetType === 'gold_purchase'
    );
    if (goldPayables.length === 0) return;

    const pickedGold = goldPayables.find((i) => i.key === caisseSettlementTarget);
    const defaultAmt = pickedGold
      ? pickedGold.remainingXaf
      : goldPayables.reduce((sum, item) => sum + item.remainingXaf, 0);

    const parsedInputAmt = parseFloat(caisseAmount.replace(/\s+/g, '').replace(',', '.') || '0');
    const amt = parsedInputAmt > 0 && Number.isFinite(parsedInputAmt) ? parsedInputAmt : defaultAmt;

    if (amt <= 0 || !Number.isFinite(amt)) {
      setCaisseFeedback({ type: 'error', message: 'Veuillez saisir un montant strictement positif.' });
      return;
    }

    try {
      const res = store.settleSourceAccountFromCash({
        contactName: selectedContactPosition.name,
        reference: selectedContactPosition.reference,
        direction: 'pay_out',
        targetType: 'gold_purchase',
        targetId: pickedGold ? pickedGold.targetId : undefined,
        amountXaf: amt,
        account: caisseSourceAccount,
        mode: 'cash_movement',
        date: caisseDate || new Date().toISOString().slice(0, 10),
        note: caisseMotif.trim() || 'Dépôt sur compte fournisseur · Règlement achat or',
        methodLabel: 'Dépôt sur compte fournisseur (Caisse)',
      });
      if (caisseOpexMode) setCaisseOpexMode(false);
      setCaisseFeedback({
        type: 'success',
        message: res.summary,
      });
      setCaisseAmount('');
      setCaisseMotif('');
      setTimeout(() => setCaisseFeedback(null), 5000);
    } catch (err: unknown) {
      setCaisseFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Exécuter un Retrait en cash (lié aux dettes fournisseur si applicable) ou une Dépense OPEX
  const handleCaisseRetrait = () => {
    setCaisseFeedback(null);
    const amt = parseFloat(caisseAmount.replace(/\s+/g, '').replace(',', '.') || '0');
    if (amt <= 0 || !Number.isFinite(amt)) {
      setCaisseFeedback({ type: 'error', message: 'Veuillez saisir un montant strictement positif.' });
      return;
    }
    const contactLabel =
      selectedContactPosition?.name || contactSearchContext.matchedContact?.name || caisseContact.trim();
    const motifLabel = caisseMotif.trim();

    if (caisseOpexMode) {
      if (!canDepenses) {
        setCaisseFeedback({ type: 'error', message: 'Vous n’avez pas accès aux dépenses OPEX.' });
        return;
      }
      if (!motifLabel && caisseOpexCategory === 'Dépense courante') {
        setCaisseFeedback({ type: 'error', message: 'Veuillez saisir un motif pour la dépense OPEX.' });
        return;
      }
      const fullDescription =
        caisseOpexCategory === 'Dépense courante'
          ? motifLabel
          : `${caisseOpexCategory}${motifLabel ? ` - ${motifLabel}` : ''}`;
      try {
        store.addExpense({
          account: caisseSourceAccount,
          amount: amt,
          description: fullDescription,
          date: caisseDate || new Date().toISOString().slice(0, 10),
          contactName: contactLabel || undefined,
        });
        setCaisseFeedback({
          type: 'success',
          message: `Dépense OPEX (${caisseOpexCategory}) de ${formatMoney(amt)} FCFA débitée sur ${caisseSourceAccount}.`,
        });
        setCaisseAmount('');
        setCaisseMotif('');
        setTimeout(() => setCaisseFeedback(null), 4000);
      } catch (err: unknown) {
        setCaisseFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (!canDepotRetrait) {
      setCaisseFeedback({ type: 'error', message: 'Vous n’avez pas accès aux retraits de caisse.' });
      return;
    }

    const selectedPayItem = selectedContactOpenItems.payables.find(
      (i) => i.key === caisseSettlementTarget
    );
    const shouldLinkSettlement =
      Boolean(selectedContactPosition) &&
      caisseSettlementTarget !== 'FREE' &&
      (selectedPayItem !== undefined ||
        (caisseSettlementTarget === 'AUTO' && selectedContactOpenItems.payables.length > 0));

    try {
      if (shouldLinkSettlement && selectedContactPosition) {
        const parsed = parseSettlementTargetKey(
          selectedPayItem ? selectedPayItem.key : 'AUTO'
        );
        const res = store.settleSourceAccountFromCash({
          contactName: selectedContactPosition.name,
          reference: selectedContactPosition.reference,
          direction: 'pay_out',
          targetType: parsed.targetType,
          targetId: parsed.targetId,
          amountXaf: amt,
          account: caisseSourceAccount,
          mode: 'cash_movement',
          date: caisseDate || new Date().toISOString().slice(0, 10),
          note: motifLabel || undefined,
        });
        setCaisseFeedback({
          type: 'success',
          message: res.summary,
        });
      } else {
        store.withdrawCash({
          account: caisseSourceAccount,
          amount: amt,
          beneficiaryName: contactLabel || 'Bénéficiaire',
          reason: motifLabel || 'Retrait en cash',
          date: caisseDate || new Date().toISOString().slice(0, 10),
        });
        setCaisseFeedback({
          type: 'success',
          message: `Retrait de ${formatMoney(amt)} FCFA débité sur ${caisseSourceAccount} (${contactLabel || 'Bénéficiaire'}).`,
        });
      }
      setCaisseAmount('');
      setCaisseMotif('');
      setTimeout(() => setCaisseFeedback(null), 4500);
    } catch (err: unknown) {
      setCaisseFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleOpenSettleSourceModal = (pos: ContactPosition) => {
    if (!canDepotRetrait) return;
    const open = getOpenSettlementItems(pos);
    setSettlingSourceAccount(pos);
    setSettleError(null);
    setSettleAccount(caisseSourceAccount || cashAccountName);
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleNote('');
    setSettleMode('cash_movement');

    if (open.totalPayablesXaf > 0 && (open.totalReceivablesXaf === 0 || pos.netPositionXaf >= 0)) {
      setSettleDirection('pay_out');
      setSettleTargetKey('AUTO');
      const suggested =
        pos.netPositionXaf > 0
          ? Math.min(pos.netPositionXaf, open.totalPayablesXaf)
          : open.totalPayablesXaf;
      setSettleAmount(String(suggested > 0 ? suggested : open.totalPayablesXaf));
    } else if (open.totalReceivablesXaf > 0) {
      setSettleDirection('collect_in');
      setSettleTargetKey('AUTO');
      setSettleAmount(String(open.totalReceivablesXaf));
    } else if (pos.cashDepositNetXaf > 0) {
      setSettleDirection('pay_out');
      setSettleTargetKey('cash_balance');
      setSettleAmount(String(pos.cashDepositNetXaf));
    } else if (pos.cashDepositNetXaf < 0) {
      setSettleDirection('collect_in');
      setSettleTargetKey('cash_balance');
      setSettleAmount(String(Math.abs(pos.cashDepositNetXaf)));
    } else {
      setSettleDirection('pay_out');
      setSettleTargetKey('cash_balance');
      setSettleAmount('');
    }
  };

  const handleChangeSettleDirection = (dir: 'pay_out' | 'collect_in') => {
    setSettleDirection(dir);
    setSettleError(null);
    if (!settlingSourceAccount) return;
    if (dir === 'pay_out') {
      if (settlingOpenItems.payables.length > 0) {
        setSettleTargetKey('AUTO');
        setSettleAmount(String(settlingOpenItems.totalPayablesXaf));
      } else {
        setSettleTargetKey('cash_balance');
        setSettleAmount(
          settlingSourceAccount.cashDepositNetXaf > 0
            ? String(settlingSourceAccount.cashDepositNetXaf)
            : ''
        );
      }
      if (settleMode === 'compensate_cash_balance' && settlingSourceAccount.cashDepositNetXaf >= 0) {
        setSettleMode('cash_movement');
      }
    } else {
      if (settlingOpenItems.receivables.length > 0) {
        setSettleTargetKey('AUTO');
        setSettleAmount(String(settlingOpenItems.totalReceivablesXaf));
      } else {
        setSettleTargetKey('cash_balance');
        setSettleAmount(
          settlingSourceAccount.cashDepositNetXaf < 0
            ? String(Math.abs(settlingSourceAccount.cashDepositNetXaf))
            : ''
        );
      }
      if (settleMode === 'compensate_cash_balance' && settlingSourceAccount.cashDepositNetXaf <= 0) {
        setSettleMode('cash_movement');
      }
    }
  };

  const handleSubmitSettleSourceAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingSourceAccount) return;
    setSettleError(null);
    const amt = parseFloat(settleAmount.replace(/\s+/g, '').replace(',', '.') || '0');
    if (amt <= 0 || !Number.isFinite(amt)) {
      setSettleError('Veuillez saisir un montant strictement positif.');
      return;
    }

    const parsed = parseSettlementTargetKey(settleTargetKey);
    try {
      const res = store.settleSourceAccountFromCash({
        contactName: settlingSourceAccount.name,
        reference: settlingSourceAccount.reference,
        direction: settleDirection,
        targetType: parsed.targetType,
        targetId: parsed.targetId,
        amountXaf: amt,
        account: settleAccount,
        mode: settleMode,
        date: settleDate,
        note: settleNote.trim() || undefined,
      });

      setCaisseContact(settlingSourceAccount.name);
      setApercuFilterByContact(true);
      setCaisseFeedback({ type: 'success', message: res.summary });
      setSourceActionFeedback(res.summary);
      setSettlingSourceAccount(null);
      setTimeout(() => setCaisseFeedback(null), 5000);
      setTimeout(() => setSourceActionFeedback(null), 5000);
    } catch (err: unknown) {
      setSettleError(err instanceof Error ? err.message : String(err));
    }
  };

  // Ouvrir le modal d'édition d'opération
  const handleOpenEditOp = (op: LedgerEntry) => {
    setEditingOp(op);
    setEditTitle(op.title);
    setEditSubtitle(op.subtitle);
    setEditAmount(String(op.amount));
    setEditDate(op.date);
    setEditNotes(op.notes || '');
    setEditSuccess(null);
    setEditError(null);
    setConfirmDeleteEditingOp(false);
  };

  // Enregistrer les modifications d'une opération
  const handleSaveEditOp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOp) return;
    const amt = parseFloat(editAmount.replace(',', '.') || '0');
    if (amt <= 0 || !Number.isFinite(amt)) {
      setEditError('Le montant doit être supérieur à zéro.');
      return;
    }
    try {
      store.editOperation(editingOp.id, {
        title: editTitle.trim(),
        subtitle: editSubtitle.trim(),
        amount: amt,
        date: editDate.trim(),
        notes: editNotes.trim(),
      });
      setEditSuccess('Opération mise à jour avec succès.');
      setTimeout(() => {
        setEditingOp(null);
        setEditSuccess(null);
      }, 1200);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteEditingOp = () => {
    if (!editingOp || !isAdmin) return;
    try {
      store.deleteOperation(editingOp.id);
      setEditingOp(null);
      setConfirmDeleteEditingOp(false);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenEditSourceAccount = (pos: ContactPosition) => {
    if (!isAdmin) return;
    const matchedContact = pos.reference
      ? store.contacts.find((c) => c.reference === pos.reference)
      : undefined;
    setEditingSourceAccount({
      key: pos.key,
      name: pos.name,
      reference: pos.reference,
      phone: matchedContact?.phone ?? pos.phone ?? '',
      city: matchedContact?.city ?? pos.city ?? '',
      roles: matchedContact?.roles ? [...matchedContact.roles] : [...pos.roles],
    });
    setSourceEditName(pos.name);
    setSourceEditPhone(matchedContact?.phone ?? pos.phone ?? '');
    setSourceEditCity(matchedContact?.city ?? pos.city ?? '');
    setSourceEditRoles(
      matchedContact?.roles && matchedContact.roles.length > 0
        ? [...matchedContact.roles]
        : pos.roles.filter((r) => r !== 'Fournisseur / Contact')
    );
    setSourceEditRenameLinked(true);
    setSourceEditError(null);
    setSourceEditSuccess(null);
    setConfirmDeleteLinkedOpId(null);
  };

  const handleToggleSourceRole = (role: string) => {
    setSourceEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSaveSourceAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSourceAccount || !isAdmin) return;
    setSourceEditError(null);
    if (!sourceEditName.trim()) {
      setSourceEditError('Le nom du compte source est obligatoire.');
      return;
    }
    try {
      store.updateSourceAccount({
        previousName: editingSourceAccount.name,
        reference: editingSourceAccount.reference,
        name: sourceEditName.trim(),
        phone: sourceEditPhone.trim(),
        city: sourceEditCity.trim(),
        roles: sourceEditRoles.length > 0 ? sourceEditRoles : ['Fournisseur / Contact'],
        renameLinkedRecords: sourceEditRenameLinked,
      });
      if (caisseContact.trim().toLowerCase() === editingSourceAccount.name.trim().toLowerCase()) {
        setCaisseContact(sourceEditName.trim());
      }
      setSourceEditSuccess('Compte source mis à jour avec succès.');
      setSourceActionFeedback(`Compte « ${sourceEditName.trim()} » mis à jour.`);
      setTimeout(() => setSourceActionFeedback(null), 4000);
      setTimeout(() => {
        setEditingSourceAccount(null);
        setSourceEditSuccess(null);
      }, 900);
    } catch (err: unknown) {
      setSourceEditError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleOpenDeleteSourceAccount = (pos: ContactPosition) => {
    if (!isAdmin) return;
    setDeletingSourceAccount(pos);
    setSourceDeleteMode(pos.operationsCount > 0 ? 'detach_only' : 'purge_all');
    setSourceDeleteError(null);
  };

  const handleConfirmDeleteSourceAccount = () => {
    if (!deletingSourceAccount || !isAdmin) return;
    try {
      const deletedName = deletingSourceAccount.name;
      store.deleteSourceAccount({
        reference: deletingSourceAccount.reference,
        name: deletedName,
        mode: sourceDeleteMode,
      });
      if (caisseContact.trim().toLowerCase() === deletedName.trim().toLowerCase()) {
        setCaisseContact('');
      }
      setDeletingSourceAccount(null);
      setSourceActionFeedback(
        sourceDeleteMode === 'purge_all'
          ? `Compte « ${deletedName} » et ses opérations liées supprimés (soldes recalculés).`
          : `Compte « ${deletedName} » retiré de la liste (soldes caisse/banques conservés).`
      );
      setTimeout(() => setSourceActionFeedback(null), 5000);
    } catch (err: unknown) {
      setSourceDeleteError(err instanceof Error ? err.message : String(err));
    }
  };

  const linkedCashOpsForEditingSource = useMemo(() => {
    if (!editingSourceAccount) return [];
    const tokens = [
      editingSourceAccount.name,
      editingSourceAccount.reference,
      editingSourceAccount.phone,
    ]
      .map((v) => (v || '').trim().toLowerCase())
      .filter((v) => v.length > 0);
    const matchesVal = (val?: string) => {
      if (!val) return false;
      const lower = val.trim().toLowerCase();
      return tokens.some((t) => lower === t);
    };
    return store.operations.filter((op) => {
      if (
        op.id.startsWith('op-curbuy-') ||
        op.id.startsWith('op-cursell-') ||
        op.id.startsWith('op-curpay-') ||
        op.id.startsWith('op-gcurbuy-') ||
        op.id.startsWith('op-gcursell-') ||
        op.id.startsWith('op-gcurpay-')
      ) {
        return false;
      }
      if (
        matchesVal(op.depositor) ||
        matchesVal(op.beneficiary) ||
        matchesVal(op.clientTransferDetails?.clientName)
      ) {
        return true;
      }
      const stripped = op.title
        .replace(/^(Dépôt|Retrait|Virement client)\s*·\s*/i, '')
        .trim()
        .toLowerCase();
      return stripped !== op.title.trim().toLowerCase() && tokens.includes(stripped);
    });
  }, [editingSourceAccount, store.operations]);

  // Classifier une opération vis-à-vis d'un compte donné (Dépôt vs Retrait vs OPEX)
  const knownAccountNames = useMemo(() => Object.keys(store.bankBalances), [store.bankBalances]);

  const classifyOperationForAccount = (
    op: LedgerEntry,
    accountName: string
  ): { side: 'DEPOT' | 'RETRAIT'; isOpex: boolean; contact: string; motif: string } | null => {
    const titleLower = op.title.toLowerCase();
    const subLower = op.subtitle.toLowerCase();
    const isOpex = titleLower.startsWith('dépense');
    const contact =
      op.depositor ||
      op.beneficiary ||
      op.clientTransferDetails?.clientName ||
      op.title.replace(/^(Dépôt|Retrait|Virement client|Dépense OPEX|Dépense)\s*·\s*/i, '').trim() ||
      '—';
    const motif = op.notes || op.clientTransferDetails?.reason || op.subtitle;

    // 1. Versement bancaire Caisse -> Banque
    if (op.isTransfer && op.isDeposit && op.depositDetails) {
      const fromAcc = op.depositDetails.fromAccount || cashAccountName;
      const toAcc = op.depositDetails.targetBank;
      if (accountName === fromAcc) return { side: 'RETRAIT', isOpex: false, contact: toAcc, motif: op.depositDetails.note || 'Versement banque' };
      if (accountName === toAcc) return { side: 'DEPOT', isOpex: false, contact: fromAcc, motif: op.depositDetails.note || 'Versement reçu' };
      return null;
    }

    // 2. Appro interne (from -> to)
    if (op.isTransfer && op.subtitle.includes('→')) {
      const [rawFrom, rawTo] = op.subtitle.split('→').map((s) => s.trim());
      if (accountName === rawFrom) return { side: 'RETRAIT', isOpex: false, contact: rawTo, motif: op.title };
      if (accountName === rawTo) return { side: 'DEPOT', isOpex: false, contact: rawFrom, motif: op.title };
      return null;
    }

    // 3. Virement client
    if (op.isClientTransfer) {
      const fromAcc = op.clientTransferDetails?.fromAccount || op.account || '';
      if (accountName === fromAcc) return { side: 'RETRAIT', isOpex: false, contact, motif };
      return null;
    }

    // 4. Opération explicitement rattachée à un compte
    let opAccount = op.account;
    if (!opAccount) {
      opAccount = knownAccountNames.find((k) => subLower.includes(k.toLowerCase())) || cashAccountName;
    }
    if (opAccount !== accountName) return null;

    return {
      side: op.isIncome ? 'DEPOT' : 'RETRAIT',
      isOpex,
      contact,
      motif,
    };
  };

  const resolveOpAccount = (op: LedgerEntry): string => {
    if (op.isTransfer && op.isDeposit && op.depositDetails) {
      return op.depositDetails.fromAccount || cashAccountName;
    }
    if (op.isClientTransfer) {
      return op.clientTransferDetails?.fromAccount || op.account || cashAccountName;
    }
    if (op.account) return op.account;
    return knownAccountNames.find((k) => op.subtitle.toLowerCase().includes(k.toLowerCase())) || cashAccountName;
  };

  const classifyOperationForAnyAccount = (
    op: LedgerEntry
  ): { side: 'DEPOT' | 'RETRAIT'; isOpex: boolean; contact: string; motif: string; account: string } => {
    const titleLower = op.title.toLowerCase();
    const isOpex = titleLower.startsWith('dépense');
    const contact =
      op.depositor ||
      op.beneficiary ||
      op.clientTransferDetails?.clientName ||
      op.title.replace(/^(Dépôt|Retrait|Virement client|Dépense OPEX|Dépense)\s*·\s*/i, '').trim() ||
      '—';
    const motif = op.notes || op.clientTransferDetails?.reason || op.subtitle;
    const account = resolveOpAccount(op);

    if (op.isTransfer && op.isDeposit && op.depositDetails) {
      return {
        side: 'RETRAIT',
        isOpex: false,
        contact: op.depositDetails.targetBank,
        motif: op.depositDetails.note || 'Versement banque',
        account: op.depositDetails.fromAccount || cashAccountName,
      };
    }

    if (op.isTransfer && op.subtitle.includes('→')) {
      const [rawFrom] = op.subtitle.split('→').map((s) => s.trim());
      return {
        side: 'RETRAIT',
        isOpex: false,
        contact: op.subtitle,
        motif: op.title,
        account: rawFrom || account,
      };
    }

    if (op.isClientTransfer) {
      return {
        side: 'RETRAIT',
        isOpex: false,
        contact,
        motif,
        account,
      };
    }

    return {
      side: op.isIncome ? 'DEPOT' : 'RETRAIT',
      isOpex,
      contact,
      motif,
      account,
    };
  };

  const doesOperationMatchContact = (op: LedgerEntry): boolean => {
    if (!contactSearchContext.hasQuery) return true;
    const { matchesValue } = contactSearchContext;
    return (
      matchesValue(op.depositor) ||
      matchesValue(op.beneficiary) ||
      matchesValue(op.clientTransferDetails?.clientName) ||
      matchesValue(op.title) ||
      matchesValue(op.subtitle) ||
      matchesValue(op.notes) ||
      matchesValue(op.reference)
    );
  };

  // Données filtrées par contact (Achats d'or, Devises, Ventes, Prêts)
  const contactCrossModuleData = useMemo(() => {
    if (!contactSearchContext.hasQuery) {
      return {
        purchases: [] as typeof store.purchases,
        currencyMovements: [] as typeof store.currencyStockMovements,
        sales: [] as typeof store.saleRecords,
        loans: [] as typeof store.loans,
        goldTotalWeightGrams: 0,
        goldTotalAmountXaf: 0,
        goldPaidXaf: 0,
        goldRemainingXaf: 0,
        currencyTotalXaf: 0,
        currencyWeOweXaf: 0,
        currencyOwedToUsXaf: 0,
      };
    }

    const { matchesValue } = contactSearchContext;
    const matchedPurchases = store.purchases.filter(
      (p) => matchesValue(p.supplier) || matchesValue(p.reference) || matchesValue(p.description)
    );
    const matchedCurrency = [
      ...store.currencyStockMovements,
      ...store.goldCurrencyMovements.filter(
        (m) => m.type === 'Achat devise d’or' || m.type === 'Vente devise d’or'
      ),
    ].filter((m) => matchesValue(m.contact) || matchesValue(m.label));
    const matchedSales = store.saleRecords.filter(
      (s) => matchesValue(s.clientName) || matchesValue(s.clientPhone) || matchesValue(s.clientReference)
    );
    const matchedLoans = store.loans.filter(
      (l) => matchesValue(l.partnerName) || (l.partnerId !== undefined && matchesValue(String(l.partnerId)))
    );

    const activePurchases = matchedPurchases.filter((p) => !p.cancelledAt);
    const goldTotalWeightGrams = activePurchases.reduce(
      (sum, p) => sum + (p.netWeightGrams ?? p.grossWeightGrams ?? 0),
      0
    );
    const goldTotalAmountXaf = activePurchases.reduce((sum, p) => sum + p.amount, 0);
    const goldPaidXaf = activePurchases.reduce(
      (sum, p) => sum + (p.payments || []).reduce((ps, pay) => ps + pay.amount, 0),
      0
    );
    const goldRemainingXaf = Math.max(0, goldTotalAmountXaf - goldPaidXaf);
    const currencyTotalXaf = matchedCurrency.reduce((sum, m) => sum + (m.totalXaf || 0), 0);
    const currencyWeOweXaf = matchedCurrency.reduce((sum, m) => {
      const isBuy = m.type.toLowerCase().startsWith('achat');
      const rem = m.creditStatus === 'settled' ? 0 : m.remainingXaf ?? 0;
      return isBuy && rem > 0 ? sum + rem : sum;
    }, 0);
    const currencyOwedToUsXaf = matchedCurrency.reduce((sum, m) => {
      const isSell = m.type.toLowerCase().startsWith('vente');
      const rem = m.creditStatus === 'settled' ? 0 : m.remainingXaf ?? 0;
      return isSell && rem > 0 ? sum + rem : sum;
    }, 0);

    return {
      purchases: matchedPurchases,
      currencyMovements: matchedCurrency,
      sales: matchedSales,
      loans: matchedLoans,
      goldTotalWeightGrams,
      goldTotalAmountXaf,
      goldPaidXaf,
      goldRemainingXaf,
      currencyTotalXaf,
      currencyWeOweXaf,
      currencyOwedToUsXaf,
    };
  }, [
    contactSearchContext,
    store.purchases,
    store.currencyStockMovements,
    store.goldCurrencyMovements,
    store.saleRecords,
    store.loans,
  ]);

  interface ApercuLine {
    id: string;
    op?: LedgerEntry;
    contact: string;
    motif: string;
    date: string;
    account: string;
    amount: number;
    isOpex?: boolean;
  }

  // Données de l'Aperçu du compte (T-account Dépôt | Retrait)
  const apercuLedger = useMemo(() => {
    const hasContactFilter = contactSearchContext.hasQuery && apercuFilterByContact;
    const deposits: ApercuLine[] = [];
    const withdrawals: ApercuLine[] = [];

    if (hasContactFilter) {
      const matchedPurchaseOpIds = new Set(
        contactCrossModuleData.purchases
          .filter((p) => p.id.startsWith('purch-'))
          .map((p) => `op-${p.id.slice('purch-'.length)}`)
      );

      for (const op of store.operations) {
        if (
          matchedPurchaseOpIds.has(op.id) ||
          contactCrossModuleData.purchases.some((p) => op.id.startsWith(`op-purchpay-${p.id}-`))
        ) {
          continue;
        }
        if (!doesOperationMatchContact(op)) continue;

        const classified = contactAllAccounts
          ? classifyOperationForAnyAccount(op)
          : classifyOperationForAccount(op, caisseSourceAccount);
        if (!classified) continue;

        const accountLabel =
          'account' in classified && typeof classified.account === 'string'
            ? classified.account
            : caisseSourceAccount;

        if (classified.side === 'DEPOT') {
          deposits.push({
            id: op.id,
            op,
            contact: classified.contact,
            motif: classified.motif,
            date: op.date,
            account: accountLabel,
            amount: op.amount,
          });
        } else {
          const settledPurchaseAmt = op.settledPurchaseAmountXaf ? Math.min(op.amount, op.settledPurchaseAmountXaf) : 0;
          const remainingWithdrawalAmt = Math.max(0, op.amount - settledPurchaseAmt);
          if (remainingWithdrawalAmt > 0) {
            withdrawals.push({
              id: op.id,
              op,
              contact: classified.contact,
              motif: classified.motif,
              date: op.date,
              account: accountLabel,
              amount: remainingWithdrawalAmt,
              isOpex: classified.isOpex,
            });
          }
        }
      }

      // Inclure les règlements réels des achats d'or de ce fournisseur (hors imputations internes déjà comptées via op-comp)
      for (const purchase of contactCrossModuleData.purchases) {
        if (purchase.cancelledAt) continue;
        (purchase.payments || []).forEach((pay, idx) => {
          if (pay.method?.startsWith('Imputation')) return;
          const payAcc = pay.account || cashAccountName;
          if (!contactAllAccounts && payAcc !== caisseSourceAccount) return;
          withdrawals.push({
            id: `purchpay-${purchase.id}-${idx}`,
            contact: `Achat or · ${purchase.reference}`,
            motif: `${pay.method} · ${purchase.goldCategory}${purchase.netWeightGrams ? ` · ${formatNumber(purchase.netWeightGrams, 2)}g` : ''}${purchase.karat ? ` ${purchase.karat}` : ''}`,
            date: formatDate(pay.paidAt),
            account: payAcc,
            amount: pay.amount,
            isOpex: false,
          });
        });
      }
    } else {
      for (const op of store.operations) {
        if (op.isCompensation) continue;
        const classified = classifyOperationForAccount(op, caisseSourceAccount);
        if (!classified) continue;
        if (classified.side === 'DEPOT') {
          deposits.push({
            id: op.id,
            op,
            contact: classified.contact,
            motif: classified.motif,
            date: op.date,
            account: caisseSourceAccount,
            amount: op.amount,
          });
        } else {
          withdrawals.push({
            id: op.id,
            op,
            contact: classified.contact,
            motif: classified.motif,
            date: op.date,
            account: caisseSourceAccount,
            amount: op.amount,
            isOpex: classified.isOpex,
          });
        }
      }
    }

    const totalDepot = deposits.reduce((sum, item) => sum + item.amount, 0);
    const totalRetrait = withdrawals.reduce((sum, item) => sum + item.amount, 0);
    const totalOpex = withdrawals
      .filter((item) => item.isOpex)
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      hasContactFilter,
      deposits,
      withdrawals,
      totalDepot,
      totalRetrait,
      totalOpex,
      netBalance: totalDepot - totalRetrait,
    };
  }, [
    store.operations,
    caisseSourceAccount,
    contactSearchContext,
    apercuFilterByContact,
    contactAllAccounts,
    contactCrossModuleData.purchases,
    knownAccountNames,
    cashAccountName,
  ]);

  interface UnifiedHistoryItem {
    id: string;
    kind: 'DEPOT' | 'RETRAIT' | 'OPEX' | 'OR' | 'DEVISE' | 'PRET';
    side: 'DEPOT' | 'RETRAIT' | 'INFO';
    badge: string;
    title: string;
    subtitle: string;
    date: string;
    sortTime: number;
    amountXaf: number;
    account?: string;
    extraTag?: string;
    editableOp?: LedgerEntry;
  }

  // Historique unifié pour la colonne droite (synchronisé automatiquement dès qu'un contact est saisi)
  const searchedCaisseOperations = useMemo<UnifiedHistoryItem[]>(() => {
    const q = searchOpQuery.trim().toLowerCase();

    if (contactSearchContext.hasQuery) {
      const items: UnifiedHistoryItem[] = [];
      const matchedPurchaseOpIds = new Set(
        contactCrossModuleData.purchases
          .filter((p) => p.id.startsWith('purch-'))
          .map((p) => `op-${p.id.slice('purch-'.length)}`)
      );

      // 1. Dépôts, Retraits, Virements clients & Dépenses OPEX
      for (const op of store.operations) {
        if (
          matchedPurchaseOpIds.has(op.id) ||
          contactCrossModuleData.purchases.some((p) => op.id.startsWith(`op-purchpay-${p.id}-`))
        ) {
          continue;
        }
        // Éviter le doublon avec currencyStockMovements / goldCurrencyMovements si op-cur* / op-gcur*
        if (
          (op.id.startsWith('op-curbuy-') ||
            op.id.startsWith('op-cursell-') ||
            op.id.startsWith('op-curpay-') ||
            op.id.startsWith('op-gcurbuy-') ||
            op.id.startsWith('op-gcursell-') ||
            op.id.startsWith('op-gcurpay-')) &&
          contactCrossModuleData.currencyMovements.length > 0
        ) {
          continue;
        }
        if (!doesOperationMatchContact(op)) continue;

        const classified = contactAllAccounts
          ? classifyOperationForAnyAccount(op)
          : classifyOperationForAccount(op, caisseSourceAccount);
        if (!classified) continue;

        const accountLabel =
          'account' in classified && typeof classified.account === 'string'
            ? classified.account
            : caisseSourceAccount;
        const kind: UnifiedHistoryItem['kind'] = classified.isOpex
          ? 'OPEX'
          : classified.side === 'DEPOT'
          ? 'DEPOT'
          : 'RETRAIT';

        items.push({
          id: op.id,
          kind,
          side: classified.side,
          badge: classified.isOpex ? 'OPEX' : classified.side === 'DEPOT' ? 'Dépôt' : 'Retrait',
          title: op.title,
          subtitle: `${classified.motif}`,
          date: op.date,
          sortTime: parseLedgerDate(op.date, op.createdAt).getTime(),
          amountXaf: op.amount,
          account: accountLabel,
          editableOp: op,
        });
      }

      // 2. Achats d'or
      for (const p of contactCrossModuleData.purchases) {
        const paid = (p.payments || []).reduce((sum, pay) => sum + pay.amount, 0);
        const remaining = Math.max(0, p.amount - paid);
        const weight = p.netWeightGrams ?? p.grossWeightGrams ?? 0;
        const payAccount = p.payments?.[0]?.account;
        if (!contactAllAccounts && payAccount && payAccount !== caisseSourceAccount) continue;
        items.push({
          id: `hist-purch-${p.id}`,
          kind: 'OR',
          side: 'RETRAIT',
          badge: p.cancelledAt ? 'Or (Annulé)' : 'Achat Or',
          title: `${p.reference} · ${p.goldCategory}${weight > 0 ? ` · ${formatNumber(weight, 2)} g` : ''}${p.karat ? ` ${p.karat}` : ''}`,
          subtitle: `Réglé : ${formatMoney(paid)} F${remaining > 0 ? ` · Reste : ${formatMoney(remaining)} F` : ' · Soldé'}`,
          date: formatDate(p.purchasedAt),
          sortTime: new Date(p.purchasedAt).getTime() || 0,
          amountXaf: p.amount,
          account: payAccount,
          extraTag: p.cancelledAt ? 'Annulé' : remaining > 0 ? `Dû ${formatMoney(remaining)} F` : 'Soldé',
        });
      }

      // 3. Opérations de devises
      for (const m of contactCrossModuleData.currencyMovements) {
        const isInflowXaf = m.type.toLowerCase().includes('vente') || m.type.toLowerCase().includes('encaissement');
        const movAcc = m.account || cashAccountName;
        if (!contactAllAccounts && movAcc !== caisseSourceAccount) continue;
        const rem = m.creditStatus === 'settled' ? 0 : m.remainingXaf ?? 0;
        const paid = m.paidXaf ?? (m.totalXaf || 0);
        const creditNote =
          rem > 0
            ? ` · Payé ${formatMoney(paid)} F · Reste ${formatMoney(rem)} F${m.dueDate ? ` (Éch. ${formatDate(m.dueDate)})` : ''}`
            : m.isCredit
            ? ' · Crédit soldé'
            : '';
        items.push({
          id: `hist-cur-${m.id}`,
          kind: 'DEVISE',
          side: isInflowXaf ? 'DEPOT' : 'RETRAIT',
          badge: m.type,
          title: `${m.type} · ${m.amount >= 0 ? '+' : ''}${formatNumber(m.amount, 2)} ${m.currency}`,
          subtitle: `${m.rate ? `@ ${formatNumber(m.rate, 2)} FCFA · ` : ''}${m.label}${creditNote}`,
          date: formatDate(m.date),
          sortTime: new Date(m.date).getTime() || 0,
          amountXaf: m.totalXaf || 0,
          account: movAcc,
          extraTag:
            rem > 0
              ? `Dû ${formatMoney(rem)} F`
              : m.isCredit
              ? 'Soldé'
              : undefined,
        });
      }

      // 4. Ventes d'or associées au contact
      for (const s of contactCrossModuleData.sales) {
        const saleRemXaf =
          s.balanceRemainingUsd > 0.01
            ? s.balanceRemainingXaf ?? Math.round(s.balanceRemainingUsd * (s.usdToXafRate ?? store.purchaseFormulaConfig.officialUsdRate ?? 606.85))
            : 0;
        items.push({
          id: `hist-sale-${s.id}`,
          kind: 'OR',
          side: 'DEPOT',
          badge: 'Vente Or',
          title: `${s.reference} · ${formatNumber(s.totalPureOunces, 3)} oz (${formatNumber(s.totalPureWeight24kGrams, 2)} g)`,
          subtitle: `Total $${formatNumber(s.grossRevenueUsd, 2)} · Encaissé ${formatMoney(s.totalWithdrawXaf)} F${s.dueDate && saleRemXaf > 0 ? ` · Éch. ${formatDate(s.dueDate)}` : ''}`,
          date: s.date,
          sortTime: parseLedgerDate(s.date, s.createdAt).getTime(),
          amountXaf: s.grossRevenueXaf || s.totalWithdrawXaf || 0,
          extraTag:
            saleRemXaf > 0
              ? `Dû ${formatMoney(saleRemXaf)} F`
              : s.paymentMode === 'credit' || s.paymentMode === 'partial'
              ? 'Soldé'
              : undefined,
        });
      }

      // 5. Prêts / Avances
      for (const l of contactCrossModuleData.loans) {
        const repaid = (l.repayments || []).reduce((sum, r) => sum + r.amountXaf, 0);
        const remaining = Math.max(0, l.principalXaf - repaid);
        items.push({
          id: `hist-loan-${l.id}`,
          kind: 'PRET',
          side: l.direction === 'companyLends' ? 'RETRAIT' : 'DEPOT',
          badge: l.direction === 'companyLends' ? 'Prêt accordé' : 'Emprunt / Avance',
          title: `${l.reference} · ${l.partnerName}`,
          subtitle: `${l.note} · Remboursé ${formatMoney(repaid)} F · Reste ${formatMoney(remaining)} F`,
          date: formatDate(l.createdAt),
          sortTime: new Date(l.createdAt).getTime() || 0,
          amountXaf: l.principalXaf,
        });
      }

      items.sort((a, b) => b.sortTime - a.sortTime);

      return items.filter((item) => {
        if (historyTypeFilter === 'DEPOT' && item.side !== 'DEPOT') return false;
        if (historyTypeFilter === 'RETRAIT' && item.side !== 'RETRAIT') return false;
        if (historyTypeFilter === 'OPEX' && item.kind !== 'OPEX') return false;
        if (historyTypeFilter === 'OR' && item.kind !== 'OR') return false;
        if (historyTypeFilter === 'DEVISE' && item.kind !== 'DEVISE') return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.date.toLowerCase().includes(q) ||
          item.badge.toLowerCase().includes(q) ||
          String(item.amountXaf).includes(q) ||
          (item.account?.toLowerCase().includes(q) ?? false)
        );
      });
    }

    // Mode global (aucun contact sélectionné)
    return store.operations
      .map((op): UnifiedHistoryItem | null => {
        if (op.isCompensation) return null;
        const classified =
          historyScope === 'account'
            ? classifyOperationForAccount(op, caisseSourceAccount)
            : {
                side: (op.isIncome ? 'DEPOT' : 'RETRAIT') as 'DEPOT' | 'RETRAIT',
                isOpex: op.title.toLowerCase().startsWith('dépense'),
                contact:
                  op.depositor ||
                  op.beneficiary ||
                  op.clientTransferDetails?.clientName ||
                  op.title,
                motif: op.notes || op.subtitle,
              };
        if (!classified) return null;
        const kind: UnifiedHistoryItem['kind'] = classified.isOpex
          ? 'OPEX'
          : classified.side === 'DEPOT'
          ? 'DEPOT'
          : 'RETRAIT';
        return {
          id: op.id,
          kind,
          side: classified.side,
          badge: classified.isOpex ? 'Dépense OPEX' : classified.side === 'DEPOT' ? 'Dépôt' : 'Retrait',
          title: op.title,
          subtitle: classified.motif,
          date: op.date,
          sortTime: parseLedgerDate(op.date, op.createdAt).getTime(),
          amountXaf: op.amount,
          account: historyScope === 'account' ? caisseSourceAccount : resolveOpAccount(op),
          editableOp: op,
        };
      })
      .filter((item): item is UnifiedHistoryItem => Boolean(item))
      .filter((item) => {
        if (historyTypeFilter === 'DEPOT' && item.side !== 'DEPOT') return false;
        if (historyTypeFilter === 'RETRAIT' && (item.side !== 'RETRAIT' || item.kind === 'OPEX')) return false;
        if (historyTypeFilter === 'OPEX' && item.kind !== 'OPEX') return false;
        if (historyTypeFilter === 'OR' && !item.title.toLowerCase().includes('or')) return false;
        if (historyTypeFilter === 'DEVISE' && !item.title.toLowerCase().includes('devise')) return false;
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q) ||
          item.date.toLowerCase().includes(q) ||
          String(item.amountXaf).includes(q) ||
          (item.editableOp?.notes?.toLowerCase().includes(q) ?? false) ||
          (item.editableOp?.reference?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [
    store.operations,
    searchOpQuery,
    historyScope,
    caisseSourceAccount,
    historyTypeFilter,
    knownAccountNames,
    cashAccountName,
    contactSearchContext,
    contactAllAccounts,
    contactCrossModuleData,
  ]);

  // Execute Approvisionnement
  const handleAppro = (e: React.FormEvent) => {
    e.preventDefault();
    setApproSuccess(null);
    setApproError(null);
    const amount = parseFloat(approAmount.replace(',', '.') || '0');
    try {
      store.transferFunds({
        fromAccount: approFrom,
        toAccount: approTo,
        amount,
        label: approLabel.trim() || 'Appro Caisse',
      });
      setApproSuccess(`Approvisionnement de ${formatMoney(amount)} FCFA effectué avec succès.`);
      setApproAmount('');
      setApproLabel('');
    } catch (err: unknown) {
      setApproError(err instanceof Error ? err.message : String(err));
    }
  };

  // Execute Virement Client
  const handleClientTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setClientTransferSuccess(null);
    setClientTransferError(null);

    const selectedContactObj = !isNewClient
      ? store.contacts.find((c) => c.reference === selectedContactRef)
      : undefined;
    const clientName = (isNewClient ? customClientName : (selectedContactObj?.name || customClientName)).trim();
    if (!clientName) {
      setClientTransferError('Veuillez sélectionner ou saisir le nom du client bénéficiaire.');
      return;
    }

    const amount = parseFloat(clientTransferAmount.replace(',', '.') || '0');
    if (amount <= 0 || !Number.isFinite(amount)) {
      setClientTransferError('Le montant du virement doit être supérieur à zéro.');
      return;
    }

    const feeAmount = clientTransferFee.trim() ? parseFloat(clientTransferFee.replace(',', '.') || '0') : 0;

    try {
      const newTransfer = store.transferToClient({
        fromAccount: clientTransferFrom,
        clientName,
        contactReference: selectedContactObj?.reference,
        clientBank: clientBank.trim(),
        clientAccountNumber: clientAccountNumber.trim(),
        clientBankAgency: clientBankAgency.trim(),
        clientAccountHolder: clientAccountHolder.trim(),
        clientBankReference: clientBankReference.trim(),
        amount,
        feeAmount,
        reason: clientTransferReason.trim() || 'Règlement virement client',
        targetPurchaseId: clientTransferPurchaseId !== 'NONE' ? clientTransferPurchaseId : undefined,
      });

      const settledMsg =
        newTransfer.settledPurchaseReferences && newTransfer.settledPurchaseReferences.length > 0
          ? ` Achats d'or réglés directement : ${newTransfer.settledPurchaseReferences.join(', ')}.`
          : '';
      const successMsg = `Virement de ${formatMoney(amount)} FCFA en faveur de ${clientName} effectué avec succès depuis ${clientTransferFrom}.${settledMsg}`;
      setClientTransferSuccess(successMsg);

      setReceiptEntry(newTransfer);

      // Reset form fields
      setClientTransferAmount('');
      setClientTransferFee('');
      setClientTransferReason('');
      setClientTransferPurchaseId('NONE');
      setClientBankAgency('');
      setClientAccountHolder('');
      setClientBankReference('');
    } catch (err: unknown) {
      setClientTransferError(err instanceof Error ? err.message : String(err));
    }
  };

  const clientTransferContactPurchases = useMemo(() => {
    const selectedContactObj = !isNewClient
      ? store.contacts.find((c) => c.reference === selectedContactRef)
      : undefined;
    const targetName = (isNewClient ? customClientName : (selectedContactObj?.name || customClientName)).trim();
    if (!targetName) return [];
    const tokens = [targetName, selectedContactObj?.reference, selectedContactObj?.phone]
      .map((v) => (v || '').trim().toLowerCase())
      .filter((v) => v.length > 0);
    return store.purchases
      .filter((p) => {
        if (p.cancelledAt) return false;
        const paid = (p.payments || []).reduce((s, pay) => s + pay.amount, 0);
        if (p.amount - paid <= 0) return false;
        return [p.supplier, p.reference, p.description].some((val) => {
          if (!val) return false;
          const low = val.trim().toLowerCase();
          return tokens.some((t) => low.includes(t));
        });
      })
      .map((p) => {
        const paid = (p.payments || []).reduce((s, pay) => s + pay.amount, 0);
        return { purchase: p, remaining: Math.max(0, p.amount - paid) };
      });
  }, [isNewClient, selectedContactRef, customClientName, store.contacts, store.purchases]);

  const approHistory = store.operations.filter((op) => op.isTransfer && !op.isDeposit);
  const clientTransfersHistory = store.operations.filter((op) => op.isClientTransfer);
  const bankDepositsHistory = store.operations.filter(
    (op) => op.isDeposit && (op.isTransfer || op.depositDetails || op.title.toLowerCase().includes('versement caisse'))
  );
  const allDepositsHistory = store.operations.filter((op) => op.isDeposit);

  // Classification chronologique de tous les flux qui touchent la Caisse
  interface CaisseFlowItem {
    id: string;
    rawDate: Date;
    displayDate: string;
    direction: 'IN' | 'OUT';
    category: string;
    title: string;
    subtitle: string;
    amount: number;
    rawOp?: LedgerEntry;
  }

  const allCaisseFlows = useMemo<CaisseFlowItem[]>(() => {
    const list: CaisseFlowItem[] = [];
    for (const op of store.operations) {
      if (op.isCompensation) continue;
      const parsedDate = parseLedgerDate(op.date, op.createdAt);
      const titleLower = op.title.toLowerCase();
      const subLower = op.subtitle.toLowerCase();

      // 1. Versement Caisse -> Banque (Sortie de caisse)
      if (
        op.isDeposit &&
        (op.isTransfer || op.depositDetails || titleLower.includes('versement caisse') || subLower.includes('vers '))
      ) {
        list.push({
          id: op.id,
          rawDate: parsedDate,
          displayDate: op.date,
          direction: 'OUT',
          category: 'Versement en Banque',
          title: op.title,
          subtitle: op.subtitle,
          amount: op.amount,
          rawOp: op,
        });
        continue;
      }

      // 2. Vente or (versée directement en caisse = Entrée de caisse)
      if (
        (op.isDeposit && !op.isTransfer) ||
        titleLower.includes('vente') ||
        subLower.includes('versé en caisse')
      ) {
        list.push({
          id: op.id,
          rawDate: parsedDate,
          displayDate: op.date,
          direction: 'IN',
          category: 'Vente d’or (Recette)',
          title: op.title,
          subtitle: op.subtitle,
          amount: op.amount,
          rawOp: op,
        });
        continue;
      }

      // 3. Approvisionnements
      if (op.isTransfer) {
        if (subLower.includes('vers caisse') || subLower.endsWith('caisse (espèces)')) {
          list.push({
            id: op.id,
            rawDate: parsedDate,
            displayDate: op.date,
            direction: 'IN',
            category: 'Appro Caisse (Entrant)',
            title: op.title,
            subtitle: op.subtitle,
            amount: op.amount,
            rawOp: op,
          });
          continue;
        }
        if (subLower.includes('caisse vers') || subLower.startsWith('caisse')) {
          list.push({
            id: op.id,
            rawDate: parsedDate,
            displayDate: op.date,
            direction: 'OUT',
            category: 'Appro vers Banque (Sortant)',
            title: op.title,
            subtitle: op.subtitle,
            amount: op.amount,
            rawOp: op,
          });
          continue;
        }
      }

      // 4. Virement Client décaissé depuis la caisse
      if (op.isClientTransfer) {
        if (
          op.clientTransferDetails?.fromAccount?.toLowerCase().includes('caisse') ||
          subLower.includes('caisse')
        ) {
          list.push({
            id: op.id,
            rawDate: parsedDate,
            displayDate: op.date,
            direction: 'OUT',
            category: 'Virement Client (Caisse)',
            title: op.title,
            subtitle: op.subtitle,
            amount: op.amount,
            rawOp: op,
          });
          continue;
        }
      }

      // 5. Achat d'or payé en espèces (Sortie de caisse)
      if (titleLower.includes('achat')) {
        list.push({
          id: op.id,
          rawDate: parsedDate,
          displayDate: op.date,
          direction: 'OUT',
          category: 'Achat d’or (Espèces)',
          title: op.title,
          subtitle: op.subtitle,
          amount: op.amount,
          rawOp: op,
        });
        continue;
      }

      // 6. Dépense courante de caisse
      if (!op.isIncome && !op.isTransfer && !op.isClientTransfer) {
        list.push({
          id: op.id,
          rawDate: parsedDate,
          displayDate: op.date,
          direction: 'OUT',
          category: 'Dépense d’exploitation',
          title: op.title,
          subtitle: op.subtitle,
          amount: op.amount,
          rawOp: op,
        });
        continue;
      }

      // 7. Autre encaissement
      if (op.isIncome) {
        list.push({
          id: op.id,
          rawDate: parsedDate,
          displayDate: op.date,
          direction: 'IN',
          category: 'Autre Encaissement',
          title: op.title,
          subtitle: op.subtitle,
          amount: op.amount,
          rawOp: op,
        });
        continue;
      }
    }
    return list;
  }, [store.operations]);

  const filteredCaisseFlows = useMemo(() => {
    return allCaisseFlows.filter((flow) => isDateInPeriod(flow.rawDate, periodFilter));
  }, [allCaisseFlows, periodFilter]);

  const periodInflows = useMemo(
    () => filteredCaisseFlows.filter((f) => f.direction === 'IN'),
    [filteredCaisseFlows]
  );
  const periodOutflows = useMemo(
    () => filteredCaisseFlows.filter((f) => f.direction === 'OUT'),
    [filteredCaisseFlows]
  );

  const totalInflowsXaf = useMemo(
    () => periodInflows.reduce((sum, f) => sum + f.amount, 0),
    [periodInflows]
  );
  const totalOutflowsXaf = useMemo(
    () => periodOutflows.reduce((sum, f) => sum + f.amount, 0),
    [periodOutflows]
  );
  const netFlowXaf = totalInflowsXaf - totalOutflowsXaf;

  const inflowsByCategory = useMemo(() => {
    return periodInflows.reduce<Record<string, number>>((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + f.amount;
      return acc;
    }, {});
  }, [periodInflows]);

  const outflowsByCategory = useMemo(() => {
    return periodOutflows.reduce<Record<string, number>>((acc, f) => {
      acc[f.category] = (acc[f.category] || 0) + f.amount;
      return acc;
    }, {});
  }, [periodOutflows]);

  const displayedFlows = useMemo(() => {
    return filteredCaisseFlows.filter((f) => {
      if (operationsTypeFilter === 'IN') return f.direction === 'IN';
      if (operationsTypeFilter === 'OUT') return f.direction === 'OUT';
      return true;
    });
  }, [filteredCaisseFlows, operationsTypeFilter]);

  const quickBankSuggestions = ['Ecobank', 'UBA', 'Coris Bank', 'Afriland First Bank', 'BOA', 'BGFIBank', 'Société Générale', 'Wave', 'Orange Money', 'MTN MoMo'];

  return (
    <div className="p-4 sm:p-7 max-w-7xl mx-auto space-y-6">
      {!isPurchaseFormOpen && (
        <>
          <PageHeading eyebrow="Trésorerie · Opérations" title="Caisse & Mouvements" />

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-[#E8D8BE] pb-2 overflow-x-auto">
            {canAchat && (
              <button
                onClick={() => setActiveTab('achat')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'achat'
                    ? 'bg-[#192A24] text-white shadow-xs'
                    : 'text-[#7D8176] hover:bg-[#F6F0E5]'
                }`}
              >
                <Wallet size={16} />
                <span>Achat d&apos;or</span>
              </button>
            )}

            {/* Tab: Caisse (Alimentation, Retraits & Dépenses) */}
            {canCaisse && (
              <button
                onClick={() => setActiveTab('depot_retrait')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'depot_retrait'
                    ? 'bg-[#FFD27A] text-[#192A24] shadow-xs ring-2 ring-[#E7AD35]/50'
                    : 'text-[#9E731B] hover:bg-amber-100 bg-amber-50 border border-[#E7AD35]'
                }`}
              >
                <Banknote size={16} />
                <span>Caisse</span>
              </button>
            )}

            {/* Replaced 'Virements' by 'Appro' */}
            {canAppro && (
              <button
                onClick={() => setActiveTab('appro')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'appro'
                    ? 'bg-[#192A24] text-white shadow-xs'
                    : 'text-[#7D8176] hover:bg-[#F6F0E5]'
                }`}
              >
                <ArrowLeftRight size={16} />
                <span>Appro ({approHistory.length + clientTransfersHistory.length})</span>
              </button>
            )}

            {/* Tab 5: Versements (Caisse -> Banque) */}
            {canVersements && (
              <button
                onClick={() => setActiveTab('versements')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'versements'
                    ? 'bg-[#D39725] text-white shadow-xs'
                    : 'text-[#966308] hover:bg-amber-50'
                }`}
              >
                <ArrowDownLeft size={16} />
                <span>Versements (Caisse → Banque) ({bankDepositsHistory.length})</span>
              </button>
            )}

            {/* Tab 6: Entrées & Sorties par Période (Mois, Trimestre, Semestre, Annuel) */}
            {canFlux && (
              <button
                onClick={() => setActiveTab('flux_periodes')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'flux_periodes'
                    ? 'bg-[#192A24] text-white shadow-xs ring-2 ring-[#D39725]/50'
                    : 'text-[#192A24] hover:bg-amber-50 bg-amber-50/60 border border-amber-200'
                }`}
              >
                <BarChart3 size={16} className="text-[#D39725]" />
                <span>Entrées & Sorties (Mois · Trimestre · Année)</span>
              </button>
            )}
          </div>
        </>
      )}

      {allowedCashTabs.length === 0 && (
        <AppPanel className="text-center py-10 text-xs text-gray-500">
          Aucun service n&apos;est autorisé dans le module Opérations (Caisse & Achats) pour ce compte.
        </AppPanel>
      )}

      {/* Tab 1: Achats */}
      {activeTab === 'achat' && canAchat && (
        <PurchasesScreen
          onFormVisibilityChanged={setIsPurchaseFormOpen}
          canCreatePurchase={canNewPurchase}
          canViewPurchaseHistory={canPurchaseList}
        />
      )}

      {/* Tab: Caisse — Comptes Sources Clients & Fournisseurs (3 colonnes + Répertoire & Critères) */}
      {activeTab === 'depot_retrait' && canCaisse && (
        <div className="space-y-6">
          {/* En-tête de section Interface Caisse */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8D8BE] pb-4">
            <div>
              <h2 className="text-xl font-bold text-[#192A24] tracking-tight">
                Interface Caisse · Comptes Clients &amp; Fournisseurs
              </h2>
              <p className="text-xs text-[#7D8176]">
                Sélectionnez un client ou fournisseur comme Compte Source pour voir ce qu&apos;il possède chez nous, ce que nous lui devons ou ce qu&apos;il nous doit.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-[#7D8176]">Trésorerie ({caisseSourceAccount}) : </span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    (store.bankBalances[caisseSourceAccount] ?? 0) < 0 ? 'text-red-700' : 'text-[#192A24]'
                  }`}
                >
                  {formatMoney(store.bankBalances[caisseSourceAccount] ?? 0)} FCFA
                </span>
              </div>
              {caisseSourceAccount !== cashAccountName && (
                <div>
                  <span className="text-[#7D8176]">{cashAccountName} : </span>
                  <span className="font-mono tabular-nums font-semibold text-[#192A24]">
                    {formatMoney(currentCashBalance)} FCFA
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Barre de synthèse globale Clients & Fournisseurs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-[#E8D8BE] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#7D8176]">
                <span>Possèdent chez nous (Dépôts nets)</span>
                <TrendingUp size={14} className="text-emerald-600" />
              </div>
              <div className="text-base font-mono tabular-nums font-bold text-emerald-700">
                +{formatMoney(globalAccountTotals.totalHeldDepositsXaf)} FCFA
              </div>
              <div className="text-[11px] text-[#7D8176]">
                {globalAccountTotals.creditorCount} compte(s) créditeur(s) au global
              </div>
            </div>

            <div className="bg-white border border-[#E8D8BE] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#7D8176]">
                <span>On doit aux fournisseurs (Or &amp; Prêts)</span>
                <Scale size={14} className="text-[#D39725]" />
              </div>
              <div className="text-base font-mono tabular-nums font-bold text-[#AA6B0B]">
                {formatMoney(globalAccountTotals.totalWeOweXaf)} FCFA
              </div>
              <div className="text-[11px] text-[#7D8176]">
                Lots d&apos;or non soldés &amp; avances reçues
              </div>
            </div>

            <div className="bg-white border border-[#E8D8BE] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#7D8176]">
                <span>Clients nous doivent (Ventes &amp; Prêts)</span>
                <TrendingDown size={14} className="text-red-600" />
              </div>
              <div className="text-base font-mono tabular-nums font-bold text-red-700">
                {formatMoney(globalAccountTotals.totalOwedToUsXaf)} FCFA
              </div>
              <div className="text-[11px] text-[#7D8176]">
                {globalAccountTotals.debtorCount} compte(s) débiteur(s)
              </div>
            </div>

            <div className="bg-[#FAF8F3] border border-[#E8D8BE] rounded-2xl p-4 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-[#7D8176]">
                <span>Total Trésorerie (Caisse + Banques)</span>
                <Landmark size={14} className="text-[#192A24]" />
              </div>
              <div className="text-base font-mono tabular-nums font-bold text-[#192A24]">
                {formatMoney(store.totalTreasury)} FCFA
              </div>
              <div className="text-[11px] text-[#7D8176]">
                {allContactPositions.length} comptes clients/fournisseurs suivis
              </div>
            </div>
          </div>

          {/* Grille principale 3 colonnes */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* COLONNE 1 : Compte Source (Client / Fournisseur) + Compte de Trésorerie + Saisie */}
            <div className="xl:col-span-4 bg-white border border-[#E8D8BE] rounded-2xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#F1E8D8] pb-3">
                  <h3 className="text-sm font-bold text-[#192A24]">Compte Source &amp; Opération</h3>
                  <input
                    type="date"
                    value={caisseDate}
                    onChange={(e) => setCaisseDate(e.target.value)}
                    aria-label="Date de l'opération"
                    className="px-2.5 py-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-xs font-mono tabular-nums text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                  />
                </div>

                {caisseFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                      caisseFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {caisseFeedback.type === 'success' ? (
                      <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-600" />
                    ) : (
                      <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                    )}
                    <span>{caisseFeedback.message}</span>
                  </div>
                )}

                {/* 1. Critères & Compte Source (Client / Fournisseur) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[#192A24]">
                      Compte Source (Client / Fournisseur)
                    </label>
                    {caisseContact && (
                      <button
                        type="button"
                        onClick={() => setCaisseContact('')}
                        className="text-[11px] font-semibold text-[#7D8176] hover:text-[#192A24] cursor-pointer"
                      >
                        Tout afficher
                      </button>
                    )}
                  </div>

                  {/* Critères rapides de filtrage du Compte Source */}
                  <div className="grid grid-cols-4 gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[10px]">
                    {(
                      [
                        ['ALL', 'Tous'],
                        ['SUPPLIER', 'Fournisseurs'],
                        ['CLIENT', 'Clients'],
                        ['DEVISE', 'Devises'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSourceRoleFilter(val)}
                        className={`py-1 px-1 rounded-md font-bold cursor-pointer transition-colors truncate ${
                          sourceRoleFilter === val
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-4 gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[10px]">
                    {(
                      [
                        ['ALL', 'Toutes sit.'],
                        ['CREDITOR', 'Possède / Dû'],
                        ['DEBTOR', 'Nous doit'],
                        ['SETTLED', 'Soldé'],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSourceStatusFilter(val)}
                        className={`py-1 px-1 rounded-md font-bold cursor-pointer transition-colors truncate ${
                          sourceStatusFilter === val
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Sélecteur Compte Source Client/Fournisseur avec solde */}
                  <select
                    value={
                      filteredSourceContacts.some((p) => p.name === caisseContact)
                        ? caisseContact
                        : ''
                    }
                    onChange={(e) => setCaisseContact(e.target.value)}
                    aria-label="Sélectionner le Compte Source client ou fournisseur"
                    className="w-full px-3.5 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                  >
                    <option value="">
                      — Choisir un Compte Source ({filteredSourceContacts.length}) —
                    </option>
                    {filteredSourceContacts.map((pos) => {
                      const statusTag =
                        pos.netPositionXaf > 0
                          ? `Possède / On doit +${formatMoney(pos.netPositionXaf)} F`
                          : pos.netPositionXaf < 0
                          ? `Nous doit -${formatMoney(Math.abs(pos.netPositionXaf))} F`
                          : 'Soldé (0 F)';
                      return (
                        <option key={pos.key} value={pos.name}>
                          {pos.name} · {statusTag}
                        </option>
                      );
                    })}
                  </select>

                  {/* Recherche directe par nom, téléphone ou référence */}
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-[#7D8176]" />
                    <input
                      type="text"
                      list="caisse-contacts-datalist"
                      value={caisseContact}
                      onChange={(e) => setCaisseContact(e.target.value)}
                      placeholder="Ou saisir nom, téléphone, réf. CLI-..."
                      className="w-full pl-8 pr-3.5 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                    />
                    <datalist id="caisse-contacts-datalist">
                      {allContactPositions.map((pos) => (
                        <option key={pos.key} value={pos.name}>
                          {pos.phone ? `${pos.phone} · ` : ''}
                          {pos.roles.join(' / ')}
                        </option>
                      ))}
                    </datalist>
                  </div>

                  {/* Carte complète Situation du Compte Source */}
                  {contactSearchContext.hasQuery && (
                    <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#192A24] truncate flex items-center gap-1.5">
                            <User size={13} className="text-[#D39725] shrink-0" />
                            <span>
                              {selectedContactPosition?.name ||
                                contactSearchContext.matchedContact?.name ||
                                contactSearchContext.raw}
                            </span>
                          </div>
                          {selectedContactPosition?.phone && (
                            <div className="text-[11px] text-[#7D8176] flex items-center gap-1 mt-0.5 font-mono">
                              <Phone size={10} />
                              <span>{selectedContactPosition.phone}</span>
                              {selectedContactPosition.city && (
                                <span>· {selectedContactPosition.city}</span>
                              )}
                            </div>
                          )}
                          {selectedContactPosition?.roles && selectedContactPosition.roles.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedContactPosition.roles.slice(0, 2).map((r, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 rounded bg-white border border-[#E8D8BE] text-[10px] font-semibold text-[#7D8176]"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        {selectedContactPosition?.reference && (
                          <span className="px-1.5 py-0.5 rounded bg-white border border-[#E8D8BE] text-[10px] font-mono text-[#7D8176] shrink-0">
                            {selectedContactPosition.reference}
                          </span>
                        )}
                      </div>

                      {selectedContactPosition && (
                        <>
                          {/* Statut Net Principal */}
                          <div
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                              selectedContactPosition.netPositionXaf > 0
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                : selectedContactPosition.netPositionXaf < 0
                                ? 'bg-red-50 border-red-200 text-red-900'
                                : 'bg-white border-[#E8D8BE] text-[#192A24]'
                            }`}
                          >
                            <span className="font-bold">
                              {selectedContactPosition.netPositionXaf > 0
                                ? selectedContactPosition.cashDepositNetXaf > 0 &&
                                  selectedContactPosition.goldRemainingXaf +
                                    selectedContactPosition.currencyWeOweXaf +
                                    selectedContactPosition.loansWeOweXaf ===
                                    0
                                  ? 'Possède chez nous'
                                  : selectedContactPosition.cashDepositNetXaf <= 0 &&
                                    selectedContactPosition.goldRemainingXaf +
                                      selectedContactPosition.currencyWeOweXaf +
                                      selectedContactPosition.loansWeOweXaf >
                                      0
                                  ? 'On doit au fournisseur'
                                  : 'Possède / On lui doit'
                                : selectedContactPosition.netPositionXaf < 0
                                ? 'Le contact nous doit'
                                : 'Compte soldé'}
                            </span>
                            <span className="font-mono tabular-nums font-bold">
                              {selectedContactPosition.netPositionXaf > 0
                                ? `+${formatMoney(selectedContactPosition.netPositionXaf)}`
                                : selectedContactPosition.netPositionXaf < 0
                                ? `-${formatMoney(Math.abs(selectedContactPosition.netPositionXaf))}`
                                : '0'}{' '}
                              FCFA
                            </span>
                          </div>

                          {/* Détail des critères */}
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                              <div className="text-[10px] text-[#7D8176]">Dépôts confiés (+)</div>
                              <div className="font-mono tabular-nums font-bold text-emerald-700">
                                +{formatMoney(selectedContactPosition.cashDepositsXaf)} F
                              </div>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                              <div className="text-[10px] text-[#7D8176]">Retraits / Virements (-)</div>
                              <div className="font-mono tabular-nums font-bold text-red-700">
                                -{formatMoney(selectedContactPosition.cashWithdrawalsXaf)} F
                              </div>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                              <div className="text-[10px] text-[#7D8176]">
                                Achats Or ({selectedContactPosition.goldPurchaseCount} lot ·{' '}
                                {formatNumber(selectedContactPosition.goldTotalWeightGrams, 1)}g)
                              </div>
                              <div className="font-mono tabular-nums font-bold text-[#192A24]">
                                {selectedContactPosition.goldRemainingXaf > 0
                                  ? `Dû ${formatMoney(selectedContactPosition.goldRemainingXaf)} F`
                                  : `${formatMoney(selectedContactPosition.goldTotalAmountXaf)} F (Soldé)`}
                              </div>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                              <div className="text-[10px] text-[#7D8176]">
                                Ventes Or ({selectedContactPosition.saleCount} ·{' '}
                                {formatNumber(selectedContactPosition.salesPureGrams, 1)}g)
                              </div>
                              <div className="font-mono tabular-nums font-bold text-[#192A24]">
                                {selectedContactPosition.salesRemainingXaf > 0
                                  ? `Dû ${formatMoney(selectedContactPosition.salesRemainingXaf)} F`
                                  : `${formatMoney(selectedContactPosition.salesTotalXaf)} F`}
                              </div>
                            </div>
                          </div>

                          {(selectedContactPosition.currencyOpsCount > 0 ||
                            selectedContactPosition.currencyWeOweXaf > 0 ||
                            selectedContactPosition.currencyOwedToUsXaf > 0 ||
                            selectedContactPosition.loansWeOweXaf > 0 ||
                            selectedContactPosition.loansOwedToUsXaf > 0) && (
                            <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                              {selectedContactPosition.currencyOpsCount > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-900">
                                  Devises : {selectedContactPosition.currencyOpsCount} op(s) ·{' '}
                                  {formatMoney(selectedContactPosition.currencyTotalXaf)} F
                                </span>
                              )}
                              {selectedContactPosition.currencyWeOweXaf > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                                  Dû achat devise : +{formatMoney(selectedContactPosition.currencyWeOweXaf)} F
                                </span>
                              )}
                              {selectedContactPosition.currencyOwedToUsXaf > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-900">
                                  Créance vente devise : -{formatMoney(selectedContactPosition.currencyOwedToUsXaf)} F
                                </span>
                              )}
                              {selectedContactPosition.loansWeOweXaf > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                                  Emprunt dû : {formatMoney(selectedContactPosition.loansWeOweXaf)} F
                                </span>
                              )}
                              {selectedContactPosition.loansOwedToUsXaf > 0 && (
                                <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-900">
                                  Prêt à recouvrer : {formatMoney(selectedContactPosition.loansOwedToUsXaf)} F
                                </span>
                              )}
                            </div>
                          )}

                          {canDepotRetrait &&
                            (selectedContactPosition.netPositionXaf !== 0 ||
                              selectedContactOpenItems.payables.length > 0 ||
                              selectedContactOpenItems.receivables.length > 0 ||
                              selectedContactPosition.cashDepositNetXaf !== 0) && (
                              <div className="pt-1 flex items-center justify-between gap-2 border-t border-[#EFE6D5]">
                                <span className="text-[10px] text-[#7D8176]">
                                  Lié à la Caisse (Dépôt / Retrait)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSettleSourceModal(selectedContactPosition)}
                                  className="px-2.5 py-1 rounded-lg bg-[#D39725] hover:bg-[#B8801A] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                                >
                                  Régler solde
                                </button>
                              </div>
                            )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Lien Règlement direct depuis la barre Dépôt / Retrait */}
                  {!caisseOpexMode &&
                    selectedContactPosition &&
                    (selectedContactOpenItems.payables.length > 0 ||
                      selectedContactOpenItems.receivables.length > 0) && (
                      <div className="p-3 rounded-xl bg-amber-50/60 border border-[#E8D8BE] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-[#192A24]">
                            Affectation Règlement (Dépôt / Retrait)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const pickedPay = selectedContactOpenItems.payables.find(
                                (i) => i.key === caisseSettlementTarget
                              );
                              const pickedRec = selectedContactOpenItems.receivables.find(
                                (i) => i.key === caisseSettlementTarget
                              );
                              const amtToFill = pickedPay
                                ? pickedPay.remainingXaf
                                : pickedRec
                                ? pickedRec.remainingXaf
                                : selectedContactOpenItems.totalPayablesXaf > 0
                                ? selectedContactOpenItems.totalPayablesXaf
                                : selectedContactOpenItems.totalReceivablesXaf;
                              if (amtToFill > 0) {
                                setCaisseAmount(String(amtToFill));
                              }
                            }}
                            className="text-[10px] font-bold text-[#9E731B] hover:text-[#192A24] underline cursor-pointer"
                          >
                            Remplir le solde
                          </button>
                        </div>
                        <select
                          value={caisseSettlementTarget}
                          onChange={(e) => setCaisseSettlementTarget(e.target.value)}
                          aria-label="Affectation du dépôt ou retrait sur les dettes et créances"
                          className="w-full px-3 py-2 bg-white rounded-lg border border-[#E8D8BE] text-[11px] font-semibold text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                        >
                          <option value="AUTO">
                            Auto : imputer sur les soldes ouverts (FIFO)
                          </option>
                          {selectedContactOpenItems.receivables.length > 0 && (
                            <optgroup label="Créances à encaisser (via Dépôt)">
                              {selectedContactOpenItems.receivables.map((item) => (
                                <option key={item.key} value={item.key}>
                                  [Dépôt] {item.label} · {formatMoney(item.remainingXaf)} F
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {selectedContactOpenItems.payables.length > 0 && (
                            <optgroup label="Dettes à régler (Achats à crédit / partiels)">
                              {selectedContactOpenItems.payables.map((item) => (
                                <option key={item.key} value={item.key}>
                                  {item.targetType === 'gold_purchase' ? '[Achat Or] ' : '[Retrait] '}
                                  {item.label} · {formatMoney(item.remainingXaf)} F
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <option value="FREE">
                            Dépôt / Retrait libre (compte cash uniquement)
                          </option>
                        </select>
                        {selectedContactOpenItems.payables.some((i) => i.targetType === 'gold_purchase') && (
                          <div className="pt-1 flex flex-col gap-1.5 border-t border-[#E8D8BE]/70">
                            <div className="text-[10px] text-[#7D8176]">
                              Dépôt sur compte fournisseur : déduit de <strong>{caisseSourceAccount}</strong> et règle directement l&apos;achat dans <strong>Achats d&apos;or brut &amp; bijoux</strong>.
                            </div>
                            <button
                              type="button"
                              onClick={handleSettleGoldPurchaseByDeposit}
                              className="w-full py-2 px-3 rounded-lg bg-[#D39725] hover:bg-[#B8801A] text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Wallet size={13} />
                              <span>Régler achat Or (Dépôt compte fournisseur)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                </div>

                {/* 2. Compte de Trésorerie CAMS GOLD (où entre / sort l'argent) */}
                <div>
                  <label className="block text-xs font-semibold text-[#192A24] mb-1.5">
                    Compte de Trésorerie (Encaissement / Décaissement)
                  </label>
                  <select
                    value={caisseSourceAccount}
                    onChange={(e) => setCaisseSourceAccount(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                  >
                    {Object.entries(store.bankBalances).map(([accName, bal]) => (
                      <option key={accName} value={accName}>
                        {accName} ({formatMoney(bal)} FCFA)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Montant */}
                <div>
                  <label className="block text-xs font-semibold text-[#192A24] mb-1.5">
                    Montant (FCFA)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={caisseAmount}
                    onChange={(e) => setCaisseAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3.5 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] font-mono tabular-nums font-bold text-base text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                  />
                </div>

                {/* 4. Motif */}
                <div>
                  <label className="block text-xs font-semibold text-[#192A24] mb-1.5">
                    Motif
                  </label>
                  <input
                    type="text"
                    value={caisseMotif}
                    onChange={(e) => setCaisseMotif(e.target.value)}
                    placeholder={
                      caisseOpexMode
                        ? 'ex: Loyer bureau, transport, électricité...'
                        : 'ex: Dépôt fournisseur, avance or, règlement client...'
                    }
                    className="w-full px-3.5 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-medium text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                  />
                </div>

                {/* 5. Dépenses OPEX toggle + sélecteur de catégorie */}
                {canDepenses && (
                  <div className="space-y-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCaisseOpexMode((prev) => !prev)}
                      className={`w-full py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                        caisseOpexMode
                          ? 'bg-[#192A24] text-white border-[#192A24]'
                          : 'bg-[#FAF8F3] text-[#192A24] border-[#E8D8BE] hover:bg-[#F3EBDC]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <Receipt size={14} />
                        <span>Dépenses OPEX</span>
                      </span>
                      <span className="text-[11px] opacity-80">
                        {caisseOpexMode ? 'Actif' : 'Activer'}
                      </span>
                    </button>

                    {caisseOpexMode && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#7D8176] mb-1">
                          Catégorie de dépense OPEX
                        </label>
                        <select
                          value={caisseOpexCategory}
                          onChange={(e) => setCaisseOpexCategory(e.target.value)}
                          className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                        >
                          {EXPENSE_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 6. Barre d'action scindée : Dépôt | Retrait */}
              <div className="pt-2">
                <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-[#E8D8BE]">
                  <button
                    type="button"
                    disabled={!canDepotRetrait}
                    onClick={handleCaisseDepot}
                    className={`py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 border-r border-[#E8D8BE] transition-colors whitespace-nowrap ${
                      canDepotRetrait
                        ? 'bg-[#008B62] hover:bg-[#007452] text-white cursor-pointer'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <ArrowDownLeft size={15} />
                    <span>
                      {selectedContactPosition &&
                      caisseSettlementTarget !== 'FREE' &&
                      selectedContactOpenItems.payables.some(
                        (i) => i.key === caisseSettlementTarget
                      )
                        ? selectedContactOpenItems.payables.find(
                            (i) => i.key === caisseSettlementTarget
                          )?.targetType === 'gold_purchase'
                          ? 'Dépôt compte · Régler achat Or'
                          : 'Dépôt compte · Régler dette'
                        : selectedContactPosition &&
                          caisseSettlementTarget !== 'FREE' &&
                          (selectedContactOpenItems.receivables.some(
                            (i) => i.key === caisseSettlementTarget
                          ) ||
                            (caisseSettlementTarget === 'AUTO' &&
                              selectedContactOpenItems.receivables.length > 0))
                        ? 'Dépôt · Encaisser'
                        : 'Dépôt (+ Contact)'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={caisseOpexMode ? !canDepenses : !canDepotRetrait}
                    onClick={handleCaisseRetrait}
                    className={`py-3 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                      (caisseOpexMode ? canDepenses : canDepotRetrait)
                        ? caisseOpexMode
                          ? 'bg-[#192A24] hover:bg-[#253D34] text-white cursor-pointer'
                          : 'bg-[#DC2626] hover:bg-[#B91C1C] text-white cursor-pointer'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <ArrowUpRight size={15} />
                    <span>
                      {caisseOpexMode
                        ? 'Retrait OPEX'
                        : selectedContactPosition &&
                          caisseSettlementTarget !== 'FREE' &&
                          (selectedContactOpenItems.payables.some(
                            (i) => i.key === caisseSettlementTarget
                          ) ||
                            (caisseSettlementTarget === 'AUTO' &&
                              selectedContactOpenItems.payables.length > 0))
                        ? 'Retrait · Régler solde'
                        : 'Retrait (- Contact)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* COLONNE 2 : Situation & Compte en T du Compte Source */}
            <div className="xl:col-span-4 bg-white border border-[#E8D8BE] rounded-2xl flex flex-col overflow-hidden">
              <div className="p-4 border-b border-[#E8D8BE] bg-[#FFFDF9] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#192A24]">
                      {apercuLedger.hasContactFilter ? 'Caisse du Compte Source' : 'Aperçu Trésorerie'}
                    </h3>
                    <div className="text-[11px] text-[#7D8176] truncate">
                      {apercuLedger.hasContactFilter
                        ? `${contactAllAccounts ? 'Tous comptes' : caisseSourceAccount} · ${selectedContactPosition?.name || contactSearchContext.matchedContact?.name || caisseContact.trim()}`
                        : caisseSourceAccount}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-[#7D8176]">
                      {apercuLedger.hasContactFilter && selectedContactPosition
                        ? selectedContactPosition.netPositionXaf >= 0
                          ? 'Possède / On doit'
                          : 'Nous doit'
                        : apercuLedger.hasContactFilter
                        ? 'Net cash'
                        : 'Solde actuel'}
                    </div>
                    <div
                      className={`text-sm font-mono tabular-nums font-bold ${
                        (apercuLedger.hasContactFilter && selectedContactPosition
                          ? selectedContactPosition.netPositionXaf
                          : apercuLedger.hasContactFilter
                          ? apercuLedger.netBalance
                          : store.bankBalances[caisseSourceAccount] ?? 0) < 0
                          ? 'text-red-700'
                          : 'text-[#192A24]'
                      }`}
                    >
                      {apercuLedger.hasContactFilter &&
                      (selectedContactPosition
                        ? selectedContactPosition.netPositionXaf
                        : apercuLedger.netBalance) >= 0
                        ? '+'
                        : ''}
                      {formatMoney(
                        apercuLedger.hasContactFilter && selectedContactPosition
                          ? selectedContactPosition.netPositionXaf
                          : apercuLedger.hasContactFilter
                          ? apercuLedger.netBalance
                          : store.bankBalances[caisseSourceAccount] ?? 0
                      )}{' '}
                      F
                    </div>
                  </div>
                </div>

                {caisseContact.trim() && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[11px]">
                      <button
                        type="button"
                        onClick={() => setApercuFilterByContact(true)}
                        className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer truncate ${
                          apercuFilterByContact
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        Compte : {selectedContactPosition?.name || contactSearchContext.matchedContact?.name || caisseContact.trim()}
                      </button>
                      <button
                        type="button"
                        onClick={() => setApercuFilterByContact(false)}
                        className={`py-1 px-2.5 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          !apercuFilterByContact
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        Tout {caisseSourceAccount}
                      </button>
                    </div>

                    {apercuFilterByContact && (
                      <div className="flex items-center gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[11px]">
                        <button
                          type="button"
                          onClick={() => setContactAllAccounts(true)}
                          className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            contactAllAccounts
                              ? 'bg-white text-[#192A24] shadow-2xs'
                              : 'text-[#7D8176] hover:text-[#192A24]'
                          }`}
                        >
                          Tous comptes
                        </button>
                        <button
                          type="button"
                          onClick={() => setContactAllAccounts(false)}
                          className={`flex-1 py-1 px-2 rounded-md font-semibold transition-colors cursor-pointer truncate ${
                            !contactAllAccounts
                              ? 'bg-white text-[#192A24] shadow-2xs'
                              : 'text-[#7D8176] hover:text-[#192A24]'
                          }`}
                        >
                          {caisseSourceAccount} seul
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Tableau Compte en T : Dépôt (gauche) | Retrait (droite) */}
              <div className="grid grid-cols-2 border-b border-[#E8D8BE] bg-[#FAF8F3] text-xs font-bold text-[#192A24]">
                <div className="py-2.5 px-3 border-r border-[#E8D8BE] flex items-center justify-between">
                  <span>Dépôt (+)</span>
                  <span className="font-mono tabular-nums text-[11px] text-emerald-700">
                    {apercuLedger.deposits.length}
                  </span>
                </div>
                <div className="py-2.5 px-3 flex items-center justify-between">
                  <span>Retrait (-)</span>
                  <span className="font-mono tabular-nums text-[11px] text-red-700">
                    {apercuLedger.withdrawals.length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 flex-1 min-h-[280px] max-h-[380px] overflow-y-auto">
                {/* Colonne Dépôt */}
                <div className="border-r border-[#E8D8BE] divide-y divide-[#F3EBDC]">
                  {apercuLedger.deposits.length === 0 ? (
                    <div className="p-4 text-[11px] text-[#7D8176] text-center">
                      Aucun dépôt enregistré
                    </div>
                  ) : (
                    apercuLedger.deposits.map((item) => (
                      <div key={item.id} className="p-2.5 hover:bg-emerald-50/30 transition-colors">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-[#192A24] truncate">
                            {item.contact}
                          </span>
                          <span className="text-xs font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                            +{formatMoney(item.amount)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#7D8176] truncate mt-0.5">
                          {item.date} · {item.motif}
                        </div>
                        {apercuLedger.hasContactFilter && contactAllAccounts && item.account && (
                          <div className="mt-1">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#EFE6D5] text-[10px] font-semibold text-[#7D8176]">
                              {item.account}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Colonne Retrait */}
                <div className="divide-y divide-[#F3EBDC]">
                  {apercuLedger.withdrawals.length === 0 ? (
                    <div className="p-4 text-[11px] text-[#7D8176] text-center">
                      Aucun retrait enregistré
                    </div>
                  ) : (
                    apercuLedger.withdrawals.map((item) => (
                      <div key={item.id} className="p-2.5 hover:bg-red-50/30 transition-colors">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-[#192A24] truncate">
                            {item.isOpex ? `OPEX · ${item.contact}` : item.contact}
                          </span>
                          <span className="text-xs font-mono tabular-nums font-bold text-red-700 shrink-0">
                            -{formatMoney(item.amount)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#7D8176] truncate mt-0.5">
                          {item.date} · {item.motif}
                        </div>
                        {apercuLedger.hasContactFilter && contactAllAccounts && item.account && (
                          <div className="mt-1">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#EFE6D5] text-[10px] font-semibold text-[#7D8176]">
                              {item.account}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Totaux Dépôt / Retrait + Critères de position finale */}
              <div className="border-t border-[#E8D8BE] bg-[#FAF8F3]">
                <div className="grid grid-cols-2 border-b border-[#EFE6D5] text-xs">
                  <div className="py-2 px-3 border-r border-[#E8D8BE] flex items-center justify-between gap-1">
                    <span className="text-[#7D8176] font-medium">Total</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-700">
                      {formatMoney(apercuLedger.totalDepot)} F
                    </span>
                  </div>
                  <div className="py-2 px-3 flex items-center justify-between gap-1">
                    <span className="text-[#7D8176] font-medium">Total</span>
                    <span className="font-mono tabular-nums font-bold text-red-700">
                      {formatMoney(apercuLedger.totalRetrait)} F
                    </span>
                  </div>
                </div>
                {apercuLedger.hasContactFilter && selectedContactPosition && (
                  <div className="px-3 py-1.5 border-b border-[#EFE6D5] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-[#7D8176]">
                    <span>
                      Cash confié :{' '}
                      <strong className="font-mono text-[#192A24]">
                        {selectedContactPosition.cashDepositNetXaf >= 0 ? '+' : ''}
                        {formatMoney(selectedContactPosition.cashDepositNetXaf)} F
                      </strong>
                    </span>
                    {selectedContactPosition.goldRemainingXaf > 0 && (
                      <span>
                        Dû Or :{' '}
                        <strong className="font-mono text-[#AA6B0B]">
                          +{formatMoney(selectedContactPosition.goldRemainingXaf)} F
                        </strong>
                      </span>
                    )}
                    {selectedContactPosition.salesRemainingXaf > 0 && (
                      <span>
                        Dû Ventes :{' '}
                        <strong className="font-mono text-red-700">
                          -{formatMoney(selectedContactPosition.salesRemainingXaf)} F
                        </strong>
                      </span>
                    )}
                    {selectedContactPosition.currencyWeOweXaf > 0 && (
                      <span>
                        Dû Dev. :{' '}
                        <strong className="font-mono text-[#AA6B0B]">
                          +{formatMoney(selectedContactPosition.currencyWeOweXaf)} F
                        </strong>
                      </span>
                    )}
                    {selectedContactPosition.currencyOwedToUsXaf > 0 && (
                      <span>
                        Créance Dev. :{' '}
                        <strong className="font-mono text-red-700">
                          -{formatMoney(selectedContactPosition.currencyOwedToUsXaf)} F
                        </strong>
                      </span>
                    )}
                  </div>
                )}
                <div className="py-2.5 px-3 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#192A24]">
                    {apercuLedger.hasContactFilter && selectedContactPosition
                      ? 'Position nette globale'
                      : apercuLedger.hasContactFilter
                      ? 'Solde contact (Dépôt − Retrait)'
                      : 'Net (Dépôt − Retrait)'}
                  </span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      (apercuLedger.hasContactFilter && selectedContactPosition
                        ? selectedContactPosition.netPositionXaf
                        : apercuLedger.netBalance) < 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {(apercuLedger.hasContactFilter && selectedContactPosition
                      ? selectedContactPosition.netPositionXaf
                      : apercuLedger.netBalance) >= 0
                      ? '+'
                      : ''}
                    {formatMoney(
                      apercuLedger.hasContactFilter && selectedContactPosition
                        ? selectedContactPosition.netPositionXaf
                        : apercuLedger.netBalance
                    )}{' '}
                    FCFA
                  </span>
                </div>
              </div>
            </div>

            {/* COLONNE 3 : Historique / Tous les mouvements du contact */}
            <div className="xl:col-span-4 bg-white border border-[#E8D8BE] rounded-2xl flex flex-col overflow-hidden">
              <div className="p-4 border-b border-[#E8D8BE] bg-[#FFFDF9] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#192A24] truncate">
                      {contactSearchContext.hasQuery ? 'Mouvements du contact' : 'Historique'}
                    </h3>
                    {contactSearchContext.hasQuery && (
                      <div className="text-[11px] text-[#7D8176] truncate">
                        {contactSearchContext.matchedContact?.name || contactSearchContext.raw}
                      </div>
                    )}
                  </div>

                  {contactSearchContext.hasQuery ? (
                    <div className="flex items-center gap-1 p-0.5 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[11px] shrink-0">
                      <button
                        type="button"
                        onClick={() => setContactAllAccounts(true)}
                        className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                          contactAllAccounts
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        Tous comptes
                      </button>
                      <button
                        type="button"
                        onClick={() => setContactAllAccounts(false)}
                        className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                          !contactAllAccounts
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        Ce compte
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 p-0.5 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[11px] shrink-0">
                      <button
                        type="button"
                        onClick={() => setHistoryScope('account')}
                        className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                          historyScope === 'account'
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        Ce compte
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryScope('all')}
                        className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                          historyScope === 'all'
                            ? 'bg-white text-[#192A24] shadow-2xs'
                            : 'text-[#7D8176] hover:text-[#192A24]'
                        }`}
                      >
                        Tous
                      </button>
                    </div>
                  )}
                </div>

                {/* Recherche */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-[#7D8176]" />
                  <input
                    type="text"
                    value={searchOpQuery}
                    onChange={(e) => setSearchOpQuery(e.target.value)}
                    placeholder="Filtrer par motif, réf., montant..."
                    className="w-full pl-8 pr-8 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-medium text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                  />
                  {searchOpQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchOpQuery('')}
                      aria-label="Effacer la recherche"
                      className="absolute right-2.5 top-2.5 text-[#7D8176] hover:text-[#192A24] cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Filtre rapide par nature (Tout, Dépôts, Retraits, Or, Devises, OPEX) */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-[11px]">
                  {(
                    [
                      ['ALL', 'Tout'],
                      ['DEPOT', 'Dépôts'],
                      ['RETRAIT', 'Retraits'],
                      ['OR', 'Or'],
                      ['DEVISE', 'Devises'],
                      ['OPEX', 'OPEX'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setHistoryTypeFilter(val)}
                      className={`py-1 px-1.5 rounded-md font-semibold cursor-pointer transition-colors whitespace-nowrap text-center ${
                        historyTypeFilter === val
                          ? 'bg-white text-[#192A24] shadow-2xs'
                          : 'text-[#7D8176] hover:text-[#192A24]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-[300px] max-h-[420px] overflow-y-auto divide-y divide-[#F3EBDC]">
                {searchedCaisseOperations.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#7D8176]">
                    {contactSearchContext.hasQuery
                      ? `Aucun mouvement trouvé pour « ${contactSearchContext.matchedContact?.name || contactSearchContext.raw} ».`
                      : searchOpQuery
                      ? `Aucune opération trouvée pour « ${searchOpQuery} ».`
                      : 'Aucune opération enregistrée pour ce filtre.'}
                  </div>
                ) : (
                  searchedCaisseOperations.slice(0, 50).map((item) => {
                    const badgeClass =
                      item.kind === 'OR'
                        ? 'bg-amber-100 text-amber-900'
                        : item.kind === 'DEVISE'
                        ? 'bg-sky-100 text-sky-900'
                        : item.kind === 'DEPOT'
                        ? 'bg-emerald-100 text-emerald-900'
                        : item.kind === 'OPEX'
                        ? 'bg-[#192A24]/10 text-[#192A24]'
                        : item.kind === 'PRET'
                        ? 'bg-purple-100 text-purple-900'
                        : 'bg-red-100 text-red-900';

                    return (
                      <div
                        key={item.id}
                        className="p-3 hover:bg-[#FAF8F3] transition-colors flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badgeClass}`}>
                              {item.badge}
                            </span>
                            {item.account && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FAF8F3] border border-[#E8D8BE] text-[10px] font-semibold text-[#7D8176]">
                                {item.account}
                              </span>
                            )}
                            {item.extraTag && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.extraTag.startsWith('Dû')
                                    ? 'bg-red-50 text-red-700 border border-red-200'
                                    : item.extraTag === 'Annulé'
                                    ? 'bg-gray-100 text-gray-500'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}
                              >
                                {item.extraTag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold text-[#192A24] truncate">{item.title}</div>
                          <div className="text-[11px] text-[#7D8176] truncate">
                            {item.date} · {item.subtitle}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <div
                            className={`text-xs font-mono tabular-nums font-bold ${
                              item.side === 'DEPOT'
                                ? 'text-emerald-700'
                                : item.side === 'RETRAIT'
                                ? 'text-red-700'
                                : 'text-[#192A24]'
                            }`}
                          >
                            {item.side === 'DEPOT' ? '+' : item.side === 'RETRAIT' ? '-' : ''}
                            {formatMoney(item.amountXaf)} F
                          </div>
                          {item.editableOp && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditOp(item.editableOp!)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7D8176] hover:text-[#192A24] cursor-pointer"
                            >
                              <Edit3 size={11} />
                              <span>Modifier</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-2.5 border-t border-[#E8D8BE] bg-[#FAF8F3] flex items-center justify-between text-[11px] text-[#7D8176]">
                <span>
                  {searchedCaisseOperations.length} mouvement{searchedCaisseOperations.length > 1 ? 's' : ''}
                </span>
                {searchedCaisseOperations.length > 50 && <span>50 plus récents affichés</span>}
              </div>
            </div>
          </div>

          {/* SECTION BASSE 1 : Rapport du Compte Source */}
          <div className="bg-white border border-[#E8D8BE] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-[#192A24]">
                  {contactSearchContext.hasQuery
                    ? `Situation Compte Source · ${selectedContactPosition?.name || contactSearchContext.matchedContact?.name || contactSearchContext.raw}`
                    : 'Rapport de la caisse'}
                </h3>
                <p className="text-xs text-[#7D8176]">
                  {contactSearchContext.hasQuery
                    ? `Synthèse globale (${contactAllAccounts ? 'tous comptes' : caisseSourceAccount}) des dépôts, retraits, achats d’or, ventes et devises.`
                    : `Synthèse des flux sur ${caisseSourceAccount}.`}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:gap-6">
                <div>
                  <div className="text-[11px] text-[#7D8176]">Total Dépôts</div>
                  <div className="text-sm font-mono tabular-nums font-bold text-emerald-700">
                    +{formatMoney(apercuLedger.totalDepot)} FCFA
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#7D8176]">Total Retraits</div>
                  <div className="text-sm font-mono tabular-nums font-bold text-red-700">
                    -{formatMoney(apercuLedger.totalRetrait)} FCFA
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#7D8176]">Dont Dépenses OPEX</div>
                  <div className="text-sm font-mono tabular-nums font-bold text-[#192A24]">
                    {formatMoney(apercuLedger.totalOpex)} FCFA
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#7D8176]">
                    {apercuLedger.hasContactFilter && selectedContactPosition
                      ? selectedContactPosition.netPositionXaf >= 0
                        ? 'Possède / On doit'
                        : 'Nous doit'
                      : apercuLedger.hasContactFilter
                      ? 'Solde net contact'
                      : 'Solde du compte'}
                  </div>
                  <div
                    className={`text-sm font-mono tabular-nums font-bold ${
                      (apercuLedger.hasContactFilter && selectedContactPosition
                        ? selectedContactPosition.netPositionXaf
                        : apercuLedger.hasContactFilter
                        ? apercuLedger.netBalance
                        : store.bankBalances[caisseSourceAccount] ?? 0) < 0
                        ? 'text-red-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {apercuLedger.hasContactFilter &&
                    (selectedContactPosition
                      ? selectedContactPosition.netPositionXaf
                      : apercuLedger.netBalance) >= 0
                      ? '+'
                      : ''}
                    {formatMoney(
                      apercuLedger.hasContactFilter && selectedContactPosition
                        ? selectedContactPosition.netPositionXaf
                        : apercuLedger.hasContactFilter
                        ? apercuLedger.netBalance
                        : store.bankBalances[caisseSourceAccount] ?? 0
                    )}{' '}
                    FCFA
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {canFlux && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('flux_periodes')}
                    className="px-3.5 py-2 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] hover:bg-[#F3EBDC] text-xs font-bold text-[#192A24] cursor-pointer whitespace-nowrap transition-colors"
                  >
                    Rapport détaillé par période
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsCaisseReportPrintOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap transition-colors"
                >
                  <Printer size={14} />
                  <span>Imprimer</span>
                </button>
              </div>
            </div>

            {contactSearchContext.hasQuery && selectedContactPosition && (
              <div className="pt-3 border-t border-[#EFE6D5] grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Scale size={16} className="text-[#D39725] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#7D8176]">Achats d&apos;Or (On doit)</div>
                      <div className="text-xs font-bold text-[#192A24] truncate">
                        {selectedContactPosition.goldPurchaseCount} lot(s) ·{' '}
                        {formatNumber(selectedContactPosition.goldTotalWeightGrams, 2)} g
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono tabular-nums font-bold text-[#192A24]">
                      {formatMoney(selectedContactPosition.goldTotalAmountXaf)} F
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        selectedContactPosition.goldRemainingXaf > 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {selectedContactPosition.goldRemainingXaf > 0
                        ? `On doit : ${formatMoney(selectedContactPosition.goldRemainingXaf)} F`
                        : 'Soldé'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Coins size={16} className="text-sky-700 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#7D8176]">Ventes d&apos;Or (Nous doit)</div>
                      <div className="text-xs font-bold text-[#192A24] truncate">
                        {selectedContactPosition.saleCount} vente(s) ·{' '}
                        {formatNumber(selectedContactPosition.salesPureGrams, 2)} g 24K
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono tabular-nums font-bold text-[#192A24]">
                      {formatMoney(selectedContactPosition.salesTotalXaf)} F
                    </div>
                    <div
                      className={`text-[10px] font-bold ${
                        selectedContactPosition.salesRemainingXaf > 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {selectedContactPosition.salesRemainingXaf > 0
                        ? `Nous doit : ${formatMoney(selectedContactPosition.salesRemainingXaf)} F`
                        : 'Soldé'}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ArrowLeftRight size={16} className="text-[#192A24] shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#7D8176]">Devises &amp; Prêts</div>
                      <div className="text-xs font-bold text-[#192A24] truncate">
                        {selectedContactPosition.currencyOpsCount} op(s) devise
                        {selectedContactPosition.currencyTags.length > 0
                          ? ` (${selectedContactPosition.currencyTags.join(', ')})`
                          : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono tabular-nums font-bold text-[#192A24]">
                      {formatMoney(selectedContactPosition.currencyTotalXaf)} F
                    </div>
                    {selectedContactPosition.currencyWeOweXaf > 0 && (
                      <div className="text-[10px] font-bold text-[#AA6B0B]">
                        On doit (dev.) : {formatMoney(selectedContactPosition.currencyWeOweXaf)} F
                      </div>
                    )}
                    {selectedContactPosition.currencyOwedToUsXaf > 0 && (
                      <div className="text-[10px] font-bold text-red-700">
                        Nous doit (dev.) : {formatMoney(selectedContactPosition.currencyOwedToUsXaf)} F
                      </div>
                    )}
                    {(selectedContactPosition.loansWeOweXaf > 0 ||
                      selectedContactPosition.loansOwedToUsXaf > 0) && (
                      <div className="text-[10px] font-bold text-[#AA6B0B]">
                        Prêts nets :{' '}
                        {formatMoney(
                          selectedContactPosition.loansWeOweXaf - selectedContactPosition.loansOwedToUsXaf
                        )}{' '}
                        F
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION BASSE 2 : Répertoire & Situation complète de tous les Comptes Clients / Fournisseurs */}
          <div className="bg-white border border-[#E8D8BE] rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-[#E8D8BE] bg-[#FFFDF9] space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[#192A24] flex items-center gap-2">
                    <Users size={16} className="text-[#D39725]" />
                    <span>État des Comptes Sources · Clients &amp; Fournisseurs</span>
                  </h3>
                  <p className="text-xs text-[#7D8176]">
                    Vue complète liée à la caisse : dépôts confiés chez nous, dettes sur achats d&apos;or, créances sur ventes, devises, prêts et règlements directs par Dépôt ou Retrait.
                  </p>
                  {sourceActionFeedback && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                      <CheckCircle2 size={14} />
                      <span>{sourceActionFeedback}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-2.5 text-[#7D8176]" />
                    <input
                      type="text"
                      value={directorySearchQuery}
                      onChange={(e) => setDirectorySearchQuery(e.target.value)}
                      placeholder="Rechercher client, tél., ville..."
                      className="pl-8 pr-3 py-1.5 bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl text-xs text-[#192A24] focus:outline-none focus:ring-2 focus:ring-[#D39725]/40"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl px-2.5 py-1.5 text-xs">
                    <ArrowUpDown size={13} className="text-[#7D8176]" />
                    <select
                      value={directorySortBy}
                      onChange={(e) => setDirectorySortBy(e.target.value as typeof directorySortBy)}
                      aria-label="Trier les comptes"
                      className="bg-transparent font-semibold text-[#192A24] focus:outline-none text-xs"
                    >
                      <option value="magnitude">Plus gros encours</option>
                      <option value="we_owe">Possède / On doit le +</option>
                      <option value="owes_us">Nous doit le +</option>
                      <option value="name">Nom (A → Z)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Critères combinés : Profil · Typologie Or · Situation */}
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <div className="flex items-center gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl">
                  {(
                    [
                      ['ALL', 'Tous profils'],
                      ['SUPPLIER', 'Fournisseurs'],
                      ['CLIENT', 'Clients'],
                      ['DEVISE', 'Devises'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSourceRoleFilter(val)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap ${
                        sourceRoleFilter === val
                          ? 'bg-[#192A24] text-white'
                          : 'text-[#7D8176] hover:text-[#192A24]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl">
                  {(
                    [
                      ['ALL', 'Toutes typologies'],
                      ['Or brut', 'Or brut'],
                      ['Or fondu', 'Or fondu'],
                      ['Bijoux', 'Bijoux'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setDirectoryGoldTypeFilter(val)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap ${
                        directoryGoldTypeFilter === val
                          ? 'bg-[#D39725] text-white'
                          : 'text-[#7D8176] hover:text-[#192A24]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl">
                  {(
                    [
                      ['ALL', 'Toutes situations'],
                      ['CREDITOR', 'Possède / On doit'],
                      ['DEBTOR', 'Nous doit'],
                      ['SETTLED', 'Soldé (0 F)'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSourceStatusFilter(val)}
                      className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-colors whitespace-nowrap ${
                        sourceStatusFilter === val
                          ? 'bg-white text-[#192A24] shadow-2xs border border-[#E8D8BE]'
                          : 'text-[#7D8176] hover:text-[#192A24]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF8F3] border-b border-[#E8D8BE] text-[11px] font-bold uppercase tracking-wider text-[#7D8176]">
                    <th className="py-3 px-4">Client / Fournisseur</th>
                    <th className="py-3 px-4 text-right">Dépôts − Retraits (Cash)</th>
                    <th className="py-3 px-4 text-right">Achats Or (On doit)</th>
                    <th className="py-3 px-4 text-right">Ventes Or (Nous doit)</th>
                    <th className="py-3 px-4 text-right">Devises &amp; Prêts</th>
                    <th className="py-3 px-4 text-right">Position Nette</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EBDC] text-xs">
                  {directoryFilteredPositions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#7D8176]">
                        Aucun compte client ou fournisseur ne correspond aux critères sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    directoryFilteredPositions.map((pos) => {
                      const isSelected =
                        contactSearchContext.hasQuery &&
                        (selectedContactPosition?.key === pos.key ||
                          caisseContact.trim().toLowerCase() === pos.name.toLowerCase());
                      return (
                        <tr
                          key={pos.key}
                          onClick={() => {
                            setCaisseContact(pos.name);
                            setApercuFilterByContact(true);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-amber-50/60' : 'hover:bg-[#FAF8F3]'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#192A24] flex items-center gap-1.5">
                              <span>{pos.name}</span>
                              {pos.reference && (
                                <span className="text-[10px] font-mono text-[#7D8176]">
                                  · {pos.reference}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[#7D8176]">
                              {pos.phone || 'Sans tél.'}
                              {pos.city ? ` · ${pos.city}` : ''}
                              {' · '}
                              {pos.roles[0] || 'Contact'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            <div
                              className={`font-bold ${
                                pos.cashDepositNetXaf > 0
                                  ? 'text-emerald-700'
                                  : pos.cashDepositNetXaf < 0
                                  ? 'text-red-700'
                                  : 'text-[#7D8176]'
                              }`}
                            >
                              {pos.cashDepositNetXaf > 0 ? '+' : ''}
                              {formatMoney(pos.cashDepositNetXaf)} F
                            </div>
                            <div className="text-[10px] text-[#7D8176]">
                              +{formatMoney(pos.cashDepositsXaf)} / -{formatMoney(pos.cashWithdrawalsXaf)}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {pos.goldPurchaseCount === 0 ? (
                              <span className="text-[#7D8176]">—</span>
                            ) : (
                              <>
                                <div
                                  className={`font-bold ${
                                    pos.goldRemainingXaf > 0 ? 'text-[#AA6B0B]' : 'text-[#192A24]'
                                  }`}
                                >
                                  {pos.goldRemainingXaf > 0
                                    ? `Dû ${formatMoney(pos.goldRemainingXaf)} F`
                                    : `${formatMoney(pos.goldTotalAmountXaf)} F`}
                                </div>
                                <div className="text-[10px] text-[#7D8176]">
                                  {pos.goldPurchaseCount} lot(s) · {formatNumber(pos.goldTotalWeightGrams, 1)} g
                                  {pos.goldRemainingXaf === 0 ? ' · Soldé' : ''}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {pos.saleCount === 0 ? (
                              <span className="text-[#7D8176]">—</span>
                            ) : (
                              <>
                                <div
                                  className={`font-bold ${
                                    pos.salesRemainingXaf > 0 ? 'text-red-700' : 'text-[#192A24]'
                                  }`}
                                >
                                  {pos.salesRemainingXaf > 0
                                    ? `Dû ${formatMoney(pos.salesRemainingXaf)} F`
                                    : `${formatMoney(pos.salesTotalXaf)} F`}
                                </div>
                                <div className="text-[10px] text-[#7D8176]">
                                  {pos.saleCount} vente(s) · {formatNumber(pos.salesPureGrams, 1)} g
                                  {pos.salesRemainingXaf === 0 ? ' · Soldé' : ''}
                                </div>
                              </>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums">
                            {pos.currencyOpsCount === 0 &&
                            pos.currencyWeOweXaf === 0 &&
                            pos.currencyOwedToUsXaf === 0 &&
                            pos.loansWeOweXaf === 0 &&
                            pos.loansOwedToUsXaf === 0 ? (
                              <span className="text-[#7D8176]">—</span>
                            ) : (
                              <>
                                <div className="font-semibold text-[#192A24]">
                                  {pos.currencyOpsCount > 0
                                    ? `${pos.currencyOpsCount} dev. (${formatMoney(pos.currencyTotalXaf)} F)`
                                    : ''}
                                </div>
                                {pos.currencyWeOweXaf > 0 && (
                                  <div className="text-[10px] font-bold text-[#AA6B0B]">
                                    Dû achat dev. : {formatMoney(pos.currencyWeOweXaf)} F
                                  </div>
                                )}
                                {pos.currencyOwedToUsXaf > 0 && (
                                  <div className="text-[10px] font-bold text-red-700">
                                    À encaisser dev. : {formatMoney(pos.currencyOwedToUsXaf)} F
                                  </div>
                                )}
                                {(pos.loansWeOweXaf > 0 || pos.loansOwedToUsXaf > 0) && (
                                  <div className="text-[10px] text-[#AA6B0B]">
                                    Prêt net : {formatMoney(pos.loansWeOweXaf - pos.loansOwedToUsXaf)} F
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg font-mono tabular-nums font-bold text-[11px] ${
                                pos.netPositionXaf > 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : pos.netPositionXaf < 0
                                  ? 'bg-red-50 text-red-800 border border-red-200'
                                  : 'bg-[#FAF8F3] text-[#7D8176] border border-[#E8D8BE]'
                              }`}
                            >
                              {pos.netPositionXaf > 0
                                ? `+${formatMoney(pos.netPositionXaf)} F`
                                : pos.netPositionXaf < 0
                                ? `-${formatMoney(Math.abs(pos.netPositionXaf))} F`
                                : 'Soldé (0 F)'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                              {canDepotRetrait &&
                                (pos.netPositionXaf !== 0 ||
                                  pos.goldRemainingXaf > 0 ||
                                  pos.salesRemainingXaf > 0 ||
                                  pos.currencyWeOweXaf > 0 ||
                                  pos.currencyOwedToUsXaf > 0 ||
                                  pos.loansWeOweXaf > 0 ||
                                  pos.loansOwedToUsXaf > 0 ||
                                  pos.cashDepositNetXaf !== 0) && (
                                  <button
                                    type="button"
                                    title="Régler le solde directement depuis la Caisse (Dépôt / Retrait)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSettleSourceModal(pos);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#D39725] hover:bg-[#B8801A] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                                  >
                                    <Wallet size={12} />
                                    <span>Régler solde</span>
                                  </button>
                                )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCaisseContact(pos.name);
                                  setApercuFilterByContact(true);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#192A24] hover:bg-[#253D34] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                              >
                                {isSelected ? 'Sélectionné' : 'Ouvrir caisse'}
                              </button>
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    title="Modifier ce compte source (Admin)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEditSourceAccount(pos);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#FAF8F3] hover:bg-amber-50 border border-[#E8D8BE] text-[#192A24] text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                                  >
                                    <Edit3 size={12} className="text-[#AA6B0B]" />
                                    <span>Modifier</span>
                                  </button>
                                  <button
                                    type="button"
                                    title="Supprimer ce compte source (Admin)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenDeleteSourceAccount(pos);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors"
                                  >
                                    <Trash2 size={12} />
                                    <span>Supprimer</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'appro' && canAppro && (
        <div className="flex items-center gap-2 border-b border-[#E8D8BE] pb-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setApproView('internal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              approView === 'internal'
                ? 'bg-[#FFD27A] text-[#192A24] border border-[#E7AD35]'
                : 'text-[#7D8176] hover:bg-amber-50'
            }`}
          >
            Transferts entre comptes ({approHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setApproView('client')}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              approView === 'client'
                ? 'bg-[#FFD27A] text-[#192A24] border border-[#E7AD35]'
                : 'text-[#7D8176] hover:bg-amber-50'
            }`}
          >
            Transactions avec les clients ({clientTransfersHistory.length})
          </button>
        </div>
      )}

      {/* Tab 2: Appro (transactions entre comptes et avec les clients) */}
      {activeTab === 'appro' && canAppro && approView === 'internal' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AppPanel className="lg:col-span-1">
            <SectionHeading title="Nouvel Appro (Approvisionnement interne)" icon={<ArrowLeftRight size={18} />} />
            <p className="text-[11px] text-[#7D8176] mb-4">
              Transférer des fonds en interne entre la caisse espèces et les comptes bancaires.
            </p>

            {approSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{approSuccess}</span>
              </div>
            )}

            {approError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-bold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{approError}</span>
              </div>
            )}

            <form onSubmit={handleAppro} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Compte Source (Débit)</label>
                <select
                  value={approFrom}
                  onChange={(e) => setApproFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                >
                  {Object.entries(store.bankBalances).map(([b, bal]) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Compte Cible (Crédit)</label>
                <select
                  value={approTo}
                  onChange={(e) => setApproTo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                >
                  {Object.entries(store.bankBalances)
                    .filter(([b]) => b !== approFrom)
                    .map(([b, bal]) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Montant de l'appro (FCFA)</label>
                <input
                  type="text"
                  required
                  value={approAmount}
                  onChange={(e) => setApproAmount(e.target.value)}
                  placeholder="ex: 1000000"
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Libellé / Motif de l'appro</label>
                <input
                  type="text"
                  required
                  value={approLabel}
                  onChange={(e) => setApproLabel(e.target.value)}
                  placeholder="ex: Appro Caisse pour achats d'or"
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Effectuer l'appro
              </button>
            </form>
          </AppPanel>

          <AppPanel className="lg:col-span-2">
            <SectionHeading title="Historique des approvisionnements" icon={<ArrowLeftRight size={18} />} />
            {approHistory.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">Aucun approvisionnement enregistré.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {approHistory.map((op) => (
                  <div key={op.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-[#192A24]">{op.title}</div>
                      <div className="text-[11px] text-[#7D8176]">
                        {op.subtitle} · {op.date}
                      </div>
                    </div>
                    <span className="font-extrabold text-blue-600 font-mono">
                      {formatMoney(op.amount)} FCFA
                    </span>
                  </div>
                ))}
              </div>
            )}
          </AppPanel>
        </div>
      )}

      {/* Transactions between company accounts and clients */}
      {activeTab === 'appro' && canAppro && approView === 'client' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <AppPanel className="lg:col-span-1 border-emerald-200 shadow-md">
            <div className="flex items-center gap-2 border-b border-[#E8D8BE] pb-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <Send size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#192A24]">Virement vers compte client</h3>
                <p className="text-[11px] text-[#7D8176]">Débiter mon compte pour payer un client par virement</p>
              </div>
            </div>

            {clientTransferSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                  <span>{clientTransferSuccess}</span>
                </div>
                {receiptEntry && (
                  <button
                    type="button"
                    onClick={() => setReceiptEntry(receiptEntry)}
                    className="w-full py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer size={13} />
                    <span>Afficher / Imprimer le reçu de virement</span>
                  </button>
                )}
              </div>
            )}

            {clientTransferError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-bold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{clientTransferError}</span>
              </div>
            )}

            <form onSubmit={handleClientTransfer} className="space-y-4">
              {/* Mon Compte Source */}
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  Mon compte source (Débité)
                </label>
                <select
                  value={clientTransferFrom}
                  onChange={(e) => setClientTransferFrom(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24] focus:outline-hidden focus:border-[#008B62]"
                >
                  {Object.entries(store.bankBalances).map(([b, bal]) => (
                    <option key={b} value={b}>
                      {b} — Solde dispo : {formatMoney(bal)} FCFA
                    </option>
                  ))}
                </select>
              </div>

              {/* Client Bénéficiaire */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Client bénéficiaire
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewClient(!isNewClient)}
                    className="text-[11px] text-[#008B62] font-bold hover:underline cursor-pointer"
                  >
                    {isNewClient ? 'Choisir contact enregistré' : '+ Nouveau / Client libre'}
                  </button>
                </div>

                {!isNewClient ? (
                  <select
                    value={selectedContactRef}
                    onChange={(e) => handleSelectContact(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                  >
                    <option value="">-- Choisir un client dans le carnet --</option>
                    {clientContacts.map((c) => (
                      <option key={c.reference} value={c.reference}>
                        {c.name} ({c.city}) {c.phone ? `· ${c.phone}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={customClientName}
                    onChange={(e) => setCustomClientName(e.target.value)}
                    placeholder="Nom complet du client bénéficiaire"
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                  />
                )}
              </div>

              {/* Banque du client */}
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  Banque / Opérateur du client
                </label>
                <input
                  type="text"
                  required
                  value={clientBank}
                  onChange={(e) => setClientBank(e.target.value)}
                  placeholder="ex: Ecobank, UBA, Wave..."
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                />
                {/* Quick suggestions pills */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {quickBankSuggestions.slice(0, 5).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setClientBank(b)}
                      className="px-2 py-0.5 rounded-md bg-gray-100 hover:bg-emerald-100 text-[10px] text-gray-700 font-semibold cursor-pointer transition-colors"
                    >
                      {b}
                    </button>
                  ))}
                </div>
                {clientBank.trim() && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                    <div className="text-[11px] font-black text-emerald-900">
                      Informations complémentaires du bordereau
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                          Agence bancaire
                        </label>
                        <input
                          type="text"
                          value={clientBankAgency}
                          onChange={(e) => setClientBankAgency(e.target.value)}
                          placeholder="Nom ou code de l’agence"
                          className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                          Titulaire du compte
                        </label>
                        <input
                          type="text"
                          value={clientAccountHolder}
                          onChange={(e) => setClientAccountHolder(e.target.value)}
                          placeholder="Nom indiqué sur le compte"
                          className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                        Référence bancaire
                      </label>
                      <input
                        type="text"
                        value={clientBankReference}
                        onChange={(e) => setClientBankReference(e.target.value)}
                        placeholder="Référence de l’ordre ou du transfert"
                        className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Numéro de compte / RIB */}
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  Numéro de compte / RIB / IBAN / N° Mobile
                </label>
                <input
                  type="text"
                  required
                  value={clientAccountNumber}
                  onChange={(e) => setClientAccountNumber(e.target.value)}
                  placeholder="ex: 12345678901 ou 0708091011"
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-mono font-bold text-[#192A24]"
                />
              </div>

              {/* Montant & Frais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#192A24] mb-1">
                    Montant du virement (FCFA)
                  </label>
                  <input
                    type="text"
                    required
                    value={clientTransferAmount}
                    onChange={(e) => setClientTransferAmount(e.target.value)}
                    placeholder="ex: 2500000"
                    className="w-full px-3 py-2 bg-emerald-50/50 rounded-xl border border-emerald-300 text-xs font-black text-[#192A24]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#192A24] mb-1">
                    Frais bancaires (FCFA)
                  </label>
                  <input
                    type="text"
                    value={clientTransferFee}
                    onChange={(e) => setClientTransferFee(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                  />
                </div>
              </div>

              {/* Affectation directe à un achat d'or brut / bijoux à crédit ou partiel */}
              {clientTransferContactPurchases.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50/70 border border-[#E8D8BE] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-[#192A24]">
                      Régler un achat d&apos;or à crédit / partiel (optionnel)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const chosen = clientTransferContactPurchases.find(
                          (item) => item.purchase.id === clientTransferPurchaseId
                        );
                        const amtToFill = chosen
                          ? chosen.remaining
                          : clientTransferContactPurchases.reduce((s, item) => s + item.remaining, 0);
                        if (amtToFill > 0) setClientTransferAmount(String(amtToFill));
                      }}
                      className="text-[10px] font-bold text-[#9E731B] hover:text-[#192A24] underline cursor-pointer"
                    >
                      Remplir le solde
                    </button>
                  </div>
                  <select
                    value={clientTransferPurchaseId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setClientTransferPurchaseId(val);
                      if (val === 'AUTO') {
                        const tot = clientTransferContactPurchases.reduce((s, item) => s + item.remaining, 0);
                        if (tot > 0 && !clientTransferAmount) setClientTransferAmount(String(tot));
                      } else if (val !== 'NONE') {
                        const found = clientTransferContactPurchases.find((item) => item.purchase.id === val);
                        if (found && !clientTransferAmount) setClientTransferAmount(String(found.remaining));
                      }
                    }}
                    className="w-full px-3 py-2 bg-white rounded-lg border border-[#E8D8BE] text-[11px] font-semibold text-[#192A24]"
                  >
                    <option value="NONE">— Virement libre (sans imputation directe sur achat) —</option>
                    <option value="AUTO">
                      Auto : solder les achats d&apos;or ouverts (FIFO ·{' '}
                      {formatMoney(
                        clientTransferContactPurchases.reduce((s, item) => s + item.remaining, 0)
                      )}{' '}
                      FCFA)
                    </option>
                    {clientTransferContactPurchases.map(({ purchase, remaining }) => (
                      <option key={purchase.id} value={purchase.id}>
                        {purchase.reference} · {purchase.goldCategory} · Reste {formatMoney(remaining)} FCFA
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Motif / Référence */}
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  Motif / Référence du virement
                </label>
                <input
                  type="text"
                  required
                  value={clientTransferReason}
                  onChange={(e) => setClientTransferReason(e.target.value)}
                  placeholder="ex: Règlement achat or lot ACH-2026-0004"
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs text-[#192A24]"
                />
              </div>

              {/* Dynamic Summary Card */}
              {clientTransferAmount && parseFloat(clientTransferAmount.replace(',', '.') || '0') > 0 && (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#192A24] to-[#253D34] text-white text-xs space-y-1.5 shadow-sm">
                  <div className="flex justify-between items-center text-white/80">
                    <span>Net transféré au client :</span>
                    <strong className="text-white font-mono">{formatMoney(parseFloat(clientTransferAmount.replace(',', '.') || '0'))} FCFA</strong>
                  </div>
                  {clientTransferFee && parseFloat(clientTransferFee.replace(',', '.') || '0') > 0 && (
                    <div className="flex justify-between items-center text-white/70 text-[11px]">
                      <span>Frais bancaires déduits :</span>
                      <span>+{formatMoney(parseFloat(clientTransferFee.replace(',', '.') || '0'))} FCFA</span>
                    </div>
                  )}
                  <div className="border-t border-white/10 pt-1.5 flex justify-between items-center text-[#F2BD45] font-black text-sm">
                    <span>Débit total de {clientTransferFrom} :</span>
                    <span>
                      {formatMoney(
                        parseFloat(clientTransferAmount.replace(',', '.') || '0') +
                        (parseFloat(clientTransferFee.replace(',', '.') || '0') || 0)
                      )} FCFA
                    </span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <Send size={15} />
                <span>Valider le virement au client</span>
              </button>
            </form>
          </AppPanel>

          {/* Right column: Historique des virements clients */}
          <AppPanel className="lg:col-span-2">
            <div className="flex items-center justify-between border-b border-[#E8D8BE] pb-3 mb-4">
              <SectionHeading title="Historique des virements vers clients" icon={<Send size={18} className="text-[#008B62]" />} />
              <span className="text-xs font-bold text-[#008B62] bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                {clientTransfersHistory.length} virement(s) effectué(s)
              </span>
            </div>

            {clientTransfersHistory.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
                  <Send size={22} />
                </div>
                <p className="text-xs font-bold text-gray-700">Aucun virement client enregistré pour le moment.</p>
                <p className="text-[11px] text-gray-500">Utilisez le formulaire à gauche pour effectuer un virement de votre compte vers un client.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {clientTransfersHistory.map((op) => {
                  const details = op.clientTransferDetails;
                  return (
                    <div key={op.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[#FAF8F3] px-2 rounded-xl transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-[#192A24]">{op.title}</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Virement exécuté
                          </span>
                        </div>
                        <div className="text-[11px] text-[#7D8176] font-medium">
                          {op.subtitle}
                        </div>
                        {details && (
                          <div className="text-[10px] text-gray-500 flex items-center gap-3">
                            <span>Banque : <strong>{details.clientBank || 'N/A'}</strong></span>
                            {details.clientAccountNumber && <span>N° Compte : <strong className="font-mono">{details.clientAccountNumber}</strong></span>}
                            <span>Débité de : <strong>{details.fromAccount}</strong></span>
                          </div>
                        )}
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                        <span className="font-black text-sm text-emerald-700 font-mono">
                          {formatMoney(op.amount)} FCFA
                        </span>
                        <button
                          type="button"
                          onClick={() => setReceiptEntry(op)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#E8D8BE] hover:bg-emerald-50 text-[11px] font-bold text-[#192A24] cursor-pointer shadow-2xs transition-colors"
                        >
                          <Printer size={12} className="text-[#008B62]" />
                          <span>Voir reçu</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AppPanel>
        </div>
      )}

      {/* Tab 5: Versements (Caisse -> Compte bancaire) */}
      {activeTab === 'versements' && canVersements && (
        <div className="space-y-6">
          {/* Informational Hero Card */}
          <div className="bg-[#FAF8F3] border border-[#E8D8BE] p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#D39725]/15 text-[#966308] flex items-center justify-center shrink-0">
                <ArrowDownLeft size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-[#192A24]">
                  Versement d'espèces de la Caisse vers un Compte Bancaire
                </h3>
                <p className="text-xs text-[#7D8176] mt-0.5">
                  Dépôt physique des liquidités de la caisse espèces vers les comptes bancaires (Ecobank, UBA, etc.). Débite la caisse et crédite le compte bancaire avec génération de bordereau.
                </p>
              </div>
            </div>

          </div>

          {/* Formulaire complet de versement conforme au bordereau officiel */}
          <AppPanel className="p-5 sm:p-6">
            <SectionHeading
              title="Saisie du Bordereau de Versement (Caisse → Banque)"
              icon={<ArrowDownLeft size={18} />}
            />
            <div className="mt-4">
              <BankDepositForm
                onSuccess={(newOp) => {
                  setSelectedDepositReceipt(newOp);
                }}
                onOpenSlipPreview={(tempOp) => {
                  setSelectedDepositReceipt(tempOp as LedgerEntry);
                }}
              />
            </div>
          </AppPanel>

          {/* Bank Deposits History */}
          <AppPanel className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <SectionHeading
                title="Historique des versements en banque & Bordereaux émis"
                icon={<Landmark size={18} />}
              />
              <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                {bankDepositsHistory.length} versement(s)
              </span>
            </div>

            {bankDepositsHistory.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                  <ArrowDownLeft size={24} />
                </div>
                <p className="text-xs font-bold text-gray-600">Aucun versement d'espèces en banque pour le moment.</p>
                <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
                  Utilisez le formulaire ci-dessus pour transférer des espèces de la caisse physique vers vos comptes bancaires d'entreprise avec le décompte exact des coupures.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bankDepositsHistory.map((op) => {
                  const details = op.depositDetails;
                  const targetBankName = details?.targetBank || (op.title.includes('→') ? op.title.split('→')[1].trim() : 'Banque');
                  return (
                    <div
                      key={op.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[#FAF8F3]/60 px-2 rounded-xl transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-[#966308] text-[10px] font-black uppercase">
                            Caisse → {targetBankName}
                          </span>
                          <span className="font-bold text-[#192A24] text-xs">
                            {op.title}
                          </span>
                        </div>

                        <div className="text-[11px] text-[#7D8176] flex flex-wrap items-center gap-2">
                          <span>{op.date}</span>
                          {details?.slipNumber && (
                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">
                              Bordereau : {details.slipNumber}
                            </span>
                          )}
                          {details?.depositedBy && (
                            <span>Déposant : <strong>{details.depositedBy}</strong></span>
                          )}
                          {details?.shiftPeriod && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 font-bold text-gray-600 text-[10px]">
                              {details.shiftPeriod}
                            </span>
                          )}
                          {details?.denominations && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-[10px] text-emerald-800 font-mono border border-emerald-200">
                              <Banknote size={11} className="text-emerald-600" />
                              {[
                                details.denominations.b10000 ? `10K: ${details.denominations.b10000}` : null,
                                details.denominations.b5000 ? `5K: ${details.denominations.b5000}` : null,
                                details.denominations.b2000 ? `2K: ${details.denominations.b2000}` : null,
                                details.denominations.b1000 ? `1K: ${details.denominations.b1000}` : null,
                                details.denominations.b500 ? `500: ${details.denominations.b500}` : null,
                              ]
                                .filter(Boolean)
                                .slice(0, 3)
                                .join(' · ')}
                            </span>
                          )}
                          {details?.note && (
                            <span className="italic text-gray-500">({details.note})</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-right">
                          <span className="text-sm font-black text-emerald-600 font-mono block">
                            +{formatMoney(op.amount)} FCFA
                          </span>
                          <span className="text-[10px] text-red-500 font-mono">
                            Débit Caisse : -{formatMoney(op.amount)} F
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedDepositReceipt(op)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 hover:border-[#D39725] hover:bg-amber-50 text-[#192A24] text-xs font-bold transition-all cursor-pointer"
                          title="Voir et imprimer le bordereau officiel"
                        >
                          <FileText size={14} className="text-[#D39725]" />
                          <span>Imprimer Bordereau</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AppPanel>
        </div>
      )}

      {/* Tab 6: Entrées & Sorties par Période (Mois, Trimestre, Semestre, Annuel) */}
      {activeTab === 'flux_periodes' && canFlux && (
        <div className="space-y-6">
          {/* Header & Period Controls */}
          <AppPanel className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E8D8BE] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#192A24] text-[#F2BD45] flex items-center justify-center shrink-0 shadow-xs">
                  <BarChart3 size={22} />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#192A24] tracking-tight">
                    Flux de Trésorerie Caisse · Entrées & Sorties
                  </h2>
                  <p className="text-xs text-[#7D8176] mt-0.5">
                    Consolidation périodique des flux physiques en espèces : Mois, Trimestre, Semestre et Annuel.
                  </p>
                </div>
              </div>

              {/* Solde Caisse Actuel hidden by design */}
              {false && (
                <div className="flex items-center gap-3 bg-[#FAF8F3] px-4 py-2.5 rounded-xl border border-[#E8D8BE]">
                  <Wallet size={18} className="text-[#966308]" />
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#7D8176]">Solde Actuel Caisse</div>
                    <div className="text-base font-black font-mono text-[#192A24]">
                      {formatMoney(currentCashBalance)} <span className="text-xs text-gray-500 font-bold">FCFA</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Period Mode Selector */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Granularity Switcher: Mois / Trimestre / Semestre / Annuel */}
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100 rounded-xl">
                {[
                  { mode: 'month' as const, label: 'Mois (Mensuel)', icon: <Calendar size={14} /> },
                  { mode: 'quarter' as const, label: 'Trimestre', icon: <Layers size={14} /> },
                  { mode: 'semester' as const, label: 'Semestre', icon: <PieChart size={14} /> },
                  { mode: 'year' as const, label: 'Annuel', icon: <BarChart3 size={14} /> },
                ].map((item) => (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => setPeriodMode(item.mode)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      periodMode === item.mode
                        ? 'bg-white text-[#192A24] shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              {/* Year Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#7D8176]">Année :</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 bg-[#FAF8F3] border border-[#E8D8BE] rounded-lg text-xs font-black text-[#192A24] cursor-pointer"
                >
                  {[2027, 2026, 2025, 2024].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>

                {/* Quick Presets */}
                <div className="flex items-center gap-1 ml-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode('month');
                      setSelectedYear(currentYear);
                      setSelectedMonth(currentMonth);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-100 hover:bg-[#FAF8F3] text-gray-700 border border-gray-200 cursor-pointer"
                  >
                    Ce Mois
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode('quarter');
                      setSelectedYear(currentYear);
                      setSelectedQuarter(currentQuarter);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-100 hover:bg-[#FAF8F3] text-gray-700 border border-gray-200 cursor-pointer"
                  >
                    Ce Trimestre
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode('semester');
                      setSelectedYear(currentYear);
                      setSelectedSemester(currentSemester);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-100 hover:bg-[#FAF8F3] text-gray-700 border border-gray-200 cursor-pointer"
                  >
                    Ce Semestre
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode('year');
                      setSelectedYear(currentYear);
                    }}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-gray-100 hover:bg-[#FAF8F3] text-gray-700 border border-gray-200 cursor-pointer"
                  >
                    Année {currentYear}
                  </button>
                </div>
              </div>
            </div>

            {/* Granular Period Pickers */}
            <div className="pt-2">
              {/* If Month mode: Show 12 month buttons */}
              {periodMode === 'month' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {MONTH_NAMES_FR.map((name, idx) => {
                    const isSelected = selectedMonth === idx;
                    const isCurrent = currentMonth === idx && currentYear === selectedYear;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setSelectedMonth(idx)}
                        className={`p-2 rounded-xl text-xs font-bold transition-all text-center cursor-pointer border ${
                          isSelected
                            ? 'bg-[#192A24] text-white border-[#192A24] shadow-xs'
                            : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                        }`}
                      >
                        <div className="truncate">{name}</div>
                        {isCurrent && (
                          <div
                            className={`text-[9px] font-normal uppercase tracking-wider mt-0.5 ${
                              isSelected ? 'text-[#F2BD45]' : 'text-emerald-600'
                            }`}
                          >
                            En cours
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* If Quarter mode: 4 Quarters */}
              {periodMode === 'quarter' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {QUARTER_NAMES_FR.map((q) => {
                    const isSelected = selectedQuarter === q.id;
                    const isCurrent = currentQuarter === q.id && currentYear === selectedYear;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setSelectedQuarter(q.id)}
                        className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#192A24] text-white border-[#192A24] shadow-md'
                            : 'bg-white hover:bg-gray-50 text-[#192A24] border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black">{q.short}</span>
                          {isCurrent && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                                isSelected ? 'bg-amber-400/20 text-[#F2BD45]' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              Actuel
                            </span>
                          )}
                        </div>
                        <div className={`text-xs mt-1 ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                          {q.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* If Semester mode: 2 Semesters */}
              {periodMode === 'semester' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SEMESTER_NAMES_FR.map((s) => {
                    const isSelected = selectedSemester === s.id;
                    const isCurrent = currentSemester === s.id && currentYear === selectedYear;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSemester(s.id)}
                        className={`p-4 rounded-xl text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#192A24] text-white border-[#192A24] shadow-md'
                            : 'bg-white hover:bg-gray-50 text-[#192A24] border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-black">{s.short}</span>
                          {isCurrent && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                                isSelected ? 'bg-amber-400/20 text-[#F2BD45]' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              Semestre Actuel
                            </span>
                          )}
                        </div>
                        <div className={`text-xs mt-1 font-semibold ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                          {s.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* If Year mode */}
              {periodMode === 'year' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#966308] font-bold">
                    <Calendar size={16} />
                    <span>Bilan complet des 12 mois de l'année civile {selectedYear}</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#192A24] font-bold">
                    {filteredCaisseFlows.length} mouvement(s) recensé(s)
                  </span>
                </div>
              )}
            </div>
          </AppPanel>

          {/* Headline Period KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Total Inflows */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-900 to-emerald-950 text-white shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase font-bold text-emerald-300 tracking-wider">
                  Total Entrées Caisse
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-800/80 text-[10px] font-bold">
                  {periodInflows.length} flux
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-300 mt-2">
                +{formatMoney(totalInflowsXaf)} <span className="text-xs font-bold text-white/70">FCFA</span>
              </div>
              <p className="text-[11px] text-white/60 mt-1">
                Recettes ventes or et approvisionnements entrants sur {periodLabel}
              </p>
            </div>

            {/* Total Outflows */}
            <div className="p-5 rounded-2xl bg-gradient-to-br from-rose-900 to-rose-950 text-white shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase font-bold text-rose-300 tracking-wider">
                  Total Sorties Caisse
                </span>
                <span className="px-2 py-0.5 rounded-full bg-rose-800/80 text-[10px] font-bold">
                  {periodOutflows.length} flux
                </span>
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-rose-300 mt-2">
                -{formatMoney(totalOutflowsXaf)} <span className="text-xs font-bold text-white/70">FCFA</span>
              </div>
              <p className="text-[11px] text-white/60 mt-1">
                Achats or espèces, versements banques, dépenses et virements clients
              </p>
            </div>

            {/* Net Period Balance */}
            <div className="p-5 rounded-2xl bg-[#192A24] text-white shadow-md relative overflow-hidden">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase font-bold text-[#F2BD45] tracking-wider">
                  Flux Net Périodique
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    netFlowXaf >= 0
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {netFlowXaf >= 0 ? 'Excédent' : 'Déficit'}
                </span>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black font-mono mt-2 ${
                  netFlowXaf >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {netFlowXaf >= 0 ? '+' : ''}
                {formatMoney(netFlowXaf)} <span className="text-xs font-bold text-white/70">FCFA</span>
              </div>
              <p className="text-[11px] text-white/60 mt-1">
                Variation nette de la caisse espèces pour {periodLabel}
              </p>
            </div>
          </div>

          {/* Visual Ratio Gauge */}
          {(totalInflowsXaf > 0 || totalOutflowsXaf > 0) && (
            <div className="bg-white p-4 rounded-2xl border border-[#E8D8BE] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#192A24]">
                  Équilibre des flux de la période ({periodLabel})
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                  Volume total mouvementé : {formatMoney(totalInflowsXaf + totalOutflowsXaf)} FCFA
                </span>
              </div>
              {(() => {
                const totalVol = totalInflowsXaf + totalOutflowsXaf;
                const inPercent = totalVol > 0 ? Math.round((totalInflowsXaf / totalVol) * 100) : 50;
                const outPercent = 100 - inPercent;
                return (
                  <div className="space-y-1">
                    <div className="w-full h-3.5 bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${inPercent}%` }}
                        className="bg-emerald-600 h-full transition-all duration-500"
                        title={`Entrées : ${inPercent}%`}
                      />
                      <div
                        style={{ width: `${outPercent}%` }}
                        className="bg-rose-500 h-full transition-all duration-500"
                        title={`Sorties : ${outPercent}%`}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-emerald-700">Entrées : {inPercent}%</span>
                      <span className="text-rose-600">Sorties : {outPercent}%</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Category Breakdown (2 columns) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Inflows breakdown */}
            <AppPanel>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
                <SectionHeading
                  title="Détail des Entrées"
                  icon={<ArrowDownLeft size={18} className="text-emerald-600" />}
                />
                <span className="text-xs font-black font-mono text-emerald-600">
                  +{formatMoney(totalInflowsXaf)} F
                </span>
              </div>

              {Object.keys(inflowsByCategory).length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">Aucune entrée pour {periodLabel}.</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(inflowsByCategory).map(([cat, amt]) => {
                    const pct = totalInflowsXaf > 0 ? Math.round((amt / totalInflowsXaf) * 100) : 0;
                    return (
                      <div key={cat} className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#192A24]">{cat}</span>
                          <span className="font-mono font-black text-emerald-700">+{formatMoney(amt)} FCFA</span>
                        </div>
                        <div className="w-full bg-emerald-100 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="bg-emerald-600 h-full" />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">{pct}% du total des entrées</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AppPanel>

            {/* Outflows breakdown */}
            <AppPanel>
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
                <SectionHeading
                  title="Détail des Sorties"
                  icon={<ArrowUpRight size={18} className="text-rose-600" />}
                />
                <span className="text-xs font-black font-mono text-rose-600">
                  -{formatMoney(totalOutflowsXaf)} F
                </span>
              </div>

              {Object.keys(outflowsByCategory).length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">Aucune sortie pour {periodLabel}.</p>
              ) : (
                <div className="space-y-2.5">
                  {Object.entries(outflowsByCategory).map(([cat, amt]) => {
                    const pct = totalOutflowsXaf > 0 ? Math.round((amt / totalOutflowsXaf) * 100) : 0;
                    return (
                      <div key={cat} className="p-3 rounded-xl bg-rose-50/50 border border-rose-100 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#192A24]">{cat}</span>
                          <span className="font-mono font-black text-rose-700">-{formatMoney(amt)} FCFA</span>
                        </div>
                        <div className="w-full bg-rose-100 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="bg-rose-500 h-full" />
                        </div>
                        <div className="text-[10px] text-gray-500 mt-1">{pct}% du total des sorties</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </AppPanel>
          </div>

          {/* Detailed Period Movements Journal */}
          <AppPanel>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-4 border-b border-[#E8D8BE]">
              <div className="flex items-center gap-2">
                <SectionHeading
                  title={`Journal des mouvements de caisse · ${periodLabel}`}
                  icon={<Receipt size={18} />}
                />
              </div>

              {/* Filter Pills & Print */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg p-0.5 bg-gray-100 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setOperationsTypeFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      operationsTypeFilter === 'ALL'
                        ? 'bg-[#192A24] text-white shadow-xs'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Tous ({filteredCaisseFlows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationsTypeFilter('IN')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      operationsTypeFilter === 'IN'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    Entrées ({periodInflows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperationsTypeFilter('OUT')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      operationsTypeFilter === 'OUT'
                        ? 'bg-rose-700 text-white shadow-xs'
                        : 'text-rose-700 hover:text-rose-900'
                    }`}
                  >
                    Sorties ({periodOutflows.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E8D8BE] text-xs font-bold text-[#192A24] hover:bg-[#FAF8F3] transition-colors cursor-pointer"
                  title="Imprimer le relevé périodique"
                >
                  <Printer size={14} />
                  <span className="hidden sm:inline">Imprimer relevé</span>
                </button>
              </div>
            </div>

            {displayedFlows.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500">
                Aucun mouvement de caisse ne correspond à ces critères pour {periodLabel}.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {displayedFlows.map((flow) => {
                  const isIncoming = flow.direction === 'IN';
                  return (
                    <div
                      key={flow.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-[#FAF8F3]/60 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-start sm:items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                            isIncoming
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {isIncoming ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                isIncoming
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-800 border border-rose-200'
                              }`}
                            >
                              {flow.category}
                            </span>
                            <span className="font-bold text-[#192A24]">{flow.title}</span>
                          </div>
                          <div className="text-[11px] text-[#7D8176] mt-0.5">
                            {flow.subtitle} · <span className="font-mono">{flow.displayDate}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right pl-10 sm:pl-0 shrink-0">
                        <span
                          className={`font-black font-mono text-sm block ${
                            isIncoming ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isIncoming ? '+' : '-'}
                          {formatMoney(flow.amount)} FCFA
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {isIncoming ? 'Crédit Caisse' : 'Débit Caisse'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AppPanel>
        </div>
      )}

      {/* Printable Bordereau Modal for Cash to Bank Deposits (Official Reference Model) */}
      {selectedDepositReceipt && (
        <OfficialBankDepositSlipModal
          isOpen={Boolean(selectedDepositReceipt)}
          onClose={() => setSelectedDepositReceipt(null)}
          operation={selectedDepositReceipt}
          initialBank={selectedDepositReceipt.depositDetails?.targetBank || 'Crédit du Congo'}
          initialAmount={selectedDepositReceipt.amount}
          initialDepositor={
            selectedDepositReceipt.depositDetails?.depositedBy ||
            selectedDepositReceipt.depositor ||
            store.userName
          }
          initialDate={selectedDepositReceipt.depositDetails?.date || selectedDepositReceipt.date}
          initialSlipRef={selectedDepositReceipt.depositDetails?.slipNumber}
          initialProvenance={
            selectedDepositReceipt.depositDetails?.note ||
            selectedDepositReceipt.subtitle ||
            'Recettes de vente d\'or'
          }
        />
      )}

      {/* Receipt Modal for Client Transfers */}
      {receiptEntry && (
        <Modal
          isOpen={Boolean(receiptEntry)}
          onClose={() => setReceiptEntry(null)}
          title="Bordereau officiel de virement client"
          maxWidth="max-w-xl"
        >
          <div className="space-y-5 print:p-0">
            {/* Printable Bordereau Container */}
            <div className="p-6 bg-[#FFFDFA] border-2 border-[#192A24] rounded-2xl space-y-5 text-[#192A24]">
              {/* Header */}
              <div className="flex items-center justify-between border-b-2 border-[#192A24] pb-4">
                <div>
                  <div className="text-lg font-black tracking-tight text-[#192A24]">CAMS GOLD</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[#D39725]">Achat & Vente d'Or</div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 text-[10px] font-black uppercase tracking-wider">
                    Virement Exécuté
                  </span>
                  <div className="text-[10px] text-gray-500 font-mono mt-1">Réf : {receiptEntry.id}</div>
                </div>
              </div>

              {/* Body */}
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Compte Débiteur (Émetteur)</span>
                    <strong className="text-sm font-black text-[#192A24]">
                      {receiptEntry.clientTransferDetails?.fromAccount || 'Compte CAMS GOLD'}
                    </strong>
                    <div className="text-[10px] text-gray-500">Cams Gold Sarl</div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Client Bénéficiaire</span>
                    <strong className="text-sm font-black text-emerald-800">
                      {receiptEntry.clientTransferDetails?.clientName || receiptEntry.title.replace('Virement client · ', '')}
                    </strong>
                    <div className="text-[11px] text-gray-600 font-semibold">
                      {receiptEntry.clientTransferDetails?.clientBank || 'Banque Client'}
                    </div>
                    {receiptEntry.clientTransferDetails?.clientAccountNumber && (
                      <div className="text-[10px] font-mono text-gray-600">
                        N° Compte / RIB : <strong>{receiptEntry.clientTransferDetails.clientAccountNumber}</strong>
                      </div>
                    )}
                    {receiptEntry.clientTransferDetails?.clientBankAgency && (
                      <div className="text-[10px] text-gray-600">
                        Agence : <strong>{receiptEntry.clientTransferDetails.clientBankAgency}</strong>
                      </div>
                    )}
                    {receiptEntry.clientTransferDetails?.clientAccountHolder && (
                      <div className="text-[10px] text-gray-600">
                        Titulaire : <strong>{receiptEntry.clientTransferDetails.clientAccountHolder}</strong>
                      </div>
                    )}
                    {receiptEntry.clientTransferDetails?.clientBankReference && (
                      <div className="text-[10px] font-mono text-gray-600">
                        Référence bancaire : <strong>{receiptEntry.clientTransferDetails.clientBankReference}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-gradient-to-r from-[#192A24] to-[#253D34] text-white flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#F2BD45]">Montant total du virement</div>
                    <div className="text-2xl font-black font-mono mt-0.5">
                      {formatMoney(receiptEntry.amount)} <span className="text-sm">FCFA</span>
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-white/80">
                    <div>Date : {receiptEntry.date}</div>
                    {receiptEntry.clientTransferDetails?.feeAmount ? (
                      <div className="text-[10px] text-emerald-300">
                        Dont frais : {formatMoney(receiptEntry.clientTransferDetails.feeAmount)} F
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <span className="text-[10px] uppercase font-bold text-gray-500 block">Motif du virement</span>
                  <div className="font-semibold text-xs text-[#192A24]">
                    {receiptEntry.clientTransferDetails?.reason || receiptEntry.subtitle}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-dashed border-gray-300 text-[11px]">
                <div className="text-center space-y-8">
                  <span className="font-bold text-gray-500 block">Signature de l'Émetteur (CAMS GOLD)</span>
                  <div className="border-t border-gray-400 w-3/4 mx-auto pt-1 font-mono text-[10px] text-gray-400">
                    Visa CAMS GOLD
                  </div>
                </div>
                <div className="text-center space-y-8">
                  <span className="font-bold text-gray-500 block">Signature / Décharge Client</span>
                  <div className="border-t border-gray-400 w-3/4 mx-auto pt-1 font-mono text-[10px] text-gray-400">
                    Bénéficiaire
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 print:hidden">
              <button
                type="button"
                onClick={() => setReceiptEntry(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-black cursor-pointer shadow-md"
              >
                <Printer size={15} />
                <span>Imprimer le bordereau</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Modification d'une opération */}
      {editingOp && (
        <Modal
          isOpen={Boolean(editingOp)}
          onClose={() => setEditingOp(null)}
          title={`Modifier l'opération : ${editingOp.title}`}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleSaveEditOp} className="space-y-4">
            {editSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{editSuccess}</span>
              </div>
            )}

            {editError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{editError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Libellé / Titre de l'opération *
              </label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Tiers / Sous-titre / Compte *
              </label>
              <input
                type="text"
                required
                value={editSubtitle}
                onChange={(e) => setEditSubtitle(e.target.value)}
                className="w-full px-3.5 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs text-[#192A24]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Montant (FCFA) *</label>
                <input
                  type="text"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-sm font-black text-[#192A24]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Date</label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">Notes internes / Motif</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Précisions sur la modification..."
                className="w-full px-3.5 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
              <div>
                {isAdmin && (
                  !confirmDeleteEditingOp ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteEditingOp(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-xs font-bold text-red-700 cursor-pointer"
                    >
                      <Trash2 size={14} />
                      <span>Supprimer</span>
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleDeleteEditingOp}
                        className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Confirmer suppression
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteEditingOp(false)}
                        className="px-2.5 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
                      >
                        Non
                      </button>
                    </div>
                  )
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingOp(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>Enregistrer les modifications</span>
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Admin : Modification d'un Compte Source (Client / Fournisseur) */}
      {isAdmin && editingSourceAccount && (
        <Modal
          isOpen={Boolean(editingSourceAccount)}
          onClose={() => setEditingSourceAccount(null)}
          title={`Modifier le compte source : ${editingSourceAccount.name}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            <form onSubmit={handleSaveSourceAccount} className="space-y-4">
              {sourceEditSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>{sourceEditSuccess}</span>
                </div>
              )}

              {sourceEditError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{sourceEditError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[11px] bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl px-3 py-2 text-[#7D8176]">
                <span className="font-bold text-[#192A24]">
                  {editingSourceAccount.reference
                    ? `Fiche répertoire ${editingSourceAccount.reference}`
                    : 'Compte détecté dans les mouvements (sera enregistré au répertoire)'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-bold text-[#192A24] mb-1">
                    Nom complet / Raison *
                  </label>
                  <input
                    type="text"
                    required
                    value={sourceEditName}
                    onChange={(e) => setSourceEditName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#192A24] mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={sourceEditPhone}
                    onChange={(e) => setSourceEditPhone(e.target.value)}
                    placeholder="+242..."
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs text-[#192A24]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#192A24] mb-1">Ville</label>
                  <input
                    type="text"
                    value={sourceEditCity}
                    onChange={(e) => setSourceEditCity(e.target.value)}
                    placeholder="Brazzaville, Pointe-Noire..."
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs text-[#192A24]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1.5">
                  Rôles &amp; Typologies du compte
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[...SUPPLIER_ROLES, ...CLIENT_ROLES, ...OTHER_CONTACT_ROLES].map((role) => {
                    const active = sourceEditRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => handleToggleSourceRole(role)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#192A24] text-white border-[#192A24]'
                            : 'bg-[#FAF8F3] text-[#7D8176] border-[#E8D8BE] hover:text-[#192A24]'
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </div>

              {sourceEditName.trim().toLowerCase() !== editingSourceAccount.name.trim().toLowerCase() && (
                <label className="flex items-center gap-2 text-xs text-[#192A24] bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sourceEditRenameLinked}
                    onChange={(e) => setSourceEditRenameLinked(e.target.checked)}
                    className="rounded border-amber-400"
                  />
                  <span>
                    Mettre à jour ce nom automatiquement dans toutes les opérations cash, achats d&apos;or, ventes et devises liés
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingSourceAccount(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>Enregistrer le compte</span>
                </button>
              </div>
            </form>

            {/* Liste des opérations cash liées pour correction / suppression rapide par l'Admin */}
            <div className="border-t border-[#E8D8BE] pt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[#192A24]">
                  Opérations Cash liées ({linkedCashOpsForEditingSource.length})
                </h4>
                <span className="text-[11px] text-[#7D8176]">
                  Modifier ou supprimer une écriture recalcule automatiquement la caisse.
                </span>
              </div>

              {linkedCashOpsForEditingSource.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] text-xs text-[#7D8176] text-center">
                  Aucune opération cash directe (dépôt / retrait / virement) trouvée pour ce compte.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto divide-y divide-[#F3EBDC] border border-[#E8D8BE] rounded-xl bg-[#FFFDF9]">
                  {linkedCashOpsForEditingSource.map((op) => (
                    <div
                      key={op.id}
                      className="p-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#192A24] truncate">{op.title}</div>
                        <div className="text-[11px] text-[#7D8176] truncate">
                          {op.date} · {op.subtitle}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono tabular-nums font-bold ${
                            op.isIncome ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {op.isIncome ? '+' : '-'}
                          {formatMoney(op.amount)} F
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditOp(op)}
                          className="p-1.5 rounded-lg bg-white border border-[#E8D8BE] hover:bg-amber-50 text-[#192A24] cursor-pointer"
                          title="Modifier cette opération"
                        >
                          <Edit3 size={12} />
                        </button>
                        {confirmDeleteLinkedOpId === op.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  store.deleteOperation(op.id);
                                  setConfirmDeleteLinkedOpId(null);
                                } catch (err: unknown) {
                                  setSourceEditError(
                                    err instanceof Error ? err.message : String(err)
                                  );
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Oui
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLinkedOpId(null)}
                              className="px-2 py-1 rounded-lg border border-gray-300 text-[10px] font-bold text-gray-600 cursor-pointer"
                            >
                              Non
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteLinkedOpId(op.id)}
                            className="p-1.5 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-red-700 cursor-pointer"
                            title="Supprimer cette opération"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Admin : Suppression d'un Compte Source */}
      {isAdmin && deletingSourceAccount && (
        <Modal
          isOpen={Boolean(deletingSourceAccount)}
          onClose={() => setDeletingSourceAccount(null)}
          title={`Supprimer le compte source : ${deletingSourceAccount.name}`}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            {sourceDeleteError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{sourceDeleteError}</span>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#192A24]">{deletingSourceAccount.name}</span>
                {deletingSourceAccount.reference && (
                  <span className="font-mono text-[11px] text-[#7D8176]">
                    {deletingSourceAccount.reference}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#7D8176]">
                <div>
                  Cash net :{' '}
                  <strong className="font-mono text-[#192A24]">
                    {deletingSourceAccount.cashDepositNetXaf >= 0 ? '+' : ''}
                    {formatMoney(deletingSourceAccount.cashDepositNetXaf)} F
                  </strong>
                </div>
                <div>
                  Achats or :{' '}
                  <strong className="font-mono text-[#192A24]">
                    {deletingSourceAccount.goldPurchaseCount} lot(s)
                  </strong>
                </div>
                <div>
                  Ventes or :{' '}
                  <strong className="font-mono text-[#192A24]">
                    {deletingSourceAccount.saleCount} vente(s)
                  </strong>
                </div>
                <div>
                  Devises :{' '}
                  <strong className="font-mono text-[#192A24]">
                    {deletingSourceAccount.currencyOpsCount} op(s)
                  </strong>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  sourceDeleteMode === 'detach_only'
                    ? 'bg-amber-50/70 border-[#D39725]'
                    : 'bg-white border-[#E8D8BE] hover:bg-[#FAF8F3]'
                }`}
              >
                <input
                  type="radio"
                  name="sourceDeleteMode"
                  checked={sourceDeleteMode === 'detach_only'}
                  onChange={() => setSourceDeleteMode('detach_only')}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <div className="font-bold text-[#192A24]">
                    Supprimer le compte uniquement (conserver les soldes caisse &amp; banques)
                  </div>
                  <div className="text-[11px] text-[#7D8176] mt-0.5">
                    Supprime la fiche du répertoire et détache ce nom des mouvements existants pour ne plus l&apos;afficher dans les comptes sources tout en préservant la trésorerie.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${
                  sourceDeleteMode === 'purge_all'
                    ? 'bg-red-50 border-red-400'
                    : 'bg-white border-[#E8D8BE] hover:bg-[#FAF8F3]'
                }`}
              >
                <input
                  type="radio"
                  name="sourceDeleteMode"
                  checked={sourceDeleteMode === 'purge_all'}
                  onChange={() => setSourceDeleteMode('purge_all')}
                  className="mt-0.5"
                />
                <div className="text-xs">
                  <div className="font-bold text-red-800 flex items-center gap-1.5">
                    <ShieldAlert size={14} />
                    <span>Supprimer le compte ET toutes ses opérations liées</span>
                  </div>
                  <div className="text-[11px] text-red-700/80 mt-0.5">
                    Efface la fiche, les dépôts/retraits cash, achats, ventes et mouvements de devises associés, et recalcule automatiquement les soldes caisse, banques et coffre devises.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeletingSourceAccount(null)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSourceAccount}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                <span>Confirmer la suppression</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Impression Rapport de la Caisse */}
      {isCaisseReportPrintOpen && (
        <Modal
          isOpen={isCaisseReportPrintOpen}
          onClose={() => setIsCaisseReportPrintOpen(false)}
          title="Rapport de la caisse"
          maxWidth="max-w-4xl"
          printMode={true}
        >
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#192A24] pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[#AA6B0B]">
                  CAMSGOLD · Trésorerie
                </div>
                <h2 className="text-xl font-bold text-[#192A24]">
                  {apercuLedger.hasContactFilter
                    ? `Situation Compte Source · ${selectedContactPosition?.name || contactSearchContext.matchedContact?.name || caisseContact.trim()}`
                    : 'Rapport de la caisse'}
                </h2>
                <div className="text-xs text-[#7D8176] mt-0.5">
                  Trésorerie :{' '}
                  <strong className="text-[#192A24]">
                    {apercuLedger.hasContactFilter && contactAllAccounts ? 'Tous comptes' : caisseSourceAccount}
                  </strong>
                  {apercuLedger.hasContactFilter ? (
                    <>
                      {' · '}Compte Source :{' '}
                      <strong className="text-[#192A24]">
                        {selectedContactPosition?.name || contactSearchContext.matchedContact?.name || caisseContact.trim()}
                      </strong>
                      {contactSearchContext.matchedContact?.phone
                        ? ` (${contactSearchContext.matchedContact.phone})`
                        : ''}
                      {contactSearchContext.matchedContact?.reference
                        ? ` · ${contactSearchContext.matchedContact.reference}`
                        : ''}
                    </>
                  ) : null}
                  {' · '}Édité le {formatDateTime(new Date())}
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-[11px] text-[#7D8176]">
                  {apercuLedger.hasContactFilter && selectedContactPosition
                    ? selectedContactPosition.netPositionXaf >= 0
                      ? 'Possède chez nous / On doit'
                      : 'Le contact nous doit'
                    : apercuLedger.hasContactFilter
                    ? 'Solde net contact'
                    : 'Solde actuel du compte'}
                </div>
                <div className="text-lg font-mono tabular-nums font-bold text-[#192A24]">
                  {apercuLedger.hasContactFilter &&
                  (selectedContactPosition
                    ? selectedContactPosition.netPositionXaf
                    : apercuLedger.netBalance) >= 0
                    ? '+'
                    : ''}
                  {formatMoney(
                    apercuLedger.hasContactFilter && selectedContactPosition
                      ? selectedContactPosition.netPositionXaf
                      : apercuLedger.hasContactFilter
                      ? apercuLedger.netBalance
                      : store.bankBalances[caisseSourceAccount] ?? 0
                  )}{' '}
                  FCFA
                </div>
              </div>
            </div>

            {/* Synthèse */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAF8F3] border border-[#E8D8BE] rounded-xl p-4">
              <div>
                <div className="text-[11px] text-[#7D8176]">Total Dépôts</div>
                <div className="text-sm font-mono tabular-nums font-bold text-emerald-700">
                  +{formatMoney(apercuLedger.totalDepot)} FCFA
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7D8176]">Total Retraits</div>
                <div className="text-sm font-mono tabular-nums font-bold text-red-700">
                  -{formatMoney(apercuLedger.totalRetrait)} FCFA
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7D8176]">Dont Dépenses OPEX</div>
                <div className="text-sm font-mono tabular-nums font-bold text-[#192A24]">
                  {formatMoney(apercuLedger.totalOpex)} FCFA
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#7D8176]">Cash net (Dépôt − Retrait)</div>
                <div
                  className={`text-sm font-mono tabular-nums font-bold ${
                    apercuLedger.netBalance < 0 ? 'text-red-700' : 'text-emerald-700'
                  }`}
                >
                  {apercuLedger.netBalance >= 0 ? '+' : ''}
                  {formatMoney(apercuLedger.netBalance)} FCFA
                </div>
              </div>
            </div>

            {apercuLedger.hasContactFilter && selectedContactPosition && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-[#E8D8BE] rounded-xl p-3 text-xs">
                <div>
                  <span className="text-[11px] text-[#7D8176] block">Achats d&apos;Or (On doit)</span>
                  <strong className="text-[#192A24]">
                    {selectedContactPosition.goldPurchaseCount} lot(s) ·{' '}
                    {formatNumber(selectedContactPosition.goldTotalWeightGrams, 2)} g ·{' '}
                    {formatMoney(selectedContactPosition.goldTotalAmountXaf)} FCFA
                  </strong>
                  {selectedContactPosition.goldRemainingXaf > 0 && (
                    <span className="ml-2 text-red-700 font-bold">
                      (Reste dû : {formatMoney(selectedContactPosition.goldRemainingXaf)} F)
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-[#7D8176] block">Ventes d&apos;Or (Nous doit)</span>
                  <strong className="text-[#192A24]">
                    {selectedContactPosition.saleCount} vente(s) ·{' '}
                    {formatNumber(selectedContactPosition.salesPureGrams, 2)} g ·{' '}
                    {formatMoney(selectedContactPosition.salesTotalXaf)} FCFA
                  </strong>
                  {selectedContactPosition.salesRemainingXaf > 0 && (
                    <span className="ml-2 text-red-700 font-bold">
                      (Nous doit : {formatMoney(selectedContactPosition.salesRemainingXaf)} F)
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-[#7D8176] block">Devises &amp; Prêts</span>
                  <strong className="text-[#192A24]">
                    {selectedContactPosition.currencyOpsCount} op(s) ·{' '}
                    {formatMoney(selectedContactPosition.currencyTotalXaf)} FCFA
                  </strong>
                  {(selectedContactPosition.loansWeOweXaf > 0 ||
                    selectedContactPosition.loansOwedToUsXaf > 0) && (
                    <span className="ml-2 text-[#AA6B0B] font-bold">
                      (Prêt net :{' '}
                      {formatMoney(
                        selectedContactPosition.loansWeOweXaf - selectedContactPosition.loansOwedToUsXaf
                      )}{' '}
                      F)
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Tableau Compte en T complet */}
            <div className="border border-[#E8D8BE] rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 border-b border-[#E8D8BE] bg-[#FAF8F3] text-xs font-bold text-[#192A24]">
                <div className="py-2.5 px-3 border-r border-[#E8D8BE] flex items-center justify-between">
                  <span>Dépôt ({apercuLedger.deposits.length})</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    +{formatMoney(apercuLedger.totalDepot)} F
                  </span>
                </div>
                <div className="py-2.5 px-3 flex items-center justify-between">
                  <span>Retrait ({apercuLedger.withdrawals.length})</span>
                  <span className="font-mono tabular-nums text-red-700">
                    -{formatMoney(apercuLedger.totalRetrait)} F
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2">
                <div className="border-r border-[#E8D8BE] divide-y divide-[#F3EBDC]">
                  {apercuLedger.deposits.length === 0 ? (
                    <div className="p-4 text-xs text-[#7D8176] text-center">Aucun dépôt</div>
                  ) : (
                    apercuLedger.deposits.map((item) => (
                      <div key={item.id} className="p-2.5 flex items-baseline justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#192A24] truncate">{item.contact}</div>
                          <div className="text-[11px] text-[#7D8176] truncate">
                            {item.date} · {item.motif}
                            {apercuLedger.hasContactFilter && contactAllAccounts && item.account
                              ? ` · ${item.account}`
                              : ''}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                          +{formatMoney(item.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                <div className="divide-y divide-[#F3EBDC]">
                  {apercuLedger.withdrawals.length === 0 ? (
                    <div className="p-4 text-xs text-[#7D8176] text-center">Aucun retrait</div>
                  ) : (
                    apercuLedger.withdrawals.map((item) => (
                      <div key={item.id} className="p-2.5 flex items-baseline justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold text-[#192A24] truncate">
                            {item.isOpex ? `OPEX · ${item.contact}` : item.contact}
                          </div>
                          <div className="text-[11px] text-[#7D8176] truncate">
                            {item.date} · {item.motif}
                            {apercuLedger.hasContactFilter && contactAllAccounts && item.account
                              ? ` · ${item.account}`
                              : ''}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-red-700 shrink-0">
                          -{formatMoney(item.amount)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 print:hidden">
              <button
                type="button"
                onClick={() => setIsCaisseReportPrintOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer"
              >
                <Printer size={15} />
                <span>Imprimer le rapport</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Régler le Solde d'un Compte Source (lié à la Caisse Dépôt / Retrait) */}
      {canDepotRetrait && settlingSourceAccount && (
        <Modal
          isOpen={Boolean(settlingSourceAccount)}
          onClose={() => setSettlingSourceAccount(null)}
          title={`Régler le solde · ${settlingSourceAccount.name}`}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSubmitSettleSourceAccount} className="space-y-4">
            {settleError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{settleError}</span>
              </div>
            )}

            {/* Synthèse du compte source */}
            <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-[#192A24]">{settlingSourceAccount.name}</span>
                  {settlingSourceAccount.reference && (
                    <span className="ml-1.5 font-mono text-[11px] text-[#7D8176]">
                      · {settlingSourceAccount.reference}
                    </span>
                  )}
                </div>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${
                    settlingSourceAccount.netPositionXaf > 0
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : settlingSourceAccount.netPositionXaf < 0
                      ? 'bg-red-50 text-red-800 border border-red-200'
                      : 'bg-white text-[#7D8176] border border-[#E8D8BE]'
                  }`}
                >
                  Net :{' '}
                  {settlingSourceAccount.netPositionXaf > 0
                    ? `+${formatMoney(settlingSourceAccount.netPositionXaf)}`
                    : settlingSourceAccount.netPositionXaf < 0
                    ? `-${formatMoney(Math.abs(settlingSourceAccount.netPositionXaf))}`
                    : '0'}{' '}
                  F
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                  <div className="text-[#7D8176]">Dépôts − Retraits</div>
                  <div
                    className={`font-mono font-bold ${
                      settlingSourceAccount.cashDepositNetXaf >= 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    }`}
                  >
                    {settlingSourceAccount.cashDepositNetXaf >= 0 ? '+' : ''}
                    {formatMoney(settlingSourceAccount.cashDepositNetXaf)} F
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                  <div className="text-[#7D8176]">Achats Or (On doit)</div>
                  <div className="font-mono font-bold text-[#AA6B0B]">
                    {formatMoney(settlingSourceAccount.goldRemainingXaf)} F
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                  <div className="text-[#7D8176]">Ventes Or (Nous doit)</div>
                  <div className="font-mono font-bold text-red-700">
                    {formatMoney(settlingSourceAccount.salesRemainingXaf)} F
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white border border-[#EFE6D5]">
                  <div className="text-[#7D8176]">Devises &amp; Prêts</div>
                  <div className="font-mono font-bold text-[#192A24]">
                    {settlingSourceAccount.currencyWeOweXaf + settlingSourceAccount.loansWeOweXaf > 0
                      ? `Dû +${formatMoney(settlingSourceAccount.currencyWeOweXaf + settlingSourceAccount.loansWeOweXaf)} F`
                      : settlingSourceAccount.currencyOwedToUsXaf + settlingSourceAccount.loansOwedToUsXaf > 0
                      ? `À enc. -${formatMoney(settlingSourceAccount.currencyOwedToUsXaf + settlingSourceAccount.loansOwedToUsXaf)} F`
                      : '0 F'}
                  </div>
                </div>
              </div>
            </div>

            {/* Sens de l'opération Caisse : Retrait (On paie) vs Dépôt (On encaisse) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleChangeSettleDirection('pay_out')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  settleDirection === 'pay_out'
                    ? 'bg-[#DC2626] text-white border-[#DC2626]'
                    : 'bg-[#FAF8F3] text-[#192A24] border-[#E8D8BE] hover:bg-red-50'
                }`}
              >
                <ArrowUpRight size={15} />
                <span>Retrait / Dépôt fournisseur (On paie)</span>
              </button>
              <button
                type="button"
                onClick={() => handleChangeSettleDirection('collect_in')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  settleDirection === 'collect_in'
                    ? 'bg-[#008B62] text-white border-[#008B62]'
                    : 'bg-[#FAF8F3] text-[#192A24] border-[#E8D8BE] hover:bg-emerald-50'
                }`}
              >
                <ArrowDownLeft size={15} />
                <span>Dépôt Caisse (On encaisse)</span>
              </button>
            </div>

            {/* Cible du règlement */}
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Opération / Solde à régler
              </label>
              <select
                value={settleTargetKey}
                onChange={(e) => {
                  const key = e.target.value;
                  setSettleTargetKey(key);
                  const activeList =
                    settleDirection === 'pay_out'
                      ? settlingOpenItems.payables
                      : settlingOpenItems.receivables;
                  const found = activeList.find((i) => i.key === key);
                  if (found) {
                    setSettleAmount(String(found.remainingXaf));
                  } else if (key === 'AUTO') {
                    const tot =
                      settleDirection === 'pay_out'
                        ? settlingOpenItems.totalPayablesXaf
                        : settlingOpenItems.totalReceivablesXaf;
                    if (tot > 0) setSettleAmount(String(tot));
                  } else if (key === 'cash_balance') {
                    const cashVal =
                      settleDirection === 'pay_out'
                        ? Math.max(0, settlingSourceAccount.cashDepositNetXaf)
                        : Math.max(0, -settlingSourceAccount.cashDepositNetXaf);
                    if (cashVal > 0) setSettleAmount(String(cashVal));
                    if (settleMode === 'compensate_cash_balance') {
                      setSettleMode('cash_movement');
                    }
                  }
                }}
                className="w-full px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
              >
                {(settleDirection === 'pay_out'
                  ? settlingOpenItems.payables
                  : settlingOpenItems.receivables
                ).length > 0 && (
                  <option value="AUTO">
                    Tous les soldes ouverts (FIFO ·{' '}
                    {formatMoney(
                      settleDirection === 'pay_out'
                        ? settlingOpenItems.totalPayablesXaf
                        : settlingOpenItems.totalReceivablesXaf
                    )}{' '}
                    FCFA)
                  </option>
                )}
                {(settleDirection === 'pay_out'
                  ? settlingOpenItems.payables
                  : settlingOpenItems.receivables
                ).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label} — {item.sublabel}
                  </option>
                ))}
                <option value="cash_balance">
                  {settleDirection === 'pay_out'
                    ? 'Retrait direct sur le compte cash (Rembourser dépôt confié)'
                    : 'Dépôt direct sur le compte cash (Encaisser avance / régularisation)'}
                </option>
              </select>
            </div>

            {/* Mode : Mouvement Caisse réel OU Compensation sur solde Dépôt/Retrait existant */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#192A24]">
                Mode d&apos;exécution
              </label>
              <div className="grid grid-cols-1 gap-2">
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs ${
                    settleMode === 'cash_movement'
                      ? 'bg-amber-50/70 border-[#D39725]'
                      : 'bg-white border-[#E8D8BE]'
                  }`}
                >
                  <input
                    type="radio"
                    name="settleMode"
                    checked={settleMode === 'cash_movement'}
                    onChange={() => setSettleMode('cash_movement')}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-bold text-[#192A24]">
                      Via Caisse / Banque ({settleDirection === 'collect_in' ? 'Dépôt réel' : 'Retrait réel'})
                    </div>
                    <div className="text-[11px] text-[#7D8176]">
                      Enregistre le {settleDirection === 'collect_in' ? 'dépôt' : 'retrait'} dans l&apos;historique de Caisse, met à jour la trésorerie et solde le compte source.
                    </div>
                  </div>
                </label>

                {settleTargetKey !== 'cash_balance' &&
                  ((settleDirection === 'collect_in' &&
                    settlingSourceAccount.cashDepositNetXaf > 0 &&
                    settlingOpenItems.totalReceivablesXaf > 0) ||
                    (settleDirection === 'pay_out' &&
                      settlingSourceAccount.cashDepositNetXaf < 0 &&
                      settlingOpenItems.totalPayablesXaf > 0)) && (
                    <label
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs ${
                        settleMode === 'compensate_cash_balance'
                          ? 'bg-emerald-50/80 border-emerald-500'
                          : 'bg-white border-[#E8D8BE]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="settleMode"
                        checked={settleMode === 'compensate_cash_balance'}
                        onChange={() => {
                          setSettleMode('compensate_cash_balance');
                          const maxComp = Math.min(
                            Math.abs(settlingSourceAccount.cashDepositNetXaf),
                            settleDirection === 'collect_in'
                              ? settlingOpenItems.totalReceivablesXaf
                              : settlingOpenItems.totalPayablesXaf
                          );
                          if (maxComp > 0) setSettleAmount(String(maxComp));
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-bold text-emerald-900">
                          Compenser avec le solde Cash déjà{' '}
                          {settleDirection === 'collect_in' ? 'déposé (+' : 'avancé (-'}
                          {formatMoney(Math.abs(settlingSourceAccount.cashDepositNetXaf))} F)
                        </div>
                        <div className="text-[11px] text-emerald-800/80">
                          Impute la facture sur son solde cash en caisse sans nouvelle sortie/entrée physique d&apos;argent.
                        </div>
                      </div>
                    </label>
                  )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {settleMode === 'cash_movement' && (
                <div>
                  <label className="block text-xs font-bold text-[#192A24] mb-1">
                    Compte Caisse / Banque *
                  </label>
                  <select
                    value={settleAccount}
                    onChange={(e) => setSettleAccount(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                  >
                    {Object.entries(store.bankBalances).map(([accName, bal]) => (
                      <option key={accName} value={accName}>
                        {accName} ({formatMoney(bal)} F)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={settleMode === 'compensate_cash_balance' ? 'sm:col-span-2' : ''}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-[#192A24]">Montant (FCFA) *</label>
                  <div className="flex items-center gap-2 text-[10px]">
                    {settlingSourceAccount.netPositionXaf !== 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSettleAmount(String(Math.abs(settlingSourceAccount.netPositionXaf)))
                        }
                        className="font-bold text-[#9E731B] hover:underline cursor-pointer"
                      >
                        Solde net ({formatMoney(Math.abs(settlingSourceAccount.netPositionXaf))})
                      </button>
                    )}
                    {((settleDirection === 'pay_out' && settlingOpenItems.totalPayablesXaf > 0) ||
                      (settleDirection === 'collect_in' &&
                        settlingOpenItems.totalReceivablesXaf > 0)) && (
                      <button
                        type="button"
                        onClick={() =>
                          setSettleAmount(
                            String(
                              settleDirection === 'pay_out'
                                ? settlingOpenItems.totalPayablesXaf
                                : settlingOpenItems.totalReceivablesXaf
                            )
                          )
                        }
                        className="font-bold text-[#192A24] hover:underline cursor-pointer"
                      >
                        Total dû
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full px-3.5 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] font-mono tabular-nums font-bold text-sm text-[#192A24]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">Date</label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-mono text-[#192A24]"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[#192A24] mb-1">Motif / Note</label>
                <input
                  type="text"
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  placeholder="ex: Règlement solde depuis la caisse..."
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs text-[#192A24]"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  const pos = settlingSourceAccount;
                  setCaisseContact(pos.name);
                  setApercuFilterByContact(true);
                  setCaisseSourceAccount(settleAccount);
                  setCaisseAmount(settleAmount);
                  setCaisseMotif(settleNote || 'Règlement solde');
                  setCaisseOpexMode(false);
                  setCaisseSettlementTarget(
                    settleTargetKey === 'cash_balance' ? 'FREE' : settleTargetKey
                  );
                  setSettlingSourceAccount(null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="px-3 py-2 rounded-xl bg-[#FAF8F3] hover:bg-amber-50 border border-[#E8D8BE] text-[11px] font-bold text-[#192A24] cursor-pointer"
              >
                Précharger dans Dépôt / Retrait
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSettlingSourceAccount(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white text-xs font-black shadow-md cursor-pointer flex items-center gap-1.5 ${
                    settleDirection === 'collect_in'
                      ? 'bg-[#008B62] hover:bg-[#007452]'
                      : 'bg-[#192A24] hover:bg-[#253D34]'
                  }`}
                >
                  <CheckCircle2 size={15} />
                  <span>
                    {settleMode === 'compensate_cash_balance'
                      ? 'Valider la compensation'
                      : settleDirection === 'collect_in'
                      ? 'Valider Dépôt & Régler'
                      : 'Valider Retrait & Régler'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
