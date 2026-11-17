import { jsPDF } from 'jspdf';
import { PurchaseRecord } from '../types';

export const RECIPIENT_WHATSAPP_PHONE = '242053396158';
export const RECIPIENT_WHATSAPP_DISPLAY = '+242 05 339 61 58';

const formatMoney = (val: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
    .format(Math.round(val || 0))
    .replace(/[\u202F\u00A0]/g, ' ');

const formatNumber = (val: number, decimals: number = 2): string =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(val || 0)
    .replace(/[\u202F\u00A0]/g, ' ');

const formatDate = (dateString?: string): string => {
  if (!dateString) return 'Date non renseignée';
  const d = new Date(dateString);
  return Number.isNaN(d.getTime())
    ? dateString
    : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeZone: 'Africa/Brazzaville',
      }).format(d);
};

const formatDateTime = (dateString?: string): string => {
  if (!dateString) return '';
  const d = new Date(dateString);
  return Number.isNaN(d.getTime())
    ? dateString
    : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Africa/Brazzaville',
      }).format(d);
};

const normalizePurchasesList = (
  input: PurchaseRecord | PurchaseRecord[]
): PurchaseRecord[] => (Array.isArray(input) ? input.filter(Boolean) : [input]);

export const getPurchaseSlipFilename = (
  input: PurchaseRecord | PurchaseRecord[]
): string => {
  const list = normalizePurchasesList(input);
  const firstRef = list[0]?.reference || 'bordereau-achat';
  const refSuffix =
    list.length > 1
      ? `${firstRef}_au_${list[list.length - 1]?.reference || list.length}`
      : firstRef;
  const safeRef = refSuffix.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `Bordereau-Achat-CAMS-GOLD-${safeRef}.pdf`;
};

export const createPurchaseSlipPdfDocument = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string
): jsPDF => {
  const purchases = normalizePurchasesList(purchaseOrList);
  const purchase = purchases[0];
  if (!purchase) {
    throw new Error('Aucun achat fourni pour générer le bordereau PDF.');
  }

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const darkGreen = [25, 42, 36]; // #192A24
  const gold = [211, 151, 37]; // #D39725
  const emerald = [0, 139, 98]; // #008B62
  const textMuted = [102, 112, 133]; // #667085
  const borderLight = [232, 216, 190]; // #E8D8BE
  const bgLight = [250, 248, 243]; // #FAF8F3

  // Outer Border
  doc.setDrawColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.setLineWidth(0.8);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8, 'S');

  // Inner subtle border
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.2);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4, 'S');

  let y = margin + 4;

  // Header Left: Brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text('CAMS GOLD', margin, y);

  y += 5.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text("Bordereau Officiel d'Achat, Pesée & Règlement", margin, y);
  y += 4.5;

  // Header Right: Reference Pill & Dates
  const refText =
    purchases.length > 1
      ? `BORDEREAU D'ACHAT · ${purchases[0].reference} - ${purchases[purchases.length - 1].reference}`
      : `BORDEREAU D'ACHAT N° ${purchase.reference}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(purchases.length > 1 ? 8 : 9.2);
  const refWidth = Math.min(contentWidth * 0.55, doc.getTextWidth(refText) + 8);
  const refX = pageWidth - margin - refWidth;

  doc.setFillColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.roundedRect(refX, margin, refWidth, 7.5, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(refText, refX + refWidth / 2, margin + 5.1, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  const dateText = `Date d'opération : ${formatDate(purchase.purchasedAt)}`;
  doc.text(dateText, pageWidth - margin, margin + 12, { align: 'right' });

  const opText = `Opérateur : ${operatorName || 'CAMS GOLD'}`;
  doc.text(opText, pageWidth - margin, margin + 16, { align: 'right' });

  // Divider Line
  y += 6;
  doc.setDrawColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageWidth - margin, y);

  y += 5;

  // Section 1: Fournisseur & Catégorie d'Or (Card)
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(220, 224, 230);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('FOURNISSEUR / VENDEUR', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text(purchase.supplier || 'Fournisseur particulier / Non renseigné', margin + 4, y + 11);

  const uniqueCategories = Array.from(
    new Set(purchases.map((item) => item.goldCategory || 'Or brut'))
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.text("Catégorie d'or :", margin + 4, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text(uniqueCategories.join(' / '), margin + 26, y + 16);

  if (purchases.length > 1) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
    doc.text(`${purchases.length} lots pesés sur ce bordereau`, pageWidth - margin - 4, y + 11, {
      align: 'right',
    });
  } else if (purchase.description) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const desc = doc.splitTextToSize(purchase.description, contentWidth / 2);
    doc.text(desc[0] || '', pageWidth - margin - 4, y + 11, { align: 'right' });
  }

  y += 24;

  // Section 2: Analyse Physique & Pesée Certifiée (Table)
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
  doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text("DÉTAIL DE L'ANALYSE PHYSIQUE & PESÉE CERTIFIÉE", margin + 4, y + 4.8);

  y += 8;

  const colDefs =
    purchases.length > 1
      ? [
          { title: 'LOT / CAT.', width: 32 },
          { title: 'BRUT', width: 22 },
          { title: 'TARE', width: 20 },
          { title: 'NET', width: 24 },
          { title: 'CARAT', width: 18 },
          { title: 'FIN 24K', width: 28 },
          { title: 'MONTANT FCFA', width: contentWidth - 144, alignRight: true },
        ]
      : [
          { title: 'POIDS BRUT', width: 28 },
          { title: 'TARE / DÉCHETS', width: 30 },
          { title: 'POIDS NET', width: 28 },
          { title: 'TITRE CARAT', width: 26 },
          { title: 'POIDS FIN 24K', width: 32 },
          { title: 'PRIX NET / G', width: contentWidth - 144, alignRight: true },
        ];

  // Header row
  doc.setFillColor(245, 247, 250);
  doc.setDrawColor(220, 225, 230);
  doc.rect(margin, y, contentWidth, 6, 'FD');

  let curX = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  for (const c of colDefs) {
    if (c.alignRight) {
      doc.text(c.title, curX + c.width - 3, y + 4.2, { align: 'right' });
    } else {
      doc.text(c.title, curX + 2.5, y + 4.2);
    }
    curX += c.width;
  }

  y += 6;

  let totalGross = 0;
  let totalNonGold = 0;
  let totalNet = 0;
  let totalFine = 0;
  let totalAmount = 0;
  let totalPaid = 0;

  purchases.forEach((item) => {
    const gross = item.grossWeightGrams ?? item.netWeightGrams ?? 0;
    const nonGold = item.nonGoldWeightGrams ?? 0;
    const net = item.netWeightGrams ?? gross;
    const karat = item.karat || '24K';
    const karatNum = parseFloat(karat.replace('K', '')) || 24;
    const fineGold = (net * karatNum) / 24;
    const pricePerGram = item.referencePricePerGram || 0;

    totalGross += gross;
    totalNonGold += nonGold;
    totalNet += net;
    totalFine += fineGold;
    totalAmount += item.amount || 0;
    totalPaid += (item.payments || []).reduce((sum, p) => sum + p.amount, 0);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(225, 230, 235);
    doc.rect(margin, y, contentWidth, 8, 'FD');

    const rowCells =
      purchases.length > 1
        ? [
            { value: `${item.reference} (${item.goldCategory})`, bold: true },
            { value: `${formatNumber(gross, 2)} g` },
            { value: `${formatNumber(nonGold, 2)} g` },
            { value: `${formatNumber(net, 2)} g`, bold: true },
            { value: karat, color: gold, bold: true },
            { value: `${formatNumber(fineGold, 3)} g`, bold: true },
            {
              value: `${formatMoney(item.amount)} F`,
              alignRight: true,
              color: emerald,
              bold: true,
            },
          ]
        : [
            { value: `${formatNumber(gross, 2)} g` },
            { value: `${formatNumber(nonGold, 2)} g` },
            { value: `${formatNumber(net, 2)} g`, bold: true },
            { value: karat, color: gold, bold: true },
            { value: `${formatNumber(fineGold, 3)} g`, bold: true },
            {
              value: `${formatMoney(pricePerGram)} FCFA`,
              alignRight: true,
              color: emerald,
              bold: true,
            },
          ];

    curX = margin;
    doc.setFontSize(purchases.length > 1 ? 8 : 9);
    rowCells.forEach((cell, idx) => {
      const col = colDefs[idx];
      doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
      if (cell.color) {
        doc.setTextColor(cell.color[0], cell.color[1], cell.color[2]);
      } else {
        doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
      }
      if (cell.alignRight) {
        doc.text(cell.value, curX + col.width - 3, y + 5.3, { align: 'right' });
      } else {
        doc.text(cell.value, curX + 2.5, y + 5.3);
      }
      curX += col.width;
    });

    y += 8;
  });

  if (purchases.length > 1) {
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.setDrawColor(borderLight[0], borderLight[1], borderLight[2]);
    doc.rect(margin, y, contentWidth, 8, 'FD');

    const totalCells = [
      { value: `TOTAL (${purchases.length} lots)`, bold: true },
      { value: `${formatNumber(totalGross, 2)} g`, bold: true },
      { value: `${formatNumber(totalNonGold, 2)} g`, bold: true },
      { value: `${formatNumber(totalNet, 2)} g`, bold: true },
      { value: '—', bold: false },
      { value: `${formatNumber(totalFine, 3)} g`, bold: true },
      {
        value: `${formatMoney(totalAmount)} F`,
        alignRight: true,
        color: emerald,
        bold: true,
      },
    ];

    curX = margin;
    doc.setFontSize(8);
    totalCells.forEach((cell, idx) => {
      const col = colDefs[idx];
      doc.setFont('helvetica', cell.bold ? 'bold' : 'normal');
      if (cell.color) {
        doc.setTextColor(cell.color[0], cell.color[1], cell.color[2]);
      } else {
        doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
      }
      if (cell.alignRight) {
        doc.text(cell.value, curX + col.width - 3, y + 5.3, { align: 'right' });
      } else {
        doc.text(cell.value, curX + 2.5, y + 5.3);
      }
      curX += col.width;
    });
    y += 8;
  }

  y += 5;

  // Section 3: Situation du Règlement
  const balance = totalAmount - totalPaid;

  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(220, 224, 230);
  doc.roundedRect(margin, y, contentWidth, 26, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('SITUATION DU RÈGLEMENT FINANCIER', margin + 4, y + 5);

  const colWidth = contentWidth / 3;

  // Col 1: Montant Total
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text("MONTANT TOTAL DE L'ACHAT", margin + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text(`${formatMoney(totalAmount)} FCFA`, margin + 4, y + 17);

  // Col 2: Déjà réglé
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('DÉJÀ RÉGLÉ AU FOURNISSEUR', margin + colWidth + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(emerald[0], emerald[1], emerald[2]);
  doc.text(`${formatMoney(totalPaid)} FCFA`, margin + colWidth + 4, y + 17);

  // Col 3: Solde
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  const soldeLabel =
    balance > 0 ? 'RESTE À PAYER (DETTE)' : balance < 0 ? 'TROP-PERÇU' : 'SOLDE DU COMPTE';
  doc.text(soldeLabel, margin + colWidth * 2 + 4, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  if (balance > 0) {
    doc.setTextColor(217, 119, 6);
  } else {
    doc.setTextColor(emerald[0], emerald[1], emerald[2]);
  }
  doc.text(`${formatMoney(Math.abs(balance))} FCFA`, margin + colWidth * 2 + 4, y + 17);

  // Status sentence
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(70, 70, 70);
  const statusSentence =
    balance === 0
      ? 'Achat entièrement soldé : le fournisseur a perçu la totalité du règlement.'
      : balance > 0
      ? `Reste à verser au fournisseur : ${formatMoney(balance)} FCFA.`
      : `Le fournisseur a un trop-perçu de ${formatMoney(Math.abs(balance))} FCFA.`;
  doc.text(statusSentence, margin + 4, y + 22.5);

  y += 30;

  // Section 4: Modalités de Règlement (Historique des paiements)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('MODALITÉS & JUSTIFICATIFS DE RÈGLEMENT', margin, y);

  y += 3;

  const payments = purchases.flatMap((item) => item.payments || []);
  if (payments.length === 0) {
    doc.setFillColor(252, 252, 252);
    doc.setDrawColor(230, 230, 230);
    doc.roundedRect(margin, y, contentWidth, 8, 1, 1, 'FD');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text('Aucun versement enregistré immédiatement pour ce bordereau.', margin + 4, y + 5.2);
    y += 12;
  } else {
    for (let i = 0; i < Math.min(payments.length, 4); i++) {
      const p = payments[i];
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(230, 235, 240);
      doc.roundedRect(margin, y, contentWidth, 9, 1, 1, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
      doc.text(p.method || 'Règlement espèces', margin + 3, y + 5.8);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
      const datePay = formatDateTime(p.paidAt);
      const acc = p.account || 'Caisse principale';
      doc.text(`Date : ${datePay}  ·  Compte : ${acc}${p.note ? ` (${p.note})` : ''}`, margin + 45, y + 5.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(emerald[0], emerald[1], emerald[2]);
      doc.text(`${formatMoney(p.amount)} FCFA`, pageWidth - margin - 3, y + 5.8, { align: 'right' });

      y += 10.5;
    }
  }

  y += 6;

  // Signatures Section (2 boxes)
  const sigBoxWidth = (contentWidth - 10) / 2;
  const sigBoxHeight = Math.min(28, Math.max(18, pageHeight - margin - 8 - y));

  // Box 1: Vendeur
  doc.setDrawColor(180, 185, 190);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.roundedRect(margin, y, sigBoxWidth, sigBoxHeight, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text('Signature & Empreinte du Fournisseur', margin + sigBoxWidth / 2, y + 5, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('« Lu et approuvé, bon pour accord »', margin + sigBoxWidth / 2, y + 9, { align: 'center' });

  // Box 2: CAMS GOLD
  doc.roundedRect(margin + sigBoxWidth + 10, y, sigBoxWidth, sigBoxHeight, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(darkGreen[0], darkGreen[1], darkGreen[2]);
  doc.text('Visa, Cachet & Signature CAMS GOLD', margin + sigBoxWidth + 10 + sigBoxWidth / 2, y + 5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('Le Peseur / Caissier habilité', margin + sigBoxWidth + 10 + sigBoxWidth / 2, y + 9, {
    align: 'center',
  });

  // Footer bar
  doc.setLineDashPattern([], 0);
  const footerY = pageHeight - margin + 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(gold[0], gold[1], gold[2]);
  doc.text('CAMS GOLD', margin, footerY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `Destinataire WhatsApp officiel : ${RECIPIENT_WHATSAPP_DISPLAY} · République du Congo`,
    pageWidth - margin,
    footerY,
    { align: 'right' }
  );

  return doc;
};

export const generatePurchaseSlipPdfBlob = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string
): Blob => {
  const doc = createPurchaseSlipPdfDocument(purchaseOrList, operatorName);
  return doc.output('blob');
};

export const generatePurchaseSlipPdfBase64 = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string
): { filename: string; pdfBase64: string } => {
  const doc = createPurchaseSlipPdfDocument(purchaseOrList, operatorName);
  const filename = getPurchaseSlipFilename(purchaseOrList);
  const dataUri = doc.output('datauristring');
  const pdfBase64 = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  return { filename, pdfBase64 };
};

export const downloadPurchaseSlipPdf = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string
): string => {
  const doc = createPurchaseSlipPdfDocument(purchaseOrList, operatorName);
  const filename = getPurchaseSlipFilename(purchaseOrList);
  doc.save(filename);
  return filename;
};

export const buildWhatsAppSlipMessage = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string
): string => {
  const purchases = normalizePurchasesList(purchaseOrList);
  const first = purchases[0];
  if (!first) return '';
  const totalAmount = purchases.reduce((sum, p) => sum + (p.amount || 0), 0);
  const paid = purchases.reduce(
    (sum, p) => sum + (p.payments || []).reduce((pSum, pay) => pSum + pay.amount, 0),
    0
  );
  const balance = totalAmount - paid;
  const totalNet = purchases.reduce(
    (sum, p) => sum + (p.netWeightGrams ?? p.grossWeightGrams ?? 0),
    0
  );
  const refLabel =
    purchases.length > 1
      ? `${first.reference} → ${purchases[purchases.length - 1].reference}`
      : first.reference;

  return [
    `🪙 *CAMS GOLD · BORDEREAU D'ACHAT D'OR (PDF)*`,
    `📄 *Bordereau N° :* ${refLabel}`,
    `📅 *Date :* ${formatDate(first.purchasedAt)}`,
    `👤 *Opérateur :* ${operatorName || 'CAMS GOLD'}`,
    `🤝 *Fournisseur :* ${first.supplier || 'Particulier'}`,
    `⚖️ *Poids net total :* ${formatNumber(totalNet, 2)} g`,
    `💰 *Total achat :* ${formatMoney(totalAmount)} FCFA · *Réglé :* ${formatMoney(paid)} FCFA${
      balance > 0 ? ` · *Reste :* ${formatMoney(balance)} FCFA` : ' · *Soldé*'
    }`,
    `📎 _Merci de joindre le fichier PDF : ${getPurchaseSlipFilename(purchases)}_`,
  ].join('\n');
};

export const getWhatsAppShareUrl = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string,
  phone: string = RECIPIENT_WHATSAPP_PHONE
): string => {
  const text = buildWhatsAppSlipMessage(purchaseOrList, operatorName);
  return `https://api.whatsapp.com/send?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}`;
};

export const sharePurchaseSlipToWhatsApp = async (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string,
  phone: string = RECIPIENT_WHATSAPP_PHONE
): Promise<{ method: 'share' | 'whatsapp_link'; success: boolean; filename: string }> => {
  const purchases = normalizePurchasesList(purchaseOrList);
  const first = purchases[0];
  const filename = getPurchaseSlipFilename(purchases);
  const pdfBlob = generatePurchaseSlipPdfBlob(purchases, operatorName);
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
  const messageText = buildWhatsAppSlipMessage(purchases, operatorName);

  // 1. Try Web Share API with file support (Android/iOS WhatsApp app directly receives the PDF!)
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [pdfFile] })
  ) {
    try {
      await navigator.share({
        title: `Bordereau d'Achat Or ${first?.reference || ''} - CAMS GOLD`,
        text: messageText,
        files: [pdfFile],
      });
      return { method: 'share', success: true, filename };
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') {
        return { method: 'share', success: false, filename };
      }
    }
  }

  // 2. Download PDF bordereau and open WhatsApp to official recipient
  openWhatsAppPurchaseSlip(purchases, operatorName, phone);
  return { method: 'whatsapp_link', success: true, filename };
};

export const openWhatsAppPurchaseSlip = (
  purchaseOrList: PurchaseRecord | PurchaseRecord[],
  operatorName: string,
  phone: string = RECIPIENT_WHATSAPP_PHONE
): void => {
  try {
    downloadPurchaseSlipPdf(purchaseOrList, operatorName);
  } catch (e) {
    console.warn('PDF download warning:', e);
  }

  const messageText = buildWhatsAppSlipMessage(purchaseOrList, operatorName);
  const cleanPhone = phone.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;

  try {
    const link = document.createElement('a');
    link.href = whatsappUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.warn('Unable to open WhatsApp link:', e);
  }
};
