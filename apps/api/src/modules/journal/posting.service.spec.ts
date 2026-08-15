import { JournalEntryType } from '@prisma/client';
import { PostingService } from './posting.service';

describe('PostingService', () => {
  const journal = {
    write: jest.fn().mockResolvedValue({ id: 'je1' }),
  };
  const posting = new PostingService(journal as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts balanced payment with advance', async () => {
    await posting.postPayment('p1', 100, 70, 30, {
      buildingId: 'b1',
      apartmentId: 'a1',
    });
    expect(journal.write).toHaveBeenCalledWith(
      expect.objectContaining({
        type: JournalEntryType.payment,
        refId: 'p1',
        lines: expect.arrayContaining([
          expect.objectContaining({ account: 'cash', debit: 100 }),
          expect.objectContaining({ account: 'receivable', credit: 70 }),
          expect.objectContaining({ account: 'advance', credit: 30 }),
        ]),
      }),
      undefined,
    );
  });

  it('posts supplier invoice expense/payable', async () => {
    await posting.postSupplierInvoice('inv1', 500, {
      buildingId: 'b1',
      fundId: 'f1',
      supplierId: 's1',
    });
    expect(journal.write).toHaveBeenCalledWith(
      expect.objectContaining({
        type: JournalEntryType.supplier_invoice,
        lines: [
          expect.objectContaining({ account: 'expense', debit: 500 }),
          expect.objectContaining({ account: 'payable', credit: 500 }),
        ],
      }),
      undefined,
    );
  });

  it('posts credit note', async () => {
    await posting.postCreditNote('cn1', 25, { buildingId: 'b1', fundId: 'f1' });
    expect(journal.write).toHaveBeenCalledWith(
      expect.objectContaining({
        type: JournalEntryType.adjustment,
        refType: 'CreditNote',
      }),
      undefined,
    );
  });
});
