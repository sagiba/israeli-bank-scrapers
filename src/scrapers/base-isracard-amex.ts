import _ from 'lodash';
import buildUrl from 'build-url';
import moment from 'moment';

import { BaseScraperWithBrowser } from './base-scraper-with-browser';
import { fetchGetWithinPage, fetchPostWithinPage } from '../helpers/fetch';
import {
  SHEKEL_CURRENCY_KEYWORD,
  SHEKEL_CURRENCY,
  ALT_SHEKEL_CURRENCY,
} from '../constants';
import getAllMonthMoments from '../helpers/dates';
import { fixInstallments, filterOldTransactions } from '../helpers/transactions';
import {
  ErrorTypes, LegacyScrapingResult, TransactionStatuses, TransactionTypes,
} from '../types';
import { ScrapeProgressTypes } from './base-scraper';

const COUNTRY_CODE = '212';
const ID_TYPE = '1';
const INSTALLMENTS_KEYWORD = 'תשלום';

const DATE_FORMAT = 'DD/MM/YYYY';

function getAccountsUrl(servicesUrl, monthMoment) {
  const billingDate = monthMoment.format('YYYY-MM-DD');
  return buildUrl(servicesUrl, {
    queryParams: {
      reqName: 'DashboardMonth',
      actionCode: '0',
      billingDate,
      format: 'Json',
    },
  });
}

async function fetchAccounts(page, servicesUrl, monthMoment) {
  const dataUrl = getAccountsUrl(servicesUrl, monthMoment);
  const dataResult = await fetchGetWithinPage(page, dataUrl);
  if (_.get(dataResult, 'Header.Status') === '1' && dataResult.DashboardMonthBean) {
    const { cardsCharges } = dataResult.DashboardMonthBean;
    if (cardsCharges) {
      return cardsCharges.map((cardCharge) => {
        return {
          index: parseInt(cardCharge.cardIndex, 10),
          accountNumber: cardCharge.cardNumber,
          processedDate: moment(cardCharge.billingDate, DATE_FORMAT).toISOString(),
        };
      });
    }
  }
  return null;
}

function getTransactionsUrl(servicesUrl, monthMoment) {
  const month = monthMoment.month() + 1;
  const year = monthMoment.year();
  const monthStr = month < 10 ? `0${month}` : month.toString();
  return buildUrl(servicesUrl, {
    queryParams: {
      reqName: 'CardsTransactionsList',
      month: monthStr,
      year,
      requiredDate: 'N',
    },
  });
}

function convertCurrency(currencyStr) {
  if (currencyStr === SHEKEL_CURRENCY_KEYWORD || currencyStr === ALT_SHEKEL_CURRENCY) {
    return SHEKEL_CURRENCY;
  }
  return currencyStr;
}

function getInstallmentsInfo(txn) {
  if (!txn.moreInfo || !txn.moreInfo.includes(INSTALLMENTS_KEYWORD)) {
    return null;
  }
  const matches = txn.moreInfo.match(/\d+/g);
  if (!matches || matches.length < 2) {
    return null;
  }

  return {
    number: parseInt(matches[0], 10),
    total: parseInt(matches[1], 10),
  };
}

function getTransactionType(txn) {
  return getInstallmentsInfo(txn) ? TransactionTypes.Installments : TransactionTypes.Normal;
}

function convertTransactions(txns, processedDate) {
  const filteredTxns = txns.filter((txn) => txn.dealSumType !== '1' &&
                                            txn.voucherNumberRatz !== '000000000' &&
                                            txn.voucherNumberRatzOutbound !== '000000000');

  return filteredTxns.map((txn) => {
    const isOutbound = txn.dealSumOutbound;
    const txnDateStr = isOutbound ? txn.fullPurchaseDateOutbound : txn.fullPurchaseDate;
    const txnMoment = moment(txnDateStr, DATE_FORMAT);

    return {
      type: getTransactionType(txn),
      identifier: isOutbound ? txn.voucherNumberRatzOutbound : txn.voucherNumberRatz,
      date: txnMoment.toISOString(),
      processedDate,
      originalAmount: isOutbound ? -txn.dealSumOutbound : -txn.dealSum,
      originalCurrency: convertCurrency(txn.currencyId),
      chargedAmount: isOutbound ? -txn.paymentSumOutbound : -txn.paymentSum,
      description: isOutbound ? txn.fullSupplierNameOutbound : txn.fullSupplierNameHeb,
      memo: txn.moreInfo,
      installments: getInstallmentsInfo(txn),
      status: TransactionStatuses.Completed,
    };
  });
}

async function fetchTransactions(page, options, startMoment, monthMoment) {
  const accounts = await fetchAccounts(page, options.servicesUrl, monthMoment);
  const dataUrl = getTransactionsUrl(options.servicesUrl, monthMoment);
  const dataResult = await fetchGetWithinPage(page, dataUrl);
  if (_.get(dataResult, 'Header.Status') === '1' && dataResult.CardsTransactionsListBean) {
    const accountTxns = {};
    accounts.forEach((account) => {
      const txnGroups = _.get(dataResult, `CardsTransactionsListBean.Index${account.index}.CurrentCardTransactions`);
      if (txnGroups) {
        let allTxns = [];
        txnGroups.forEach((txnGroup) => {
          if (txnGroup.txnIsrael) {
            const txns = convertTransactions(txnGroup.txnIsrael, account.processedDate);
            allTxns.push(...txns);
          }
          if (txnGroup.txnAbroad) {
            const txns = convertTransactions(txnGroup.txnAbroad, account.processedDate);
            allTxns.push(...txns);
          }
        });

        if (!options.combineInstallments) {
          allTxns = fixInstallments(allTxns);
        }
        allTxns = filterOldTransactions(allTxns, startMoment, options.combineInstallments);

        accountTxns[account.accountNumber] = {
          accountNumber: account.accountNumber,
          index: account.index,
          txns: allTxns,
        };
      }
    });
    return accountTxns;
  }

  return null;
}

async function fetchAllTransactions(page, options, startMoment) {
  const allMonths = getAllMonthMoments(startMoment, true);
  const results = await Promise.all(allMonths.map(async (monthMoment) => {
    return fetchTransactions(page, options, startMoment, monthMoment);
  }));

  const combinedTxns = {};
  results.forEach((result) => {
    Object.keys(result).forEach((accountNumber) => {
      let txnsForAccount = combinedTxns[accountNumber];
      if (!txnsForAccount) {
        txnsForAccount = [];
        combinedTxns[accountNumber] = txnsForAccount;
      }
      const toBeAddedTxns = result[accountNumber].txns;
      combinedTxns[accountNumber].push(...toBeAddedTxns);
    });
  });

  const accounts = Object.keys(combinedTxns).map((accountNumber) => {
    return {
      accountNumber,
      txns: combinedTxns[accountNumber],
    };
  });

  return {
    success: true,
    accounts,
  };
}

class IsracardAmexBaseScraper extends BaseScraperWithBrowser {
  private baseUrl: string;

  private companyCode: string;

  private servicesUrl: string;

  constructor(options, baseUrl, companyCode) {
    const servicesUrl = `${baseUrl}/services/ProxyRequestHandler.ashx`;
    const clonedOptions = {
      ...options,
      servicesUrl,
    };
    super(clonedOptions);

    this.baseUrl = baseUrl;
    this.companyCode = companyCode;
    this.servicesUrl = servicesUrl;
  }

  async login(credentials): Promise<LegacyScrapingResult> {
    await this.navigateTo(`${this.baseUrl}/personalarea/Login`);

    this.emitProgress(ScrapeProgressTypes.LoggingIn);

    const validateUrl = `${this.servicesUrl}?reqName=ValidateIdData`;
    const validateRequest = {
      id: credentials.id,
      cardSuffix: credentials.card6Digits,
      countryCode: COUNTRY_CODE,
      idType: ID_TYPE,
      checkLevel: '1',
      companyCode: this.companyCode,
    };
    const validateResult = await fetchPostWithinPage(this.page, validateUrl, validateRequest);
    if (!validateResult || !validateResult.Header || validateResult.Header.Status !== '1' || !validateResult.ValidateIdDataBean) {
      throw new Error('unknown error during login');
    }

    const validateReturnCode = validateResult.ValidateIdDataBean.returnCode;
    if (validateReturnCode === '1') {
      const { userName } = validateResult.ValidateIdDataBean;

      const loginUrl = `${this.servicesUrl}?reqName=performLogonI`;
      const request = {
        KodMishtamesh: userName,
        MisparZihuy: credentials.id,
        Sisma: credentials.password,
        cardSuffix: credentials.card6Digits,
        countryCode: COUNTRY_CODE,
        idType: ID_TYPE,
      };
      const loginResult = await fetchPostWithinPage(this.page, loginUrl, request);
      if (loginResult.status === '1') {
        this.emitProgress(ScrapeProgressTypes.LoginSuccess);
        return { success: true };
      }

      if (loginResult.status === '3') {
        this.emitProgress(ScrapeProgressTypes.ChangePassword);
        return {
          success: false,
          errorType: ErrorTypes.ChangePassword,
        };
      }

      this.emitProgress(ScrapeProgressTypes.LoginFailed);
      return {
        success: false,
        errorType: ErrorTypes.InvalidPassword,
      };
    }

    if (validateReturnCode === '4') {
      this.emitProgress(ScrapeProgressTypes.ChangePassword);
      return {
        success: false,
        errorType: ErrorTypes.ChangePassword,
      };
    }

    this.emitProgress(ScrapeProgressTypes.LoginFailed);
    return {
      success: false,
      errorType: ErrorTypes.InvalidPassword,
    };
  }

  async fetchData() {
    const defaultStartMoment = moment().subtract(1, 'years');
    const startDate = this.options.startDate || defaultStartMoment.toDate();
    const startMoment = moment.max(defaultStartMoment, moment(startDate));

    return fetchAllTransactions(this.page, this.options, startMoment);
  }
}

export default IsracardAmexBaseScraper;
