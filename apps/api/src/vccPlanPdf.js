import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import regularBytes from './assets/vcc-fonts/Sarabun-Regular.ttf';
import boldBytes from './assets/vcc-fonts/Sarabun-Bold.ttf';

const text = (value, fallback = '-') => value == null || String(value).trim() === '' ? fallback : String(value).trim();
const graphemes = new Intl.Segmenter('th', { granularity: 'grapheme' });

const wrap = (value, font, size, width) => {
  const lines = [];
  for (const paragraph of text(value).split(/\r?\n/)) {
    let line = '';
    for (const { segment } of graphemes.segment(paragraph)) {
      if (line && font.widthOfTextAtSize(line + segment, size) > width) {
        lines.push(line);
        line = '';
      }
      line += segment;
    }
    lines.push(line);
  }
  return lines;
};

export const generatePlanPdfBuffer = async (plan, items = [], signatories = {}) => {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  const ink = rgb(0.1, 0.15, 0.25);
  const white = rgb(1, 1, 1);
  const left = 36;
  const width = 769.89;
  const size = 8;
  const lineHeight = 11;
  let profile = {};
  try { profile = JSON.parse(plan.profile_snapshot || '{}'); } catch { /* Missing legacy metadata is printed as unknown. */ }
  const columns = [
    ['No.', 26], ['Asset Code', 90], ['Equipment Name', 140], ['Brand / Model / Serial', 120],
    ['MPE / Criteria', 110], ['Cal. Points', 80], ['Schedule (Months)', 105], ['Provider', 98.89]
  ];
  let page;
  let y;

  const drawLines = (lines, x, top, chosenFont = font, chosenSize = size) => {
    lines.forEach((line, index) => page.drawText(line, {
      x, y: top - index * lineHeight, size: chosenSize, font: chosenFont, color: ink
    }));
  };

  const addPage = () => {
    page = doc.addPage([841.89, 595.28]);
    const title = wrap(plan.title, bold, 13, width - 24);
    const bannerHeight = 30 + title.length * lineHeight;
    page.drawRectangle({ x: left, y: 571 - bannerHeight, width, height: bannerHeight, color: rgb(0.08, 0.15, 0.3) });
    page.drawText('QMS PORTAL · VERIFY & CALIBRATION CENTER (VCC)', { x: 48, y: 557, size: 9, font: bold, color: white });
    title.forEach((line, index) => page.drawText(line, { x: 48, y: 539 - index * lineHeight, size: 13, font: bold, color: white }));
    y = 557 - bannerHeight;
    const referenceLines = wrap(`Document: ${text(plan.document_code)}  |  Plan Rev: ${text(plan.revision)}  |  Form Rev: ${text(profile.form_template_revision || profile.revision)}`, font, size, width);
    drawLines(referenceLines, left, y);
    y -= referenceLines.length * lineHeight + 4;
    drawLines([`Department: ${text(plan.department)}  |  Plan Year: ${text(plan.plan_year)}  |  Status: ${text(plan.status)}`], left, y);
    y -= 15;
    drawLines([`Effective Date: ${text(plan.effective_date)}  |  Form Issue Date: ${text(plan.form_issue_date)}`], left, y);
    y -= 15;
    drawLines([`Approval reference: ${text(plan.approval_attempt_id)}`], left, y);
    y -= 22;
    page.drawRectangle({ x: left, y: y - 6, width, height: 19, color: rgb(0.18, 0.24, 0.32) });
    let x = left;
    for (const [label, columnWidth] of columns) {
      page.drawText(label, { x: x + 4, y, size: 7, font: bold, color: white });
      x += columnWidth;
    }
    y -= 20;
  };

  addPage();
  for (const [index, item] of items.entries()) {
    const values = [
      index + 1,
      item.asset_code,
      item.asset_name,
      [item.brand, item.model, item.serial_no].filter(Boolean).join('\n'),
      [item.mpe && `MPE: ${item.mpe}`, item.acceptance_criteria && `Criteria: ${item.acceptance_criteria}`].filter(Boolean).join('\n'),
      item.calibration_points,
      [Array.isArray(item.planned_months) ? item.planned_months.join(', ') : '', item.remarks].filter(Boolean).join('\n'),
      item.provider_name
    ];
    const cells = values.map((value, col) => wrap(value, font, size, columns[col][1] - 8));
    const totalLines = Math.max(...cells.map((lines) => lines.length));
    let offset = 0;
    while (offset < totalLines) {
      let available = Math.floor((y - 55) / lineHeight) - 1;
      if (available < 1) {
        addPage();
        available = Math.floor((y - 55) / lineHeight) - 1;
      }
      const count = Math.min(available, totalLines - offset);
      const height = count * lineHeight + 8;
      if (index % 2) page.drawRectangle({ x: left, y: y - height + 3, width, height, color: rgb(0.97, 0.98, 0.99) });
      let x = left;
      cells.forEach((lines, col) => {
        drawLines(lines.slice(offset, offset + count), x + 4, y);
        x += columns[col][1];
      });
      y -= height + 5;
      page.drawLine({ start: { x: left, y: y + 5 }, end: { x: left + width, y: y + 5 }, thickness: 0.5, color: rgb(0.85, 0.88, 0.92) });
      offset += count;
    }
  }

  const signers = [
    ['PREPARED BY', 'preparer', 'prepared'],
    ['REVIEWED BY', 'reviewer', 'reviewed'],
    ['APPROVED BY', 'approver', 'approved']
  ].map(([label, role, field]) => {
    const person = signatories[role] || {};
    return [label,
      ...wrap(`Name: ${text(person.name || plan[`${field}_by_name`] || plan[`${field}_by`])}`, font, 8, 240),
      ...wrap(`Position: ${text(person.position || plan[`${field}_by_position`])}`, font, 8, 240),
      ...wrap(`Date/Time: ${text(plan[`${field}_at`])}`, font, 8, 240)
    ];
  });
  const signerHeight = Math.max(...signers.map((lines) => lines.length)) * lineHeight + 18;
  if (y - signerHeight < 48) addPage();
  signers.forEach((lines, index) => {
    const x = left + index * 260;
    page.drawRectangle({ x, y: y - signerHeight, width: 250, height: signerHeight, color: rgb(0.96, 0.98, 1), borderColor: rgb(0.8, 0.85, 0.92), borderWidth: 1 });
    drawLines(lines, x + 5, y - 14);
  });

  const pages = doc.getPages();
  pages.forEach((current, index) => {
    current.drawText('CONTROLLED ELECTRONIC RECORD · Uncontrolled when printed or detached from QMS-Portal.', { x: left, y: 28, size: 8, font, color: ink });
    current.drawText(`Page ${index + 1} of ${pages.length}`, { x: 740, y: 28, size: 8, font, color: ink });
  });
  return doc.save();
};
