import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DocumentDetailModal from "../components/workflow/DocumentDetailModal";
import useStore from "../../../store/useStore";

describe("Controlled Copy Modern Contextual Action Suite (Direct Action Layout)", () => {
  const sampleDoc = {
    id: "DOC-PD-001",
    title: "SOP-PD-01",
    name: "คู่มือการปฏิบัติงานฝ่ายผลิต",
    rev: "01",
    department: "PD",
    status: "EFFECTIVE"
  };

  const copyPD1 = {
    id: "cc-001",
    doc_id: "DOC-PD-001",
    copy_no: "01",
    recipientDept: "PD",
    department: "PD",
    location: "Mixing Room",
    status: "ISSUED_ACTIVE"
  };

  const copyPD2 = {
    id: "cc-002",
    doc_id: "DOC-PD-001",
    copy_no: "02",
    recipientDept: "PD",
    department: "PD",
    location: "Packing Line",
    status: "ISSUED_ACTIVE"
  };

  beforeEach(() => {
    useStore.setState({
      currentUser: { id: "U002", name: "ธนาวุฒิ PD", department: "PD", isDcc: false, role: "GENERAL_USER" },
      documentControlledCopies: [copyPD1, copyPD2],
      controlledCopyInstances: [copyPD1, copyPD2],
      documents: [sampleDoc],
      canDownloadDocument: () => true
    });
  });

  it("1. Origin Invariant: Copy 01 shows only emergency Damaged/Lost button; Copy 02 shows all 3 direct actions", () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    // Relocate and Return buttons are only rendered for Copy 02 (non-origin)
    const relocateBtns = screen.getAllByRole("button", { name: /ขอย้ายจุด/i });
    expect(relocateBtns.length).toBe(1);

    const returnBtns = screen.getAllByRole("button", { name: /ส่งคืน/i });
    expect(returnBtns.length).toBe(1);

    // Both Copy 01 and Copy 02 have damaged/lost buttons
    const damagedBtns = screen.getAllByRole("button", { name: /แจ้งชำรุด/i });
    expect(damagedBtns.length).toBe(2);
  });

  it("2. Clicking 'ขอย้ายจุด' on Copy 02 directly opens relocation modal", () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    const relocateBtn = screen.getByRole("button", { name: /ขอย้ายจุด/i });
    fireEvent.click(relocateBtn);

    // Relocation modal opens directly without intermediary dropdown
    expect(screen.getByText(/ขอย้ายจุดติดตั้งสำเนา/i)).toBeInTheDocument();
  });

  it("3. Clicking 'ส่งคืน' on Copy 02 directly opens return modal", () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    const returnBtn = screen.getByRole("button", { name: /ส่งคืน/i });
    fireEvent.click(returnBtn);

    // Return modal opens directly
    expect(screen.getByText(/ขอส่งคืน \/ ยกเลิกสำเนาควบคุม/i)).toBeInTheDocument();
  });

  it("4. Clicking 'แจ้งชำรุด/สูญหาย' directly opens replacement modal", () => {
    render(<DocumentDetailModal isOpen={true} onClose={() => {}} document={sampleDoc} />);

    // Click on Copy 01 damaged button
    const damagedBtns = screen.getAllByRole("button", { name: /แจ้งชำรุด/i });
    fireEvent.click(damagedBtns[0]);

    // Replacement modal opens
    expect(screen.getByText(/แจ้งเอกสารชำรุด\/สูญหาย/i)).toBeInTheDocument();
  });
});
