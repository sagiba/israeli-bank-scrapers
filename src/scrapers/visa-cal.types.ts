export interface VisaCalRawTransaction {
  Id: string;
  Numerator: number;
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
  CurrentPayment: number;
  TotalPayments: number;
  TransType: number;
  TransTypeDesc: string;
  TransSourceDesc: string;
  TransExecutionWay: number;
}

namespace VisaCalRawTransaction {
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
    Id: number;
    Type: string;
    SectorName: string;
    SectorCode: string;
    FaxNumber: string;
  }
}
