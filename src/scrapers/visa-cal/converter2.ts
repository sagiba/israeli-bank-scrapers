import VisaCalTransactionConverter from './converter';
import { VisaCalRawTransaction } from './types';
import { CreditCardTransaction } from '../../types';
import { SHEKEL_CURRENCY, SHEKEL_CURRENCY_SYMBOL } from '../../constants';

class VisaCalTransactionConverter2 extends VisaCalTransactionConverter {
  convertTransaction(raw: VisaCalRawTransaction): CreditCardTransaction {
    if (raw.DebitAmount.Symbol !== SHEKEL_CURRENCY_SYMBOL) {
      // Sanity check, not sure how non-ILS debits are looking, so we won't handle them for now
      throw new Error('Debit amount must be ILS');
    }

    const txn = super.convertTransaction(raw);

    if (txn.installments && txn.installments.total > 1) {
      if (txn.originalCurrency !== SHEKEL_CURRENCY) {
        // Haven't seen non-ILS installment transaction, so won't handle for now
        throw new Error('Currency for installment transaction must be ILS');
      }
    }

    // It appears that the Id + Numerator combination is unique,
    // Id by itself is non-unique across installments transactions, they have the same Id
    // but the Numerator is changing for every installment.
    txn.identifier = `${raw.Id}:${raw.Numerator}`;

    txn.raw = raw;

    return txn;
  }
}

export default VisaCalTransactionConverter2;
