import { VisaCalRawTransaction } from './types';
import VisaCalTransactionConverter from './converter';
import { CreditCardTransaction } from '../../types';

describe('VisaCal converter test', () => {
  test('convert-installments', () => {
    const rawTxn1 = <VisaCalRawTransaction> {
      Id: '16960679999',
      Numerator: '4',
      Amount: {
        Value: 1671,
        Symbol: '₪',
        FormattedValue: '₪ 1,671.00',
        ReversedFormattedValue: '1,671.00 ₪',
      },
      AccumulatedAmount: {
        Value: 0,
        Symbol: '₪',
        FormattedValue: '₪ 0.00',
        ReversedFormattedValue: '0.00 ₪',
      },
      Date: '17/09/2019',
      DebitAmount: {
        Value: 557,
        Symbol: '₪',
        FormattedValue: '₪ 557.00',
        ReversedFormattedValue: '557.00 ₪',
      },
      DebitDate: '10/10/2019',
      Currency: 'שח',
      MerchantDetails: {
        PhoneNumber: null,
        Address: null,
        Name: 'Some Furniture Store',
        Id: '1234567',
        Type: null,
        SectorName: null,
        SectorCode: null,
        FaxNumber: null,
      },
      Comments: null,
      Notes: null,
      PayWaveInd: false,
      CurrentPayment: '1',
      TotalPayments: '3',
      TransType: '8',
      TransTypeDesc: 'רכישה בתשלומים',
      TransSourceDesc: 'שבא-אשראית 96',
      TransExecutionWay: 5,
    };

    const expected1 = <CreditCardTransaction> {
      type: 'installments',
      date: '2019-09-16T21:00:00.000Z',
      processedDate: '2019-10-09T21:00:00.000Z',
      originalAmount: -1671,
      originalCurrency: 'ILS',
      chargedAmount: -557,
      description: 'Some Furniture Store',
      memo: 'תשלום 1 מתוך 3',
      installments: {
        number: 1,
        total: 3,
      },
      status: 'completed',
    };

    const converter = new VisaCalTransactionConverter();

    const result1 = converter.convertTransaction(rawTxn1);
    expect(result1).toEqual(expected1);

    const rawTxn2 = {
      ...rawTxn1,
      Numerator: '6',
      DebitDate: '10/11/2019',
      CurrentPayment: '2',
    };

    const expected2 = {
      ...expected1,
      // date: '2019-10-16T21:00:00.000Z', <-- is this later changed by prepareTransactions?
      date: '2019-09-16T21:00:00.000Z',
      processedDate: '2019-11-09T22:00:00.000Z',
      memo: 'תשלום 2 מתוך 3',
      installments: {
        ...expected1.installments,
        number: 2,
      },
    };

    const result2 = converter.convertTransaction(rawTxn2);
    expect(result2).toEqual(expected2);
  });
});
