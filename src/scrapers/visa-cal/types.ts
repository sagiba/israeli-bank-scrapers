export interface VisaCalRawTransaction {
  Id: string;
  Numerator: string;
  Amount: VisaCalRawTransaction.Amount;
  AccumulatedAmount: VisaCalRawTransaction.Amount;
  Date: string;
  DebitAmount: VisaCalRawTransaction.Amount;
  DebitDate: string;
  Currency: string;
  MerchantDetails: VisaCalRawTransaction.MerchantDetails;
  Comments: string;
  Notes: string;
  PayWaveInd: boolean;
  CurrentPayment: string;
  TotalPayments: string;
  TransType: string;
  TransTypeDesc: string;
  TransSourceDesc: string;
  TransExecutionWay: number;
}

export declare namespace VisaCalRawTransaction {
  export interface Amount {
    Value: number;
    Symbol: string;
    FormattedValue: string;
    ReversedFormattedValue: string;
  }

  export interface MerchantDetails {
    PhoneNumber: string;
    Address: string;
    Name: string;
    Id: string;
    Type: string;
    SectorName: string;
    SectorCode: string;
    FaxNumber: string;
  }
}

// This cannot be inside the namespace, because the namespace is declare-only
export enum VisaCalRawTransactionTransType {
  Normal = 5,
  Refund = 6,
  Withdrawal,
  Installments,
  Cancel = 25,
  Withdrawal2 = 27,
  CreditPayments = 59,
  MembershipFee = 67,
  ServicesRefund = 71,
  Services = 72,
  Refund2 = 76
}
