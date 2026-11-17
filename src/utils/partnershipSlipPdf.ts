import { jsPDF } from 'jspdf';
import {
  Partner,
  Partnership,
  PartnershipCashMovement,
  PARTNERSHIP_SCENARIO_LABELS,
  PARTNERSHIP_STATUS_LABELS,
  REMUNERATION_METHOD_LABELS,
} from '../types';
import { numberToWordsFr } from './numberToWordsFr';
import { WhatsAppDirectService } from '../services/whatsappDirectService';

const trySendPdfDirectlyViaWhatsApp = async (
  doc: jsPDF,
  filename: string,
  phone: string | undefined,
  caption: string
): Promise<boolean> => {
  const cleanPhone = (phone || '').replace(/[^\d]/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return false;
  try {
    const status = await WhatsAppDirectService.getStatus();
    if (!status.apiConfigured && status.status !== 'connected') {
      return false;
    }
    const dataUri = doc.output('datauristring');
    const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
    await WhatsAppDirectService.sendDocument({
      phone: cleanPhone,
      filename,
      pdfBase64,
      caption,
    });
    return true;
  } catch {
    return false;
  }
};

const formatMoney = (val?: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(val || 0))
    .replace(/[\u202F\u00A0]/g, ' ');

const formatNumber = (val?: number, decimals: number = 2): string =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(val || 0)
    .replace(/[\u202F\u00A0]/g, ' ');

const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return Number.isNaN(d.getTime())
    ? dateString
    : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Africa/Brazzaville',
      }).format(d);
};

export const getPartnershipInvestments = (partnership: Partnership) => {
  const companyInvestmentXaf = partnership.members
    .filter((m) => m.isCompany || m.name.trim().toLowerCase() === 'cams gold')
    .reduce(
      (sum, m) =>
        sum +
        m.contributions
          .filter((c) => c.kind === 'financial')
          .reduce((cSum, c) => cSum + (c.amountXaf || 0), 0),
      0
    );

  const partnerMembers = partnership.members.filter(
    (m) => !m.isCompany && m.name.trim().toLowerCase() !== 'cams gold'
  );
  const partnerInvestmentXaf = partnerMembers.reduce(
    (sum, m) =>
      sum +
      m.contributions
        .filter((c) => c.kind === 'financial')
        .reduce((cSum, c) => cSum + (c.amountXaf || 0), 0),
    0
  );

  const totalInvestmentXaf = companyInvestmentXaf + partnerInvestmentXaf;
  const companyShareCapitalPct =
    totalInvestmentXaf > 0 ? (companyInvestmentXaf / totalInvestmentXaf) * 100 : 0;
  const partnerShareCapitalPct =
    totalInvestmentXaf > 0 ? (partnerInvestmentXaf / totalInvestmentXaf) * 100 : 0;

  return {
    companyInvestmentXaf,
    partnerInvestmentXaf,
    totalInvestmentXaf,
    companyShareCapitalPct,
    partnerShareCapitalPct,
    partnerNames: partnerMembers.map((m) => m.name).join(', ') || 'Partenaire',
    partnerProfitPct:
      partnerMembers[0]?.profitSharePercent ?? partnership.remunerationValue ?? 50,
    companyProfitPct:
      partnership.members.find((m) => m.isCompany || m.name.trim().toLowerCase() === 'cams gold')
        ?.profitSharePercent ??
      Math.max(0, 100 - (partnerMembers[0]?.profitSharePercent ?? partnership.remunerationValue ?? 50)),
  };
};

// =========================================================================
// 1. BORDEREAU DE CONTRAT DE PARTENARIAT
// =========================================================================
export const createPartnershipContractPdf = (
  partnership: Partnership,
  operatorName: string
): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const darkGreen: [number, number, number] = [25, 42, 36];
  const gold: [number, number, number] = [211, 151, 37];
  const emerald: [number, number, number] = [0, 139, 98];
  const muted: [number, number, number] = [102, 112, 133];

  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.8);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8, 'S');
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4, 'S');

  let y = margin + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...darkGreen);
  doc.text('CAMS GOLD', margin, y);

  y += 5.5;
  doc.setFontSize(8.5);
  doc.setTextColor(...gold);
  doc.text('PARTENARIATS · INVESTISSEMENTS · OPÉRATIONS OR', margin, y);

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Bordereau Officiel de Convention de Partenariat', margin, y);

  const refText = `CONTRAT N° ${partnership.reference}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const refW = doc.getTextWidth(refText) + 8;
  doc.setFillColor(...darkGreen);
  doc.roundedRect(pageWidth - margin - refW, margin, refW, 7.5, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(refText, pageWidth - margin - refW + 4, margin + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Établi le : ${formatDateTime(partnership.createdAt)}`, pageWidth - margin, margin + 12, {
    align: 'right',
  });
  doc.text(`Opérateur : ${operatorName || 'CAMS GOLD'}`, pageWidth - margin, margin + 16, {
    align: 'right',
  });

  y += 6;
  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  const inv = getPartnershipInvestments(partnership);

  // Scénario & Statut
  doc.setFillColor(250, 248, 243);
  doc.setDrawColor(232, 216, 190);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('OBJET DU PARTENARIAT', margin + 4, y + 5.5);

  doc.setFontSize(12);
  doc.setTextColor(...darkGreen);
  doc.text(PARTNERSHIP_SCENARIO_LABELS[partnership.scenario] || partnership.scenario, margin + 4, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `Statut : ${PARTNERSHIP_STATUS_LABELS[partnership.status] || partnership.status} · Rémunération : ${
      REMUNERATION_METHOD_LABELS[partnership.remunerationMethod] || partnership.remunerationMethod
    }`,
    margin + 4,
    y + 18.5
  );
  y += 29;

  // Investissements Entreprise vs Partenaire
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkGreen);
  doc.text('1. RÉPARTITION DES INVESTISSEMENTS & PARTS', margin, y);
  y += 4;

  const boxW = (contentWidth - 6) / 3;
  // Box 1: Entreprise CAMS GOLD
  doc.setFillColor(255, 249, 234);
  doc.setDrawColor(231, 173, 53);
  doc.roundedRect(margin, y, boxW, 22, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(158, 115, 27);
  doc.text('INVESTI PAR CAMS GOLD', margin + 3, y + 5.5);
  doc.setFontSize(11);
  doc.setTextColor(...darkGreen);
  doc.text(`${formatMoney(inv.companyInvestmentXaf)} FCFA`, margin + 3, y + 12.5);
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text(
    `Capital : ${formatNumber(inv.companyShareCapitalPct, 1)}% · Bénéfice : ${inv.companyProfitPct}%`,
    margin + 3,
    y + 18.5
  );

  // Box 2: Partenaire
  const box2X = margin + boxW + 3;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.roundedRect(box2X, y, boxW, 22, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 64, 175);
  doc.text(`INVESTI PAR ${inv.partnerNames.toUpperCase().slice(0, 22)}`, box2X + 3, y + 5.5);
  doc.setFontSize(11);
  doc.setTextColor(...darkGreen);
  doc.text(`${formatMoney(inv.partnerInvestmentXaf)} FCFA`, box2X + 3, y + 12.5);
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text(
    `Capital : ${formatNumber(inv.partnerShareCapitalPct, 1)}% · Bénéfice : ${inv.partnerProfitPct}%`,
    box2X + 3,
    y + 18.5
  );

  // Box 3: Total
  const box3X = box2X + boxW + 3;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(110, 231, 183);
  doc.roundedRect(box3X, y, boxW, 22, 2, 2, 'FD');
  doc.setFontSize(7.5);
  doc.setTextColor(...emerald);
  doc.text('CAPITAL TOTAL ENGAGÉ', box3X + 3, y + 5.5);
  doc.setFontSize(11);
  doc.setTextColor(...darkGreen);
  doc.text(`${formatMoney(inv.totalInvestmentXaf)} FCFA`, box3X + 3, y + 12.5);
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text('100% du partenariat', box3X + 3, y + 18.5);
  y += 28;

  // Parties détaillées
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkGreen);
  doc.text('2. PARTIES CONTRACTANTES & APPORTS DÉTAILLÉS', margin, y);
  y += 4;

  partnership.members.forEach((m) => {
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(220, 220, 220);
    doc.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkGreen);
    doc.text(`${m.name} (${m.role})`, margin + 4, y + 6);
    if (m.profitSharePercent !== undefined) {
      doc.setTextColor(...gold);
      doc.text(`Part bénéfices : ${m.profitSharePercent}%`, pageWidth - margin - 4, y + 6, {
        align: 'right',
      });
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(70, 70, 70);
    const contribSummary =
      m.contributions.length > 0
        ? m.contributions
            .map((c) => {
              if (c.kind === 'financial') return `Apport financier : ${formatMoney(c.amountXaf)} FCFA`;
              if (c.kind === 'metal') return `Apport métal : ${c.netWeightGrams} g (${c.purityPercent}%)`;
              return `Prestation : ${c.serviceDescription || 'Service'}`;
            })
            .join(' · ')
        : 'Aucun apport initial renseigné';
    doc.text(contribSummary, margin + 4, y + 13);
    y += 21;
  });

  y += 3;
  // Clauses & Observations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkGreen);
  doc.text('3. CLAUSES & OBSERVATIONS DE LA CONVENTION', margin, y);
  y += 4;

  doc.setFillColor(250, 248, 243);
  doc.setDrawColor(232, 216, 190);
  doc.roundedRect(margin, y, contentWidth, 28, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  const noteLines = doc.splitTextToSize(
    partnership.note || 'Convention commerciale établie entre CAMS GOLD et le partenaire.',
    contentWidth - 8
  );
  doc.text(noteLines.slice(0, 4), margin + 4, y + 6);
  y += 36;

  // Signatures
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkGreen);
  doc.text('Pour CAMS GOLD (L’Entreprise)', margin + 8, y);
  doc.text(`Pour le Partenaire (${inv.partnerNames.slice(0, 26)})`, pageWidth - margin - 8, y, {
    align: 'right',
  });

  y += 4;
  doc.setDrawColor(190, 190, 190);
  doc.rect(margin, y, 78, 26);
  doc.rect(pageWidth - margin - 78, y, 78, 26);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text('Signature & Cachet CAMS GOLD', margin + 39, y + 23, { align: 'center' });
  doc.text('Lu et approuvé · Signature Partenaire', pageWidth - margin - 39, y + 23, {
    align: 'center',
  });

  // Footer
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...gold);
  doc.text('CAMS GOLD · BORDEREAU CONTRAT PARTENARIAT', margin, pageHeight - margin + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('Document certifié pour partage & archivage', pageWidth - margin, pageHeight - margin + 2, {
    align: 'right',
  });

  return doc;
};

export const buildPartnershipContractWhatsAppMessage = (partnership: Partnership): string => {
  const inv = getPartnershipInvestments(partnership);
  return [
    `🤝 *CAMS GOLD · BORDEREAU DE CONTRAT PARTENARIAT*`,
    `--------------------------------------`,
    `🔹 *Contrat N° :* ${partnership.reference}`,
    `📅 *Date :* ${formatDateTime(partnership.createdAt)}`,
    `📋 *Objet :* ${PARTNERSHIP_SCENARIO_LABELS[partnership.scenario]}`,
    `📌 *Statut :* ${PARTNERSHIP_STATUS_LABELS[partnership.status]}`,
    ``,
    `💰 *RÉPARTITION DES INVESTISSEMENTS*`,
    `• Investi par l’entreprise (CAMS GOLD) : *${formatMoney(inv.companyInvestmentXaf)} FCFA* (${formatNumber(inv.companyShareCapitalPct, 1)}%)`,
    `• Investi par ${inv.partnerNames} : *${formatMoney(inv.partnerInvestmentXaf)} FCFA* (${formatNumber(inv.partnerShareCapitalPct, 1)}%)`,
    `• Capital total engagé : *${formatMoney(inv.totalInvestmentXaf)} FCFA*`,
    ``,
    `📊 *PARTAGE DES BÉNÉFICES*`,
    `• Part CAMS GOLD : *${inv.companyProfitPct}%*`,
    `• Part ${inv.partnerNames} : *${inv.partnerProfitPct}%*`,
    ``,
    `📝 *Clauses / Note :* ${partnership.note || 'Convention CAMS GOLD'}`,
  ].join('\n');
};

export const downloadPartnershipContractPdf = (
  partnership: Partnership,
  operatorName: string
): void => {
  const doc = createPartnershipContractPdf(partnership, operatorName);
  const safeRef = (partnership.reference || 'contrat').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Bordereau-Contrat-Partenariat-${safeRef}.pdf`);
};

export const sharePartnershipContract = async (
  partnership: Partnership,
  operatorName: string,
  phone?: string
): Promise<'direct' | 'share' | 'whatsapp'> => {
  const doc = createPartnershipContractPdf(partnership, operatorName);
  const safeRef = (partnership.reference || 'contrat').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Bordereau-Contrat-${safeRef}.pdf`;
  const text = buildPartnershipContractWhatsAppMessage(partnership);

  if (await trySendPdfDirectlyViaWhatsApp(doc, filename, phone, text)) {
    return 'direct';
  }

  const file = new File([doc.output('blob')], filename, {
    type: 'application/pdf',
  });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Contrat Partenariat ${partnership.reference} - CAMS GOLD`,
        text,
        files: [file],
      });
      return 'share';
    } catch {
      // Fallback to WhatsApp link below
    }
  }

  downloadPartnershipContractPdf(partnership, operatorName);
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'whatsapp';
};

// =========================================================================
// 2. BORDEREAU OPÉRATION CAISSE PARTENAIRE (AVEC DÉPENSE & BILAN PARTENARIAT)
// =========================================================================
export interface PartnershipSummarySnapshot {
  balance: number;
  camsGoldContrib: number;
  partnerContrib: number;
  purchasesTotal: number;
  salesTotal: number;
  expensesTotal: number;
  benefitTotal: number;
  partnerProfitSharePct: number;
  companyProfitSharePct: number;
  partnerProfitAmount: number;
  companyProfitAmount: number;
  fineGoldGrams: number;
}

export const getMovementTypeTitle = (movement: PartnershipCashMovement): string => {
  if (movement.type === 'contribution') {
    return movement.contributor === 'CAMS GOLD'
      ? 'BORDEREAU D’APPORT ENTREPRISE (CAMS GOLD)'
      : 'BORDEREAU D’APPORT FINANCEMENT PARTENAIRE';
  }
  if (movement.type === 'goldPurchase') return 'BORDEREAU D’ACHAT D’OR PARTENAIRE';
  if (movement.type === 'goldSale') return 'BORDEREAU DE VENTE D’OR PARTENAIRE';
  return 'BORDEREAU DE DÉPENSE PARTENAIRE';
};

export const getMovementCashDelta = (movement: PartnershipCashMovement): number => {
  const attachedExpense = movement.expenseAmountXaf || 0;
  if (movement.type === 'contribution') return movement.amountXaf;
  if (movement.type === 'goldSale') return movement.amountXaf - attachedExpense;
  if (movement.type === 'goldPurchase') return -(movement.amountXaf + attachedExpense);
  return -movement.amountXaf;
};

export const createPartnershipMovementPdf = (
  movement: PartnershipCashMovement,
  partner: Partner | null,
  balanceAfterXaf: number,
  operatorName: string,
  summary?: PartnershipSummarySnapshot
): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const darkGreen: [number, number, number] = [25, 42, 36];
  const gold: [number, number, number] = [211, 151, 37];
  const emerald: [number, number, number] = [0, 139, 98];
  const muted: [number, number, number] = [102, 112, 133];

  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.8);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8, 'S');

  let y = margin + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...darkGreen);
  doc.text('CAMS GOLD', margin, y);

  y += 5.5;
  doc.setFontSize(8.5);
  doc.setTextColor(...gold);
  doc.text('CAISSE PARTENAIRE · OPÉRATIONS DÉDIÉES', margin, y);

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(getMovementTypeTitle(movement), margin, y);

  const refText = `N° ${movement.reference || movement.id.slice(-8).toUpperCase()}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const refW = doc.getTextWidth(refText) + 8;
  doc.setFillColor(...darkGreen);
  doc.roundedRect(pageWidth - margin - refW, margin, refW, 7.5, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(refText, pageWidth - margin - refW + 4, margin + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Date : ${formatDateTime(movement.createdAt)}`, pageWidth - margin, margin + 12, {
    align: 'right',
  });
  doc.text(
    `Opérateur : ${movement.createdBy || operatorName || 'CAMS GOLD'}`,
    pageWidth - margin,
    margin + 16,
    { align: 'right' }
  );

  y += 6;
  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Partner Identity Card
  const partnerDisplay = partner?.name || movement.partnerName || 'Partenaire';
  doc.setFillColor(250, 248, 243);
  doc.setDrawColor(232, 216, 190);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text('CAISSE PARTENAIRE CONCERNÉE', margin + 4, y + 5);
  doc.setFontSize(11.5);
  doc.setTextColor(...darkGreen);
  doc.text(`CAMS GOLD ↔ ${partnerDisplay}`, margin + 4, y + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(70, 70, 70);
  doc.text(
    `${partner?.type || 'Partenaire'} · ${partner?.city || '—'} · ${partner?.phone || 'Sans tél.'}${
      movement.contractRef ? ` · Contrat : ${movement.contractRef}` : ''
    }`,
    margin + 4,
    y + 17
  );
  y += 24;

  // Amount Highlight
  const attachedExpense = movement.expenseAmountXaf || 0;
  const netDelta = getMovementCashDelta(movement);
  const isInflow = netDelta >= 0;
  doc.setFillColor(isInflow ? 236 : 254, isInflow ? 253 : 242, isInflow ? 245 : 242);
  doc.setDrawColor(isInflow ? 110 : 252, isInflow ? 231 : 165, isInflow ? 183 : 165);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...(isInflow ? emerald : ([185, 28, 28] as [number, number, number])));
  doc.text(
    isInflow ? 'ENTRÉE NETTE EN CAISSE PARTENAIRE' : 'SORTIE NETTE DE CAISSE PARTENAIRE',
    margin + 5,
    y + 5.5
  );
  doc.setFontSize(15);
  doc.text(
    `${isInflow ? '+' : '-'} ${formatMoney(Math.abs(netDelta))} FCFA`,
    margin + 5,
    y + 13.5
  );
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.8);
  doc.setTextColor(70, 70, 70);
  doc.text(
    attachedExpense > 0
      ? `Opération : ${formatMoney(movement.amountXaf)} FCFA · Dépense partenaire : -${formatMoney(attachedExpense)} FCFA`
      : `Arrêté à la somme de : ${numberToWordsFr(Math.round(Math.abs(netDelta)))} francs CFA`,
    margin + 5,
    y + 20.5
  );
  y += 29;

  // Operation details box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...darkGreen);
  doc.text('DÉTAILS DE L’OPÉRATION', margin, y);
  y += 3.5;

  const detailRows: Array<[string, string]> = [
    ['Nature de l’opération', getMovementTypeTitle(movement)],
    ['Libellé / Description', movement.description || '—'],
    [
      movement.type === 'goldPurchase'
        ? 'Montant achat d’or'
        : movement.type === 'goldSale'
          ? 'Montant brut vente d’or'
          : 'Montant opération',
      `${formatMoney(movement.amountXaf)} FCFA`,
    ],
  ];

  if (attachedExpense > 0) {
    detailRows.push([
      'Dépense partenaire rattachée',
      `-${formatMoney(attachedExpense)} FCFA${movement.expenseDescription ? ` (${movement.expenseDescription})` : ''}`,
    ]);
  }
  if (movement.type === 'contribution') {
    detailRows.push([
      'Source du financement',
      movement.contributor === 'CAMS GOLD'
        ? 'Entreprise CAMS GOLD'
        : `Partenaire (${partnerDisplay})`,
    ]);
  }
  if (movement.weightGrams !== undefined && movement.karat !== undefined) {
    const fine24k = (movement.weightGrams * movement.karat) / 24;
    detailRows.push([
      'Pesée & Carat',
      `${formatNumber(movement.weightGrams, 3)} g · ${formatNumber(movement.karat, 2)} K (Équiv. 24K : ${formatNumber(fine24k, 3)} g)`,
    ]);
  }
  if (movement.pricePerGramXaf) {
    detailRows.push(['Prix unitaire au gramme', `${formatMoney(movement.pricePerGramXaf)} FCFA / g`]);
  }
  if (movement.counterpartyName) {
    detailRows.push([
      movement.type === 'goldPurchase'
        ? 'Fournisseur'
        : movement.type === 'goldSale'
          ? 'Client / Acheteur'
          : 'Bénéficiaire',
      movement.counterpartyName,
    ]);
  }
  if (movement.paymentMode) {
    detailRows.push(['Mode de règlement', movement.paymentMode]);
  }
  detailRows.push(['Solde Caisse Partenaire après opération', `${formatMoney(balanceAfterXaf)} FCFA`]);

  const rowHeight = 7.5;
  detailRows.forEach(([k, v], idx) => {
    const rowY = y + idx * rowHeight;
    doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 243 : 255);
    doc.setDrawColor(232, 224, 210);
    doc.rect(margin, rowY, contentWidth, rowHeight, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(k, margin + 3, rowY + 5.1);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkGreen);
    doc.text(v, pageWidth - margin - 3, rowY + 5.1, { align: 'right' });
  });

  y += detailRows.length * rowHeight + 6;

  // Unified Partnership Summary Block (Purchases / Sales / Expenses / Benefit)
  if (summary) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...darkGreen);
    doc.text('BILAN PARTENARIAT CUMULÉ (ACHATS · VENTES · DÉPENSES · BÉNÉFICE)', margin, y);
    y += 3.5;

    const colW = (contentWidth - 6) / 4;
    const summaryBoxes = [
      {
        title: 'ACHATS D’OR',
        value: `${formatMoney(summary.purchasesTotal)} F`,
        fill: [254, 242, 242] as [number, number, number],
        stroke: [252, 165, 165] as [number, number, number],
        color: [185, 28, 28] as [number, number, number],
      },
      {
        title: 'VENTES D’OR',
        value: `${formatMoney(summary.salesTotal)} F`,
        fill: [236, 253, 245] as [number, number, number],
        stroke: [110, 231, 183] as [number, number, number],
        color: emerald,
      },
      {
        title: 'DÉPENSES',
        value: `${formatMoney(summary.expensesTotal)} F`,
        fill: [255, 247, 237] as [number, number, number],
        stroke: [253, 186, 116] as [number, number, number],
        color: [194, 65, 12] as [number, number, number],
      },
      {
        title: 'BÉNÉFICE NET',
        value: `${summary.benefitTotal >= 0 ? '+' : ''}${formatMoney(summary.benefitTotal)} F`,
        fill: darkGreen,
        stroke: darkGreen,
        color: summary.benefitTotal >= 0 ? ([110, 231, 183] as [number, number, number]) : ([252, 165, 165] as [number, number, number]),
      },
    ];

    summaryBoxes.forEach((box, idx) => {
      const bx = margin + idx * (colW + 2);
      doc.setFillColor(...box.fill);
      doc.setDrawColor(...box.stroke);
      doc.roundedRect(bx, y, colW, 16, 1.5, 1.5, 'FD');
      doc.setFontSize(6.8);
      doc.setTextColor(...(idx === 3 ? ([242, 189, 69] as [number, number, number]) : muted));
      doc.text(box.title, bx + 2.5, y + 5);
      doc.setFontSize(9.5);
      doc.setTextColor(...box.color);
      doc.text(box.value, bx + 2.5, y + 12);
    });

    y += 19;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(70, 70, 70);
    doc.text(
      `Apports : CAMS ${formatMoney(summary.camsGoldContrib)} F · ${partnerDisplay} ${formatMoney(summary.partnerContrib)} F · Part bénéfice : CAMS (${summary.companyProfitSharePct}%) ${formatMoney(summary.companyProfitAmount)} F · ${partnerDisplay} (${summary.partnerProfitSharePct}%) ${formatMoney(summary.partnerProfitAmount)} F`,
      margin,
      y
    );
    y += 8;
  } else {
    y += 6;
  }

  // Signatures
  const sigY = Math.min(y, pageHeight - margin - 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...darkGreen);
  doc.text('Visa CAMS GOLD', margin + 8, sigY);
  doc.text(`Visa Partenaire (${partnerDisplay.slice(0, 24)})`, pageWidth - margin - 8, sigY, {
    align: 'right',
  });
  doc.setDrawColor(190, 190, 190);
  doc.rect(margin, sigY + 3, 76, 20);
  doc.rect(pageWidth - margin - 76, sigY + 3, 76, 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...gold);
  doc.text('CAMS GOLD · CAISSE PARTENARIAT', margin, pageHeight - margin + 2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('Bordereau exclusif partenariat', pageWidth - margin, pageHeight - margin + 2, {
    align: 'right',
  });

  return doc;
};

export const buildPartnershipMovementWhatsAppMessage = (
  movement: PartnershipCashMovement,
  partner: Partner | null,
  balanceAfterXaf: number,
  summary?: PartnershipSummarySnapshot
): string => {
  const partnerName = partner?.name || movement.partnerName || 'Partenaire';
  const ref = movement.reference || movement.id.slice(-8).toUpperCase();
  const attachedExpense = movement.expenseAmountXaf || 0;
  const netDelta = getMovementCashDelta(movement);
  const lines = [
    `🪙 *CAMS GOLD · ${getMovementTypeTitle(movement)}*`,
    `--------------------------------------`,
    `🔹 *Bordereau N° :* ${ref}`,
    `🤝 *Partenaire :* ${partnerName}`,
    `📅 *Date :* ${formatDateTime(movement.createdAt)}`,
    `💰 *Montant opération :* *${formatMoney(movement.amountXaf)} FCFA*`,
  ];

  if (attachedExpense > 0) {
    lines.push(
      `🧾 *Dépense partenaire :* *-${formatMoney(attachedExpense)} FCFA*${
        movement.expenseDescription ? ` (${movement.expenseDescription})` : ''
      }`
    );
    lines.push(
      `💼 *Impact net caisse :* *${netDelta >= 0 ? '+' : '-'}${formatMoney(Math.abs(netDelta))} FCFA*`
    );
  }
  if (movement.type === 'contribution') {
    lines.push(
      `🏦 *Apporté par :* ${
        movement.contributor === 'CAMS GOLD' ? 'CAMS GOLD (Entreprise)' : partnerName
      }`
    );
  }
  if (movement.weightGrams !== undefined && movement.karat !== undefined) {
    lines.push(
      `⚖️ *Or :* ${formatNumber(movement.weightGrams, 3)} g · ${formatNumber(movement.karat, 2)}K`
    );
  }
  if (movement.counterpartyName) {
    lines.push(`👤 *Tiers :* ${movement.counterpartyName}`);
  }
  lines.push(`📝 *Libellé :* ${movement.description}`);
  lines.push(`💵 *Solde Caisse Partenaire :* *${formatMoney(balanceAfterXaf)} FCFA*`);

  if (summary) {
    lines.push(``);
    lines.push(`📊 *BILAN PARTENARIAT COMPLET*`);
    lines.push(`• Achats d’or : *${formatMoney(summary.purchasesTotal)} FCFA*`);
    lines.push(`• Ventes d’or : *${formatMoney(summary.salesTotal)} FCFA*`);
    lines.push(`• Dépenses partenaire : *${formatMoney(summary.expensesTotal)} FCFA*`);
    lines.push(
      `• Bénéfice net : *${summary.benefitTotal >= 0 ? '+' : ''}${formatMoney(summary.benefitTotal)} FCFA*`
    );
    lines.push(
      `• Partage : CAMS (${summary.companyProfitSharePct}%) *${formatMoney(summary.companyProfitAmount)} F* · ${partnerName} (${summary.partnerProfitSharePct}%) *${formatMoney(summary.partnerProfitAmount)} F*`
    );
  }

  return lines.join('\n');
};

export const downloadPartnershipMovementPdf = (
  movement: PartnershipCashMovement,
  partner: Partner | null,
  balanceAfterXaf: number,
  operatorName: string,
  summary?: PartnershipSummarySnapshot
): void => {
  const doc = createPartnershipMovementPdf(movement, partner, balanceAfterXaf, operatorName, summary);
  const safeRef = (movement.reference || movement.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Bordereau-Partenaire-${safeRef}.pdf`);
};

export const sharePartnershipMovement = async (
  movement: PartnershipCashMovement,
  partner: Partner | null,
  balanceAfterXaf: number,
  operatorName: string,
  summary?: PartnershipSummarySnapshot
): Promise<'direct' | 'share' | 'whatsapp'> => {
  const doc = createPartnershipMovementPdf(movement, partner, balanceAfterXaf, operatorName, summary);
  const safeRef = (movement.reference || movement.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Bordereau-Partenaire-${safeRef}.pdf`;
  const text = buildPartnershipMovementWhatsAppMessage(movement, partner, balanceAfterXaf, summary);

  if (await trySendPdfDirectlyViaWhatsApp(doc, filename, partner?.phone, text)) {
    return 'direct';
  }

  const file = new File([doc.output('blob')], filename, {
    type: 'application/pdf',
  });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Bordereau Partenaire ${movement.reference || ''} - CAMS GOLD`,
        text,
        files: [file],
      });
      return 'share';
    } catch {
      // Fallback
    }
  }

  downloadPartnershipMovementPdf(movement, partner, balanceAfterXaf, operatorName, summary);
  const cleanPhone = (partner?.phone || '').replace(/\D/g, '');
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'whatsapp';
};

// =========================================================================
// 3. BORDEREAU RÉCAPITULATIF COMPLET PARTENAIRE (ACHATS · VENTES · DÉPENSES · BÉNÉFICE)
// =========================================================================
export const createPartnershipSummaryPdf = (
  partner: Partner,
  summary: PartnershipSummarySnapshot,
  movements: PartnershipCashMovement[],
  operatorName: string
): jsPDF => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const darkGreen: [number, number, number] = [25, 42, 36];
  const gold: [number, number, number] = [211, 151, 37];
  const emerald: [number, number, number] = [0, 139, 98];
  const muted: [number, number, number] = [102, 112, 133];

  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.8);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8, 'S');

  let y = margin + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...darkGreen);
  doc.text('CAMS GOLD', margin, y);

  y += 5.5;
  doc.setFontSize(8.5);
  doc.setTextColor(...gold);
  doc.text('BORDEREAU RÉCAPITULATIF DE PARTENARIAT', margin, y);

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Achats d’or · Ventes d’or · Dépenses · Bénéfice Net', margin, y);

  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Édité le : ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, margin + 5, {
    align: 'right',
  });
  doc.text(`Opérateur : ${operatorName || 'CAMS GOLD'}`, pageWidth - margin, margin + 10, {
    align: 'right',
  });

  y += 6;
  doc.setDrawColor(...darkGreen);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Partner Info
  doc.setFillColor(250, 248, 243);
  doc.setDrawColor(232, 216, 190);
  doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...darkGreen);
  doc.text(`PARTENAIRE : CAMS GOLD ↔ ${partner.name}`, margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(70, 70, 70);
  doc.text(
    `${partner.type} · ${partner.city || '—'} · ${partner.phone || 'Sans tél.'} · Solde caisse : ${formatMoney(summary.balance)} FCFA`,
    margin + 4,
    y + 13.5
  );
  y += 23;

  // 4 Key Totals: Achats, Ventes, Dépenses, Bénéfice
  const colW = (contentWidth - 6) / 4;
  const boxes = [
    {
      title: 'ACHATS D’OR',
      val: `${formatMoney(summary.purchasesTotal)} F`,
      fill: [254, 242, 242] as [number, number, number],
      stroke: [252, 165, 165] as [number, number, number],
      color: [185, 28, 28] as [number, number, number],
    },
    {
      title: 'VENTES D’OR',
      val: `${formatMoney(summary.salesTotal)} F`,
      fill: [236, 253, 245] as [number, number, number],
      stroke: [110, 231, 183] as [number, number, number],
      color: emerald,
    },
    {
      title: 'DÉPENSES',
      val: `${formatMoney(summary.expensesTotal)} F`,
      fill: [255, 247, 237] as [number, number, number],
      stroke: [253, 186, 116] as [number, number, number],
      color: [194, 65, 12] as [number, number, number],
    },
    {
      title: 'BÉNÉFICE NET',
      val: `${summary.benefitTotal >= 0 ? '+' : ''}${formatMoney(summary.benefitTotal)} F`,
      fill: darkGreen,
      stroke: darkGreen,
      color: summary.benefitTotal >= 0 ? ([110, 231, 183] as [number, number, number]) : ([252, 165, 165] as [number, number, number]),
    },
  ];
  boxes.forEach((box, idx) => {
    const bx = margin + idx * (colW + 2);
    doc.setFillColor(...box.fill);
    doc.setDrawColor(...box.stroke);
    doc.roundedRect(bx, y, colW, 18, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...(idx === 3 ? ([242, 189, 69] as [number, number, number]) : muted));
    doc.text(box.title, bx + 2.5, y + 5.5);
    doc.setFontSize(10);
    doc.setTextColor(...box.color);
    doc.text(box.val, bx + 2.5, y + 13.5);
  });
  y += 22;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(
    `Apports : CAMS GOLD ${formatMoney(summary.camsGoldContrib)} F · ${partner.name} ${formatMoney(summary.partnerContrib)} F | Partage bénéfice : CAMS (${summary.companyProfitSharePct}%) ${formatMoney(summary.companyProfitAmount)} F · Partenaire (${summary.partnerProfitSharePct}%) ${formatMoney(summary.partnerProfitAmount)} F`,
    margin,
    y
  );
  y += 6;

  // Movements table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...darkGreen);
  doc.text(`DÉTAIL DES OPÉRATIONS (${movements.length})`, margin, y);
  y += 3.5;

  const drawHeader = (startY: number) => {
    doc.setFillColor(...darkGreen);
    doc.rect(margin, startY, contentWidth, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('RÉF.', margin + 2, startY + 4.8);
    doc.text('OPÉRATION', margin + 30, startY + 4.8);
    doc.text('OR / DÉPENSE', margin + 88, startY + 4.8);
    doc.text('MONTANT', pageWidth - margin - 2, startY + 4.8, { align: 'right' });
    return startY + 7;
  };

  y = drawHeader(y);

  const sortedMovements = [...movements].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  sortedMovements.forEach((m, idx) => {
    if (y > pageHeight - margin - 22) {
      doc.addPage();
      doc.setDrawColor(...darkGreen);
      doc.setLineWidth(0.8);
      doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8, 'S');
      y = drawHeader(margin + 4);
    }
    const typeLabel =
      m.type === 'contribution'
        ? m.contributor === 'CAMS GOLD'
          ? 'Apport CAMS'
          : 'Apport Part.'
        : m.type === 'goldPurchase'
          ? 'Achat d’or'
          : m.type === 'goldSale'
            ? 'Vente d’or'
            : 'Dépense';
    const net = getMovementCashDelta(m);
    const exp = m.expenseAmountXaf || 0;
    const midDetail = [
      m.weightGrams ? `${formatNumber(m.weightGrams, 2)}g ${formatNumber(m.karat || 24, 0)}K` : '',
      exp > 0 ? `Dép: -${formatMoney(exp)} F` : '',
    ]
      .filter(Boolean)
      .join(' · ') || '—';

    doc.setFillColor(idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 243 : 255);
    doc.setDrawColor(232, 224, 210);
    doc.rect(margin, y, contentWidth, 7.2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...darkGreen);
    doc.text((m.reference || m.id.slice(-8)).slice(0, 14), margin + 2, y + 4.9);
    doc.text(`${typeLabel} · ${m.description}`.slice(0, 34), margin + 30, y + 4.9);
    doc.text(midDetail.slice(0, 32), margin + 88, y + 4.9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${net >= 0 ? '+' : '-'}${formatMoney(Math.abs(net))} F`, pageWidth - margin - 2, y + 4.9, {
      align: 'right',
    });
    y += 7.2;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...gold);
  doc.text('CAMS GOLD · BORDEREAU RÉCAPITULATIF PARTENARIAT', margin, pageHeight - margin + 2);

  return doc;
};

export const buildPartnershipSummaryWhatsAppMessage = (
  partner: Partner,
  summary: PartnershipSummarySnapshot
): string => {
  return [
    `🤝 *CAMS GOLD · BORDEREAU RÉCAPITULATIF PARTENARIAT*`,
    `--------------------------------------`,
    `👤 *Partenaire :* ${partner.name}`,
    `💰 *Apports CAMS GOLD :* ${formatMoney(summary.camsGoldContrib)} FCFA`,
    `💰 *Apports ${partner.name} :* ${formatMoney(summary.partnerContrib)} FCFA`,
    ``,
    `📉 *Achats d’or :* ${formatMoney(summary.purchasesTotal)} FCFA`,
    `📈 *Ventes d’or :* ${formatMoney(summary.salesTotal)} FCFA`,
    `🧾 *Dépenses partenaire :* ${formatMoney(summary.expensesTotal)} FCFA`,
    `✨ *Bénéfice net :* *${summary.benefitTotal >= 0 ? '+' : ''}${formatMoney(summary.benefitTotal)} FCFA*`,
    `• Part CAMS GOLD (${summary.companyProfitSharePct}%) : *${formatMoney(summary.companyProfitAmount)} FCFA*`,
    `• Part ${partner.name} (${summary.partnerProfitSharePct}%) : *${formatMoney(summary.partnerProfitAmount)} FCFA*`,
    ``,
    `🏦 *Solde Caisse Partenaire :* *${formatMoney(summary.balance)} FCFA*`,
  ].join('\n');
};

export const downloadPartnershipSummaryPdf = (
  partner: Partner,
  summary: PartnershipSummarySnapshot,
  movements: PartnershipCashMovement[],
  operatorName: string
): void => {
  const doc = createPartnershipSummaryPdf(partner, summary, movements, operatorName);
  const safeName = partner.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Bordereau-Recapitulatif-${safeName}.pdf`);
};

export const sharePartnershipSummary = async (
  partner: Partner,
  summary: PartnershipSummarySnapshot,
  movements: PartnershipCashMovement[],
  operatorName: string
): Promise<'direct' | 'share' | 'whatsapp'> => {
  const doc = createPartnershipSummaryPdf(partner, summary, movements, operatorName);
  const safeName = partner.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `Bordereau-Recapitulatif-${safeName}.pdf`;
  const text = buildPartnershipSummaryWhatsAppMessage(partner, summary);

  if (await trySendPdfDirectlyViaWhatsApp(doc, filename, partner.phone, text)) {
    return 'direct';
  }

  const file = new File([doc.output('blob')], filename, {
    type: 'application/pdf',
  });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Bordereau Partenariat ${partner.name} - CAMS GOLD`,
        text,
        files: [file],
      });
      return 'share';
    } catch {
      // Fallback
    }
  }

  downloadPartnershipSummaryPdf(partner, summary, movements, operatorName);
  const cleanPhone = (partner.phone || '').replace(/\D/g, '');
  const url = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'whatsapp';
};
