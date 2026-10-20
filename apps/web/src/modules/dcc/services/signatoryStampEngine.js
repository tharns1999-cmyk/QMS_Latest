import { getSignatoryTableDimensions } from './watermarkEngine';
import { 
  generateSignOffStampImage, 
  applyProgressiveSignatoryStamp, 
  stampDocumentLastPage, 
  stampDocumentFirstPage,
  drawSignatoryMatrixCanvas,
  stampUnifiedInternalPdf,
  stampPdfDocument,
  SIGNATORY_FONT_FAMILY,
  PURE_BLACK,
  renderSignatoryText
} from '../utils/pdfStamper';

export {
  SIGNATORY_FONT_FAMILY,
  PURE_BLACK,
  renderSignatoryText,
  getSignatoryTableDimensions,
  generateSignOffStampImage,
  applyProgressiveSignatoryStamp,
  stampDocumentLastPage,
  stampDocumentFirstPage,
  drawSignatoryMatrixCanvas,
  stampUnifiedInternalPdf,
  stampPdfDocument
};

export default {
  SIGNATORY_FONT_FAMILY,
  PURE_BLACK,
  renderSignatoryText,
  getSignatoryTableDimensions,
  generateSignOffStampImage,
  applyProgressiveSignatoryStamp,
  stampDocumentLastPage,
  stampDocumentFirstPage,
  drawSignatoryMatrixCanvas,
  stampUnifiedInternalPdf,
  stampPdfDocument
};
