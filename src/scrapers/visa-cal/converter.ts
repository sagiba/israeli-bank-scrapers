/* eslint-disable class-methods-use-this */
import moment from 'moment';
import { VisaCalRawTransaction, VisaCalRawTransactionTransType } from './types';
import { Transaction, TransactionStatuses, TransactionTypes } from '../../types';
import {
  SHEKEL_CURRENCY_SYMBOL,
  SHEKEL_CURRENCY,
  DOLLAR_CURRENCY_SYMBOL,
  DOLLAR_CURRENCY,
} from '../../constants';
import { filterOldTransactions, fixInstallments, sortTransactionsByDate } from '../../helpers/transactions';

const DATE_FORMAT = 'DD/MM/YYYY';

class VisaCalTransactionConverter {
  convertTransactions(txns: Array<VisaCalRawTransaction>): Array<Transaction> {
    return txns.map((txn) => {
      return {
        type: this.convertTransactionType(txn.TransType),
        date: moment(txn.Date, DATE_FORMAT).toISOString(),
        processedDate: moment(txn.DebitDate, DATE_FORMAT).toISOString(),
        originalAmount: -txn.Amount.Value,
        originalCurrency: this.convertCurrency(txn.Amount.Symbol),
        chargedAmount: -txn.DebitAmount.Value,
        description: txn.MerchantDetails.Name,
        memo: this.getTransactionMemo(txn),
        installments: this.getInstallmentsInfo(txn),
        status: TransactionStatuses.Completed,
      };
    });
  }

  convertTransactionType(txnType: VisaCalRawTransactionTransType|string) {
    if (typeof txnType === 'string') {
      // eslint-disable-next-line no-param-reassign
      txnType = parseInt(txnType, 10);
    }

    switch (txnType) {
      case VisaCalRawTransactionTransType.Normal:
      case VisaCalRawTransactionTransType.Refund:
      case VisaCalRawTransactionTransType.Cancel:
      case VisaCalRawTransactionTransType.Withdrawal:
      case VisaCalRawTransactionTransType.Withdrawal2:
      case VisaCalRawTransactionTransType.Refund2:
      case VisaCalRawTransactionTransType.ServicesRefund:
      case VisaCalRawTransactionTransType.MembershipFee:
      case VisaCalRawTransactionTransType.Services:
        return TransactionTypes.Normal;
      case VisaCalRawTransactionTransType.Installments:
      case VisaCalRawTransactionTransType.CreditPayments:
        return TransactionTypes.Installments;
      default:
        throw new Error(`unknown transaction type ${txnType}`);
    }
  }

  convertCurrency(currency) {
    switch (currency) {
      case SHEKEL_CURRENCY_SYMBOL:
        return SHEKEL_CURRENCY;
      case DOLLAR_CURRENCY_SYMBOL:
        return DOLLAR_CURRENCY;
      default:
        return currency;
    }
  }

  getInstallmentsInfo(txn) {
    if (!txn.CurrentPayment || txn.CurrentPayment === '0') {
      return null;
    }

    return {
      number: parseInt(txn.CurrentPayment, 10),
      total: parseInt(txn.TotalPayments, 10),
    };
  }

  getTransactionMemo(txn) {
    const { TransType: txnType, TransTypeDesc: txnTypeDescription } = txn;
    switch (txnType) {
      case VisaCalRawTransactionTransType.Normal:
        return txnTypeDescription === 'רכישה רגילה' ? '' : txnTypeDescription;
      case VisaCalRawTransactionTransType.Installments:
        return `תשלום ${txn.CurrentPayment} מתוך ${txn.TotalPayments}`;
      default:
        return txn.TransTypeDesc;
    }
  }

  prepareTransactions(txns, startMoment, combineInstallments): Array<Transaction> {
    let clonedTxns: Array<Transaction> = Array.from(txns);
    if (!combineInstallments) {
      clonedTxns = fixInstallments(clonedTxns);
    }
    clonedTxns = sortTransactionsByDate(clonedTxns);
    clonedTxns = filterOldTransactions(clonedTxns, startMoment, combineInstallments);
    return clonedTxns;
  }
}

export default VisaCalTransactionConverter;
