import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Coins,
  ArrowLeftRight,
  Plus,
  Minus,
  Sliders,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  Banknote,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '../../context/AppContext';
import { AppPanel, Modal, PageHeading, SectionHeading } from '../common/UIComponents';
import {
  calculateFineGoldStockOunces,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatOunces,
  getUnsoldPurchases,
  goldKaratValue,
  TROY_OUNCE_IN_GRAMS,
} from '../../utils/goldMath';
import { GOLD_STOCK_CATEGORIES, GoldCategory, CurrencyStockMovement } from '../../types';

type StockScreenMode = 'all' | 'gold' | 'currency';
type CurrencyWalletTarget = 'physical' | 'gold_currency';

export const StockScreen: React.FC<{
  mode?: StockScreenMode;
  defaultTab?: 'gold' | 'currency';
}> = ({ mode = 'all', defaultTab = 'gold' }) => {
  const store = useAppStore();
  const canBuyCurrency = store.canAccessService(3, 'currency.buy');
  const canSellCurrency = store.canAccessService(3, 'currency.sell');
  const canAdjustCurrency = store.canAccessService(3, 'currency.adjust');
  const canViewCurrencyHistory = store.canAccessService(3, 'currency.history');
  const [activeTab, setActiveTab] = useState<'gold' | 'currency'>(defaultTab);
  const [currencyView, setCurrencyView] = useState<'physical' | 'gold_currency'>('physical');
  const currentTab = mode === 'currency' ? 'currency' : mode === 'gold' ? 'gold' : activeTab;
  const canAddPhysicalBalance = canAdjustCurrency || canBuyCurrency;


  // Gold Adjustment Modal
  const [showGoldAdjModal, setShowGoldAdjModal] = useState(false);
  const [goldKarat, setGoldKarat] = useState('24K');
  const [goldCategory, setGoldCategory] = useState<GoldCategory>('Or brut');
  const [goldWeightGrams, setGoldWeightGrams] = useState('');
  const [goldReason, setGoldReason] = useState('');
  const [goldError, setGoldError] = useState<string | null>(null);

  // Currency Adjustment / Add Balance Modal
  const [showCurAdjModal, setShowCurAdjModal] = useState(false);
  const [curCurrency, setCurCurrency] = useState('USD');
  const [curAmount, setCurAmount] = useState('');
  const [curIsAddition, setCurIsAddition] = useState(true);
  const [curReason, setCurReason] = useState('');
  const [curTargetWallet, setCurTargetWallet] = useState<CurrencyWalletTarget>('physical');
  const [curError, setCurError] = useState<string | null>(null);

  // Transfer Gold Currency -> Physical Safe Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferCurrency, setTransferCurrency] = useState('USD');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  // Currency BUY Modal (Achat de devise / Achat devise d'or)
  const [showBuyCurModal, setShowBuyCurModal] = useState(false);
  const [buyTargetWallet, setBuyTargetWallet] = useState<CurrencyWalletTarget>('physical');
  const [buyCurrencyCode, setBuyCurrencyCode] = useState('USD');
  const [buyAmount, setBuyAmount] = useState('');
  const [buyRate, setBuyRate] = useState('605');
  const [buyPaymentMode, setBuyPaymentMode] = useState<'cash' | 'partial' | 'credit'>('cash');
  const [buyPaidXaf, setBuyPaidXaf] = useState('');
  const [buyDueDate, setBuyDueDate] = useState('');
  const [buyPaymentAccount, setBuyPaymentAccount] = useState('Caisse (espèces)');
  const [buyContact, setBuyContact] = useState('');
  const [buyNotes, setBuyNotes] = useState('');
  const [buyError, setBuyError] = useState<string | null>(null);

  // Currency SELL Modal (Vente de devise / Vente devise d'or)
  const [showSellCurModal, setShowSellCurModal] = useState(false);
  const [sellTargetWallet, setSellTargetWallet] = useState<CurrencyWalletTarget>('physical');
  const [sellCurrencyCode, setSellCurrencyCode] = useState('USD');
  const [sellAmount, setSellAmount] = useState('');
  const [sellRate, setSellRate] = useState('625');
  const [sellPaymentMode, setSellPaymentMode] = useState<'cash' | 'partial' | 'credit'>('cash');
  const [sellPaidXaf, setSellPaidXaf] = useState('');
  const [sellDueDate, setSellDueDate] = useState('');
  const [sellReceiptAccount, setSellReceiptAccount] = useState('Caisse (espèces)');
  const [sellContact, setSellContact] = useState('');
  const [sellNotes, setSellNotes] = useState('');
  const [sellError, setSellError] = useState<string | null>(null);

  // Credit Settlement Modal (Règlement / Encaissement d'un crédit devise)
  const [creditPaymentModal, setCreditPaymentModal] = useState<{
    movement: CurrencyStockMovement;
    targetWallet: CurrencyWalletTarget;
  } | null>(null);
  const [creditPayAmount, setCreditPayAmount] = useState('');
  const [creditPayAccount, setCreditPayAccount] = useState('Caisse (espèces)');
  const [creditPayNote, setCreditPayNote] = useState('');
  const [creditPayError, setCreditPayError] = useState<string | null>(null);

  // Success notifications
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Currency movements filter
  const [curMovFilter, setCurMovFilter] = useState<
    'ALL' | 'ACHAT' | 'VENTE' | 'CREDIT' | 'AJUSTEMENT'
  >('ALL');
  const [goldCurMovFilter, setGoldCurMovFilter] = useState<
    'ALL' | 'ACHAT_OR' | 'VENTE_OR' | 'ENCAISSEMENT' | 'CREDIT' | 'AJUSTEMENT'
  >('ALL');

  const standardKarats = ['24K', '22K', '21K', '18K', '14K', '9K'];
  const currencyList = ['USD', 'EUR', 'AED', 'CNY', 'GBP', 'XOF', 'CAD', 'CHF'];

  // Open Add / Adjust currency modal
  const openAddPhysicalModal = (
    code: string = 'USD',
    isAddition: boolean = true,
    wallet: CurrencyWalletTarget = 'physical'
  ) => {
    setCurTargetWallet(wallet);
    setCurCurrency(code);
    setCurIsAddition(isAddition);
    setCurAmount('');
    setCurReason(
      isAddition
        ? wallet === 'gold_currency'
          ? 'Approvisionnement Devise d’or'
          : 'Approvisionnement du solde physique'
        : ''
    );
    setCurError(null);
    setShowCurAdjModal(true);
  };

  // Open Transfer from Devise d'or to Solde physique modal
  const openTransferModal = (code: string = 'USD') => {
    setTransferCurrency(code);
    setTransferAmount('');
    setTransferReason(`Transfert Devise d’or → Solde physique (${code})`);
    setTransferError(null);
    setShowTransferModal(true);
  };

  // Open Buy modal
  const openBuyModal = (
    code: string = 'USD',
    wallet: CurrencyWalletTarget = 'physical'
  ) => {
    setBuyTargetWallet(wallet);
    setBuyCurrencyCode(code);
    setBuyRate('');
    setBuyAmount('');
    setBuyPaymentMode('cash');
    setBuyPaidXaf('');
    setBuyDueDate('');
    setBuyContact('');
    setBuyNotes('');
    setBuyError(null);
    setShowBuyCurModal(true);
  };

  // Open Sell modal
  const openSellModal = (
    code: string = 'USD',
    wallet: CurrencyWalletTarget = 'physical'
  ) => {
    setSellTargetWallet(wallet);
    setSellCurrencyCode(code);
    setSellRate('');
    setSellAmount('');
    setSellPaymentMode('cash');
    setSellPaidXaf('');
    setSellDueDate('');
    setSellContact('');
    setSellNotes('');
    setSellError(null);
    setShowSellCurModal(true);
  };

  const openCreditPaymentModal = (
    movement: CurrencyStockMovement,
    targetWallet: CurrencyWalletTarget
  ) => {
    const remaining = movement.remainingXaf ?? 0;
    setCreditPaymentModal({ movement, targetWallet });
    setCreditPayAmount(remaining > 0 ? String(remaining) : '');
    setCreditPayAccount('Caisse (espèces)');
    setCreditPayNote('');
    setCreditPayError(null);
  };

  // Handlers
  const handleAdjustGold = (e: React.FormEvent) => {
    e.preventDefault();
    setGoldError(null);
    const weight = parseFloat(goldWeightGrams.replace(',', '.') || '0');
    if (!weight) {
      setGoldError('Veuillez spécifier un poids non nul.');
      return;
    }
    if (!goldReason.trim()) {
      setGoldError('Le motif est requis.');
      return;
    }
    try {
      store.adjustGoldStock({
        karat: goldKarat,
        category: goldCategory,
        weightGrams: weight,
        reason: goldReason.trim(),
      });
      setShowGoldAdjModal(false);
      setGoldWeightGrams('');
      setGoldReason('');
      setSuccessBanner(`Ajustement d'or enregistré avec succès (${weight > 0 ? '+' : ''}${weight} g).`);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: unknown) {
      setGoldError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAdjustCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    setCurError(null);
    const amount = parseFloat(curAmount.replace(',', '.') || '0');
    if (amount <= 0) {
      setCurError('Le montant doit être positif.');
      return;
    }
    const isGoldCur = curTargetWallet === 'gold_currency';
    const reasonText =
      curReason.trim() ||
      (curIsAddition
        ? isGoldCur
          ? 'Approvisionnement Devise d’or'
          : 'Approvisionnement du solde physique'
        : '');
    if (!reasonText) {
      setCurError('Le motif est requis.');
      return;
    }
    try {
      store.adjustCurrencyStock({
        currency: curCurrency,
        amount,
        isAddition: curIsAddition,
        reason: reasonText,
        movementType: isGoldCur
          ? curIsAddition
            ? 'Ajout Devise d’or'
            : 'Ajustement Devise d’or'
          : curIsAddition
          ? 'Ajout solde physique'
          : 'Ajustement',
        targetWallet: curTargetWallet,
      });
      setShowCurAdjModal(false);
      setCurAmount('');
      setCurReason('');
      setSuccessBanner(
        isGoldCur
          ? curIsAddition
            ? `Devise d’or approvisionnée : +${formatNumber(amount, 2)} ${curCurrency} ajoutés.`
            : `Solde Devise d’or de ${curCurrency} ajusté (-${formatNumber(amount, 2)} ${curCurrency}).`
          : curIsAddition
          ? `Solde physique approvisionné : +${formatNumber(amount, 2)} ${curCurrency} ajouté au coffre.`
          : `Stock de ${curCurrency} ajusté avec succès (-${formatNumber(amount, 2)} ${curCurrency}).`
      );
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: unknown) {
      setCurError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleTransferGoldCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    const amount = parseFloat(transferAmount.replace(',', '.') || '0');
    if (amount <= 0) {
      setTransferError('Le montant doit être strictement positif.');
      return;
    }
    try {
      store.transferGoldCurrencyToPhysical({
        currency: transferCurrency,
        amount,
        reason: transferReason.trim() || undefined,
      });
      setShowTransferModal(false);
      setTransferAmount('');
      setTransferReason('');
      setSuccessBanner(
        `${formatNumber(amount, 2)} ${transferCurrency} transférés de Devise d’or vers le Solde physique.`
      );
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: unknown) {
      setTransferError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExecuteBuyCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    setBuyError(null);
    const amountNum = parseFloat(buyAmount.replace(',', '.') || '0');
    const rateNum = parseFloat(buyRate.replace(',', '.') || '0');

    if (amountNum <= 0) {
      setBuyError('Le montant en devises doit être strictement positif.');
      return;
    }
    if (rateNum <= 0) {
      setBuyError('Le cours d’achat doit être strictement positif.');
      return;
    }

    const totalXaf = Math.round(amountNum * rateNum);
    const isGoldCur = buyTargetWallet === 'gold_currency';
    let paidXafNum = totalXaf;
    if (buyPaymentMode === 'credit') {
      paidXafNum = 0;
    } else if (buyPaymentMode === 'partial') {
      if (!buyPaidXaf.trim()) {
        setBuyError('Veuillez saisir le montant payé maintenant ou sélectionner « À crédit ».');
        return;
      }
      paidXafNum = Math.round(parseFloat(buyPaidXaf.replace(/\s/g, '').replace(',', '.') || '0'));
      if (!Number.isFinite(paidXafNum) || paidXafNum < 0 || paidXafNum > totalXaf) {
        setBuyError(`Le montant payé doit être compris entre 0 et ${formatMoney(totalXaf)} FCFA.`);
        return;
      }
    }
    const remainingXaf = Math.max(0, totalXaf - paidXafNum);
    if (remainingXaf > 0 && !buyContact.trim()) {
      setBuyError('Veuillez sélectionner un contact / fournisseur pour un achat à crédit.');
      return;
    }

    try {
      store.buyCurrency({
        currency: buyCurrencyCode,
        amount: amountNum,
        rate: rateNum,
        totalXaf,
        paymentAccount: paidXafNum > 0 ? buyPaymentAccount : undefined,
        contactName: buyContact.trim() || undefined,
        notes: buyNotes.trim() || undefined,
        targetWallet: buyTargetWallet,
        paymentMode: buyPaymentMode,
        paidXaf: buyPaymentMode === 'partial' ? paidXafNum : undefined,
        dueDate: remainingXaf > 0 ? (buyDueDate.trim() || undefined) : undefined,
      });

      setShowBuyCurModal(false);
      const treasuryMsg =
        remainingXaf <= 0
          ? `-${formatMoney(totalXaf)} FCFA depuis ${buyPaymentAccount}`
          : paidXafNum > 0
            ? `Avance -${formatMoney(paidXafNum)} FCFA · Reste à crédit : ${formatMoney(remainingXaf)} FCFA`
            : `À crédit · 0 FCFA décaissé · Dette : ${formatMoney(remainingXaf)} FCFA`;
      setSuccessBanner(
        isGoldCur
          ? `Achat de devise d’or validé : +${formatNumber(amountNum, 2)} ${buyCurrencyCode} ajoutés à Devise d’or (${treasuryMsg}).`
          : `Achat de devises validé : +${formatNumber(amountNum, 2)} ${buyCurrencyCode} entrés au coffre (${treasuryMsg}).`
      );
      setTimeout(() => setSuccessBanner(null), 6000);
    } catch (err: unknown) {
      setBuyError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExecuteSellCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    setSellError(null);
    const amountNum = parseFloat(sellAmount.replace(',', '.') || '0');
    const rateNum = parseFloat(sellRate.replace(',', '.') || '0');

    if (amountNum <= 0) {
      setSellError('Le montant en devises doit être strictement positif.');
      return;
    }
    if (rateNum <= 0) {
      setSellError('Le cours de vente doit être strictement positif.');
      return;
    }

    const totalXaf = Math.round(amountNum * rateNum);
    const isGoldCur = sellTargetWallet === 'gold_currency';
    let paidXafNum = totalXaf;
    if (sellPaymentMode === 'credit') {
      paidXafNum = 0;
    } else if (sellPaymentMode === 'partial') {
      if (!sellPaidXaf.trim()) {
        setSellError('Veuillez saisir le montant encaissé maintenant ou sélectionner « À crédit ».');
        return;
      }
      paidXafNum = Math.round(parseFloat(sellPaidXaf.replace(/\s/g, '').replace(',', '.') || '0'));
      if (!Number.isFinite(paidXafNum) || paidXafNum < 0 || paidXafNum > totalXaf) {
        setSellError(`Le montant encaissé doit être compris entre 0 et ${formatMoney(totalXaf)} FCFA.`);
        return;
      }
    }
    const remainingXaf = Math.max(0, totalXaf - paidXafNum);
    if (remainingXaf > 0 && !sellContact.trim()) {
      setSellError('Veuillez sélectionner un client / contact pour une vente à crédit.');
      return;
    }

    try {
      store.sellCurrency({
        currency: sellCurrencyCode,
        amount: amountNum,
        rate: rateNum,
        totalXaf,
        receiptAccount: paidXafNum > 0 ? sellReceiptAccount : undefined,
        contactName: sellContact.trim() || undefined,
        notes: sellNotes.trim() || undefined,
        targetWallet: sellTargetWallet,
        paymentMode: sellPaymentMode,
        paidXaf: sellPaymentMode === 'partial' ? paidXafNum : undefined,
        dueDate: remainingXaf > 0 ? (sellDueDate.trim() || undefined) : undefined,
      });

      setShowSellCurModal(false);
      const treasuryMsg =
        remainingXaf <= 0
          ? `+${formatMoney(totalXaf)} FCFA encaissés en ${sellReceiptAccount}`
          : paidXafNum > 0
            ? `Acompte +${formatMoney(paidXafNum)} FCFA · Créance à crédit : ${formatMoney(remainingXaf)} FCFA`
            : `À crédit · 0 FCFA encaissé · Créance : ${formatMoney(remainingXaf)} FCFA`;
      setSuccessBanner(
        isGoldCur
          ? `Vente de devise d’or validée : -${formatNumber(amountNum, 2)} ${sellCurrencyCode} retirés de Devise d’or (${treasuryMsg}).`
          : `Vente de devises validée : -${formatNumber(amountNum, 2)} ${sellCurrencyCode} sortis du coffre (${treasuryMsg}).`
      );
      setTimeout(() => setSuccessBanner(null), 6000);
    } catch (err: unknown) {
      setSellError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleExecuteCreditPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditPaymentModal) return;
    setCreditPayError(null);
    const amountNum = Math.round(parseFloat(creditPayAmount.replace(/\s/g, '').replace(',', '.') || '0'));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setCreditPayError('Le montant du règlement doit être strictement positif.');
      return;
    }
    try {
      const updated = store.addCurrencyMovementPayment({
        movementId: creditPaymentModal.movement.id,
        targetWallet: creditPaymentModal.targetWallet,
        amountXaf: amountNum,
        account: creditPayAccount,
        note: creditPayNote.trim() || undefined,
      });
      const isSale = creditPaymentModal.movement.type.toLowerCase().startsWith('vente');
      setCreditPaymentModal(null);
      setSuccessBanner(
        `${isSale ? 'Encaissement' : 'Règlement'} de ${formatMoney(amountNum)} FCFA enregistré (${creditPayAccount}). ${(updated.remainingXaf ?? 0) > 0 ? `Reste : ${formatMoney(updated.remainingXaf)} FCFA.` : 'Crédit intégralement soldé !'}`
      );
      setTimeout(() => setSuccessBanner(null), 6000);
    } catch (err: unknown) {
      setCreditPayError(err instanceof Error ? err.message : String(err));
    }
  };

  const currentVaultFineOunces = calculateFineGoldStockOunces(store.stockMovements);
  const unsoldPurchases = getUnsoldPurchases(
    store.purchases,
    store.saleRecords,
    store.stockMovements
  );
  const expectedUnsoldFineGrams = unsoldPurchases.reduce((sum, p) => {
    const k = p.karat ? goldKaratValue(p.karat) : null;
    const netWeight =
      p.netWeightGrams ??
      Math.max(0, (p.grossWeightGrams || 0) - (p.nonGoldWeightGrams || 0));
    if (!k || netWeight <= 0 || !Number.isFinite(netWeight)) return sum;
    return sum + (netWeight * k) / 24;
  }, 0);
  const expectedUnsoldFineOunces = expectedUnsoldFineGrams / TROY_OUNCE_IN_GRAMS;
  const hasVaultStockMismatch =
    (unsoldPurchases.length > 0 || currentVaultFineOunces > 0) &&
    Math.abs(currentVaultFineOunces - expectedUnsoldFineOunces) > 0.005;

  const totalCurPurchasedCount = store.currencyStockMovements.filter(
    (movement) => movement.type === 'Achat devise'
  ).length;

  const totalCurSoldCount = store.currencyStockMovements.filter(
    (movement) => movement.type === 'Vente devise'
  ).length;

  const currencyMovementTotals = (movementType: 'achat' | 'vente') => {
    const movementName = movementType === 'achat' ? 'Achat devise' : 'Vente devise';
    const movements = store.currencyStockMovements.filter(
      (movement) => movement.type === movementName
    );

    return {
      totalXaf: movements.reduce((total, movement) => total + (movement.totalXaf ?? 0), 0),
      amountsByCurrency: movements.reduce<Record<string, number>>((totals, movement) => {
        totals[movement.currency] = (totals[movement.currency] ?? 0) + Math.abs(movement.amount);
        return totals;
      }, {}),
    };
  };

  const currencyPurchaseTotals = currencyMovementTotals('achat');
  const currencySaleTotals = currencyMovementTotals('vente');

  const formatCurrencyAmounts = (amountsByCurrency: Record<string, number>) =>
    Object.entries(amountsByCurrency)
      .filter(([, amount]) => amount > 0)
      .map(([currency, amount]) => `${formatNumber(amount, 2)} ${currency}`)
      .join(' · ') || 'Aucun mouvement';

  // Filtered movements (Solde physique)
  const filteredCurrencyMovements = store.currencyStockMovements.filter((mov) => {
    const tLower = mov.type.toLowerCase();
    if (curMovFilter === 'ACHAT') return mov.type === 'Achat devise';
    if (curMovFilter === 'VENTE') return mov.type === 'Vente devise';
    if (curMovFilter === 'CREDIT') return (mov.remainingXaf ?? 0) > 0 && mov.creditStatus !== 'settled';
    if (curMovFilter === 'AJUSTEMENT') {
      return (
        tLower.includes('ajustement') ||
        tLower.includes('ajout') ||
        tLower.includes('approvisionnement') ||
        tLower.includes('change')
      );
    }
    return true;
  });

  // Devise d'or KPIs
  const goldSaleReceipts = store.goldCurrencyMovements.filter(
    (mov) => mov.type === 'Encaissement vente or'
  );
  const goldCurrencyPurchases = store.goldCurrencyMovements.filter(
    (mov) => mov.type === 'Achat devise d’or'
  );
  const goldCurrencySales = store.goldCurrencyMovements.filter(
    (mov) => mov.type === 'Vente devise d’or'
  );
  const goldCurrencyReceiptTotals = goldSaleReceipts.reduce<Record<string, number>>((acc, mov) => {
    acc[mov.currency] = (acc[mov.currency] ?? 0) + Math.abs(mov.amount);
    return acc;
  }, {});
  const goldCurrencyPurchaseTotals = {
    totalXaf: goldCurrencyPurchases.reduce((sum, mov) => sum + (mov.totalXaf ?? 0), 0),
    amountsByCurrency: goldCurrencyPurchases.reduce<Record<string, number>>((acc, mov) => {
      acc[mov.currency] = (acc[mov.currency] ?? 0) + Math.abs(mov.amount);
      return acc;
    }, {}),
  };
  const goldCurrencySaleTotals = {
    totalXaf: goldCurrencySales.reduce((sum, mov) => sum + (mov.totalXaf ?? 0), 0),
    amountsByCurrency: goldCurrencySales.reduce<Record<string, number>>((acc, mov) => {
      acc[mov.currency] = (acc[mov.currency] ?? 0) + Math.abs(mov.amount);
      return acc;
    }, {}),
  };
  const filteredGoldCurrencyMovements = store.goldCurrencyMovements.filter((mov) => {
    if (goldCurMovFilter === 'ACHAT_OR') return mov.type === 'Achat devise d’or';
    if (goldCurMovFilter === 'VENTE_OR') return mov.type === 'Vente devise d’or';
    if (goldCurMovFilter === 'ENCAISSEMENT') return mov.type === 'Encaissement vente or';
    if (goldCurMovFilter === 'CREDIT') return (mov.remainingXaf ?? 0) > 0 && mov.creditStatus !== 'settled';
    if (goldCurMovFilter === 'AJUSTEMENT') {
      const tLower = mov.type.toLowerCase();
      return (
        tLower.includes('ajustement') ||
        tLower.includes('ajout') ||
        tLower.includes('transfert')
      );
    }
    return true;
  });
  const totalGoldSalesUsd = store.saleRecords.reduce((sum, s) => sum + (s.grossRevenueUsd || 0), 0);
  const totalGoldSalesRemainingUsd = store.saleRecords.reduce(
    (sum, s) => sum + (s.balanceRemainingUsd || 0),
    0
  );
  const hasAnyGoldCurrencyBalance = Object.values(store.goldCurrencyBalances).some((v) => v > 0);
  const goldCurrencyEntries = Object.entries(store.goldCurrencyBalances).filter(
    ([cur, bal]) => cur === 'USD' || cur === 'EUR' || cur === 'AED' || bal !== 0
  );
  const getCurrencyFlag = (code: string) => {
    switch (code) {
      case 'USD':
        return '🇺🇸';
      case 'EUR':
        return '🇪🇺';
      case 'AED':
        return '🇦🇪';
      case 'CNY':
        return '🇨🇳';
      case 'GBP':
        return '🇬🇧';
      case 'XAF':
      case 'XOF':
        return '🌍';
      case 'CAD':
        return '🇨🇦';
      case 'CHF':
        return '🇨🇭';
      default:
        return '🪙';
    }
  };

  return (
    <div className="p-4 sm:p-7 max-w-7xl mx-auto space-y-6">
      <PageHeading
        eyebrow={
          currentTab === 'gold'
            ? 'CAMS GOLD · Stock d’or & Devise d’or'
            : currencyView === 'gold_currency'
              ? 'CAMS GOLD · Devise d’or'
              : 'CAMS GOLD · Solde physique'
        }
        title={
          currentTab === 'gold'
            ? 'Stock d’or & Devise d’or'
            : currencyView === 'gold_currency'
              ? 'Devise d’or (Achats & Ventes d’or)'
              : 'Gestion des devises'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {currentTab === 'currency' ? (
              currencyView === 'physical' ? (
                <>
                  <button
                    onClick={() => setCurrencyView('gold_currency')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-black cursor-pointer shadow-xs transition-colors"
                  >
                    <Coins size={16} />
                    <span>Devise d’or</span>
                  </button>
                  {canAddPhysicalBalance && (
                    <button
                      onClick={() => openAddPhysicalModal('USD', true, 'physical')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer transition-colors"
                    >
                      <Plus size={15} strokeWidth={2.5} />
                      <span>Ajouter au solde</span>
                    </button>
                  )}
                  {canBuyCurrency && (
                    <button
                      onClick={() => openBuyModal('USD', 'physical')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                    >
                      <ArrowDownLeft size={16} />
                      <span>+ Achat devise</span>
                    </button>
                  )}
                  {canSellCurrency && (
                    <button
                      onClick={() => openSellModal('USD', 'physical')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                    >
                      <ArrowUpRight size={16} />
                      <span>- Vente de devise</span>
                    </button>
                  )}
                  {canAdjustCurrency && (
                    <button
                      onClick={() => openAddPhysicalModal('USD', false, 'physical')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 text-xs font-bold cursor-pointer transition-colors"
                      title="Ajustement d'inventaire"
                    >
                      <Sliders size={15} />
                      <span>Ajuster</span>
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setCurrencyView('physical')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                  >
                    <Wallet size={15} />
                    <span>Solde physique</span>
                  </button>
                  {canBuyCurrency && (
                    <button
                      onClick={() => openBuyModal('USD', 'gold_currency')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs transition-colors"
                    >
                      <ArrowDownLeft size={16} />
                      <span>+ Achat devise d’or</span>
                    </button>
                  )}
                  {canSellCurrency && (
                    <button
                      onClick={() => openSellModal('USD', 'gold_currency')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                    >
                      <ArrowUpRight size={16} />
                      <span>- Vente devise d’or</span>
                    </button>
                  )}
                  {canAddPhysicalBalance && (
                    <button
                      onClick={() => openAddPhysicalModal('USD', true, 'gold_currency')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer transition-colors"
                    >
                      <Plus size={15} strokeWidth={2.5} />
                      <span>Ajouter au solde</span>
                    </button>
                  )}
                  {canAddPhysicalBalance && hasAnyGoldCurrencyBalance && (
                    <button
                      onClick={() => openTransferModal('USD')}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer shadow-xs transition-colors"
                    >
                      <ArrowLeftRight size={15} className="text-emerald-700" />
                      <span>Vers solde physique</span>
                    </button>
                  )}
                </>
              )
            ) : (
              <>
                {canBuyCurrency && (
                  <button
                    onClick={() => openBuyModal('USD', 'gold_currency')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer shadow-xs transition-colors"
                  >
                    <ArrowDownLeft size={16} />
                    <span>+ Achat devise d’or</span>
                  </button>
                )}
                {canSellCurrency && (
                  <button
                    onClick={() => openSellModal('USD', 'gold_currency')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
                  >
                    <ArrowUpRight size={16} />
                    <span>- Vente devise d’or</span>
                  </button>
                )}
                <button
                  onClick={() => setShowGoldAdjModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  <Sliders size={15} />
                  <span>Ajuster stock d'or</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-950 text-[11px] font-bold"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Top Tabs */}
      {mode === 'all' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E8D8BE] pb-2">
        <button
          onClick={() => setActiveTab('gold')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            currentTab === 'gold'
              ? 'bg-[#192A24] text-white shadow-xs'
              : 'text-[#7D8176] hover:bg-[#F6F0E5]'
          }`}
        >
          <Coins size={16} />
          <span>Stock d’or &amp; Devise d’or</span>
        </button>

        <button
          onClick={() => setActiveTab('currency')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            currentTab === 'currency'
              ? 'bg-[#192A24] text-white shadow-xs'
              : 'text-[#7D8176] hover:bg-[#F6F0E5]'
          }`}
        >
          <Boxes size={16} />
          <span>Stock Devises (Solde physique &amp; Devise d’or)</span>
        </button>
        </div>
      )}

      {/* ========================================================= */}
      {/* Tab 1: Gold Stock                                         */}
      {/* ========================================================= */}
      {(mode === 'all' || mode === 'gold') && currentTab === 'gold' && (
        <div className="space-y-6">
          {hasVaultStockMismatch && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-amber-950">
                <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-black text-sm">
                    Écart détecté : {formatOunces(currentVaultFineOunces, 3)} oz en coffre pour{' '}
                    {unsoldPurchases.length} achat{unsoldPurchases.length > 1 ? 's' : ''} non vendu{unsoldPurchases.length > 1 ? 's' : ''} ({formatOunces(expectedUnsoldFineOunces, 3)} oz)
                  </div>
                  <p className="text-amber-900">
                    Des ventes passées n&apos;ont déduit qu&apos;une partie du poids acheté (perte de fonte, écart de carat/essai ou anciens mouvements). Cliquez sur le bouton pour aligner le stock réel.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const count = store.reconcileGoldStockWithUnsoldPurchases();
                  setSuccessBanner(
                    count > 0
                      ? `Stock synchronisé avec les achats non vendus (${formatOunces(expectedUnsoldFineOunces, 3)} oz équiv. 24K).`
                      : 'Le stock est déjà aligné.'
                  );
                  setTimeout(() => setSuccessBanner(null), 6000);
                }}
                className="shrink-0 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer shadow-xs transition-colors"
              >
                Synchroniser à {formatOunces(expectedUnsoldFineOunces, 3)} oz
              </button>
            </div>
          )}

          {/* Devise d'or directement dans Stock d'or (Achats & Réserve devises liées à l'or) */}
          <AppPanel className="space-y-4 bg-[#FFFDF7] border-[#E7AD35]/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8D8BE] pb-3">
              <div>
                <SectionHeading
                  title="Devise d’or · Achats & Réserve liée à l’or"
                  icon={<Coins size={18} className="text-[#D39725]" />}
                />
                <p className="text-xs text-[#7D8176]">
                  Achetez et gérez vos devises dédiées à l’or (USD, EUR, AED…) directement depuis le Stock d’or.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canBuyCurrency && (
                  <button
                    type="button"
                    onClick={() => openBuyModal('USD', 'gold_currency')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <ArrowDownLeft size={15} />
                    <span>+ Achat devise d’or</span>
                  </button>
                )}
                {canSellCurrency && (
                  <button
                    type="button"
                    onClick={() => openSellModal('USD', 'gold_currency')}
                    className="px-3.5 py-2 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5"
                  >
                    <ArrowUpRight size={15} />
                    <span>- Vente devise d’or</span>
                  </button>
                )}
                {canAddPhysicalBalance && (
                  <button
                    type="button"
                    onClick={() => openAddPhysicalModal('USD', true, 'gold_currency')}
                    className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <Plus size={14} />
                    <span>Ajouter au solde</span>
                  </button>
                )}
              </div>
            </div>

            {/* Gold Currency Balances Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {goldCurrencyEntries.map(([cur, bal]) => (
                <div
                  key={cur}
                  className="p-4 rounded-2xl bg-white border border-[#E7AD35]/50 hover:border-[#D39725] transition-all space-y-3 shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{getCurrencyFlag(cur)}</span>
                      <span className="text-sm font-black text-[#192A24] uppercase tracking-wide">
                        {cur}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#FFF4D6] border border-[#E7AD35]/50 text-[#9E731B] font-mono">
                      Devise d’or
                    </span>
                  </div>

                  <div className="text-2xl font-black text-[#192A24] font-mono">
                    {formatNumber(bal, 2)} <span className="text-sm font-bold text-[#7D8176]">{cur}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-[#E8D8BE]/70">
                    {canBuyCurrency && (
                      <button
                        type="button"
                        onClick={() => openBuyModal(cur, 'gold_currency')}
                        className="py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus size={13} strokeWidth={3} />
                        <span>Achat</span>
                      </button>
                    )}
                    {canSellCurrency && (
                      <button
                        type="button"
                        onClick={() => openSellModal(cur, 'gold_currency')}
                        className="py-1.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                      >
                        <Minus size={13} strokeWidth={3} />
                        <span>Vente</span>
                      </button>
                    )}
                    {canAddPhysicalBalance && bal > 0 && (
                      <button
                        type="button"
                        onClick={() => openTransferModal(cur)}
                        className="col-span-2 py-1.5 px-2 rounded-xl bg-[#FAF8F3] hover:bg-emerald-50 text-[#192A24] border border-[#E8D8BE] text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1"
                      >
                        <ArrowLeftRight size={13} className="text-emerald-700" />
                        <span>Vers solde physique</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Devise d'or purchases/movements directly visible in Stock d'or */}
            {store.goldCurrencyMovements.length > 0 && (
              <div className="pt-2 border-t border-[#E8D8BE] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#192A24] uppercase tracking-wider">
                    Derniers achats &amp; mouvements Devise d’or
                  </span>
                  <span className="text-[11px] text-[#7D8176]">
                    {goldCurrencyPurchases.length} achat(s) · {goldSaleReceipts.length} recette(s) ventes d’or
                  </span>
                </div>
                <div className="divide-y divide-gray-100 bg-white rounded-xl border border-[#E8D8BE]/70 px-3">
                  {store.goldCurrencyMovements.slice(0, 8).map((mov) => {
                    const rem = mov.remainingXaf ?? 0;
                    const isSaleMov = mov.type.toLowerCase().startsWith('vente');
                    return (
                    <div key={mov.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-[#192A24] truncate flex items-center gap-1.5">
                          <span>{mov.type} · {mov.contact || mov.label}</span>
                          {rem > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-800 text-[10px] font-extrabold shrink-0">
                              Crédit · Reste {formatMoney(rem)} F
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#7D8176] truncate">
                          {formatDateTime(mov.date)}
                          {mov.rate ? ` · Taux ${formatNumber(mov.rate, 2)} FCFA` : ''}
                          {mov.totalXaf ? ` · ${formatMoney(mov.totalXaf)} FCFA` : ''}
                          {mov.account ? ` · ${mov.account}` : ''}
                          {mov.dueDate && rem > 0 ? ` · Éch. ${mov.dueDate}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono font-black ${
                            mov.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {mov.amount >= 0 ? '+' : ''}
                          {formatNumber(mov.amount, 2)} {mov.currency}
                        </span>
                        {rem > 0 && (
                          <button
                            type="button"
                            onClick={() => openCreditPaymentModal(mov, 'gold_currency')}
                            className="px-2 py-1 rounded-lg bg-[#192A24] hover:bg-[#253D34] text-white text-[10px] font-bold cursor-pointer"
                          >
                            {isSaleMov ? 'Encaisser' : 'Régler'}
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </AppPanel>

          {/* Movement history */}
          {store.stockMovements.length > 0 && (
            <AppPanel className="space-y-4">
              <SectionHeading title="Mouvements et corrections de stock d'or" />
              <div className="divide-y divide-gray-100">
                {store.stockMovements.map((mov) => (
                  <div key={mov.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-[#192A24]">{mov.label}</div>
                      <div className="text-[11px] text-[#7D8176]">
                        {mov.karat} · {mov.category} · {formatDateTime(mov.date)}
                        {mov.reason && ` · Motif : ${mov.reason}`}
                      </div>
                    </div>
                    <span
                      className={`font-black ${
                        mov.weightGrams >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {mov.weightGrams >= 0 ? '+' : ''}
                      {formatNumber(mov.weightGrams, 2)} g
                    </span>
                  </div>
                ))}
              </div>
            </AppPanel>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* Tab 2: Currency Stock (Solde physique & Devise d'or)      */}
      {/* ========================================================= */}
      {(mode === 'all' || mode === 'currency') && currentTab === 'currency' && (
        <div className="space-y-6">
          {/* Top Switcher Bar: Solde physique vs Devise d'or */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8D8BE] pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrencyView('physical')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  currencyView === 'physical'
                    ? 'bg-[#192A24] text-white shadow-xs'
                    : 'bg-white border border-[#E8D8BE] text-[#7D8176] hover:bg-[#F6F0E5]'
                }`}
              >
                <Wallet size={16} />
                <span>Solde physique (Achat & Vente)</span>
              </button>

              <button
                type="button"
                onClick={() => setCurrencyView('gold_currency')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  currencyView === 'gold_currency'
                    ? 'bg-[#D39725] text-white shadow-xs'
                    : 'bg-[#FFF8E7] border border-[#E7AD35] text-[#9E731B] hover:bg-[#FFE9B8]'
                }`}
              >
                <Coins size={16} />
                <span>Devise d’or (Recettes ventes d’or)</span>
              </button>
            </div>

            <span className="text-xs text-[#7D8176]">
              {currencyView === 'physical'
                ? 'Solde physique du coffre dédié aux opérations de change'
                : 'Toutes les devises reçues après vos ventes d’or arrivent ici'}
            </span>
          </div>

          {currencyView === 'physical' ? (
            <>
              {/* Top Banner KPI: Devises au coffre */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <AppPanel className="bg-emerald-50/60 border-emerald-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                      Total des achats de devises
                    </span>
                    <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                      <ArrowDownLeft size={16} />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-emerald-900 mt-1">
                    {formatMoney(currencyPurchaseTotals.totalXaf)} FCFA
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1 leading-relaxed">
                    {totalCurPurchasedCount} opération(s) · {formatCurrencyAmounts(currencyPurchaseTotals.amountsByCurrency)}
                  </div>
                </AppPanel>

                <AppPanel className="bg-amber-50/60 border-amber-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                      Total des ventes de devises
                    </span>
                    <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-amber-950 mt-1">
                    {formatMoney(currencySaleTotals.totalXaf)} FCFA
                  </div>
                  <div className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                    {totalCurSoldCount} opération(s) · {formatCurrencyAmounts(currencySaleTotals.amountsByCurrency)}
                  </div>
                </AppPanel>
              </div>

              {/* Currency Balances Grid with Add Balance + Buy/Sell Buttons */}
              <AppPanel className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8D8BE] pb-3">
                  <div>
                    <SectionHeading title="Soldes physiques de devises au coffre-fort" />
                    <p className="text-xs text-[#7D8176]">
                      C’est le solde physique : vous pouvez ajouter du solde pour effectuer vos opérations d’achat et de vente de devises.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canAddPhysicalBalance && (
                      <button
                        onClick={() => openAddPhysicalModal('USD', true)}
                        className="px-3 py-1.5 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <Plus size={14} />
                        <span>Ajouter au solde</span>
                      </button>
                    )}
                    {canBuyCurrency && (
                      <button
                        onClick={() => openBuyModal('USD')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <ArrowDownLeft size={14} />
                        <span>Acheter devise</span>
                      </button>
                    )}
                    {canSellCurrency && (
                      <button
                        onClick={() => openSellModal('USD')}
                        className="px-3 py-1.5 rounded-xl bg-[#192A24] hover:bg-[#253D34] text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <ArrowUpRight size={14} />
                        <span>Vendre devise</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {Object.entries(store.currencyBalances).map(([cur, bal]) => {
                    const isNegative = bal < -0.0001;
                    return (
                      <div
                        key={cur}
                        className={`p-4 rounded-2xl border transition-all space-y-3 shadow-2xs ${
                          isNegative
                            ? 'bg-red-50/40 border-red-300 hover:border-red-400'
                            : 'bg-[#FAF8F3] border-[#E8D8BE] hover:border-[#D39725]/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getCurrencyFlag(cur)}</span>
                            <span className="text-sm font-black text-[#192A24] uppercase tracking-wide">
                              {cur}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-600 font-mono">
                            {cur}
                          </span>
                        </div>

                        <div className="pt-1 space-y-1">
                          <div
                            className={`text-xl font-black font-mono ${
                              isNegative ? 'text-red-700' : 'text-[#192A24]'
                            }`}
                          >
                            {formatNumber(bal, 2)}
                          </div>
                          {isNegative && (
                            <p className="text-[10px] leading-snug font-semibold text-red-700">
                              Sorties/ventes &gt; stock enregistré ({formatNumber(Math.abs(bal), 2)} {cur} manquants). Vérifiez le journal ci-dessous ou ajoutez au solde.
                            </p>
                          )}
                        </div>

                        {/* Quick action buttons per currency */}
                        {(canAddPhysicalBalance || canBuyCurrency || canSellCurrency) && (
                          <div className="space-y-1.5 pt-1 border-t border-gray-200/80">
                            {canAddPhysicalBalance && (
                              <button
                                onClick={() => openAddPhysicalModal(cur, true)}
                                className="w-full py-1.5 px-2 rounded-xl bg-white hover:bg-[#FFF8E7] text-[#192A24] border border-[#E8D8BE] text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                                title={`Ajouter du ${cur} au solde physique`}
                              >
                                <Plus size={13} strokeWidth={3} className="text-[#D39725]" />
                                <span>Ajouter au solde</span>
                              </button>
                            )}
                            {(canBuyCurrency || canSellCurrency) && (
                              <div className="grid grid-cols-2 gap-1.5">
                                {canBuyCurrency && (
                                  <button
                                    onClick={() => openBuyModal(cur)}
                                    className="py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                                    title={`Acheter du ${cur}`}
                                  >
                                    <Plus size={13} strokeWidth={3} />
                                    <span>Achat</span>
                                  </button>
                                )}
                                {canSellCurrency && (
                                  <button
                                    onClick={() => openSellModal(cur)}
                                    className="py-1.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                                    title={`Vendre du ${cur}`}
                                  >
                                    <Minus size={13} strokeWidth={3} />
                                    <span>Vente</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </AppPanel>

              {/* Currency Movements Table (Achats, Ventes, Ajouts & Ajustements) */}
              {canViewCurrencyHistory && (
                <AppPanel className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <SectionHeading title="Journal des mouvements du solde physique" />
                      <span className="text-xs text-gray-500">
                        Historique des ajouts au solde physique, achats et ventes de devises
                      </span>
                    </div>

                    {/* Movement Type Filter */}
                    <div className="flex flex-wrap items-center gap-1 bg-[#FAF8F3] p-1 rounded-xl border border-[#E8D8BE]">
                      {(
                        [
                          { id: 'ALL', label: 'Tous' },
                          { id: 'ACHAT', label: 'Achats' },
                          { id: 'VENTE', label: 'Ventes' },
                          { id: 'CREDIT', label: 'À crédit' },
                          { id: 'AJUSTEMENT', label: 'Ajouts & Ajust.' },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setCurMovFilter(f.id)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            curMovFilter === f.id
                              ? 'bg-[#192A24] text-white shadow-2xs'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredCurrencyMovements.length === 0 ? (
                    <p className="text-xs text-gray-500 py-8 text-center">
                      Aucun mouvement de devise ne correspond à ce filtre.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#FAF8F3] border-b border-[#E8D8BE] text-[11px] font-bold text-[#7D8176] uppercase tracking-wider">
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Type</th>
                            <th className="py-2.5 px-3">Devise & Montant</th>
                            <th className="py-2.5 px-3">Taux</th>
                            <th className="py-2.5 px-3">Contre-valeur FCFA</th>
                            <th className="py-2.5 px-3">Règlement / Crédit</th>
                            <th className="py-2.5 px-3">Client / Motif</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredCurrencyMovements.map((mov) => {
                            const isBuy = mov.type.toLowerCase().includes('achat') || mov.amount > 0;
                            const isSell = mov.type === 'Vente devise';
                            const remXaf = mov.remainingXaf ?? 0;
                            const paidXaf = mov.paidXaf ?? (mov.isCredit ? 0 : mov.totalXaf ?? 0);
                            return (
                              <tr key={mov.id} className="hover:bg-amber-50/30 transition-colors">
                                <td className="py-3 px-3 text-gray-500 font-mono text-[11px]">
                                  {formatDateTime(mov.date)}
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                      isBuy
                                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                        : isSell
                                        ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}
                                  >
                                    {isBuy && <ArrowDownLeft size={12} />}
                                    {isSell && <ArrowUpRight size={12} />}
                                    <span>{mov.type}</span>
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <span
                                    className={`font-mono font-black text-sm ${
                                      mov.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                                    }`}
                                  >
                                    {mov.amount >= 0 ? '+' : ''}
                                    {formatNumber(mov.amount, 2)} {mov.currency}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-mono font-semibold text-gray-700">
                                  {mov.rate ? `${formatNumber(mov.rate, 2)} FCFA` : '—'}
                                </td>
                                <td className="py-3 px-3 font-mono font-bold text-gray-900">
                                  {mov.totalXaf ? `${formatMoney(mov.totalXaf)} FCFA` : '—'}
                                  {mov.isCredit && mov.totalXaf ? (
                                    <div className="text-[10px] font-semibold text-gray-500">
                                      Payé : {formatMoney(paidXaf)} F
                                    </div>
                                  ) : null}
                                </td>
                                <td className="py-3 px-3 text-gray-600">
                                  {remXaf > 0 ? (
                                    <div className="space-y-0.5">
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                          paidXaf === 0
                                            ? 'bg-orange-100 text-orange-800'
                                            : 'bg-amber-100 text-amber-900'
                                        }`}
                                      >
                                        {paidXaf === 0 ? 'À crédit' : 'Partiel'} · Reste {formatMoney(remXaf)} F
                                      </span>
                                      {mov.dueDate && (
                                        <div className="text-[10px] text-amber-800 font-semibold">
                                          Éch. {mov.dueDate}
                                        </div>
                                      )}
                                    </div>
                                  ) : mov.isCredit ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                      Crédit soldé
                                    </span>
                                  ) : (
                                    <span>{mov.account || 'Coffre physique'}</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-gray-700 font-semibold">
                                  {mov.contact || mov.label || '—'}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  {remXaf > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => openCreditPaymentModal(mov, 'physical')}
                                      className="px-2.5 py-1 rounded-lg bg-[#192A24] hover:bg-[#253D34] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                    >
                                      {isSell ? 'Encaisser' : 'Régler'}
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-gray-400">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </AppPanel>
              )}
            </>
          ) : (
            /* ===================================================== */
            /* Sub-view: DEVISE D'OR (Achats & Recettes ventes d'or) */
            /* ===================================================== */
            <div className="space-y-6">
              {/* Top Banner KPI: Devise d'or */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <AppPanel className="bg-emerald-50/70 border-emerald-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                      Total achats Devise d’or
                    </span>
                    <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
                      <ArrowDownLeft size={16} />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-emerald-950 mt-1 font-mono">
                    {formatMoney(goldCurrencyPurchaseTotals.totalXaf)} FCFA
                  </div>
                  <div className="text-[11px] text-emerald-700 mt-1">
                    {goldCurrencyPurchases.length} achat(s) ·{' '}
                    {formatCurrencyAmounts(goldCurrencyPurchaseTotals.amountsByCurrency)}
                  </div>
                </AppPanel>

                <AppPanel className="bg-[#FFF9EA] border-[#E7AD35]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#9E731B] uppercase tracking-wider">
                      Encaissé après ventes d’or
                    </span>
                    <span className="p-1.5 rounded-lg bg-[#FFE1A3] text-[#192A24]">
                      <Coins size={16} />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-[#192A24] mt-1 font-mono">
                    {formatCurrencyAmounts(goldCurrencyReceiptTotals)}
                  </div>
                  <div className="text-[11px] text-[#7D5711] mt-1">
                    {goldSaleReceipts.length} encaissement(s) · Ventes :{' '}
                    {formatMoney(goldCurrencySaleTotals.totalXaf)} FCFA
                  </div>
                </AppPanel>

                <AppPanel className="bg-white border-[#E8D8BE]">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#7D8176] uppercase tracking-wider">
                      Ventes d’or &amp; Soldes clients
                    </span>
                    <span className="p-1.5 rounded-lg bg-[#FAF8F3] text-[#192A24]">
                      <TrendingUp size={16} />
                    </span>
                  </div>
                  <div className="text-2xl font-black text-[#192A24] mt-1 font-mono">
                    ${formatNumber(totalGoldSalesUsd, 2)} USD
                  </div>
                  <div className="text-[11px] text-gray-600 mt-1">
                    Solde client restant à recevoir :{' '}
                    <strong className="text-amber-800">${formatNumber(totalGoldSalesRemainingUsd, 2)}</strong>
                  </div>
                </AppPanel>
              </div>

              {/* Devise d'or Balances */}
              <AppPanel className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E8D8BE] pb-3">
                  <div>
                    <SectionHeading title="Soldes Devise d’or (Achats &amp; Recettes ventes d’or)" />
                    <p className="text-xs text-[#7D8176]">
                      Effectuez vos achats et ventes de devise d’or ici ou suivez les règlements encaissés après vos ventes d’or, séparément du solde physique.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canBuyCurrency && (
                      <button
                        onClick={() => openBuyModal('USD', 'gold_currency')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <ArrowDownLeft size={14} />
                        <span>Acheter devise d’or</span>
                      </button>
                    )}
                    {canSellCurrency && (
                      <button
                        onClick={() => openSellModal('USD', 'gold_currency')}
                        className="px-3 py-1.5 rounded-xl bg-[#D39725] hover:bg-[#c2871b] text-white text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <ArrowUpRight size={14} />
                        <span>Vendre devise d’or</span>
                      </button>
                    )}
                    {canAddPhysicalBalance && (
                      <button
                        onClick={() => openAddPhysicalModal('USD', true, 'gold_currency')}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                      >
                        <Plus size={14} />
                        <span>Ajouter au solde</span>
                      </button>
                    )}
                    <button
                      onClick={() => setCurrencyView('physical')}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-[#192A24] border border-[#E8D8BE] text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                    >
                      <Wallet size={14} />
                      <span>Voir Solde physique</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {goldCurrencyEntries.map(([cur, bal]) => {
                    const isNegative = bal < -0.0001;
                    return (
                    <div
                      key={cur}
                      className={`p-4 rounded-2xl border transition-all space-y-3 shadow-2xs ${
                        isNegative
                          ? 'bg-red-50/40 border-red-300 hover:border-red-400'
                          : 'bg-[#FFFDF7] border-[#E7AD35]/50 hover:border-[#D39725]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getCurrencyFlag(cur)}</span>
                          <div>
                            <span className="text-sm font-black text-[#192A24] uppercase tracking-wide block">
                              {cur}
                            </span>
                            {cur === 'USD' && (
                              <span className="text-[10px] text-[#7D8176]">Dollar américain</span>
                            )}
                            {cur === 'EUR' && (
                              <span className="text-[10px] text-[#7D8176]">Euro</span>
                            )}
                            {cur === 'AED' && (
                              <span className="text-[10px] text-[#7D8176]">Dirham ÉAU</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#FFF4D6] border border-[#E7AD35]/50 text-[#9E731B] font-mono">
                          Devise d’or
                        </span>
                      </div>

                      <div className="pt-1 space-y-1">
                        <div
                          className={`text-2xl font-black font-mono ${
                            isNegative ? 'text-red-700' : 'text-[#192A24]'
                          }`}
                        >
                          {cur === 'USD' ? `$${formatNumber(bal, 2)} USD` : `${formatNumber(bal, 2)} ${cur}`}
                        </div>
                        {isNegative && (
                          <p className="text-[10px] leading-snug font-semibold text-red-700">
                            Sorties &gt; stock enregistré ({formatNumber(Math.abs(bal), 2)} {cur} manquants). Vérifiez le journal ci-dessous.
                          </p>
                        )}
                      </div>

                      <div className="space-y-1.5 pt-1 border-t border-[#E8D8BE]">
                        {(canBuyCurrency || canSellCurrency) && (
                          <div className="grid grid-cols-2 gap-1.5">
                            {canBuyCurrency && (
                              <button
                                onClick={() => openBuyModal(cur, 'gold_currency')}
                                className="py-1.5 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                              >
                                <Plus size={13} strokeWidth={3} />
                                <span>Achat</span>
                              </button>
                            )}
                            {canSellCurrency && (
                              <button
                                onClick={() => openSellModal(cur, 'gold_currency')}
                                className="py-1.5 px-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-black cursor-pointer transition-colors flex items-center justify-center gap-1"
                              >
                                <Minus size={13} strokeWidth={3} />
                                <span>Vente</span>
                              </button>
                            )}
                          </div>
                        )}
                        {canAddPhysicalBalance && bal > 0 && (
                          <button
                            onClick={() => openTransferModal(cur)}
                            className="w-full py-1.5 px-2 rounded-xl bg-white hover:bg-emerald-50 text-[#192A24] border border-[#E8D8BE] text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1"
                          >
                            <ArrowLeftRight size={13} className="text-emerald-700" />
                            <span>Vers solde physique</span>
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </AppPanel>

              {/* Devise d'or Movements History */}
              <AppPanel className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div>
                    <SectionHeading title="Journal des opérations Devise d’or" />
                    <span className="text-xs text-gray-500">
                      Achats de devise d’or, ventes, encaissements après ventes d’or et transferts vers le solde physique
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1 bg-[#FAF8F3] p-1 rounded-xl border border-[#E8D8BE]">
                    {(
                      [
                        { id: 'ALL', label: 'Tous' },
                        { id: 'ACHAT_OR', label: 'Achats' },
                        { id: 'VENTE_OR', label: 'Ventes' },
                        { id: 'ENCAISSEMENT', label: 'Ventes d’or' },
                        { id: 'CREDIT', label: 'À crédit' },
                        { id: 'AJUSTEMENT', label: 'Ajouts & Transferts' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setGoldCurMovFilter(f.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          goldCurMovFilter === f.id
                            ? 'bg-[#192A24] text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredGoldCurrencyMovements.length === 0 ? (
                  <p className="text-xs text-gray-500 py-8 text-center">
                    Aucun mouvement Devise d’or ne correspond à ce filtre.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAF8F3] border-b border-[#E8D8BE] text-[11px] font-bold text-[#7D8176] uppercase tracking-wider">
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Devise &amp; Montant</th>
                          <th className="py-2.5 px-3">Taux</th>
                          <th className="py-2.5 px-3">Contre-valeur FCFA</th>
                          <th className="py-2.5 px-3">Compte / Crédit</th>
                          <th className="py-2.5 px-3">Client / Détails</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredGoldCurrencyMovements.map((mov) => {
                          const isPositive = mov.amount >= 0;
                          const remXaf = mov.remainingXaf ?? 0;
                          const paidXaf = mov.paidXaf ?? (mov.isCredit ? 0 : mov.totalXaf ?? 0);
                          const isSaleMov = mov.type.toLowerCase().startsWith('vente');
                          return (
                            <tr key={mov.id} className="hover:bg-amber-50/30 transition-colors">
                              <td className="py-3 px-3 text-gray-500 font-mono text-[11px]">
                                {formatDateTime(mov.date)}
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                    mov.type === 'Achat devise d’or'
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : isPositive
                                        ? 'bg-[#FFF4D6] text-[#9E731B] border border-[#E7AD35]'
                                        : 'bg-amber-100 text-amber-950 border border-amber-300'
                                  }`}
                                >
                                  {isPositive ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                                  <span>{mov.type}</span>
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span
                                  className={`font-mono font-black text-sm ${
                                    isPositive ? 'text-emerald-700' : 'text-amber-800'
                                  }`}
                                >
                                  {isPositive ? '+' : ''}
                                  {formatNumber(mov.amount, 2)} {mov.currency}
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono font-semibold text-gray-700">
                                {mov.rate ? `${formatNumber(mov.rate, 2)} FCFA` : '—'}
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-gray-900">
                                {mov.totalXaf ? `${formatMoney(mov.totalXaf)} FCFA` : '—'}
                                {mov.isCredit && mov.totalXaf ? (
                                  <div className="text-[10px] font-semibold text-gray-500">
                                    Payé : {formatMoney(paidXaf)} F
                                  </div>
                                ) : null}
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-[#D39725]">
                                {remXaf > 0 ? (
                                  <div className="space-y-0.5 font-sans">
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                        paidXaf === 0
                                          ? 'bg-orange-100 text-orange-800'
                                          : 'bg-amber-100 text-amber-900'
                                      }`}
                                    >
                                      {paidXaf === 0 ? 'À crédit' : 'Partiel'} · Reste {formatMoney(remXaf)} F
                                    </span>
                                    {mov.dueDate && (
                                      <div className="text-[10px] text-amber-800 font-semibold">
                                        Éch. {mov.dueDate}
                                      </div>
                                    )}
                                  </div>
                                ) : mov.isCredit ? (
                                  <span className="font-sans inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                    Crédit soldé
                                  </span>
                                ) : (
                                  <span>{mov.account || mov.referenceId || '—'}</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-gray-700 font-semibold">
                                {mov.contact || mov.label || '—'}
                              </td>
                              <td className="py-3 px-3 text-right">
                                {remXaf > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => openCreditPaymentModal(mov, 'gold_currency')}
                                    className="px-2.5 py-1 rounded-lg bg-[#192A24] hover:bg-[#253D34] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                  >
                                    {isSaleMov ? 'Encaisser' : 'Régler'}
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </AppPanel>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* Modal 1: ACHAT DE DEVISE (Solde physique ou Devise d'or)  */}
      {/* ========================================================= */}
      <Modal
        isOpen={showBuyCurModal}
        onClose={() => setShowBuyCurModal(false)}
        title={
          buyTargetWallet === 'gold_currency'
            ? 'Achat de devise d’or · Entrée réserve Devise d’or'
            : 'Achat de devises · Entrée au coffre-fort'
        }
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleExecuteBuyCurrency} className="space-y-4">
          {/* Destination wallet toggle */}
          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">
              Réserve de destination
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBuyTargetWallet('gold_currency')}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  buyTargetWallet === 'gold_currency'
                    ? 'bg-[#D39725] text-white border-[#D39725] shadow-2xs'
                    : 'bg-white text-[#7D8176] border-[#E8D8BE] hover:bg-[#FFF9EA]'
                }`}
              >
                <Coins size={14} />
                <span>Devise d’or (Stock d’or)</span>
              </button>
              <button
                type="button"
                onClick={() => setBuyTargetWallet('physical')}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  buyTargetWallet === 'physical'
                    ? 'bg-[#192A24] text-white border-[#192A24] shadow-2xs'
                    : 'bg-white text-[#7D8176] border-[#E8D8BE] hover:bg-[#FAF8F3]'
                }`}
              >
                <Wallet size={14} />
                <span>Solde physique</span>
              </button>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border text-xs ${
              buyTargetWallet === 'gold_currency'
                ? 'bg-[#FFF9EA] border-[#E7AD35] text-[#7D5711]'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <ArrowDownLeft
                size={16}
                className={buyTargetWallet === 'gold_currency' ? 'text-[#D39725]' : 'text-emerald-600'}
              />
              <span>
                {buyTargetWallet === 'gold_currency'
                  ? 'Achat de devise d’or auprès d’un fournisseur ou client'
                  : "Achat de devises étrangères auprès d'un client ou fournisseur"}
              </span>
            </div>
            <div className="text-[11px] mt-1 opacity-90">
              {buyTargetWallet === 'gold_currency'
                ? 'Les devises achetées sont ajoutées à la réserve Devise d’or et le montant en FCFA est décaissé de la caisse ou banque.'
                : 'Les devises sont ajoutées au coffre physique et le montant en FCFA est décaissé de la caisse ou banque.'}
            </div>
          </div>

          {buyError && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{buyError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">Devise achetée *</label>
              <select
                value={buyCurrencyCode}
                onChange={(e) => {
                  setBuyCurrencyCode(e.target.value);
                }}
                className="w-full px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-black text-[#192A24]"
              >
                {currencyList.map((c) => {
                  const bal =
                    buyTargetWallet === 'gold_currency'
                      ? store.goldCurrencyBalances[c] || 0
                      : store.currencyBalances[c] || 0;
                  return (
                    <option key={c} value={c}>
                      {getCurrencyFlag(c)} {c} (Solde : {formatNumber(bal, 2)})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Montant en {buyCurrencyCode} *
              </label>
              <input
                type="text"
                required
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
                placeholder="ex: 1000"
                className="w-full px-3 py-2 bg-white rounded-xl border border-emerald-400 ring-2 ring-emerald-300/30 text-sm font-black font-mono"
              />
            </div>
          </div>

          {/* Quick presets for Buy amount */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase font-bold text-gray-500 mr-1">Raccourcis :</span>
            {['100', '500', '1000', '2500', '5000', '10000'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setBuyAmount(preset)}
                className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-emerald-100 text-gray-700 text-[10px] font-bold cursor-pointer transition-colors"
              >
                {preset} {buyCurrencyCode}
              </button>
            ))}
          </div>

          {/* Payment Mode Selector */}
          <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#192A24]">
                Mode de règlement
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'cash', label: 'Comptant (100%)' },
                    { id: 'partial', label: 'Partiel (Avance)' },
                    { id: 'credit', label: 'À crédit (0 FCFA)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setBuyPaymentMode(m.id);
                      if (m.id === 'credit') setBuyPaidXaf('0');
                      else if (m.id === 'cash') setBuyPaidXaf('');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      buyPaymentMode === m.id
                        ? m.id === 'credit'
                          ? 'bg-orange-600 text-white border-orange-600'
                          : m.id === 'partial'
                            ? 'bg-[#D39725] text-white border-[#D39725]'
                            : 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-[#192A24] border-[#E8D8BE] hover:bg-amber-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {buyPaymentMode !== 'cash' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {buyPaymentMode === 'partial' && (
                  <div>
                    <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                      Montant payé maintenant (FCFA) *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={buyPaidXaf}
                      onChange={(e) => setBuyPaidXaf(e.target.value)}
                      placeholder="ex: 200000"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono text-[#192A24]"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                    Échéance du crédit (Optionnel)
                  </label>
                  <input
                    type="date"
                    value={buyDueDate}
                    onChange={(e) => setBuyDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Taux d'achat (FCFA / {buyCurrencyCode}) *
              </label>
              <input
                type="text"
                required
                value={buyRate}
                onChange={(e) => setBuyRate(e.target.value)}
                placeholder="ex: 605"
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-black font-mono text-[#192A24]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                {buyPaymentMode === 'credit' ? 'Décaissement immédiat' : 'Compte de décaissement FCFA *'}
              </label>
              {buyPaymentMode === 'credit' ? (
                <div className="px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-xs font-bold text-orange-800">
                  0 FCFA (Opération à crédit)
                </div>
              ) : (
                <select
                  value={buyPaymentAccount}
                  onChange={(e) => setBuyPaymentAccount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                >
                  {Object.entries(store.bankBalances).map(([acc, bal]) => (
                    <option key={acc} value={acc}>
                      {acc} ({formatMoney(bal)} FCFA)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Client / Fournisseur {buyPaymentMode !== 'cash' ? '(Obligatoire pour crédit) *' : '(Optionnel)'}
              </label>
              <select
                value={buyContact}
                onChange={(e) => setBuyContact(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
              >
                <option value="">{buyPaymentMode !== 'cash' ? '-- Sélectionner un contact --' : 'Client de passage'}</option>
                {store.contacts.map((c) => (
                  <option key={c.reference} value={c.name}>
                    {c.name} ({c.city}) {c.roles.length ? `· [${c.roles.join(', ')}]` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Motif / Note (Optionnel)
              </label>
              <input
                type="text"
                value={buyNotes}
                onChange={(e) => setBuyNotes(e.target.value)}
                placeholder="ex: Achat USD pour opérations or"
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
              />
            </div>
          </div>

          {/* Financial Summary Card */}
          {parseFloat(buyAmount.replace(',', '.') || '0') > 0 && (() => {
            const totalBuyXaf = Math.round(
              parseFloat(buyAmount.replace(',', '.') || '0') *
                parseFloat(buyRate.replace(',', '.') || '0')
            );
            const paidNowXaf =
              buyPaymentMode === 'credit'
                ? 0
                : buyPaymentMode === 'partial'
                  ? Math.min(totalBuyXaf, Math.max(0, Math.round(parseFloat(buyPaidXaf.replace(/\s/g, '').replace(',', '.') || '0'))))
                  : totalBuyXaf;
            const restCreditXaf = Math.max(0, totalBuyXaf - paidNowXaf);
            return (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-300 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-emerald-950 font-bold">
                  <span>
                    Devises ajoutées à{' '}
                    {buyTargetWallet === 'gold_currency' ? 'Devise d’or' : 'Solde physique'} :
                  </span>
                  <span className="font-mono text-base font-black text-emerald-700">
                    +{formatNumber(parseFloat(buyAmount.replace(',', '.') || '0'), 2)} {buyCurrencyCode}
                  </span>
                </div>
                <div className="flex justify-between items-center text-gray-700 font-bold">
                  <span>Total opération (FCFA) :</span>
                  <span className="font-mono font-black text-[#192A24]">
                    {formatMoney(totalBuyXaf)} FCFA
                  </span>
                </div>
                <div className="flex justify-between items-center text-gray-700 font-bold">
                  <span>Décaissé immédiatement :</span>
                  <span className="font-mono font-black text-red-700">
                    -{formatMoney(paidNowXaf)} FCFA
                  </span>
                </div>
                {restCreditXaf > 0 && (
                  <div className="flex justify-between items-center text-orange-800 font-extrabold">
                    <span>Reste à payer à crédit (Dette) :</span>
                    <span className="font-mono font-black">
                      {formatMoney(restCreditXaf)} FCFA
                    </span>
                  </div>
                )}
                {paidNowXaf > 0 && (
                  <div className="text-[11px] text-gray-500 pt-1 border-t border-emerald-200">
                    Débité du compte : <strong>{buyPaymentAccount}</strong>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="pt-2 flex justify-end gap-2.5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowBuyCurModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer transition-colors"
            >
              {buyTargetWallet === 'gold_currency'
                ? 'Valider l’achat de devise d’or'
                : "Valider l'achat de devises"}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* Modal 2: VENTE DE DEVISE (Solde physique ou Devise d'or)  */}
      {/* ========================================================= */}
      <Modal
        isOpen={showSellCurModal}
        onClose={() => setShowSellCurModal(false)}
        title={
          sellTargetWallet === 'gold_currency'
            ? 'Vente de devise d’or · Sortie réserve Devise d’or'
            : 'Vente de devises · Sortie du coffre-fort'
        }
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleExecuteSellCurrency} className="space-y-4">
          {/* Source wallet toggle */}
          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">
              Réserve source
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSellTargetWallet('gold_currency')}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  sellTargetWallet === 'gold_currency'
                    ? 'bg-[#D39725] text-white border-[#D39725] shadow-2xs'
                    : 'bg-white text-[#7D8176] border-[#E8D8BE] hover:bg-[#FFF9EA]'
                }`}
              >
                <Coins size={14} />
                <span>Devise d’or (Stock d’or)</span>
              </button>
              <button
                type="button"
                onClick={() => setSellTargetWallet('physical')}
                className={`py-2 px-3 rounded-xl text-xs font-black border transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                  sellTargetWallet === 'physical'
                    ? 'bg-[#192A24] text-white border-[#192A24] shadow-2xs'
                    : 'bg-white text-[#7D8176] border-[#E8D8BE] hover:bg-[#FAF8F3]'
                }`}
              >
                <Wallet size={14} />
                <span>Solde physique</span>
              </button>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <div className="font-bold flex items-center gap-1.5">
              <ArrowUpRight size={16} className="text-amber-600" />
              <span>
                {sellTargetWallet === 'gold_currency'
                  ? 'Vente de devise d’or contre FCFA'
                  : 'Vente de devises étrangères à un client contre FCFA'}
              </span>
            </div>
            <div className="text-[11px] text-amber-700 mt-1">
              {sellTargetWallet === 'gold_currency'
                ? 'Les devises sont déduites de Devise d’or et le règlement en FCFA est encaissé en caisse ou en banque.'
                : 'Les devises sont retirées du coffre et le règlement en FCFA est encaissé directement en caisse ou en banque.'}
            </div>
          </div>

          {sellError && (
            <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{sellError}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">Devise vendue *</label>
              <select
                value={sellCurrencyCode}
                onChange={(e) => {
                  setSellCurrencyCode(e.target.value);
                }}
                className="w-full px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-black text-[#192A24]"
              >
                {currencyList.map((c) => {
                  const bal =
                    sellTargetWallet === 'gold_currency'
                      ? store.goldCurrencyBalances[c] || 0
                      : store.currencyBalances[c] || 0;
                  return (
                    <option key={c} value={c}>
                      {getCurrencyFlag(c)} {c} (Dispo : {formatNumber(bal, 2)})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Montant en {sellCurrencyCode} *
              </label>
              <input
                type="text"
                required
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="ex: 500"
                className="w-full px-3 py-2 bg-white rounded-xl border border-amber-400 ring-2 ring-amber-300/30 text-sm font-black font-mono"
              />
            </div>
          </div>

          {/* Quick presets for Sell amount and All available stock */}
          {(() => {
            const availSellBal =
              sellTargetWallet === 'gold_currency'
                ? store.goldCurrencyBalances[sellCurrencyCode] || 0
                : store.currencyBalances[sellCurrencyCode] || 0;
            const enteredSellAmt = parseFloat(sellAmount.replace(',', '.') || '0');
            const projectedAfterSell = availSellBal - (Number.isFinite(enteredSellAmt) ? enteredSellAmt : 0);
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-gray-500 mr-1">Raccourcis :</span>
                  {['100', '500', '1000', '2000'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSellAmount(preset)}
                      className="px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-amber-100 text-gray-700 text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      {preset} {sellCurrencyCode}
                    </button>
                  ))}
                  {availSellBal > 0 && (
                    <button
                      type="button"
                      onClick={() => setSellAmount(String(availSellBal))}
                      className="px-2 py-0.5 rounded-lg bg-[#D39725] text-white text-[10px] font-black cursor-pointer hover:bg-[#c2871b] transition-colors"
                    >
                      Tout le stock ({formatNumber(availSellBal, 2)})
                    </button>
                  )}
                </div>
                {enteredSellAmt > 0 && projectedAfterSell < -0.0001 && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-900 flex items-start gap-2">
                    <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-700" />
                    <span>
                      Stock disponible insuffisant ({formatNumber(availSellBal, 2)} {sellCurrencyCode}). Cette vente fera passer le solde à{' '}
                      <span className="font-mono text-red-700">
                        {formatNumber(projectedAfterSell, 2)} {sellCurrencyCode}
                      </span>
                      .
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Payment Mode Selector */}
          <div className="p-3 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#192A24]">
                Mode d’encaissement
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'cash', label: 'Comptant (100%)' },
                    { id: 'partial', label: 'Partiel (Acompte)' },
                    { id: 'credit', label: 'À crédit (0 FCFA)' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSellPaymentMode(m.id);
                      if (m.id === 'credit') setSellPaidXaf('0');
                      else if (m.id === 'cash') setSellPaidXaf('');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      sellPaymentMode === m.id
                        ? m.id === 'credit'
                          ? 'bg-orange-600 text-white border-orange-600'
                          : m.id === 'partial'
                            ? 'bg-[#D39725] text-white border-[#D39725]'
                            : 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-[#192A24] border-[#E8D8BE] hover:bg-amber-50'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {sellPaymentMode !== 'cash' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {sellPaymentMode === 'partial' && (
                  <div>
                    <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                      Montant encaissé maintenant (FCFA) *
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={sellPaidXaf}
                      onChange={(e) => setSellPaidXaf(e.target.value)}
                      placeholder="ex: 200000"
                      className="w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono text-[#192A24]"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] font-bold text-[#192A24] mb-1">
                    Échéance du crédit (Optionnel)
                  </label>
                  <input
                    type="date"
                    value={sellDueDate}
                    onChange={(e) => setSellDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-xs font-semibold text-[#192A24]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Taux de vente (FCFA / {sellCurrencyCode}) *
              </label>
              <input
                type="text"
                required
                value={sellRate}
                onChange={(e) => setSellRate(e.target.value)}
                placeholder="ex: 625"
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-black font-mono text-[#192A24]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                {sellPaymentMode === 'credit' ? 'Encaissement immédiat' : "Compte d'encaissement FCFA *"}
              </label>
              {sellPaymentMode === 'credit' ? (
                <div className="px-3 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-xs font-bold text-orange-800">
                  0 FCFA (Vente à crédit)
                </div>
              ) : (
                <select
                  value={sellReceiptAccount}
                  onChange={(e) => setSellReceiptAccount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                >
                  {Object.entries(store.bankBalances).map(([acc, bal]) => (
                    <option key={acc} value={acc}>
                      {acc} ({formatMoney(bal)} FCFA)
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Client acheteur {sellPaymentMode !== 'cash' ? '(Obligatoire pour crédit) *' : '(Optionnel)'}
              </label>
              <select
                value={sellContact}
                onChange={(e) => setSellContact(e.target.value)}
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
              >
                <option value="">{sellPaymentMode !== 'cash' ? '-- Sélectionner un client --' : 'Client de passage'}</option>
                {store.contacts.map((c) => (
                  <option key={c.reference} value={c.name}>
                    {c.name} ({c.city}) {c.roles.length ? `· [${c.roles.join(', ')}]` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#192A24] mb-1">
                Motif / Note (Optionnel)
              </label>
              <input
                type="text"
                value={sellNotes}
                onChange={(e) => setSellNotes(e.target.value)}
                placeholder="ex: Conversion en FCFA"
                className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
              />
            </div>
          </div>

          {/* Financial Summary Card */}
          {parseFloat(sellAmount.replace(',', '.') || '0') > 0 && (() => {
            const totalSellXaf = Math.round(
              parseFloat(sellAmount.replace(',', '.') || '0') *
                parseFloat(sellRate.replace(',', '.') || '0')
            );
            const receivedNowXaf =
              sellPaymentMode === 'credit'
                ? 0
                : sellPaymentMode === 'partial'
                  ? Math.min(totalSellXaf, Math.max(0, Math.round(parseFloat(sellPaidXaf.replace(/\s/g, '').replace(',', '.') || '0'))))
                  : totalSellXaf;
            const restCreditXaf = Math.max(0, totalSellXaf - receivedNowXaf);
            return (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-300 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-amber-950 font-bold">
                  <span>
                    Devises retirées de{' '}
                    {sellTargetWallet === 'gold_currency' ? 'Devise d’or' : 'Solde physique'} :
                  </span>
                  <span className="font-mono text-base font-black text-red-700">
                    -{formatNumber(parseFloat(sellAmount.replace(',', '.') || '0'), 2)} {sellCurrencyCode}
                  </span>
                </div>
                <div className="flex justify-between items-center text-gray-700 font-bold">
                  <span>Total opération (FCFA) :</span>
                  <span className="font-mono font-black text-[#192A24]">
                    {formatMoney(totalSellXaf)} FCFA
                  </span>
                </div>
                <div className="flex justify-between items-center text-gray-700 font-bold">
                  <span>Encaissé immédiatement :</span>
                  <span className="font-mono font-black text-emerald-700">
                    +{formatMoney(receivedNowXaf)} FCFA
                  </span>
                </div>
                {restCreditXaf > 0 && (
                  <div className="flex justify-between items-center text-orange-800 font-extrabold">
                    <span>Créance client à crédit :</span>
                    <span className="font-mono font-black">
                      {formatMoney(restCreditXaf)} FCFA
                    </span>
                  </div>
                )}
                {receivedNowXaf > 0 && (
                  <div className="text-[11px] text-gray-500 pt-1 border-t border-amber-200">
                    Crédité sur le compte : <strong>{sellReceiptAccount}</strong>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="pt-2 flex justify-end gap-2.5 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowSellCurModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-black bg-[#192A24] hover:bg-[#253D34] text-white shadow-xs cursor-pointer transition-colors"
            >
              {sellTargetWallet === 'gold_currency'
                ? 'Valider la vente de devise d’or'
                : 'Valider la vente de devises'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* Modal 3: Ajouter au Solde / Ajustement (Physique ou Or)   */}
      {/* ========================================================= */}
      <Modal
        isOpen={showCurAdjModal}
        onClose={() => setShowCurAdjModal(false)}
        title={
          curTargetWallet === 'gold_currency'
            ? curIsAddition
              ? 'Ajouter au solde Devise d’or'
              : 'Ajustement du solde Devise d’or'
            : curIsAddition
              ? 'Ajouter au solde physique de devise'
              : 'Ajustement du solde physique'
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAdjustCurrency} className="space-y-4">
          {curError && (
            <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold">
              {curError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Réserve concernée</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurTargetWallet('gold_currency')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  curTargetWallet === 'gold_currency'
                    ? 'bg-[#D39725] text-white border-[#D39725]'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Devise d’or
              </button>
              <button
                type="button"
                onClick={() => setCurTargetWallet('physical')}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  curTargetWallet === 'physical'
                    ? 'bg-[#192A24] text-white border-[#192A24]'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Solde physique
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Devise</label>
            <select
              value={curCurrency}
              onChange={(e) => setCurCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            >
              {currencyList.map((c) => {
                const bal =
                  curTargetWallet === 'gold_currency'
                    ? store.goldCurrencyBalances[c] || 0
                    : store.currencyBalances[c] || 0;
                return (
                  <option key={c} value={c}>
                    {getCurrencyFlag(c)} {c} (Solde : {formatNumber(bal, 2)})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Opération</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCurIsAddition(true)}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  curIsAddition
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Ajouter au solde (+)
              </button>
              <button
                type="button"
                onClick={() => setCurIsAddition(false)}
                className={`py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  !curIsAddition
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Retrait / Correction (-)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Montant en {curCurrency}</label>
            <input
              type="text"
              required
              value={curAmount}
              onChange={(e) => setCurAmount(e.target.value)}
              placeholder="ex: 500"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            />
            {!curIsAddition && (() => {
              const availCur =
                curTargetWallet === 'gold_currency'
                  ? store.goldCurrencyBalances[curCurrency] || 0
                  : store.currencyBalances[curCurrency] || 0;
              const adjAmt = parseFloat(curAmount.replace(',', '.') || '0');
              const afterAdj = availCur - (Number.isFinite(adjAmt) ? adjAmt : 0);
              if (adjAmt > 0 && afterAdj < -0.0001) {
                return (
                  <p className="mt-1.5 text-[11px] font-bold text-amber-800">
                    Attention : ce retrait dépasse le solde actuel ({formatNumber(availCur, 2)} {curCurrency}) et affichera{' '}
                    <span className="font-mono text-red-700">
                      {formatNumber(afterAdj, 2)} {curCurrency}
                    </span>
                    .
                  </p>
                );
              }
              return null;
            })()}
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Motif</label>
            <input
              type="text"
              required
              value={curReason}
              onChange={(e) => setCurReason(e.target.value)}
              placeholder={
                curTargetWallet === 'gold_currency'
                  ? 'ex: Approvisionnement Devise d’or'
                  : 'ex: Approvisionnement du solde physique'
              }
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCurAdjModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#192A24] text-white cursor-pointer">
              {curIsAddition ? 'Ajouter au solde' : 'Valider le retrait'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* Modal 3b: Transfert Devise d'or -> Solde physique         */}
      {/* ========================================================= */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Transférer Devise d’or → Solde physique"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleTransferGoldCurrency} className="space-y-4">
          <div className="p-3 rounded-xl bg-[#FFF9EA] border border-[#E7AD35] text-xs text-[#7D5711]">
            Déplacez des devises issues de vos ventes d’or vers le solde physique du coffre pour les utiliser en achat ou vente de devises.
          </div>

          {transferError && (
            <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold">
              {transferError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Devise</label>
            <select
              value={transferCurrency}
              onChange={(e) => setTransferCurrency(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            >
              {Object.entries(store.goldCurrencyBalances)
                .filter(([c, bal]) => c === 'USD' || bal > 0)
                .map(([c, bal]) => (
                <option key={c} value={c}>
                  {getCurrencyFlag(c)} {c} (Dispo Devise d’or : {formatNumber(bal || 0, 2)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">
              Montant à transférer ({transferCurrency})
            </label>
            <input
              type="text"
              required
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
              placeholder="ex: 1000"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Motif / Note</label>
            <input
              type="text"
              value={transferReason}
              onChange={(e) => setTransferReason(e.target.value)}
              placeholder="Transfert Devise d’or vers Solde physique"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowTransferModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
            >
              Confirmer le transfert
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* Modal 4: Ajustement de Stock d'Or                          */}
      {/* ========================================================= */}
      <Modal
        isOpen={showGoldAdjModal}
        onClose={() => setShowGoldAdjModal(false)}
        title="Ajustement de stock d'or"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleAdjustGold} className="space-y-4">
          {goldError && (
            <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold">
              {goldError}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Titre / Carat</label>
            <select
              value={goldKarat}
              onChange={(e) => setGoldKarat(e.target.value)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            >
              {standardKarats.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Catégorie</label>
            <select
              value={goldCategory}
              onChange={(e) => setGoldCategory(e.target.value as GoldCategory)}
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-semibold"
            >
              {GOLD_STOCK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">
              Variation de poids en grammes (+ pour ajout, - pour retrait)
            </label>
            <input
              type="text"
              required
              value={goldWeightGrams}
              onChange={(e) => setGoldWeightGrams(e.target.value)}
              placeholder="ex: +25.4 ou -10.2"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#192A24] mb-1">Motif de correction obligatoire</label>
            <input
              type="text"
              required
              value={goldReason}
              onChange={(e) => setGoldReason(e.target.value)}
              placeholder="ex: Régularisation inventaire physique"
              className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowGoldAdjModal(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200"
            >
              Annuler
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-[#D39725] text-white">
              Enregistrer l'ajustement
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {/* Modal 5: Règlement / Encaissement d'un crédit devise       */}
      {/* ========================================================= */}
      {creditPaymentModal && (() => {
        const mov = creditPaymentModal.movement;
        const isSale = mov.type.toLowerCase().startsWith('vente');
        const rem = mov.remainingXaf ?? 0;
        const paid = mov.paidXaf ?? 0;
        return (
          <Modal
            isOpen={Boolean(creditPaymentModal)}
            onClose={() => setCreditPaymentModal(null)}
            title={
              isSale
                ? `Encaisser le crédit · Vente ${mov.currency}`
                : `Régler le crédit · Achat ${mov.currency}`
            }
            maxWidth="max-w-md"
          >
            <form onSubmit={handleExecuteCreditPayment} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#E8D8BE] text-xs space-y-1">
                <div className="font-black text-[#192A24]">
                  {mov.type} · {mov.contact || 'Contact'}
                </div>
                <div className="text-gray-600">
                  Total : <strong>{formatMoney(mov.totalXaf ?? 0)} FCFA</strong> · Déjà réglé :{' '}
                  <strong>{formatMoney(paid)} FCFA</strong>
                </div>
                <div className="text-orange-800 font-extrabold">
                  Reste dû : <span className="font-mono">{formatMoney(rem)} FCFA</span>
                  {mov.dueDate ? ` · Échéance : ${mov.dueDate}` : ''}
                </div>
              </div>

              {creditPayError && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-bold text-red-700 flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{creditPayError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  Montant à {isSale ? 'encaisser' : 'régler'} (FCFA) *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={creditPayAmount}
                  onChange={(e) => setCreditPayAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-[#E8D8BE] text-sm font-black font-mono text-[#192A24]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  {isSale ? "Compte d'encaissement FCFA *" : 'Compte de décaissement FCFA *'}
                </label>
                <select
                  value={creditPayAccount}
                  onChange={(e) => setCreditPayAccount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs font-bold text-[#192A24]"
                >
                  {Object.entries(store.bankBalances).map(([acc, bal]) => (
                    <option key={acc} value={acc}>
                      {acc} ({formatMoney(bal)} FCFA)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#192A24] mb-1">
                  Note / Référence (Optionnel)
                </label>
                <input
                  type="text"
                  value={creditPayNote}
                  onChange={(e) => setCreditPayNote(e.target.value)}
                  placeholder="ex: Règlement solde espèces"
                  className="w-full px-3 py-2 bg-[#FAF8F3] rounded-xl border border-[#E8D8BE] text-xs"
                />
              </div>

              {(mov.payments?.length ?? 0) > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-gray-500">
                    Historique des versements
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 text-[11px]">
                    {mov.payments?.map((p) => (
                      <div key={p.id} className="py-1 flex justify-between">
                        <span className="text-gray-600">
                          {formatDateTime(p.paidAt)} · {p.account}
                        </span>
                        <span className="font-mono font-bold text-[#192A24]">
                          {formatMoney(p.amountXaf)} F
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreditPaymentModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-600 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-black bg-[#008B62] hover:bg-[#007452] text-white cursor-pointer"
                >
                  {isSale ? "Confirmer l'encaissement" : 'Confirmer le règlement'}
                </button>
              </div>
            </form>
          </Modal>
        );
      })()}
    </div>
  );
};
