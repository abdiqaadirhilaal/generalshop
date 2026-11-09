import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import type { IOrder, ISale } from '../models/sales.js';
import type { IShopSettings } from '../models/operations.js';

const BRAND = '#101C2C';
const GOLD = '#C69B4D';
const MUTED = '#6E8099';

function money(amount: number, symbol: string) {
  return `${symbol}${amount.toFixed(2)}`;
}

function header(doc: PDFKit.PDFDocument, settings: IShopSettings, title: string, number: string) {
  doc.rect(0, 0, doc.page.width, 96).fill(BRAND);
  doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text(settings.shopName, 48, 32);
  doc
    .fillColor(GOLD)
    .fontSize(9)
    .font('Helvetica')
    .text('SHOP SMARTER. MANAGE BETTER. GROW FASTER.', 48, 60, { characterSpacing: 1 });
  doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold').text(title, 400, 34, {
    width: 150,
    align: 'right',
  });
  doc.fillColor('#C5CDD9').fontSize(9).font('Helvetica').text(number, 400, 56, {
    width: 150,
    align: 'right',
  });
  doc.fillColor(BRAND).fontSize(9).font('Helvetica');
  doc.text(settings.address, 48, 120, { width: 250 });
  doc.text(settings.phone, 48, 134);
  doc.text(settings.email, 48, 148);
}

function tableHeader(doc: PDFKit.PDFDocument, y: number) {
  doc.rect(48, y, doc.page.width - 96, 24).fill('#F5F5F2');
  doc.fillColor(BRAND).fontSize(9).font('Helvetica-Bold');
  doc.text('ITEM', 58, y + 8);
  doc.text('QTY', 330, y + 8, { width: 40, align: 'right' });
  doc.text('PRICE', 380, y + 8, { width: 60, align: 'right' });
  doc.text('TOTAL', 450, y + 8, { width: 60, align: 'right' });
  return y + 32;
}

function items(doc: PDFKit.PDFDocument, rows: IOrder['items'], startY: number, symbol: string) {
  let y = startY;
  doc.font('Helvetica').fontSize(9).fillColor('#202938');
  for (const item of rows) {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 60;
      y = tableHeader(doc, y);
    }
    doc.text(item.name + (item.variation ? ` (${item.variation})` : ''), 58, y, { width: 260 });
    doc.text(String(item.quantity), 330, y, { width: 40, align: 'right' });
    doc.text(money(item.unitPrice, symbol), 380, y, { width: 60, align: 'right' });
    doc.text(money(item.lineTotal, symbol), 450, y, { width: 60, align: 'right' });
    y += 20;
  }
  return y;
}

function totals(
  doc: PDFKit.PDFDocument,
  y: number,
  lines: { label: string; value: string; bold?: boolean }[],
  symbol: string
) {
  y += 10;
  for (const line of lines) {
    doc
      .font(line.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(line.bold ? 12 : 9)
      .fillColor(line.bold ? BRAND : MUTED)
      .text(line.label, 340, y, { width: 90, align: 'right' });
    doc
      .fillColor(line.bold ? BRAND : '#202938')
      .text(line.value, 440, y, { width: 70, align: 'right' });
    y += line.bold ? 22 : 16;
  }
  doc.fontSize(8).fillColor(MUTED);
  return y;
}

export function streamOrderInvoice(
  res: Response,
  order: IOrder & { customer?: { name?: string; phone?: string } },
  settings: IShopSettings
) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${order.orderNumber}.pdf"`);
  doc.pipe(res);

  const symbol = settings.currencySymbol;
  header(doc, settings, 'INVOICE', order.orderNumber);

  doc.fillColor(BRAND).fontSize(10).font('Helvetica-Bold').text('BILL TO', 300, 120);
  doc.font('Helvetica').fontSize(9).fillColor('#202938');
  doc.text(order.shippingAddress.fullName, 300, 136, { width: 240 });
  doc.text(order.shippingAddress.phone, 300, 150);
  doc.text(`${order.shippingAddress.address}, ${order.shippingAddress.city}`, 300, 164, {
    width: 240,
  });

  doc.fontSize(9).fillColor(MUTED);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 48, 190);
  doc.text(`Status: ${order.status.replace(/_/g, ' ')}`, 48, 204);
  doc.text(`Payment: ${order.paymentMethod.replace(/_/g, ' ')} (${order.paymentStatus})`, 48, 218);

  let y = tableHeader(doc, 240);
  y = items(doc, order.items, y, symbol);
  totals(doc, y, [
    { label: 'Subtotal', value: money(order.subtotal, symbol) },
    ...(order.discountTotal > 0
      ? [{ label: 'Discount', value: `-${money(order.discountTotal, symbol)}` }]
      : []),
    ...(order.taxTotal > 0 ? [{ label: 'Tax', value: money(order.taxTotal, symbol) }] : []),
    { label: 'Delivery', value: money(order.deliveryFee, symbol) },
    { label: 'Total', value: money(order.total, symbol), bold: true },
  ], symbol);

  doc.fontSize(8).fillColor(MUTED).text(settings.invoice.footer, 48, doc.page.height - 80, {
    width: doc.page.width - 96,
    align: 'center',
  });

  doc.end();
}

export function streamSaleReceipt(
  res: Response,
  sale: ISale & { customer?: { name?: string; phone?: string } },
  settings: IShopSettings
) {
  const doc = new PDFDocument({ size: [260, 560], margin: 18 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${sale.receiptNumber}.pdf"`);
  doc.pipe(res);

  const symbol = settings.currencySymbol;
  const width = 260 - 36;

  doc.fillColor(BRAND).fontSize(18).font('Helvetica-Bold').text(settings.shopName, { align: 'center' });
  doc.fillColor(GOLD).fontSize(7).font('Helvetica').text('RECEIPT', { align: 'center', characterSpacing: 2 });
  doc.fillColor('#202938').fontSize(8).text(settings.address, { align: 'center', width });
  doc.text(settings.phone, { align: 'center' });
  doc.moveDown(0.6);
  doc.text(`Receipt: ${sale.receiptNumber}`, { width });
  doc.text(`Date: ${new Date(sale.createdAt).toLocaleString()}`, { width });
  doc.text(`Cashier: ${sale.cashierName}`, { width });
  if (sale.customer?.name) doc.text(`Customer: ${sale.customer.name}`, { width });
  doc.moveDown(0.5);
  doc.moveTo(18, doc.y).lineTo(242, doc.y).strokeColor('#E9EDF2').stroke();
  doc.moveDown(0.4);

  for (const item of sale.items) {
    doc.font('Helvetica').fontSize(8).fillColor('#202938');
    doc.text(item.name, { width });
    doc.fillColor(MUTED).text(`${item.quantity} x ${money(item.unitPrice, symbol)}`, { width });
    doc.fillColor('#202938').text(money(item.lineTotal, symbol), { align: 'right', width });
    doc.moveDown(0.3);
  }

  doc.moveTo(18, doc.y).lineTo(242, doc.y).strokeColor('#E9EDF2').stroke();
  doc.moveDown(0.4);
  const row = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8);
    doc.text(label, { continued: true, width: width / 2 });
    doc.text(value, { align: 'right', width: width / 2 });
  };
  row('Subtotal', money(sale.subtotal, symbol));
  if (sale.discountTotal > 0) row('Discount', `-${money(sale.discountTotal, symbol)}`);
  if (sale.taxTotal > 0) row('Tax', money(sale.taxTotal, symbol));
  row('TOTAL', money(sale.total, symbol), true);
  if (sale.changeGiven > 0) row('Change', money(sale.changeGiven, symbol));
  doc.moveDown(0.4);
  for (const payment of sale.payments) {
    doc.fontSize(7).fillColor(MUTED).text(
      `${payment.method.replace(/_/g, ' ')} — ${money(payment.amount, symbol)} (${payment.status})`,
      { width }
    );
  }
  doc.moveDown(0.8);
  doc.fillColor(MUTED).fontSize(7).text(settings.receipt.footer, { align: 'center', width });
  doc.end();
}
