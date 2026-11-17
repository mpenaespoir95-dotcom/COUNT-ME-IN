import React, { useState, useEffect, useMemo } from 'react';
import {
  Handshake,
  Users,
  Coins,
  FileText,
  Plus,
  Flame,
  DollarSign,
  Wallet,
  Search,
  X,
  Download,
  Share2,
  Printer,
  Copy,
  Check,
  TrendingUp,
  ArrowLeftRight,
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
} from 'lucide-react';
import { useAppStore } from '../../context/AppContext';
import { AppPanel, Modal, PageHeading, SectionHeading } from '../common/UIComponents';
import { formatMoney, formatNumber, formatDate, formatDateTime } from '../../utils/goldMath';
import { numberToWordsFr } from '../../utils/numberToWordsFr';
import {
  getPartnershipInvestments,
  buildPartnershipContractWhatsAppMessage,
  downloadPartnershipContractPdf,
  sharePartnershipContract,
  getMovementTypeTitle,
  getMovementCashDelta,
  PartnershipSummarySnapshot,
  buildPartnershipMovementWhatsAppMessage,
  downloadPartnershipMovementPdf,
  sharePartnershipMovement,
  buildPartnershipSummaryWhatsAppMessage,
  downloadPartnershipSummaryPdf,
  sharePartnershipSummary,
} from '../../utils/partnershipSlipPdf';
import {
  Partnership,
  Partner,
  PartnershipCashMovement,
  PartnershipScenario,
  PartnershipCashMovementType,
  RemunerationMethod,
  PartnershipLoanDirection,
  PARTNERSHIP_SCENARIO_LABELS,
  PARTNERSHIP_STATUS_LABELS,
  PARTNERSHIP_LOAN_DIRECTION_LABELS,
} from '../../types';

type CashHistoryFilter = 'ALL' | 'CAMS GOLD' | 'PARTNER' | 'PURCHASE' | 'SALE' | 'EXPENSE';

export const PartnershipsScreen: React.FC = () => {
  const store = useAppStore();
  const canContracts = store.canAccessService(4, 'partners.contracts');
  const canLoans = store.canAccessService(4, 'partners.loans');
  const canCash = store.canAccessService(4, 'partners.cash');
  const canDirectory = store.canAccessService(4, 'partners.directory');

  const allowedTabs = [
    ...(canCash ? ['cash' as const] : []),
    ...(canContracts ? ['contracts' as const] : []),
    ...(canLoans ? ['loans' as const] : []),
    ...(canDirectory ? ['partners' as const] : []),
  ];

  const [activeTab, setActiveTab] = useState<'contracts' | 'partners' | 'loans' | 'cash'>(
    () => allowedTabs[0] ?? 'cash'
  );

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [canContracts, canLoans, canCash, canDirectory]);

  // New Contract Modal
  const [showNewContractModal, setShowNewContractModal] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<PartnershipScenario>('financialPurchase');
  const [selectedRemuneration] = useState<RemunerationMethod>('contractualProfitShares');
  const [remunerationVal, setRemunerationVal] = useState('40');
  const [contractNote, setContractNote] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState(store.partners[0]?.id || '');
  const [companyFinancialContrib, setCompanyFinancialContrib] = useState('');
  const [financialContrib, setFinancialContrib] = useState('');
  const [creditCashOnContractCreate, setCreditCashOnContractCreate] = useState(true);

  // New Loan Modal
  const [showNewLoanModal, setShowNewLoanModal] = useState(false);
  const [loanPartnerId, setLoanPartnerId] = useState(store.partners[0]?.id || '');
  const [loanDirection, setLoanDirection] = useState<PartnershipLoanDirection>('companyBorrows');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanDueDate, setLoanDueDate] = useState('');
  const [loanNote, setLoanNote] = useState('');

  // New Partner Modal
  const [showNewPartnerModal, setShowNewPartnerModal] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerCity, setPartnerCity] = useState('');
  const [partnerType, setPartnerType] = useState('Investisseur');

  // Repayment Modal
  const [repayingLoanId, setRepayingLoanId] = useState<string | null>(null);
  const [repaymentAmount, setRepaymentAmount] = useState('');
  const [repaymentNote, setRepaymentNote] = useState('');

  // Cash Movement Modal (Apport financement + Opération unifiée : 1. Achat d'or -> 2. Dépense -> 3. Vente d'or)
  const [showCashMovementModal, setShowCashMovementModal] = useState(false);
  const [cashModalMode, setCashModalMode] = useState<'all' | 'operation' | 'contribution'>('all');
  const [cashModalView, setCashModalView] = useState<'operation' | 'contribution'>('operation');
  const [cashContributor, setCashContributor] = useState<'CAMS GOLD' | 'partner'>('partner');
  const [selectedCashPartnerId, setSelectedCashPartnerId] = useState(
    () => store.partners.find((partner) => partner.isActive)?.id || store.partners[0]?.id || ''
  );
  const [cashPartnerSearch, setCashPartnerSearch] = useState('');
  const [cashHistoryFilter, setCashHistoryFilter] = useState<CashHistoryFilter>('ALL');
  const [cashPartnerId, setCashPartnerId] = useState(
    () => store.partners.find((partner) => partner.isActive)?.id || store.partners[0]?.id || ''
  );
  // Champs Apport financement
  const [cashAmount, setCashAmount] = useState('');
  const [cashDescription, setCashDescription] = useState('');
  const [cashCounterparty, setCashCounterparty] = useState('');
  const [cashPaymentMode, setCashPaymentMode] = useState('Espèces caisse partenaire');
  const [cashContractRef, setCashContractRef] = useState('');
  // Champs Opération unifiée — 1. Achats d'or
  const [opBuyAmount, setOpBuyAmount] = useState('');
  const [opBuyWeight, setOpBuyWeight] = useState('');
  const [opBuyKarat, setOpBuyKarat] = useState('24');
  const [opBuyCounterparty, setOpBuyCounterparty] = useState('');
  const [opBuyPaymentMode, setOpBuyPaymentMode] = useState('Espèces caisse partenaire');
  const [opBuyDescription, setOpBuyDescription] = useState('');
  // Champs Opération unifiée — 2. Dépense
  const [opExpenseAmount, setOpExpenseAmount] = useState('');
  const [opExpenseDescription, setOpExpenseDescription] = useState('');
  const [opExpenseCounterparty, setOpExpenseCounterparty] = useState('');
  const [opExpensePaymentMode, setOpExpensePaymentMode] = useState('Espèces caisse partenaire');
  // Champs Opération unifiée — 3. Vente d'or
  const [opSellAmount, setOpSellAmount] = useState('');
  const [opSellWeight, setOpSellWeight] = useState('');
  const [opSellKarat, setOpSellKarat] = useState('24');
  const [opSellCounterparty, setOpSellCounterparty] = useState('');
  const [opSellPaymentMode, setOpSellPaymentMode] = useState('Espèces caisse partenaire');
  const [opSellDescription, setOpSellDescription] = useState('');

  const [openSlipAfterSave, setOpenSlipAfterSave] = useState(true);
  const [cashMovementError, setCashMovementError] = useState<string | null>(null);

  // Bordereaux Modals (Contrat, Opération & Récapitulatif complet)
  const [viewingContract, setViewingContract] = useState<Partnership | null>(null);
  const [viewingMovement, setViewingMovement] = useState<{
    movement: PartnershipCashMovement;
    partner: Partner | null;
    balanceAfter: number;
  } | null>(null);
  const [viewingSummaryPartner, setViewingSummaryPartner] = useState<Partner | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => {
      setShareToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const getPartnerContracts = (partner: Partner) => {
    const partnerNameLower = partner.name.trim().toLowerCase();
    return store.partnerships.filter((p) =>
      p.members.some(
        (m) =>
          m.partnerId === partner.id ||
          (!m.isCompany && m.name.trim().toLowerCase() === partnerNameLower)
      )
    );
  };

  const getPartnerCashStats = (partner: Partner) => {
    const partnerNameLower = partner.name.trim().toLowerCase();
    const movements = store.partnershipCashMovements.filter(
      (movement) =>
        movement.partnerId === partner.id ||
        (!movement.partnerId && movement.partnerName?.trim().toLowerCase() === partnerNameLower)
    );

    const balance = movements.reduce(
      (sum, movement) => sum + getMovementCashDelta(movement),
      0
    );
    const camsGoldContrib = movements.reduce(
      (sum, movement) =>
        sum + (movement.type === 'contribution' && movement.contributor === 'CAMS GOLD' ? movement.amountXaf : 0),
      0
    );
    const partnerContrib = movements.reduce(
      (sum, movement) =>
        sum + (movement.type === 'contribution' && movement.contributor !== 'CAMS GOLD' ? movement.amountXaf : 0),
      0
    );
    const purchasesTotal = movements.reduce(
      (sum, movement) => sum + (movement.type === 'goldPurchase' ? movement.amountXaf : 0),
      0
    );
    const salesTotal = movements.reduce(
      (sum, movement) => sum + (movement.type === 'goldSale' ? movement.amountXaf : 0),
      0
    );
    const expensesTotal = movements.reduce(
      (sum, movement) =>
        sum + (movement.type === 'expense' ? movement.amountXaf : movement.expenseAmountXaf || 0),
      0
    );
    const purchasedGrams = movements.reduce(
      (sum, movement) => sum + (movement.type === 'goldPurchase' ? movement.weightGrams || 0 : 0),
      0
    );
    const soldGrams = movements.reduce(
      (sum, movement) => sum + (movement.type === 'goldSale' ? movement.weightGrams || 0 : 0),
      0
    );
    const fineGoldGrams = movements.reduce((weight, movement) => {
      if (movement.type !== 'goldPurchase' && movement.type !== 'goldSale') return weight;
      const fineWeight = ((movement.weightGrams || 0) * (movement.karat || 0)) / 24;
      return weight + (movement.type === 'goldPurchase' ? fineWeight : -fineWeight);
    }, 0);

    const partnerContracts = getPartnerContracts(partner);
    const contractCompanyInvested = partnerContracts.reduce(
      (sum, c) => sum + getPartnershipInvestments(c).companyInvestmentXaf,
      0
    );
    const contractPartnerInvested = partnerContracts.reduce(
      (sum, c) => sum + getPartnershipInvestments(c).partnerInvestmentXaf,
      0
    );

    const benefitTotal = salesTotal - purchasesTotal - expensesTotal;
    const activeContract = partnerContracts[0];
    const partnerProfitSharePct = activeContract
      ? getPartnershipInvestments(activeContract).partnerProfitPct
      : 50;
    const companyProfitSharePct = Math.max(0, 100 - partnerProfitSharePct);
    const partnerProfitAmount = Math.round((benefitTotal * partnerProfitSharePct) / 100);
    const companyProfitAmount = benefitTotal - partnerProfitAmount;

    return {
      movements,
      contracts: partnerContracts,
      balance,
      camsGoldContrib,
      partnerContrib,
      totalContributions: camsGoldContrib + partnerContrib,
      contractCompanyInvested,
      contractPartnerInvested,
      purchasesTotal,
      salesTotal,
      expensesTotal,
      purchasedGrams,
      soldGrams,
      fineGoldGrams,
      benefitTotal,
      partnerProfitSharePct,
      companyProfitSharePct,
      partnerProfitAmount,
      companyProfitAmount,
    };
  };

  const toSummarySnapshot = (
    stats: ReturnType<typeof getPartnerCashStats>
  ): PartnershipSummarySnapshot => ({
    balance: stats.balance,
    camsGoldContrib: stats.camsGoldContrib,
    partnerContrib: stats.partnerContrib,
    purchasesTotal: stats.purchasesTotal,
    salesTotal: stats.salesTotal,
    expensesTotal: stats.expensesTotal,
    benefitTotal: stats.benefitTotal,
    partnerProfitSharePct: stats.partnerProfitSharePct,
    companyProfitSharePct: stats.companyProfitSharePct,
    partnerProfitAmount: stats.partnerProfitAmount,
    companyProfitAmount: stats.companyProfitAmount,
    fineGoldGrams: stats.fineGoldGrams,
  });

  // Global summary strictly limited to Partner operations (ce qui concerne les partenaires uniquement)
  const globalPartnerSummary = useMemo(() => {
    let totalBalance = 0;
    let totalCamsInvested = 0;
    let totalPartnerInvested = 0;
    let totalPurchases = 0;
    let totalSales = 0;
    let totalExpenses = 0;

    store.partnershipCashMovements.forEach((m) => {
      const attachedExpense = m.expenseAmountXaf || 0;
      if (m.type === 'contribution') {
        totalBalance += m.amountXaf;
        if (m.contributor === 'CAMS GOLD') {
          totalCamsInvested += m.amountXaf;
        } else {
          totalPartnerInvested += m.amountXaf;
        }
      } else if (m.type === 'goldSale') {
        totalBalance += m.amountXaf - attachedExpense;
        totalSales += m.amountXaf;
        totalExpenses += attachedExpense;
      } else if (m.type === 'goldPurchase') {
        totalBalance -= m.amountXaf + attachedExpense;
        totalPurchases += m.amountXaf;
        totalExpenses += attachedExpense;
      } else if (m.type === 'expense') {
        totalBalance -= m.amountXaf;
        totalExpenses += m.amountXaf;
      }
    });

    // If contracts record initial investments not yet mirrored in cash movements, also expose contract totals
    const totalContractCompanyInvested = store.partnerships.reduce(
      (sum, p) => sum + getPartnershipInvestments(p).companyInvestmentXaf,
      0
    );
    const totalContractPartnerInvested = store.partnerships.reduce(
      (sum, p) => sum + getPartnershipInvestments(p).partnerInvestmentXaf,
      0
    );

    const netBenefit = totalSales - totalPurchases - totalExpenses;

    return {
      totalBalance,
      totalCamsInvested: Math.max(totalCamsInvested, totalContractCompanyInvested),
      totalPartnerInvested: Math.max(totalPartnerInvested, totalContractPartnerInvested),
      totalCamsCashOnly: totalCamsInvested,
      totalPartnerCashOnly: totalPartnerInvested,
      totalPurchases,
      totalSales,
      totalExpenses,
      netBenefit,
    };
  }, [store.partnershipCashMovements, store.partnerships]);

  const normalizedPartnerSearch = cashPartnerSearch.trim().toLowerCase();
  const filteredCashPartners = store.partners.filter((partner) => {
    if (!normalizedPartnerSearch) return true;
    return [partner.name, partner.phone, partner.city, partner.type]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(normalizedPartnerSearch));
  });

  useEffect(() => {
    if (store.partners.length === 0) return;
    if (!selectedPartnerId || !store.partners.some((p) => p.id === selectedPartnerId)) {
      setSelectedPartnerId(store.partners[0].id);
    }
    if (!loanPartnerId || !store.partners.some((p) => p.id === loanPartnerId)) {
      setLoanPartnerId(store.partners[0].id);
    }
  }, [store.partners, selectedPartnerId, loanPartnerId]);

  useEffect(() => {
    if (filteredCashPartners.length === 0) return;
    if (!filteredCashPartners.some((partner) => partner.id === selectedCashPartnerId)) {
      setSelectedCashPartnerId(filteredCashPartners[0].id);
    }
  }, [cashPartnerSearch, store.partners.length]);

  const selectedCashPartner =
    store.partners.find((partner) => partner.id === selectedCashPartnerId) ||
    filteredCashPartners[0] ||
    store.partners[0] ||
    null;

  const selectedPartnerStats = selectedCashPartner
    ? getPartnerCashStats(selectedCashPartner)
    : null;

  const modalPartner = store.partners.find((item) => item.id === cashPartnerId) || selectedCashPartner;
  const modalPartnerBalance = modalPartner ? getPartnerCashStats(modalPartner).balance : 0;
  const modalPartnerContracts = modalPartner ? getPartnerContracts(modalPartner) : [];

  const parseDecimalInput = (raw: string): number => {
    const cleaned = raw.trim().replace(/\s+/g, '').replace(',', '.');
    if (!cleaned) return Number.NaN;
    return Number.parseFloat(cleaned);
  };

  const resetCashModalFields = () => {
    setCashAmount('');
    setCashDescription('');
    setCashCounterparty('');
    setCashPaymentMode('Espèces caisse partenaire');
    setCashContractRef('');
    setOpBuyAmount('');
    setOpBuyWeight('');
    setOpBuyKarat('24');
    setOpBuyCounterparty('');
    setOpBuyPaymentMode('Espèces caisse partenaire');
    setOpBuyDescription('');
    setOpExpenseAmount('');
    setOpExpenseDescription('');
    setOpExpenseCounterparty('');
    setOpExpensePaymentMode('Espèces caisse partenaire');
    setOpSellAmount('');
    setOpSellWeight('');
    setOpSellKarat('24');
    setOpSellCounterparty('');
    setOpSellPaymentMode('Espèces caisse partenaire');
    setOpSellDescription('');
    setCashMovementError(null);
  };

  const openQuickCashModal = (
    type: PartnershipCashMovementType,
    contributor: 'CAMS GOLD' | 'partner' = 'partner',
    partnerIdOverride?: string,
    mode: 'all' | 'operation' | 'contribution' = 'all'
  ) => {
    const targetId = partnerIdOverride || selectedCashPartner?.id || store.partners[0]?.id || '';
    setCashPartnerId(targetId);
    setCashModalMode(mode);
    setCashModalView(type === 'contribution' && mode !== 'operation' ? 'contribution' : 'operation');
    setCashContributor(contributor);
    resetCashModalFields();
    setShowCashMovementModal(true);
  };

  const handleCreateCashMovement = (event: React.FormEvent) => {
    event.preventDefault();
    setCashMovementError(null);
    const partner = store.partners.find((item) => item.id === cashPartnerId && item.isActive);

    if (!partner) {
      setCashMovementError('Sélectionnez un partenaire actif pour sa caisse.');
      return;
    }

    const prevStats = getPartnerCashStats(partner);

    if (cashModalView === 'contribution') {
      const amountXaf = parseDecimalInput(cashAmount);
      if (!Number.isFinite(amountXaf) || amountXaf <= 0) {
        setCashMovementError('Saisissez un montant d’apport supérieur à zéro.');
        return;
      }

      const defaultContribDesc =
        cashContributor === 'CAMS GOLD'
          ? `Apport entreprise CAMS GOLD · Caisse ${partner.name}`
          : `Apport financement partenaire · ${partner.name}`;

      try {
        const created = store.addPartnershipCashMovement({
          type: 'contribution',
          amountXaf,
          description: cashDescription.trim() || defaultContribDesc,
          partnerId: partner.id,
          partnerName: partner.name,
          contributor: cashContributor,
          counterpartyName: cashCounterparty.trim() || undefined,
          paymentMode: cashPaymentMode.trim() || undefined,
          contractRef: cashContractRef.trim() || undefined,
        });

        setSelectedCashPartnerId(partner.id);
        setShowCashMovementModal(false);
        resetCashModalFields();

        if (openSlipAfterSave) {
          setViewingMovement({
            movement: created,
            partner,
            balanceAfter: prevStats.balance + amountXaf,
          });
        }
        showToast(`Bordereau ${created.reference || ''} enregistré dans la caisse de ${partner.name}.`);
      } catch (error: unknown) {
        setCashMovementError(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    // Mode Opération unifiée : 1. Achats d'or -> 2. Dépense -> 3. Vente d'or
    const buyStarted = Boolean(
      opBuyAmount.trim() ||
        opBuyWeight.trim() ||
        opBuyCounterparty.trim() ||
        opBuyDescription.trim()
    );
    const buyAmt = parseDecimalInput(opBuyAmount);
    const buyWt = parseDecimalInput(opBuyWeight);
    const buyKt = parseDecimalInput(opBuyKarat);

    if (buyStarted) {
      if (!Number.isFinite(buyAmt) || buyAmt <= 0) {
        setCashMovementError('1 · Achat d’or : saisissez un montant FCFA supérieur à zéro.');
        return;
      }
      if (!Number.isFinite(buyWt) || buyWt <= 0 || !Number.isFinite(buyKt) || buyKt < 1 || buyKt > 24) {
        setCashMovementError('1 · Achat d’or : saisissez un poids positif (g) et un carat entre 1 et 24.');
        return;
      }
    }

    const expenseStarted = Boolean(
      opExpenseAmount.trim() ||
        opExpenseDescription.trim() ||
        opExpenseCounterparty.trim()
    );
    const expAmt = parseDecimalInput(opExpenseAmount);
    if (expenseStarted && (!Number.isFinite(expAmt) || expAmt <= 0)) {
      setCashMovementError('2 · Dépense : saisissez un montant de dépense supérieur à zéro.');
      return;
    }

    const sellStarted = Boolean(
      opSellAmount.trim() ||
        opSellWeight.trim() ||
        opSellCounterparty.trim() ||
        opSellDescription.trim()
    );
    const sellAmt = parseDecimalInput(opSellAmount);
    const sellWt = parseDecimalInput(opSellWeight);
    const sellKt = parseDecimalInput(opSellKarat);

    if (sellStarted) {
      if (!Number.isFinite(sellAmt) || sellAmt <= 0) {
        setCashMovementError('3 · Vente d’or : saisissez un montant FCFA supérieur à zéro.');
        return;
      }
      if (!Number.isFinite(sellWt) || sellWt <= 0 || !Number.isFinite(sellKt) || sellKt < 1 || sellKt > 24) {
        setCashMovementError('3 · Vente d’or : saisissez un poids positif (g) et un carat entre 1 et 24.');
        return;
      }
    }

    if (!buyStarted && !expenseStarted && !sellStarted) {
      setCashMovementError(
        'Renseignez au moins une section : 1. Achat d’or, 2. Dépense ou 3. Vente d’or.'
      );
      return;
    }

    try {
      const createdMovements: PartnershipCashMovement[] = [];
      let runningBalance = prevStats.balance;

      if (buyStarted) {
        const createdBuy = store.addPartnershipCashMovement({
          type: 'goldPurchase',
          amountXaf: buyAmt,
          description: opBuyDescription.trim() || `Achat d’or partenaire · Caisse ${partner.name}`,
          partnerId: partner.id,
          partnerName: partner.name,
          weightGrams: buyWt,
          karat: buyKt,
          pricePerGramXaf: Math.round(buyAmt / buyWt),
          counterpartyName: opBuyCounterparty.trim() || undefined,
          paymentMode: opBuyPaymentMode.trim() || undefined,
          contractRef: cashContractRef.trim() || undefined,
        });
        createdMovements.push(createdBuy);
        runningBalance -= buyAmt;
      }

      if (expenseStarted) {
        const createdExpense = store.addPartnershipCashMovement({
          type: 'expense',
          amountXaf: expAmt,
          description: opExpenseDescription.trim() || `Dépense partenariat · Caisse ${partner.name}`,
          partnerId: partner.id,
          partnerName: partner.name,
          counterpartyName: opExpenseCounterparty.trim() || undefined,
          paymentMode: opExpensePaymentMode.trim() || undefined,
          contractRef: cashContractRef.trim() || undefined,
        });
        createdMovements.push(createdExpense);
        runningBalance -= expAmt;
      }

      if (sellStarted) {
        const createdSell = store.addPartnershipCashMovement({
          type: 'goldSale',
          amountXaf: sellAmt,
          description: opSellDescription.trim() || `Vente d’or partenaire · Retour caisse ${partner.name}`,
          partnerId: partner.id,
          partnerName: partner.name,
          weightGrams: sellWt,
          karat: sellKt,
          pricePerGramXaf: Math.round(sellAmt / sellWt),
          counterpartyName: opSellCounterparty.trim() || undefined,
          paymentMode: opSellPaymentMode.trim() || undefined,
          contractRef: cashContractRef.trim() || undefined,
        });
        createdMovements.push(createdSell);
        runningBalance += sellAmt;
      }

      setSelectedCashPartnerId(partner.id);
      setShowCashMovementModal(false);
      resetCashModalFields();

      if (openSlipAfterSave) {
        if (createdMovements.length === 1) {
          setViewingMovement({
            movement: createdMovements[0],
            partner,
            balanceAfter: runningBalance,
          });
        } else {
          setViewingSummaryPartner(partner);
        }
      }

      const refsLabel = createdMovements
        .map((item) => item.reference)
        .filter(Boolean)
        .join(', ');
      showToast(
        `${createdMovements.length} opération(s) enregistrée(s)${refsLabel ? ` (${refsLabel})` : ''} dans la caisse de ${partner.name}.`
      );
    } catch (error: unknown) {
      setCashMovementError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCreateContract = (e: React.FormEvent) => {
    e.preventDefault();
    const partner = store.partners.find((p) => p.id === selectedPartnerId);
    const partnerNameStr = partner ? partner.name : 'Partenaire';
    const partnerContribNum = Math.max(0, parseFloat(financialContrib.replace(/\s+/g, '').replace(',', '.') || '0') || 0);
    const companyContribNum = Math.max(0, parseFloat(companyFinancialContrib.replace(/\s+/g, '').replace(',', '.') || '0') || 0);
    const partnerProfitPct = Math.min(100, Math.max(0, parseFloat(remunerationVal.replace(',', '.') || '50') || 0));
    const companyProfitPct = Math.max(0, 100 - partnerProfitPct);

    const createdPartnership = store.addPartnership({
      scenario: selectedScenario,
      status: 'contractApproved',
      remunerationMethod: selectedRemuneration,
      remunerationValue: partnerProfitPct,
      note: contractNote || 'Convention de partenariat commercial CAMS GOLD',
      members: [
        {
          name: 'Cams Gold',
          role: 'Entreprise / Opérateur principal',
          isCompany: true,
          profitSharePercent: companyProfitPct,
          contributions: companyContribNum > 0 ? [
            {
              kind: 'financial',
              isValidated: true,
              amountXaf: companyContribNum,
              purityIsProvisional: false,
            },
          ] : [],
        },
        {
          partnerId: selectedPartnerId,
          name: partnerNameStr,
          role: 'Partenaire co-contractant',
          profitSharePercent: partnerProfitPct,
          contributions: partnerContribNum > 0 ? [
            {
              kind: 'financial',
              isValidated: true,
              amountXaf: partnerContribNum,
              purityIsProvisional: false,
            },
          ] : [],
        },
      ],
    });

    if (creditCashOnContractCreate && partner) {
      const year = new Date().getFullYear();
      const baseSeq = store.partnershipCashMovements.filter(
        (m) => m.reference?.startsWith(`BFP-${year}-`) || m.type === 'contribution'
      ).length;
      let offset = 1;

      if (companyContribNum > 0) {
        store.addPartnershipCashMovement({
          type: 'contribution',
          amountXaf: companyContribNum,
          description: `Investissement entreprise CAMS GOLD · Contrat ${createdPartnership.reference}`,
          partnerId: partner.id,
          partnerName: partner.name,
          contributor: 'CAMS GOLD',
          contractRef: createdPartnership.reference,
          reference: `BFP-${year}-${String(baseSeq + offset).padStart(4, '0')}`,
          paymentMode: 'Dotation contrat partenariat',
        });
        offset += 1;
      }
      if (partnerContribNum > 0) {
        store.addPartnershipCashMovement({
          type: 'contribution',
          amountXaf: partnerContribNum,
          description: `Apport financement ${partner.name} · Contrat ${createdPartnership.reference}`,
          partnerId: partner.id,
          partnerName: partner.name,
          contributor: 'partner',
          contractRef: createdPartnership.reference,
          reference: `BFP-${year}-${String(baseSeq + offset).padStart(4, '0')}`,
          paymentMode: 'Dotation contrat partenariat',
        });
      }
      setSelectedCashPartnerId(partner.id);
    }

    setShowNewContractModal(false);
    setContractNote('');
    setFinancialContrib('');
    setCompanyFinancialContrib('');
    setViewingContract(createdPartnership);
    showToast(`Contrat ${createdPartnership.reference} créé avec bordereau partageable.`);
  };

  const handleCreateLoan = (e: React.FormEvent) => {
    e.preventDefault();
    const partner = store.partners.find((p) => p.id === loanPartnerId);
    const pAmount = parseFloat(loanPrincipal.replace(/\s+/g, '').replace(',', '.') || '0');

    store.addLoan({
      partnerName: partner?.name || 'Partenaire',
      partnerId: loanPartnerId,
      direction: loanDirection,
      principalXaf: pAmount,
      dueAt: loanDueDate ? new Date(loanDueDate).toISOString() : new Date().toISOString(),
      note: loanNote || 'Avance de trésorerie',
      createdBy: store.userName,
    });

    setShowNewLoanModal(false);
    setLoanPrincipal('');
    setLoanNote('');
  };

  const handleCreatePartner = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerName.trim()) return;
    const created = store.addPartner({
      name: partnerName,
      phone: partnerPhone,
      city: partnerCity,
      email: '',
      isActive: true,
      type: partnerType,
    });
    setSelectedCashPartnerId(created.id);
    setSelectedPartnerId(created.id);
    setShowNewPartnerModal(false);
    setPartnerName('');
    setPartnerPhone('');
    setPartnerCity('');
  };

  const handleConfirmRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayingLoanId) return;
    const amount = parseFloat(repaymentAmount.replace(/\s+/g, '').replace(',', '.') || '0');
    store.addLoanRepayment(repayingLoanId, {
      amountXaf: amount,
      note: repaymentNote || 'Remboursement partiel',
      createdBy: store.userName,
    });
    setRepayingLoanId(null);
    setRepaymentAmount('');
    setRepaymentNote('');
  };

  const handleCopyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 2000);
    } catch {
      showToast('Copie impossible sur ce navigateur.');
    }
  };

  const handleShareContract = async (partnership: Partnership) => {
    const partnerMember = partnership.members.find(
      (m) => !m.isCompany && m.name.trim().toLowerCase() !== 'cams gold'
    );
    const partner = store.partners.find(
      (p) => p.id === partnerMember?.partnerId || p.name.trim().toLowerCase() === partnerMember?.name.trim().toLowerCase()
    );
    const mode = await sharePartnershipContract(partnership, store.userName, partner?.phone);
    showToast(
      mode === 'direct'
        ? `Bordereau contrat ${partnership.reference} envoyé directement sur WhatsApp (${partner?.phone}) !`
        : mode === 'share'
          ? `Bordereau contrat ${partnership.reference} partagé.`
          : `PDF téléchargé et partage WhatsApp ouvert pour ${partnership.reference}.`
    );
  };

  const handleShareMovement = async (
    movement: PartnershipCashMovement,
    partner: Partner | null,
    balanceAfter: number,
    summary?: PartnershipSummarySnapshot
  ) => {
    const resolvedSummary =
      summary || (partner ? toSummarySnapshot(getPartnerCashStats(partner)) : undefined);
    const mode = await sharePartnershipMovement(
      movement,
      partner,
      balanceAfter,
      store.userName,
      resolvedSummary
    );
    showToast(
      mode === 'direct'
        ? `Bordereau ${movement.reference || ''} envoyé directement sur WhatsApp (${partner?.phone}) !`
        : mode === 'share'
          ? `Bordereau ${movement.reference || ''} partagé.`
          : `PDF téléchargé et WhatsApp ouvert pour ${movement.reference || 'le bordereau'}.`
    );
  };

  const handleShareSummary = async (
    partner: Partner,
    summary: PartnershipSummarySnapshot,
    movements: PartnershipCashMovement[]
  ) => {
    const mode = await sharePartnershipSummary(partner, summary, movements, store.userName);
    showToast(
      mode === 'direct'
        ? `Bordereau complet ${partner.name} envoyé directement sur WhatsApp (${partner.phone}) !`
        : mode === 'share'
          ? `Bordereau complet ${partner.name} partagé.`
          : `PDF récapitulatif téléchargé et WhatsApp ouvert pour ${partner.name}.`
    );
  };

  const buyPreview = useMemo(() => {
    const amt = parseDecimalInput(opBuyAmount);
    const wt = parseDecimalInput(opBuyWeight);
    const kt = parseDecimalInput(opBuyKarat);
    const validAmt = Number.isFinite(amt) && amt > 0 ? amt : 0;
    const validWt = Number.isFinite(wt) && wt > 0 ? wt : 0;
    const validKt = Number.isFinite(kt) && kt >= 1 && kt <= 24 ? kt : 0;
    return {
      amount: validAmt,
      weight: validWt,
      pricePerGram: validAmt > 0 && validWt > 0 ? Math.round(validAmt / validWt) : 0,
      fineGold24k: validWt > 0 && validKt > 0 ? (validWt * validKt) / 24 : 0,
    };
  }, [opBuyAmount, opBuyWeight, opBuyKarat]);

  const sellPreview = useMemo(() => {
    const amt = parseDecimalInput(opSellAmount);
    const wt = parseDecimalInput(opSellWeight);
    const kt = parseDecimalInput(opSellKarat);
    const validAmt = Number.isFinite(amt) && amt > 0 ? amt : 0;
    const validWt = Number.isFinite(wt) && wt > 0 ? wt : 0;
    const validKt = Number.isFinite(kt) && kt >= 1 && kt <= 24 ? kt : 0;
    return {
      amount: validAmt,
      weight: validWt,
      pricePerGram: validAmt > 0 && validWt > 0 ? Math.round(validAmt / validWt) : 0,
      fineGold24k: validWt > 0 && validKt > 0 ? (validWt * validKt) / 24 : 0,
    };
  }, [opSellAmount, opSellWeight, opSellKarat]);

  const expensePreviewAmount = useMemo(() => {
    const amt = parseDecimalInput(opExpenseAmount);
    return Number.isFinite(amt) && amt > 0 ? amt : 0;
  }, [opExpenseAmount]);

  return (
    <div className="p-4 sm:p-7 max-w-7xl mx-auto space-y-6">
      <PageHeading
        eyebrow="CAMS GOLD · Partenaires"
        title="Partenariats, Caisses & Bordereaux"
        action={
          <div className="flex flex-wrap gap-2">
            {canCash && (
              <button
                type="button"
                onClick={() => openQuickCashModal('goldPurchase', 'partner', undefined, 'all')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer shadow-xs"
              >
                <Wallet size={15} />
                <span>Apport / Opération Caisse</span>
              </button>
            )}
            {canContracts && (
              <button
                type="button"
                onClick={() => setShowNewContractModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer shadow-xs"
              >
                <Plus size={15} />
                <span>Nouveau contrat</span>
              </button>
            )}
            {canLoans && (
              <button
                type="button"
                onClick={() => setShowNewLoanModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer"
              >
                <DollarSign size={15} />
                <span>Nouveau prêt / avance</span>
              </button>
            )}
          </div>
        }
      />

      {shareToast && (
        <div className="rounded-xl bg-[#192A24] text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-md">
          <span>{shareToast}</span>
          <button type="button" onClick={() => setShareToast(null)} className="text-amber-300 hover:text-white cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Synthèse globale strictement réservée aux partenaires uniquement */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-2xl border border-[#E8D8BE] bg-[#FFF9EA] p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#9E731B]">
            Investi Entreprise
          </div>
          <div className="mt-1 text-base font-black text-[#192A24]">
            {formatMoney(globalPartnerSummary.totalCamsInvested)} F
          </div>
          <div className="text-[10px] text-[#7D8176]">CAMS GOLD (Partenaires)</div>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
            Investi Partenaires
          </div>
          <div className="mt-1 text-base font-black text-[#192A24]">
            {formatMoney(globalPartnerSummary.totalPartnerInvested)} F
          </div>
          <div className="text-[10px] text-blue-700">Apports partenaires</div>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-red-800">
            Achats Or Partenaires
          </div>
          <div className="mt-1 text-base font-black text-red-800">
            {formatMoney(globalPartnerSummary.totalPurchases)} F
          </div>
          <div className="text-[10px] text-red-700">Hors caisse principale</div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
            Ventes Or Partenaires
          </div>
          <div className="mt-1 text-base font-black text-emerald-800">
            {formatMoney(globalPartnerSummary.totalSales)} F
          </div>
          <div className="text-[10px] text-emerald-700">Recettes partenaires</div>
        </div>

        <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-3.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-orange-800">
            Dépenses Partenaires
          </div>
          <div className="mt-1 text-base font-black text-orange-900">
            {formatMoney(globalPartnerSummary.totalExpenses)} F
          </div>
          <div className="text-[10px] text-orange-700">Charges dédiées</div>
        </div>

        <div className="rounded-2xl border border-[#192A24] bg-[#192A24] p-3.5 text-white">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#F2BD45]">
            Bénéfice / Solde Caisses
          </div>
          <div
            className={`mt-1 text-base font-black ${
              globalPartnerSummary.netBenefit >= 0 ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {globalPartnerSummary.netBenefit >= 0 ? '+' : ''}
            {formatMoney(globalPartnerSummary.netBenefit)} F
          </div>
          <div className="text-[10px] text-white/75">
            Caisses : {formatMoney(globalPartnerSummary.totalBalance)} F
          </div>
        </div>
      </div>

      {/* Tabs */}
      {allowedTabs.length === 0 ? (
        <AppPanel className="p-8 text-center text-xs text-gray-500">
          Aucun service de ce module n’est autorisé pour votre compte. Contactez l’administrateur.
        </AppPanel>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E8D8BE] pb-2">
          {canCash && (
            <button
              type="button"
              onClick={() => setActiveTab('cash')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'cash'
                  ? 'bg-[#192A24] text-white shadow-xs'
                  : 'text-[#7D8176] hover:bg-[#F6F0E5]'
              }`}
            >
              <Wallet size={16} />
              <span>Caisse partenariat ({store.partners.length})</span>
            </button>
          )}

          {canContracts && (
            <button
              type="button"
              onClick={() => setActiveTab('contracts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'contracts'
                  ? 'bg-[#192A24] text-white shadow-xs'
                  : 'text-[#7D8176] hover:bg-[#F6F0E5]'
              }`}
            >
              <Handshake size={16} />
              <span>Contrats & Bordereaux ({store.partnerships.length})</span>
            </button>
          )}

          {canLoans && (
            <button
              type="button"
              onClick={() => setActiveTab('loans')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'loans'
                  ? 'bg-[#192A24] text-white shadow-xs'
                  : 'text-[#7D8176] hover:bg-[#F6F0E5]'
              }`}
            >
              <Coins size={16} />
              <span>Registre des prêts ({store.loans.length})</span>
            </button>
          )}

          {canDirectory && (
            <button
              type="button"
              onClick={() => setActiveTab('partners')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'partners'
                  ? 'bg-[#192A24] text-white shadow-xs'
                  : 'text-[#7D8176] hover:bg-[#F6F0E5]'
              }`}
            >
              <Users size={16} />
              <span>Annuaire partenaires ({store.partners.length})</span>
            </button>
          )}
        </div>
      )}

      {/* TAB: CAISSE PARTENARIAT */}
      {activeTab === 'cash' && canCash && (
        <div className="space-y-4">
          {/* Recherche partenaire + sélection caisse dédiée */}
          <AppPanel className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-[#192A24]">
                  Caisses Partenaires · Historique CAMS GOLD ↔ Partenaire
                </h2>
                <p className="mt-0.5 text-xs text-[#7D8176]">
                  Chaque partenaire dispose de sa propre caisse dédiée. Saisissez le nom d’un partenaire pour afficher son solde, ses achats, ventes, dépenses, bénéfices et tout son historique CAMS GOLD ↔ Partenaire.
                </p>
              </div>
              {canDirectory && (
                <button
                  type="button"
                  onClick={() => setShowNewPartnerModal(true)}
                  className="self-start md:self-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  <Plus size={14} />
                  <span>Nouveau partenaire</span>
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-2.5 text-[#D39725]" />
                <input
                  type="text"
                  value={cashPartnerSearch}
                  onChange={(e) => setCashPartnerSearch(e.target.value)}
                  placeholder="Rechercher un partenaire (nom, téléphone, ville, type) pour voir sa caisse et son historique..."
                  className="w-full pl-10 pr-9 py-2.5 bg-[#FAF8F3] rounded-xl border-2 border-[#E8D8BE] text-xs font-bold text-[#192A24] focus:outline-hidden focus:border-[#D39725]"
                />
                {cashPartnerSearch && (
                  <button
                    type="button"
                    onClick={() => setCashPartnerSearch('')}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 cursor-pointer"
                    aria-label="Effacer la recherche"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              {filteredCashPartners.length > 0 && (
                <select
                  value={selectedCashPartner?.id || ''}
                  onChange={(e) => setSelectedCashPartnerId(e.target.value)}
                  className="sm:w-80 px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                >
                  {filteredCashPartners.map((partner) => {
                    const stats = getPartnerCashStats(partner);
                    return (
                      <option key={partner.id} value={partner.id}>
                        {partner.name} · Solde : {formatMoney(stats.balance)} FCFA
                      </option>
                    );
                  })}
                </select>
              )}
            </div>

            {filteredCashPartners.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-500 border border-dashed border-[#E8D8BE] rounded-xl">
                {store.partners.length === 0
                  ? 'Aucun partenaire enregistré pour le moment. Créez un partenaire pour ouvrir sa caisse dédiée.'
                  : `Aucun partenaire trouvé pour « ${cashPartnerSearch} ».`}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredCashPartners.map((partner) => {
                  const stats = getPartnerCashStats(partner);
                  const isSelected = selectedCashPartner?.id === partner.id;
                  return (
                    <button
                      key={partner.id}
                      type="button"
                      onClick={() => setSelectedCashPartnerId(partner.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFF7E2] border-[#D39725] ring-2 ring-[#D39725]/30 shadow-xs'
                          : 'bg-[#FAF8F3] border-[#E8D8BE] hover:border-[#D39725]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-xs text-[#192A24] truncate">{partner.name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-white border border-[#E8D8BE] text-[10px] font-bold text-[#7D8176] shrink-0">
                          {partner.type}
                        </span>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between text-[11px]">
                        <span className="text-[#7D8176]">Solde caisse :</span>
                        <span className={`font-black ${stats.balance >= 0 ? 'text-emerald-800' : 'text-red-700'}`}>
                          {formatMoney(stats.balance)} FCFA
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-[#7D8176]">
                        <span>CAMS : {formatMoney(Math.max(stats.camsGoldContrib, stats.contractCompanyInvested))} F</span>
                        <span>Part. : {formatMoney(Math.max(stats.partnerContrib, stats.contractPartnerInvested))} F</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] font-bold">
                        <span className="text-orange-700">Dép. : {formatMoney(stats.expensesTotal)} F</span>
                        <span className={stats.benefitTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                          Bén. : {stats.benefitTotal >= 0 ? '+' : ''}{formatMoney(stats.benefitTotal)} F
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </AppPanel>

          {selectedCashPartner && selectedPartnerStats && (
            <>
              <AppPanel className="space-y-4 border-t-4 border-t-[#D39725]">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-[#192A24] text-[#F2BD45] text-[10px] font-black uppercase tracking-wider">
                        Caisse dédiée · Partenaire uniquement
                      </span>
                      <span className="text-xs text-[#7D8176]">
                        {selectedCashPartner.city || '—'} · {selectedCashPartner.phone || 'Sans téléphone'}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-[#192A24] mt-1">
                      Partenariat CAMS GOLD ↔ {selectedCashPartner.name}
                    </h3>
                  </div>

                  {/* Actions directes avec bordereau */}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openQuickCashModal('contribution', 'partner', selectedCashPartner.id, 'contribution')
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      <ArrowDownLeft size={14} />
                      <span>Apport financement</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        openQuickCashModal('goldPurchase', 'CAMS GOLD', selectedCashPartner.id, 'operation')
                      }
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#204B57] hover:bg-[#173842] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      <ArrowLeftRight size={14} />
                      <span>Opération</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewingSummaryPartner(selectedCashPartner)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      <FileText size={14} />
                      <span>Bordereau complet</span>
                    </button>
                  </div>
                </div>

                {/* KPIs complets de la caisse partenaire */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="text-[11px] font-bold text-emerald-800">Solde Caisse Partenaire</div>
                    <div className={`mt-1 text-xl font-black ${selectedPartnerStats.balance >= 0 ? 'text-emerald-900' : 'text-red-700'}`}>
                      {formatMoney(selectedPartnerStats.balance)} FCFA
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">
                      Apports + Ventes − Achats − Dépenses
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#E8D8BE] bg-[#FFF9EA] p-4">
                    <div className="text-[11px] font-bold text-[#9E731B] flex items-center gap-1">
                      <Building2 size={12} />
                      <span>Investi par l’entreprise (CAMS GOLD)</span>
                    </div>
                    <div className="mt-1 text-lg font-black text-[#192A24]">
                      {formatMoney(selectedPartnerStats.camsGoldContrib)} FCFA
                    </div>
                    <div className="text-[10px] text-[#9E731B] font-semibold mt-0.5">
                      {selectedPartnerStats.totalContributions > 0
                        ? `${formatNumber((selectedPartnerStats.camsGoldContrib / selectedPartnerStats.totalContributions) * 100, 1)}% des apports caisse`
                        : '0% des apports caisse'}
                      {selectedPartnerStats.contractCompanyInvested > selectedPartnerStats.camsGoldContrib
                        ? ` · Contrats : ${formatMoney(selectedPartnerStats.contractCompanyInvested)} F`
                        : ''}
                    </div>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
                    <div className="text-[11px] font-bold text-blue-900 truncate">
                      Investi par {selectedCashPartner.name}
                    </div>
                    <div className="mt-1 text-lg font-black text-[#192A24]">
                      {formatMoney(selectedPartnerStats.partnerContrib)} FCFA
                    </div>
                    <div className="text-[10px] text-blue-800 font-semibold mt-0.5">
                      {selectedPartnerStats.totalContributions > 0
                        ? `${formatNumber((selectedPartnerStats.partnerContrib / selectedPartnerStats.totalContributions) * 100, 1)}% des apports caisse`
                        : '0% des apports caisse'}
                      {selectedPartnerStats.contractPartnerInvested > selectedPartnerStats.partnerContrib
                        ? ` · Contrats : ${formatMoney(selectedPartnerStats.contractPartnerInvested)} F`
                        : ''}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-[11px] font-bold text-amber-800">Stock d’or fin partenaire (24K)</div>
                    <div className="mt-1 text-lg font-black text-amber-950">
                      {formatNumber(selectedPartnerStats.fineGoldGrams, 3)} g
                    </div>
                    <div className="text-[10px] text-amber-800 mt-0.5">
                      Acheté : {formatNumber(selectedPartnerStats.purchasedGrams, 2)} g · Vendu : {formatNumber(selectedPartnerStats.soldGrams, 2)} g
                    </div>
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
                    <div className="text-[11px] font-bold text-red-800">Achats d’or (Partenaire)</div>
                    <div className="mt-1 text-lg font-black text-red-800">
                      − {formatMoney(selectedPartnerStats.purchasesTotal)} FCFA
                    </div>
                    <div className="text-[10px] text-red-700 mt-0.5">
                      Sorties caisse achat or
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="text-[11px] font-bold text-emerald-800">Ventes d’or (Partenaire)</div>
                    <div className="mt-1 text-lg font-black text-emerald-800">
                      + {formatMoney(selectedPartnerStats.salesTotal)} FCFA
                    </div>
                    <div className="text-[10px] text-emerald-700 mt-0.5">
                      Retours caisse ventes or
                    </div>
                  </div>

                  <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                    <div className="text-[11px] font-bold text-orange-800">Dépenses Partenaire</div>
                    <div className="mt-1 text-lg font-black text-orange-900">
                      − {formatMoney(selectedPartnerStats.expensesTotal)} FCFA
                    </div>
                    <div className="text-[10px] text-orange-700 mt-0.5">
                      Frais & dépenses imputés au partenariat
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#192A24] bg-[#192A24] p-4 text-white">
                    <div className="text-[11px] font-bold text-[#F2BD45]">Bénéfice Net Partenariat</div>
                    <div
                      className={`mt-1 text-lg font-black ${
                        selectedPartnerStats.benefitTotal >= 0 ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {selectedPartnerStats.benefitTotal >= 0 ? '+' : ''}
                      {formatMoney(selectedPartnerStats.benefitTotal)} FCFA
                    </div>
                    <div className="text-[10px] text-white/80 mt-0.5">
                      CAMS ({selectedPartnerStats.companyProfitSharePct}%) : {formatMoney(selectedPartnerStats.companyProfitAmount)} F · Part ({selectedPartnerStats.partnerProfitSharePct}%) : {formatMoney(selectedPartnerStats.partnerProfitAmount)} F
                    </div>
                  </div>
                </div>

                {/* Contrats liés à ce partenaire avec bordereau partageable */}
                {selectedPartnerStats.contracts.length > 0 && (
                  <div className="pt-2 border-t border-[#E8D8BE]">
                    <div className="text-xs font-black text-[#192A24] mb-2 flex items-center gap-1.5">
                      <Handshake size={14} className="text-[#D39725]" />
                      <span>Contrats de partenariat actifs ({selectedPartnerStats.contracts.length})</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {selectedPartnerStats.contracts.map((contract) => {
                        const inv = getPartnershipInvestments(contract);
                        return (
                          <div
                            key={contract.id}
                            className="p-3 rounded-xl border border-[#E8D8BE] bg-[#FAF8F3] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-black text-[#D39725]">
                                  {contract.reference}
                                </span>
                                <span className="text-xs font-bold text-[#192A24] truncate">
                                  {PARTNERSHIP_SCENARIO_LABELS[contract.scenario]}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#7D8176] mt-0.5">
                                CAMS GOLD : <strong className="text-[#192A24]">{formatMoney(inv.companyInvestmentXaf)} F</strong> ·{' '}
                                {selectedCashPartner.name} : <strong className="text-[#192A24]">{formatMoney(inv.partnerInvestmentXaf)} F</strong>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setViewingContract(contract)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#192A24] hover:bg-[#253D34] text-white text-[11px] font-bold cursor-pointer"
                              >
                                <FileText size={12} />
                                <span>Bordereau</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleShareContract(contract)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#008B62] hover:bg-[#007452] text-white text-[11px] font-bold cursor-pointer"
                              >
                                <Share2 size={12} />
                                <span>Partager</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </AppPanel>

              {/* Historique de partenariat CAMS GOLD <-> Partenaire */}
              <AppPanel>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <SectionHeading
                    title={`Historique de partenariat CAMS GOLD ↔ ${selectedCashPartner.name} (${selectedPartnerStats.movements.length})`}
                    icon={<Wallet size={18} />}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'ALL', label: 'Tout' },
                        { id: 'CAMS GOLD', label: 'Apports CAMS GOLD' },
                        { id: 'PARTNER', label: `Apports ${selectedCashPartner.name}` },
                        { id: 'PURCHASE', label: 'Achats d’or' },
                        { id: 'SALE', label: 'Ventes d’or' },
                        { id: 'EXPENSE', label: 'Dépenses' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setCashHistoryFilter(f.id)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                          cashHistoryFilter === f.id
                            ? 'bg-[#192A24] text-white'
                            : 'bg-[#FAF8F3] text-[#7D8176] border border-[#E8D8BE] hover:bg-amber-50'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedPartnerStats.movements.length === 0 ? (
                  <p className="py-8 text-center text-xs text-gray-500">
                    Aucune opération dans la caisse de {selectedCashPartner.name}. Enregistrez un apport financement, un achat d’or, une vente d’or ou une dépense pour générer le bordereau correspondant.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E8D8BE] text-[#7D8176] bg-[#FAF8F3]">
                          <th className="py-2.5 px-3">Bordereau</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Mouvement</th>
                          <th className="py-2.5 px-3">Détail / Tiers</th>
                          <th className="py-2.5 px-3 text-right text-[#9E731B]">CAMS GOLD</th>
                          <th className="py-2.5 px-3 text-right text-blue-900">{selectedCashPartner.name}</th>
                          <th className="py-2.5 px-3 text-right">Caisse (+/-)</th>
                          <th className="py-2.5 px-3 text-right">Solde après</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...selectedPartnerStats.movements]
                          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                          .reduce<Array<{ movement: PartnershipCashMovement; balance: number }>>(
                            (rows, movement) => {
                              const previousBalance = rows.length > 0 ? rows[rows.length - 1].balance : 0;
                              const balance = previousBalance + getMovementCashDelta(movement);
                              rows.push({ movement, balance });
                              return rows;
                            },
                            []
                          )
                          .reverse()
                          .filter(({ movement }) => {
                            if (cashHistoryFilter === 'CAMS GOLD') {
                              return movement.type === 'contribution' && movement.contributor === 'CAMS GOLD';
                            }
                            if (cashHistoryFilter === 'PARTNER') {
                              return movement.type === 'contribution' && movement.contributor !== 'CAMS GOLD';
                            }
                            if (cashHistoryFilter === 'PURCHASE') {
                              return movement.type === 'goldPurchase';
                            }
                            if (cashHistoryFilter === 'SALE') {
                              return movement.type === 'goldSale';
                            }
                            if (cashHistoryFilter === 'EXPENSE') {
                              return movement.type === 'expense' || (movement.expenseAmountXaf || 0) > 0;
                            }
                            return true;
                          })
                          .map(({ movement, balance }) => {
                            const movementLabels: Record<PartnershipCashMovementType, string> = {
                              contribution:
                                movement.contributor === 'CAMS GOLD'
                                  ? 'Apport CAMS GOLD'
                                  : `Apport ${selectedCashPartner.name}`,
                              goldPurchase: 'Achat d’or',
                              goldSale: 'Vente d’or',
                              expense: 'Dépense',
                            };
                            const isCamsContrib =
                              movement.type === 'contribution' && movement.contributor === 'CAMS GOLD';
                            const isPartnerContrib =
                              movement.type === 'contribution' && movement.contributor !== 'CAMS GOLD';
                            const netDelta = getMovementCashDelta(movement);
                            const isOutflow = netDelta < 0;
                            const attachedExpense = movement.expenseAmountXaf || 0;
                            const refCode = movement.reference || movement.id.slice(-8).toUpperCase();
                            return (
                              <tr key={movement.id} className="border-b border-gray-100 hover:bg-[#FAF8F3]/60">
                                <td className="py-2.5 px-3 font-mono text-[11px] font-black text-[#D39725] whitespace-nowrap">
                                  {refCode}
                                </td>
                                <td className="py-2.5 px-3 whitespace-nowrap text-gray-600">
                                  {formatDateTime(movement.createdAt)}
                                </td>
                                <td className="py-2.5 px-3 font-bold">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                      isCamsContrib
                                        ? 'bg-amber-100 text-amber-900'
                                        : isPartnerContrib
                                        ? 'bg-blue-100 text-blue-900'
                                        : movement.type === 'goldPurchase'
                                        ? 'bg-red-100 text-red-800'
                                        : movement.type === 'expense'
                                        ? 'bg-orange-100 text-orange-900'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {movementLabels[movement.type]}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="font-semibold text-[#192A24]">{movement.description}</div>
                                  {(movement.weightGrams !== undefined || movement.counterpartyName || movement.contractRef) && (
                                    <div className="mt-0.5 text-[10px] text-[#7D8176]">
                                      {movement.weightGrams !== undefined && (
                                        <>
                                          {formatNumber(movement.weightGrams, 3)} g · {formatNumber(movement.karat || 0, 2)} K
                                          {movement.pricePerGramXaf ? ` (${formatMoney(movement.pricePerGramXaf)} F/g)` : ''}
                                        </>
                                      )}
                                      {movement.counterpartyName && ` · Tiers : ${movement.counterpartyName}`}
                                      {movement.contractRef && ` · Contrat : ${movement.contractRef}`}
                                    </div>
                                  )}
                                  {attachedExpense > 0 && (
                                    <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-50 border border-orange-200 text-[10px] font-bold text-orange-800">
                                      Dépense partenaire : −{formatMoney(attachedExpense)} F
                                      {movement.expenseDescription ? ` (${movement.expenseDescription})` : ''}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-[#9E731B] whitespace-nowrap">
                                  {isCamsContrib ? `+ ${formatMoney(movement.amountXaf)} F` : '—'}
                                </td>
                                <td className="py-2.5 px-3 text-right font-bold text-blue-800 whitespace-nowrap">
                                  {isPartnerContrib ? `+ ${formatMoney(movement.amountXaf)} F` : '—'}
                                </td>
                                <td
                                  className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                                    isOutflow ? 'text-red-700' : 'text-emerald-700'
                                  }`}
                                >
                                  <div>
                                    {netDelta < 0
                                      ? `− ${formatMoney(Math.abs(netDelta))}`
                                      : `+ ${formatMoney(netDelta)}`}{' '}
                                    F
                                  </div>
                                  {attachedExpense > 0 && (
                                    <div className="text-[9px] font-normal text-[#7D8176]">
                                      Op: {formatMoney(movement.amountXaf)} · Dép: −{formatMoney(attachedExpense)}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-black whitespace-nowrap">
                                  {formatMoney(balance)} FCFA
                                </td>
                                <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setViewingMovement({
                                          movement,
                                          partner: selectedCashPartner,
                                          balanceAfter: balance,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FFF7E2] hover:bg-[#FFD27A] text-[#192A24] border border-[#E8D8BE] text-[10px] font-bold cursor-pointer"
                                      title="Voir le bordereau"
                                    >
                                      <FileText size={11} />
                                      <span>Bordereau</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleShareMovement(
                                          movement,
                                          selectedCashPartner,
                                          balance,
                                          toSummarySnapshot(selectedPartnerStats)
                                        )
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold cursor-pointer"
                                      title="Partager / WhatsApp"
                                    >
                                      <Share2 size={11} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </AppPanel>
            </>
          )}
        </div>
      )}

      {/* TAB: CONTRACTS */}
      {activeTab === 'contracts' && canContracts && (
        <div className="space-y-4">
          {store.partnerships.length === 0 ? (
            <AppPanel className="text-center py-10 space-y-3">
              <p className="text-xs text-gray-500">Aucun contrat de partenariat enregistré.</p>
              <button
                type="button"
                onClick={() => setShowNewContractModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D39725] text-white text-xs font-bold cursor-pointer"
              >
                <Plus size={14} />
                <span>Créer le premier contrat en bordereau</span>
              </button>
            </AppPanel>
          ) : (
            store.partnerships.map((p) => {
              const inv = getPartnershipInvestments(p);
              const meltDiff =
                p.analysisBefore && p.analysisAfter
                  ? p.analysisBefore.netWeightGrams - p.analysisAfter.netWeightGrams
                  : null;

              return (
                <AppPanel key={p.id} className="space-y-4 hover:border-[#D39725]/50 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8D8BE] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#D39725]/15 text-[#D39725] flex items-center justify-center font-bold">
                        <Handshake size={20} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black text-[#D39725]">{p.reference}</span>
                          <span className="font-bold text-sm text-[#192A24]">
                            {PARTNERSHIP_SCENARIO_LABELS[p.scenario]}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                            {PARTNERSHIP_STATUS_LABELS[p.status] || p.status}
                          </span>
                        </div>
                        <span className="text-xs text-[#7D8176]">
                          Créé le {formatDate(p.createdAt)} · {p.note}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingContract(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer"
                      >
                        <FileText size={13} />
                        <span>Bordereau contrat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareContract(p)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer"
                      >
                        <Share2 size={13} />
                        <span>Partager</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadPartnershipContractPdf(p, store.userName)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF8F3] hover:bg-amber-50 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer"
                      >
                        <Download size={13} />
                        <span>PDF</span>
                      </button>
                    </div>
                  </div>

                  {/* Combien investi par l'entreprise vs partenaire */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-[#FFF9EA] border border-[#E8D8BE]">
                      <div className="text-[10px] font-bold uppercase text-[#9E731B]">
                        Investi par l’entreprise (CAMS GOLD)
                      </div>
                      <div className="mt-1 text-base font-black text-[#192A24]">
                        {formatMoney(inv.companyInvestmentXaf)} FCFA
                      </div>
                      <div className="text-[11px] font-semibold text-[#9E731B] mt-0.5">
                        Capital : {formatNumber(inv.companyShareCapitalPct, 1)}% · Part bénéfice : {inv.companyProfitPct}%
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
                      <div className="text-[10px] font-bold uppercase text-blue-900 truncate">
                        Investi par {inv.partnerNames}
                      </div>
                      <div className="mt-1 text-base font-black text-[#192A24]">
                        {formatMoney(inv.partnerInvestmentXaf)} FCFA
                      </div>
                      <div className="text-[11px] font-semibold text-blue-800 mt-0.5">
                        Capital : {formatNumber(inv.partnerShareCapitalPct, 1)}% · Part bénéfice : {inv.partnerProfitPct}%
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-[10px] font-bold uppercase text-emerald-800">
                        Total Capital Engagé
                      </div>
                      <div className="mt-1 text-base font-black text-emerald-950">
                        {formatMoney(inv.totalInvestmentXaf)} FCFA
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-800 mt-0.5">
                        100% du contrat {p.reference}
                      </div>
                    </div>
                  </div>

                  {/* Members & Contributions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {p.members.map((m, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs text-[#192A24]">{m.name}</span>
                          {m.profitSharePercent !== undefined && (
                            <span className="text-[11px] font-bold text-[#D39725]">
                              Bénéfices : {m.profitSharePercent}%
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#7D8176]">{m.role}</div>
                        {m.contributions.map((c, cIdx) => (
                          <div key={cIdx} className="text-[11px] text-gray-700 font-semibold mt-1">
                            {c.kind === 'financial' && `Investissement financier : ${formatMoney(c.amountXaf)} FCFA`}
                            {c.kind === 'metal' && `Apport métal : ${c.netWeightGrams} g (${c.purityPercent}%)`}
                            {c.kind === 'service' && `Prestation : ${c.serviceDescription}`}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Melt Analysis if present */}
                  {meltDiff !== null && (
                    <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-between text-xs text-orange-900">
                      <div className="flex items-center gap-2">
                        <Flame size={16} className="text-orange-600" />
                        <span>
                          Contrôle de fonte : Avant {p.analysisBefore?.netWeightGrams} g ({p.analysisBefore?.purityPercent}%) → Après {p.analysisAfter?.netWeightGrams} g ({p.analysisAfter?.purityPercent}%)
                        </span>
                      </div>
                      <span className="font-bold">Perte fonte : {formatNumber(meltDiff, 2)} g</span>
                    </div>
                  )}
                </AppPanel>
              );
            })
          )}
        </div>
      )}

      {/* TAB: LOANS */}
      {activeTab === 'loans' && canLoans && (
        <div className="space-y-4">
          {store.loans.length === 0 ? (
            <AppPanel className="text-center py-10">
              <p className="text-xs text-gray-500">Aucun prêt ou avance enregistré.</p>
            </AppPanel>
          ) : (
            store.loans.map((loan) => {
              const repaid = loan.repayments.reduce((sum, r) => sum + r.amountXaf, 0);
              const remaining = loan.principalXaf - repaid;
              const isFullyRepaid = remaining <= 0;

              return (
                <AppPanel key={loan.id} className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8D8BE] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#192A24]/10 text-[#192A24] flex items-center justify-center font-bold">
                        <Coins size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black text-[#D39725]">{loan.reference}</span>
                          <span className="font-bold text-sm text-[#192A24]">{loan.partnerName}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {PARTNERSHIP_LOAN_DIRECTION_LABELS[loan.direction]}
                          </span>
                        </div>
                        <div className="text-xs text-[#7D8176]">
                          Échéance : {formatDate(loan.dueAt)} · Note : {loan.note}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm font-black text-[#192A24]">
                          {formatMoney(loan.principalXaf)} FCFA
                        </div>
                        <div className="text-[11px] font-bold text-[#7D8176]">
                          Reste dû :{' '}
                          <span className={isFullyRepaid ? 'text-emerald-600' : 'text-amber-700'}>
                            {formatMoney(remaining)} FCFA
                          </span>
                        </div>
                      </div>

                      {!isFullyRepaid && (
                        <button
                          type="button"
                          onClick={() => {
                            setRepayingLoanId(loan.id);
                            setRepaymentAmount(String(remaining));
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer"
                        >
                          Rembourser
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Repayments log */}
                  {loan.repayments.length > 0 && (
                    <div className="pt-1">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
                        Règlements enregistrés ({loan.repayments.length})
                      </span>
                      <div className="divide-y divide-gray-100 bg-gray-50/50 rounded-xl p-2">
                        {loan.repayments.map((r, rIdx) => (
                          <div key={rIdx} className="py-1.5 flex items-center justify-between text-xs">
                            <span className="text-[#7D8176]">
                              {formatDateTime(r.paidAt)} · {r.note} ({r.createdBy})
                            </span>
                            <span className="font-bold text-emerald-700">
                              {formatMoney(r.amountXaf)} FCFA
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </AppPanel>
              );
            })
          )}
        </div>
      )}

      {/* TAB: PARTNERS DIRECTORY */}
      {activeTab === 'partners' && canDirectory && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewPartnerModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer"
            >
              <Plus size={15} />
              <span>Ajouter un partenaire</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {store.partners.map((p) => {
              const stats = getPartnerCashStats(p);
              return (
                <AppPanel key={p.id} padding="p-4" className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#192A24]">{p.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold">
                      {p.type}
                    </span>
                  </div>
                  <div className="text-xs text-[#7D8176]">
                    {p.city || '—'} · {p.phone || 'Sans téléphone'}
                  </div>
                  {p.email && <div className="text-xs text-gray-500">{p.email}</div>}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E8D8BE]/60 text-[11px]">
                    <div>
                      <span className="text-[10px] text-[#7D8176] block">Solde caisse</span>
                      <span className="font-black text-emerald-800">{formatMoney(stats.balance)} FCFA</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-[#7D8176] block">Bénéfice net</span>
                      <span className={`font-black ${stats.benefitTotal >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {stats.benefitTotal >= 0 ? '+' : ''}{formatMoney(stats.benefitTotal)} FCFA
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#E8D8BE]/60 text-[11px]">
                    <span className="text-[#7D8176]">
                      CAMS : {formatMoney(stats.camsGoldContrib)} F · Dép : {formatMoney(stats.expensesTotal)} F
                    </span>
                    {canCash && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCashPartnerId(p.id);
                          setActiveTab('cash');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#FFF7E2] hover:bg-[#FFD27A] text-[#192A24] border border-[#E8D8BE] text-[11px] font-bold cursor-pointer transition-colors"
                      >
                        <Wallet size={12} />
                        <span>Ouvrir caisse</span>
                      </button>
                    )}
                  </div>
                </AppPanel>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: OPÉRATION UNIFIÉE PARTENAIRE (1. ACHATS D'OR -> 2. DÉPENSE -> 3. VENTE D'OR) & APPORT */}
      <Modal
        isOpen={showCashMovementModal}
        onClose={() => setShowCashMovementModal(false)}
        title={`${cashModalView === 'operation' ? 'Opération' : 'Apport financement'} · Caisse ${modalPartner?.name || 'partenaire'}`}
        maxWidth={cashModalView === 'operation' ? 'max-w-3xl' : 'max-w-lg'}
      >
        <form onSubmit={handleCreateCashMovement} className="space-y-4">
          {/* En-tête caisse & sélecteur partenaire */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[#E8D8BE]">
            <label className="block text-xs font-bold text-[#192A24]">
              Caisse du partenaire concerné
              <select
                required
                value={cashPartnerId}
                onChange={(event) => setCashPartnerId(event.target.value)}
                className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
              >
                <option value="">Sélectionner un partenaire</option>
                {store.partners.filter((partner) => partner.isActive).map((partner) => (
                  <option key={partner.id} value={partner.id}>{partner.name}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-col justify-center rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2 text-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                Solde actuel caisse ({modalPartner?.name || 'Partenaire'})
              </div>
              <div className="mt-0.5 text-sm font-black font-mono tabular-nums text-emerald-950">
                {formatMoney(modalPartnerBalance)} FCFA
              </div>
            </div>
          </div>

          {/* Sélecteur Opération / Apport uniquement quand ouvert depuis le bouton global */}
          {cashModalMode === 'all' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCashModalView('operation');
                  setCashMovementError(null);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                  cashModalView === 'operation'
                    ? 'border-[#204B57] bg-[#204B57] text-white'
                    : 'border-[#E8D8BE] bg-[#FAF8F3] text-[#7D8176]'
                }`}
              >
                <ArrowLeftRight size={14} />
                <span>Opération (Achat · Dépense · Vente)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCashModalView('contribution');
                  setCashMovementError(null);
                }}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                  cashModalView === 'contribution'
                    ? 'border-[#008B62] bg-[#008B62] text-white'
                    : 'border-[#E8D8BE] bg-[#FAF8F3] text-[#7D8176]'
                }`}
              >
                <ArrowDownLeft size={14} />
                <span>Apport financement</span>
              </button>
            </div>
          )}

          {cashModalView === 'contribution' ? (
            <div className="space-y-4">
              <label className="block text-xs font-bold text-[#192A24]">
                Qui apporte le financement ?
                <select
                  value={cashContributor}
                  onChange={(event) => setCashContributor(event.target.value as 'CAMS GOLD' | 'partner')}
                  className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
                >
                  <option value="partner">Partenaire ({modalPartner?.name || 'Partenaire'})</option>
                  <option value="CAMS GOLD">Entreprise CAMS GOLD</option>
                </select>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-[#192A24]">
                  Montant (FCFA)
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={cashAmount}
                    onChange={(event) => setCashAmount(event.target.value)}
                    placeholder="Ex. 5000000"
                    className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono tabular-nums"
                  />
                </label>

                <label className="block text-xs font-bold text-[#192A24]">
                  Mode de règlement
                  <input
                    type="text"
                    value={cashPaymentMode}
                    onChange={(event) => setCashPaymentMode(event.target.value)}
                    placeholder="Espèces / Virement / Mobile Money"
                    className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-xs font-bold text-[#192A24]">
                  Référence remise (facultatif)
                  <input
                    type="text"
                    value={cashCounterparty}
                    onChange={(event) => setCashCounterparty(event.target.value)}
                    placeholder="Nom du remettant / réf..."
                    className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                  />
                </label>

                {modalPartnerContracts.length > 0 && (
                  <label className="block text-xs font-bold text-[#192A24]">
                    Contrat rattaché (facultatif)
                    <select
                      value={cashContractRef}
                      onChange={(event) => setCashContractRef(event.target.value)}
                      className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                    >
                      <option value="">Aucun contrat spécifique</option>
                      {modalPartnerContracts.map((c) => (
                        <option key={c.id} value={c.reference}>
                          {c.reference} · {PARTNERSHIP_SCENARIO_LABELS[c.scenario]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <label className="block text-xs font-bold text-[#192A24]">
                Libellé / Détail de l’apport
                <input
                  type="text"
                  value={cashDescription}
                  onChange={(event) => setCashDescription(event.target.value)}
                  placeholder="Ex. Apport capital campagne achat d’or..."
                  className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[11px] font-medium text-[#7D8176]">
                Saisissez sur la même fiche vos informations dans l’ordre : <strong className="text-[#192A24]">1. Achats d’or</strong>, <strong className="text-[#192A24]">2. Dépense</strong>, puis <strong className="text-[#192A24]">3. Vente d’or</strong> (les sections laissées vides ne seront pas enregistrées).
              </p>

              {/* 1. ACHATS D'OR */}
              <div className="border-l-4 border-l-[#D39725] border border-[#E8D8BE] rounded-xl bg-[#FFFDF8] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#E8D8BE]/70">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#D39725] text-white text-[11px] font-black flex items-center justify-center shrink-0">
                      1
                    </span>
                    <span className="text-xs font-black text-[#192A24] uppercase tracking-wide flex items-center gap-1.5">
                      <ArrowUpRight size={14} className="text-[#D39725]" />
                      Achats d’or
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-[#9E731B]">
                    {buyPreview.amount > 0 ? `− ${formatMoney(buyPreview.amount)} FCFA` : 'Optionnel'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Montant achat (FCFA)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opBuyAmount}
                      onChange={(event) => setOpBuyAmount(event.target.value)}
                      placeholder="Ex. 1500000"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Poids acheté (g)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opBuyWeight}
                      onChange={(event) => setOpBuyWeight(event.target.value)}
                      placeholder="Ex. 25"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Carat (1 – 24)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opBuyKarat}
                      onChange={(event) => setOpBuyKarat(event.target.value)}
                      placeholder="24"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Fournisseur d’or
                    <input
                      type="text"
                      value={opBuyCounterparty}
                      onChange={(event) => setOpBuyCounterparty(event.target.value)}
                      placeholder="Nom fournisseur..."
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-[#E8D8BE] text-xs"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Mode de règlement
                    <input
                      type="text"
                      value={opBuyPaymentMode}
                      onChange={(event) => setOpBuyPaymentMode(event.target.value)}
                      placeholder="Espèces caisse partenaire"
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-[#E8D8BE] text-xs"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Libellé achat (facultatif)
                    <input
                      type="text"
                      value={opBuyDescription}
                      onChange={(event) => setOpBuyDescription(event.target.value)}
                      placeholder="Ex. Lot or brut 22K..."
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-[#E8D8BE] text-xs"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold font-mono tabular-nums text-[#9E731B] pt-1">
                  <span>Prix unitaire : {buyPreview.pricePerGram > 0 ? `${formatMoney(buyPreview.pricePerGram)} FCFA/g` : '—'}</span>
                  <span>Équiv. or fin 24K : {buyPreview.fineGold24k > 0 ? `${formatNumber(buyPreview.fineGold24k, 3)} g` : '—'}</span>
                </div>
              </div>

              {/* 2. DÉPENSE */}
              <div className="border-l-4 border-l-orange-600 border border-[#E8D8BE] rounded-xl bg-orange-50/35 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-orange-200/70">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-orange-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">
                      2
                    </span>
                    <span className="text-xs font-black text-[#192A24] uppercase tracking-wide">
                      Dépense partenaire
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-orange-800">
                    {expensePreviewAmount > 0 ? `− ${formatMoney(expensePreviewAmount)} FCFA` : 'Optionnel'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Montant dépense (FCFA)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opExpenseAmount}
                      onChange={(event) => setOpExpenseAmount(event.target.value)}
                      placeholder="Ex. 25000"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-orange-200 text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Motif de la dépense
                    <input
                      type="text"
                      value={opExpenseDescription}
                      onChange={(event) => setOpExpenseDescription(event.target.value)}
                      placeholder="Transport, fonte, analyse, frais..."
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-orange-200 text-xs"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Bénéficiaire (facultatif)
                    <input
                      type="text"
                      value={opExpenseCounterparty}
                      onChange={(event) => setOpExpenseCounterparty(event.target.value)}
                      placeholder="Nom bénéficiaire / prestataire..."
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-orange-200 text-xs"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Mode de règlement
                    <input
                      type="text"
                      value={opExpensePaymentMode}
                      onChange={(event) => setOpExpensePaymentMode(event.target.value)}
                      placeholder="Espèces caisse partenaire"
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-orange-200 text-xs"
                    />
                  </label>
                </div>
              </div>

              {/* 3. VENTE D'OR */}
              <div className="border-l-4 border-l-[#008B62] border border-[#E8D8BE] rounded-xl bg-emerald-50/35 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-emerald-200/70">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#008B62] text-white text-[11px] font-black flex items-center justify-center shrink-0">
                      3
                    </span>
                    <span className="text-xs font-black text-[#192A24] uppercase tracking-wide flex items-center gap-1.5">
                      <TrendingUp size={14} className="text-[#008B62]" />
                      Vente d’or
                    </span>
                  </div>
                  <span className="text-[11px] font-mono tabular-nums font-bold text-emerald-800">
                    {sellPreview.amount > 0 ? `+ ${formatMoney(sellPreview.amount)} FCFA` : 'Optionnel'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Montant vente (FCFA)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opSellAmount}
                      onChange={(event) => setOpSellAmount(event.target.value)}
                      placeholder="Ex. 1800000"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Poids vendu (g)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opSellWeight}
                      onChange={(event) => setOpSellWeight(event.target.value)}
                      placeholder="Ex. 25"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Carat (1 – 24)
                    <input
                      type="text"
                      inputMode="decimal"
                      value={opSellKarat}
                      onChange={(event) => setOpSellKarat(event.target.value)}
                      placeholder="24"
                      className="mt-1 w-full px-3 py-2 bg-white rounded-xl border border-emerald-200 text-xs font-bold font-mono tabular-nums"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block text-xs font-bold text-[#192A24]">
                    Client / Acheteur
                    <input
                      type="text"
                      value={opSellCounterparty}
                      onChange={(event) => setOpSellCounterparty(event.target.value)}
                      placeholder="Nom client / acheteur..."
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-emerald-200 text-xs"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Mode de règlement
                    <input
                      type="text"
                      value={opSellPaymentMode}
                      onChange={(event) => setOpSellPaymentMode(event.target.value)}
                      placeholder="Espèces caisse partenaire"
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-emerald-200 text-xs"
                    />
                  </label>
                  <label className="block text-xs font-bold text-[#192A24]">
                    Libellé vente (facultatif)
                    <input
                      type="text"
                      value={opSellDescription}
                      onChange={(event) => setOpSellDescription(event.target.value)}
                      placeholder="Ex. Vente lingot fondu..."
                      className="mt-1 w-full px-3 py-1.5 bg-white rounded-xl border border-emerald-200 text-xs"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold font-mono tabular-nums text-emerald-900 pt-1">
                  <span>Prix unitaire : {sellPreview.pricePerGram > 0 ? `${formatMoney(sellPreview.pricePerGram)} FCFA/g` : '—'}</span>
                  <span>Équiv. or fin 24K : {sellPreview.fineGold24k > 0 ? `${formatNumber(sellPreview.fineGold24k, 3)} g` : '—'}</span>
                </div>
              </div>

              {/* Contrat rattaché (facultatif) */}
              {modalPartnerContracts.length > 0 && (
                <label className="block text-xs font-bold text-[#192A24]">
                  Contrat de partenariat rattaché (facultatif)
                  <select
                    value={cashContractRef}
                    onChange={(event) => setCashContractRef(event.target.value)}
                    className="mt-1 w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                  >
                    <option value="">Aucun contrat spécifique</option>
                    {modalPartnerContracts.map((c) => (
                      <option key={c.id} value={c.reference}>
                        {c.reference} · {PARTNERSHIP_SCENARIO_LABELS[c.scenario]}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {/* Récapitulatif en direct */}
              {(buyPreview.amount > 0 || expensePreviewAmount > 0 || sellPreview.amount > 0) && (() => {
                const netDelta = sellPreview.amount - buyPreview.amount - expensePreviewAmount;
                const projectedBalance = modalPartnerBalance + netDelta;
                return (
                  <div className="rounded-xl border border-[#192A24]/20 bg-[#FAF8F3] p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#7D8176] block">1. Achats d’or</span>
                      <span className="font-mono tabular-nums font-black text-[#9E731B]">
                        − {formatMoney(buyPreview.amount)} F
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#7D8176] block">2. Dépense</span>
                      <span className="font-mono tabular-nums font-black text-orange-800">
                        − {formatMoney(expensePreviewAmount)} F
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#7D8176] block">3. Ventes d’or</span>
                      <span className="font-mono tabular-nums font-black text-emerald-800">
                        + {formatMoney(sellPreview.amount)} F
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase text-[#7D8176] block">Solde après op.</span>
                      <span className={`font-mono tabular-nums font-black ${projectedBalance >= 0 ? 'text-[#192A24]' : 'text-red-700'}`}>
                        {formatMoney(projectedBalance)} F
                      </span>
                      <span className={`block text-[10px] font-mono tabular-nums font-bold ${netDelta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        Net : {netDelta >= 0 ? '+' : '−'}{formatMoney(Math.abs(netDelta))} F
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-semibold text-[#192A24] cursor-pointer">
            <input
              type="checkbox"
              checked={openSlipAfterSave}
              onChange={(e) => setOpenSlipAfterSave(e.target.checked)}
              className="rounded accent-[#008B62]"
            />
            <span>Ouvrir le bordereau officiel partageable après enregistrement</span>
          </label>

          {cashMovementError && (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs font-semibold text-red-700">{cashMovementError}</p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-[#E8D8BE]/70">
            <button
              type="button"
              onClick={() => setShowCashMovementModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#D39725] hover:bg-[#c2871b] text-white cursor-pointer">
              Enregistrer & Générer Bordereau
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: NEW CONTRACT (AVEC INVESTISSEMENT ENTREPRISE + PARTENAIRE + BORDEREAU) */}
      <Modal
        isOpen={showNewContractModal}
        onClose={() => setShowNewContractModal(false)}
        title="Nouveau contrat de partenariat"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateContract} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Partenaire co-contractant</label>
            <select
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
            >
              {store.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type} - {p.city || '—'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Scénario de partenariat</label>
            <select
              value={selectedScenario}
              onChange={(e) => setSelectedScenario(e.target.value as PartnershipScenario)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            >
              {Object.entries(PARTNERSHIP_SCENARIO_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#9E731B] mb-1">
                Investi par l’entreprise CAMS GOLD (FCFA)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={companyFinancialContrib}
                onChange={(e) => setCompanyFinancialContrib(e.target.value)}
                placeholder="Ex. 5000000"
                className="w-full px-3 py-2 bg-[#FFF9EA] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-blue-900 mb-1">
                Investi par le partenaire (FCFA)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={financialContrib}
                onChange={(e) => setFinancialContrib(e.target.value)}
                placeholder="Ex. 5000000"
                className="w-full px-3 py-2 bg-blue-50/50 rounded-xl border border-blue-200 text-xs font-bold text-[#192A24]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">Partenaire (% bénéfice)</label>
              <input
                type="text"
                inputMode="decimal"
                value={remunerationVal}
                onChange={(e) => setRemunerationVal(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
              />
            </div>
            <div className="p-2.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] text-xs">
              <div className="text-[10px] text-[#7D8176]">Part entreprise (CAMS GOLD)</div>
              <div className="font-black text-[#192A24]">
                {Math.max(0, 100 - (parseFloat(remunerationVal.replace(',', '.') || '50') || 0))}% des bénéfices
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-[#192A24] cursor-pointer bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-200">
            <input
              type="checkbox"
              checked={creditCashOnContractCreate}
              onChange={(e) => setCreditCashOnContractCreate(e.target.checked)}
              className="rounded accent-[#008B62]"
            />
            <span>Alimenter la caisse du partenaire avec ces apports et générer les bordereaux</span>
          </label>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Clauses / Note convention</label>
            <textarea
              rows={2}
              value={contractNote}
              onChange={(e) => setContractNote(e.target.value)}
              placeholder="ex: Financement achat lingots bruts, durée et conditions de partage..."
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewContractModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#D39725] hover:bg-[#c2871b] text-white cursor-pointer">
              Créer contrat & Voir Bordereau
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: BORDEREAU DE CONTRAT PARTAGEABLE */}
      <Modal
        isOpen={Boolean(viewingContract)}
        onClose={() => setViewingContract(null)}
        title={`Bordereau de Contrat · ${viewingContract?.reference || ''}`}
        maxWidth="max-w-3xl"
        printMode={true}
      >
        {viewingContract && (() => {
          const inv = getPartnershipInvestments(viewingContract);
          const whatsappText = buildPartnershipContractWhatsAppMessage(viewingContract);
          return (
            <div className="space-y-5">
              {/* Barre d'actions partage */}
              <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                <span className="text-xs font-bold text-[#7D8176]">
                  Partager ou archiver ce bordereau de contrat :
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleShareContract(viewingContract)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer"
                  >
                    <Share2 size={14} />
                    <span>Partager / WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPartnershipContractPdf(viewingContract, store.userName)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Télécharger PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(viewingContract.id, whatsappText)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer"
                  >
                    {copiedId === viewingContract.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedId === viewingContract.id ? 'Copié' : 'Copier texte'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Imprimer</span>
                  </button>
                </div>
              </div>

              {/* Aperçu officiel du Bordereau de Contrat */}
              <div className="border-2 border-[#192A24] rounded-2xl p-6 bg-white space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-[#192A24] pb-4">
                  <div>
                    <div className="text-xl font-black text-[#192A24] tracking-tight">CAMS GOLD</div>
                    <div className="text-[11px] font-extrabold text-[#D39725] tracking-wider uppercase">
                      Bordereau Officiel de Convention de Partenariat
                    </div>
                    <div className="text-xs text-[#7D8176] mt-1">
                      {PARTNERSHIP_SCENARIO_LABELS[viewingContract.scenario]}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="inline-block px-3 py-1 rounded-lg bg-[#192A24] text-[#F2BD45] font-mono text-xs font-black">
                      CONTRAT N° {viewingContract.reference}
                    </span>
                    <div className="text-xs text-[#7D8176] mt-1.5">
                      Date : {formatDateTime(viewingContract.createdAt)}
                    </div>
                    <div className="text-xs font-semibold text-emerald-800">
                      Statut : {PARTNERSHIP_STATUS_LABELS[viewingContract.status]}
                    </div>
                  </div>
                </div>

                {/* Répartition des investissements */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-[#FFF9EA] border border-[#E8D8BE]">
                    <div className="text-[10px] font-bold uppercase text-[#9E731B]">
                      Investi par l’entreprise (CAMS GOLD)
                    </div>
                    <div className="mt-1 text-lg font-black text-[#192A24]">
                      {formatMoney(inv.companyInvestmentXaf)} FCFA
                    </div>
                    <div className="text-xs text-[#7D8176] mt-0.5">
                      Capital : {formatNumber(inv.companyShareCapitalPct, 1)}% · Bénéfice : {inv.companyProfitPct}%
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200">
                    <div className="text-[10px] font-bold uppercase text-blue-900">
                      Investi par {inv.partnerNames}
                    </div>
                    <div className="mt-1 text-lg font-black text-[#192A24]">
                      {formatMoney(inv.partnerInvestmentXaf)} FCFA
                    </div>
                    <div className="text-xs text-[#7D8176] mt-0.5">
                      Capital : {formatNumber(inv.partnerShareCapitalPct, 1)}% · Bénéfice : {inv.partnerProfitPct}%
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[10px] font-bold uppercase text-emerald-800">
                      Capital Total Engagé
                    </div>
                    <div className="mt-1 text-lg font-black text-emerald-950">
                      {formatMoney(inv.totalInvestmentXaf)} FCFA
                    </div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      {inv.totalInvestmentXaf > 0
                        ? `${numberToWordsFr(Math.round(inv.totalInvestmentXaf))} francs CFA`
                        : 'Partenariat opérationnel'}
                    </div>
                  </div>
                </div>

                {/* Clauses */}
                <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                  <div className="text-[11px] font-bold uppercase text-[#7D8176] mb-1">
                    Clauses & Observations
                  </div>
                  <p className="text-xs text-[#192A24] leading-relaxed">
                    {viewingContract.note || 'Convention commerciale établie entre CAMS GOLD et le partenaire.'}
                  </p>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-6 pt-4">
                  <div className="border border-dashed border-gray-300 rounded-xl p-4 h-24 flex flex-col justify-between">
                    <span className="text-xs font-bold text-[#192A24]">Pour CAMS GOLD (L’Entreprise)</span>
                    <span className="text-[10px] text-gray-400 italic">Signature & Cachet</span>
                  </div>
                  <div className="border border-dashed border-gray-300 rounded-xl p-4 h-24 flex flex-col justify-between text-right">
                    <span className="text-xs font-bold text-[#192A24]">Pour {inv.partnerNames}</span>
                    <span className="text-[10px] text-gray-400 italic">Lu et approuvé · Signature</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* MODAL: BORDEREAU OPÉRATION + DÉPENSE + BILAN COMPLET PARTENAIRE */}
      <Modal
        isOpen={Boolean(viewingMovement)}
        onClose={() => setViewingMovement(null)}
        title={`Bordereau Partenaire · ${viewingMovement?.movement.reference || ''}`}
        maxWidth="max-w-2xl"
        printMode={true}
      >
        {viewingMovement && (() => {
          const { movement, partner, balanceAfter } = viewingMovement;
          const targetPartner =
            partner ||
            store.partners.find((p) => p.id === movement.partnerId) ||
            null;
          const partnerSummary = targetPartner
            ? toSummarySnapshot(getPartnerCashStats(targetPartner))
            : undefined;
          const netDelta = getMovementCashDelta(movement);
          const isInflow = netDelta >= 0;
          const attachedExpense = movement.expenseAmountXaf || 0;
          const partnerDisplay = targetPartner?.name || movement.partnerName || 'Partenaire';
          const ref = movement.reference || movement.id.slice(-8).toUpperCase();
          const whatsappText = buildPartnershipMovementWhatsAppMessage(
            movement,
            targetPartner,
            balanceAfter,
            partnerSummary
          );

          return (
            <div className="space-y-5">
              {/* Barre d'actions */}
              <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                <span className="text-xs font-bold text-[#7D8176]">
                  Partager ou imprimer ce bordereau complet :
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleShareMovement(movement, targetPartner, balanceAfter, partnerSummary)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer"
                  >
                    <Share2 size={14} />
                    <span>Partager / WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadPartnershipMovementPdf(
                        movement,
                        targetPartner,
                        balanceAfter,
                        store.userName,
                        partnerSummary
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Télécharger PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(movement.id, whatsappText)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer"
                  >
                    {copiedId === movement.id ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    <span>{copiedId === movement.id ? 'Copié' : 'Copier'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Imprimer</span>
                  </button>
                </div>
              </div>

              {/* Aperçu Bordereau */}
              <div className="border-2 border-[#192A24] rounded-2xl p-6 bg-white space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-[#192A24] pb-4">
                  <div>
                    <div className="text-xl font-black text-[#192A24]">CAMS GOLD</div>
                    <div className="text-[11px] font-extrabold text-[#D39725] uppercase tracking-wider">
                      {getMovementTypeTitle(movement)}
                    </div>
                    <div className="text-xs text-[#7D8176] mt-0.5">
                      Caisse dédiée : CAMS GOLD ↔ {partnerDisplay}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="inline-block px-3 py-1 rounded-lg bg-[#192A24] text-[#F2BD45] font-mono text-xs font-black">
                      N° {ref}
                    </span>
                    <div className="text-xs text-[#7D8176] mt-1">
                      {formatDateTime(movement.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Montant principal */}
                <div
                  className={`p-4 rounded-xl border ${
                    isInflow
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className={`text-[11px] font-bold uppercase ${isInflow ? 'text-emerald-800' : 'text-red-800'}`}>
                    {isInflow ? 'Entrée nette en caisse partenaire' : 'Sortie nette de caisse partenaire'}
                  </div>
                  <div className={`text-2xl font-black mt-0.5 ${isInflow ? 'text-emerald-900' : 'text-red-900'}`}>
                    {isInflow ? '+' : '−'} {formatMoney(Math.abs(netDelta))} FCFA
                  </div>
                  <div className="text-xs italic text-gray-700 mt-1">
                    {attachedExpense > 0
                      ? `Opération : ${formatMoney(movement.amountXaf)} FCFA · Dépense partenaire : −${formatMoney(attachedExpense)} FCFA`
                      : `Arrêté à la somme de : ${numberToWordsFr(Math.round(Math.abs(netDelta)))} francs CFA`}
                  </div>
                </div>

                {/* Détails structurés */}
                <div className="divide-y divide-[#E8D8BE]/60 border border-[#E8D8BE] rounded-xl overflow-hidden text-xs">
                  <div className="flex justify-between p-3 bg-[#FAF8F3]">
                    <span className="font-bold text-[#7D8176]">Libellé</span>
                    <span className="font-bold text-[#192A24] text-right">{movement.description}</span>
                  </div>
                  <div className="flex justify-between p-3">
                    <span className="font-bold text-[#7D8176]">
                      {movement.type === 'goldPurchase'
                        ? 'Montant achat d’or'
                        : movement.type === 'goldSale'
                          ? 'Montant brut vente d’or'
                          : 'Montant opération'}
                    </span>
                    <span className="font-bold text-[#192A24]">
                      {formatMoney(movement.amountXaf)} FCFA
                    </span>
                  </div>
                  {attachedExpense > 0 && (
                    <div className="flex justify-between p-3 bg-orange-50/70">
                      <span className="font-bold text-orange-900">Dépense partenaire rattachée</span>
                      <span className="font-black text-orange-900 text-right">
                        − {formatMoney(attachedExpense)} FCFA
                        {movement.expenseDescription ? ` (${movement.expenseDescription})` : ''}
                      </span>
                    </div>
                  )}
                  {movement.type === 'contribution' && (
                    <div className="flex justify-between p-3">
                      <span className="font-bold text-[#7D8176]">Source du financement</span>
                      <span className="font-bold text-[#192A24]">
                        {movement.contributor === 'CAMS GOLD'
                          ? 'Entreprise CAMS GOLD'
                          : `Partenaire (${partnerDisplay})`}
                      </span>
                    </div>
                  )}
                  {movement.weightGrams !== undefined && movement.karat !== undefined && (
                    <div className="flex justify-between p-3">
                      <span className="font-bold text-[#7D8176]">Poids & Carat</span>
                      <span className="font-bold text-[#192A24]">
                        {formatNumber(movement.weightGrams, 3)} g · {formatNumber(movement.karat, 2)} K (24K :{' '}
                        {formatNumber((movement.weightGrams * movement.karat) / 24, 3)} g)
                      </span>
                    </div>
                  )}
                  {movement.pricePerGramXaf && (
                    <div className="flex justify-between p-3">
                      <span className="font-bold text-[#7D8176]">Prix unitaire</span>
                      <span className="font-bold text-[#192A24]">
                        {formatMoney(movement.pricePerGramXaf)} FCFA / g
                      </span>
                    </div>
                  )}
                  {movement.counterpartyName && (
                    <div className="flex justify-between p-3">
                      <span className="font-bold text-[#7D8176]">Tiers concerné</span>
                      <span className="font-bold text-[#192A24]">{movement.counterpartyName}</span>
                    </div>
                  )}
                  {movement.contractRef && (
                    <div className="flex justify-between p-3">
                      <span className="font-bold text-[#7D8176]">Contrat rattaché</span>
                      <span className="font-mono font-bold text-[#D39725]">{movement.contractRef}</span>
                    </div>
                  )}
                  {movement.paymentMode && (
                    <div className="flex justify-between p-3">
                      <span className="font-bold text-[#7D8176]">Mode de règlement</span>
                      <span className="font-bold text-[#192A24]">{movement.paymentMode}</span>
                    </div>
                  )}
                  <div className="flex justify-between p-3 bg-emerald-50/70">
                    <span className="font-bold text-emerald-900">Solde Caisse Partenaire après opération</span>
                    <span className="font-black text-emerald-900">{formatMoney(balanceAfter)} FCFA</span>
                  </div>
                </div>

                {/* Bilan cumulé sur le même bordereau : Achats, Ventes, Dépenses, Bénéfice */}
                {partnerSummary && (
                  <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-2.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-[#192A24]">
                      Bilan Partenariat Cumulé (Achats · Ventes · Dépenses · Bénéfice)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                        <div className="text-[10px] font-bold text-red-800 uppercase">Achats d’or</div>
                        <div className="font-black text-red-900 mt-0.5">
                          {formatMoney(partnerSummary.purchasesTotal)} F
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                        <div className="text-[10px] font-bold text-emerald-800 uppercase">Ventes d’or</div>
                        <div className="font-black text-emerald-900 mt-0.5">
                          {formatMoney(partnerSummary.salesTotal)} F
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-orange-50 border border-orange-200">
                        <div className="text-[10px] font-bold text-orange-800 uppercase">Dépenses</div>
                        <div className="font-black text-orange-900 mt-0.5">
                          {formatMoney(partnerSummary.expensesTotal)} F
                        </div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[#192A24] text-white">
                        <div className="text-[10px] font-bold text-[#F2BD45] uppercase">Bénéfice Net</div>
                        <div
                          className={`font-black mt-0.5 ${
                            partnerSummary.benefitTotal >= 0 ? 'text-emerald-300' : 'text-red-300'
                          }`}
                        >
                          {partnerSummary.benefitTotal >= 0 ? '+' : ''}
                          {formatMoney(partnerSummary.benefitTotal)} F
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-[#7D8176] flex flex-wrap justify-between gap-2 pt-1 border-t border-[#E8D8BE]">
                      <span>
                        Apports : CAMS {formatMoney(partnerSummary.camsGoldContrib)} F · {partnerDisplay}{' '}
                        {formatMoney(partnerSummary.partnerContrib)} F
                      </span>
                      <span className="font-bold text-[#192A24]">
                        Partage : CAMS ({partnerSummary.companyProfitSharePct}%) {formatMoney(partnerSummary.companyProfitAmount)} F ·{' '}
                        {partnerDisplay} ({partnerSummary.partnerProfitSharePct}%) {formatMoney(partnerSummary.partnerProfitAmount)} F
                      </span>
                    </div>
                  </div>
                )}

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-6 pt-2">
                  <div className="border border-dashed border-gray-300 rounded-xl p-3 h-20 flex flex-col justify-between">
                    <span className="text-xs font-bold text-[#192A24]">Visa CAMS GOLD</span>
                    <span className="text-[10px] text-gray-400 italic">{movement.createdBy || store.userName}</span>
                  </div>
                  <div className="border border-dashed border-gray-300 rounded-xl p-3 h-20 flex flex-col justify-between text-right">
                    <span className="text-xs font-bold text-[#192A24]">Visa {partnerDisplay}</span>
                    <span className="text-[10px] text-gray-400 italic">Signature partenaire</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* MODAL: BORDEREAU RÉCAPITULATIF COMPLET PARTENAIRE */}
      <Modal
        isOpen={Boolean(viewingSummaryPartner)}
        onClose={() => setViewingSummaryPartner(null)}
        title={`Bordereau Complet · ${viewingSummaryPartner?.name || ''}`}
        maxWidth="max-w-3xl"
        printMode={true}
      >
        {viewingSummaryPartner && (() => {
          const stats = getPartnerCashStats(viewingSummaryPartner);
          const summary = toSummarySnapshot(stats);
          const summaryText = buildPartnershipSummaryWhatsAppMessage(viewingSummaryPartner, summary);
          const sortedMovements = [...stats.movements].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt)
          );

          return (
            <div className="space-y-5">
              <div className="no-print flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE]">
                <span className="text-xs font-bold text-[#7D8176]">
                  Envoyer le bordereau récapitulatif complet (Achats, Ventes, Dépenses, Bénéfice) :
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleShareSummary(viewingSummaryPartner, summary, stats.movements)
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#008B62] hover:bg-[#007452] text-white text-xs font-bold cursor-pointer"
                  >
                    <Share2 size={14} />
                    <span>Partager / WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadPartnershipSummaryPdf(
                        viewingSummaryPartner,
                        summary,
                        stats.movements,
                        store.userName
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Télécharger PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText(`summary-${viewingSummaryPartner.id}`, summaryText)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer"
                  >
                    {copiedId === `summary-${viewingSummaryPartner.id}` ? (
                      <Check size={14} className="text-emerald-600" />
                    ) : (
                      <Copy size={14} />
                    )}
                    <span>
                      {copiedId === `summary-${viewingSummaryPartner.id}` ? 'Copié' : 'Copier texte'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer"
                  >
                    <Printer size={14} />
                    <span>Imprimer</span>
                  </button>
                </div>
              </div>

              <div className="border-2 border-[#192A24] rounded-2xl p-6 bg-white space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b-2 border-[#192A24] pb-4">
                  <div>
                    <div className="text-xl font-black text-[#192A24]">CAMS GOLD</div>
                    <div className="text-[11px] font-extrabold text-[#D39725] uppercase tracking-wider">
                      Bordereau Récapitulatif de Partenariat
                    </div>
                    <div className="text-xs text-[#7D8176] mt-0.5">
                      CAMS GOLD ↔ {viewingSummaryPartner.name} ({viewingSummaryPartner.type})
                    </div>
                  </div>
                  <div className="sm:text-right text-xs text-[#7D8176]">
                    <div>Édité le : {formatDateTime(new Date().toISOString())}</div>
                    <div className="font-bold text-[#192A24] mt-0.5">
                      Solde caisse : {formatMoney(summary.balance)} FCFA
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                    <div className="text-[10px] font-bold uppercase text-red-800">Achats d’or</div>
                    <div className="mt-1 text-base font-black text-red-900">
                      {formatMoney(summary.purchasesTotal)} FCFA
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="text-[10px] font-bold uppercase text-emerald-800">Ventes d’or</div>
                    <div className="mt-1 text-base font-black text-emerald-900">
                      {formatMoney(summary.salesTotal)} FCFA
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
                    <div className="text-[10px] font-bold uppercase text-orange-800">Dépenses</div>
                    <div className="mt-1 text-base font-black text-orange-900">
                      {formatMoney(summary.expensesTotal)} FCFA
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#192A24] text-white">
                    <div className="text-[10px] font-bold uppercase text-[#F2BD45]">Bénéfice Net</div>
                    <div
                      className={`mt-1 text-base font-black ${
                        summary.benefitTotal >= 0 ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {summary.benefitTotal >= 0 ? '+' : ''}
                      {formatMoney(summary.benefitTotal)} FCFA
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] text-xs flex flex-wrap justify-between gap-2">
                  <span>
                    Apports : CAMS GOLD <strong>{formatMoney(summary.camsGoldContrib)} F</strong> ·{' '}
                    {viewingSummaryPartner.name} <strong>{formatMoney(summary.partnerContrib)} F</strong>
                  </span>
                  <span>
                    Partage : CAMS ({summary.companyProfitSharePct}%){' '}
                    <strong>{formatMoney(summary.companyProfitAmount)} F</strong> · Partenaire ({summary.partnerProfitSharePct}%){' '}
                    <strong>{formatMoney(summary.partnerProfitAmount)} F</strong>
                  </span>
                </div>

                <div className="overflow-x-auto border border-[#E8D8BE] rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#192A24] text-white">
                        <th className="py-2 px-3">Réf.</th>
                        <th className="py-2 px-3">Opération</th>
                        <th className="py-2 px-3">Or / Dépense</th>
                        <th className="py-2 px-3 text-right">Impact caisse</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8D8BE]/60">
                      {sortedMovements.map((m) => {
                        const net = getMovementCashDelta(m);
                        const exp = m.expenseAmountXaf || 0;
                        return (
                          <tr key={m.id} className="hover:bg-[#FAF8F3]">
                            <td className="py-2 px-3 font-mono font-bold text-[#D39725] whitespace-nowrap">
                              {m.reference || m.id.slice(-8).toUpperCase()}
                            </td>
                            <td className="py-2 px-3">
                              <div className="font-bold text-[#192A24]">{m.description}</div>
                              <div className="text-[10px] text-[#7D8176]">{formatDateTime(m.createdAt)}</div>
                            </td>
                            <td className="py-2 px-3 text-[11px]">
                              {m.weightGrams !== undefined && (
                                <div>
                                  {formatNumber(m.weightGrams, 2)} g · {formatNumber(m.karat || 24, 1)}K
                                </div>
                              )}
                              {exp > 0 && (
                                <div className="font-bold text-orange-800">
                                  Dépense : −{formatMoney(exp)} F
                                  {m.expenseDescription ? ` (${m.expenseDescription})` : ''}
                                </div>
                              )}
                              {m.weightGrams === undefined && exp === 0 && '—'}
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-black whitespace-nowrap ${
                                net >= 0 ? 'text-emerald-700' : 'text-red-700'
                              }`}
                            >
                              {net >= 0 ? '+' : '−'} {formatMoney(Math.abs(net))} F
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Modal New Loan */}
      <Modal
        isOpen={showNewLoanModal}
        onClose={() => setShowNewLoanModal(false)}
        title="Nouvelle avance ou prêt"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateLoan} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Direction de l'avance</label>
            <select
              value={loanDirection}
              onChange={(e) => setLoanDirection(e.target.value as PartnershipLoanDirection)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            >
              <option value="companyBorrows">L’entreprise emprunte (Partenaire prête)</option>
              <option value="companyLends">L’entreprise prête (Partenaire emprunte)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Partenaire concerné</label>
            <select
              value={loanPartnerId}
              onChange={(e) => setLoanPartnerId(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
            >
              {store.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Montant principal (FCFA)</label>
            <input
              type="text"
              required
              value={loanPrincipal}
              onChange={(e) => setLoanPrincipal(e.target.value)}
              placeholder="ex: 10000000"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Date d'échéance prévue</label>
            <input
              type="date"
              value={loanDueDate}
              onChange={(e) => setLoanDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Motif / Objet</label>
            <input
              type="text"
              value={loanNote}
              onChange={(e) => setLoanNote(e.target.value)}
              placeholder="ex: Avance de campagne d'achat"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewLoanModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#192A24] text-white cursor-pointer">
              Enregistrer le prêt
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Repayment */}
      <Modal
        isOpen={Boolean(repayingLoanId)}
        onClose={() => setRepayingLoanId(null)}
        title="Enregistrer un remboursement"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmRepayment} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Montant remboursé (FCFA)</label>
            <input
              type="text"
              required
              value={repaymentAmount}
              onChange={(e) => setRepaymentAmount(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Note de versement</label>
            <input
              type="text"
              value={repaymentNote}
              onChange={(e) => setRepaymentNote(e.target.value)}
              placeholder="ex: Virement bancaire / Espèces reçues"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRepayingLoanId(null)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#008B62] text-white cursor-pointer">
              Valider le remboursement
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Add Partner */}
      <Modal
        isOpen={showNewPartnerModal}
        onClose={() => setShowNewPartnerModal(false)}
        title="Nouveau partenaire"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreatePartner} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Nom complet / Société</label>
            <input
              type="text"
              required
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="ex: Fonderie du Mali"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Téléphone</label>
            <input
              type="text"
              value={partnerPhone}
              onChange={(e) => setPartnerPhone(e.target.value)}
              placeholder="+223 ..."
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Ville</label>
            <input
              type="text"
              value={partnerCity}
              onChange={(e) => setPartnerCity(e.target.value)}
              placeholder="Bamako"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Rôle / Type</label>
            <select
              value={partnerType}
              onChange={(e) => setPartnerType(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
            >
              <option value="Investisseur">Investisseur</option>
              <option value="Transformateur">Transformateur / Fondeur</option>
              <option value="Apporteur d’affaires">Apporteur d’affaires</option>
              <option value="Opérateur">Opérateur minier</option>
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNewPartnerModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#008B62] text-white cursor-pointer">
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
