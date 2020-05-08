import _ from 'lodash';
import buildUrl from 'build-url';
import moment from 'moment';

import { BaseScraper, ScrapeProgressTypes } from '../base-scraper';
import { fetchGet, fetchPost } from '../../helpers/fetch';
import { ErrorTypes } from '../../types';
import { VisaCalRawTransaction } from './types';
import VisaCalTransactionConverter from './converter';

const BASE_URL = 'https://cal4u.cal-online.co.il/Cal4U';
const AUTH_URL = 'https://connect.cal-online.co.il/api/authentication/login';

const PASSWORD_EXPIRED_MSG = 'תוקף הסיסמא פג';
const INVALID_CREDENTIALS = 'שם המשתמש או הסיסמה שהוזנו שגויים';
const NO_DATA_FOUND_MSG = 'לא נמצאו חיובים לטווח תאריכים זה';

const HEADER_SITE = { 'X-Site-Id': '8D37DF16-5812-4ACD-BAE7-CD1A5BFA2206' };

function getBankDebitsUrl(accountId) {
  const toDate = moment().add(2, 'months');
  const fromDate = moment().subtract(6, 'months');

  return buildUrl(BASE_URL, {
    path: `CalBankDebits/${accountId}`,
    queryParams: {
      DebitLevel: 'A',
      DebitType: '2',
      FromMonth: (fromDate.month() + 1).toString().padStart(2, '0'),
      FromYear: fromDate.year().toString(),
      ToMonth: (toDate.month() + 1).toString().padStart(2, '0'),
      ToYear: toDate.year().toString(),
    },
  });
}

function getTransactionsUrl(cardId, debitDate) {
  return buildUrl(BASE_URL, {
    path: `CalTransactions/${cardId}`,
    queryParams: {
      ToDate: debitDate,
      FromDate: debitDate,
    },
  });
}

async function getBankDebits(authHeader, accountId) {
  const bankDebitsUrl = getBankDebitsUrl(accountId);
  return fetchGet(bankDebitsUrl, authHeader);
}

async function getTransactionsNextPage(authHeader) {
  const hasNextPageUrl = `${BASE_URL}/CalTransNextPage`;
  return fetchGet(hasNextPageUrl, authHeader);
}

async function fetchTxns(authHeader, cardId, debitDates): Promise<Array<VisaCalRawTransaction>> {
  const txns = [];
  for (const date of debitDates) {
    const fetchTxnUrl = getTransactionsUrl(cardId, date);
    let txnResponse = await fetchGet(fetchTxnUrl, authHeader);
    if (txnResponse.Transactions) {
      txns.push(...txnResponse.Transactions);
    }
    while (txnResponse.HasNextPage) {
      txnResponse = await getTransactionsNextPage(authHeader);
      if (txnResponse.Transactions != null) {
        txns.push(...txnResponse.Transactions);
      }
    }
  }
  return txns;
}

async function getTxnsOfCard(authHeader, card, bankDebits) {
  const cardId = card.Id;
  const cardDebitDates = bankDebits.filter((bankDebit) => {
    return bankDebit.CardId === cardId;
  }).map((cardDebit) => {
    return cardDebit.Date;
  });
  return fetchTxns(authHeader, cardId, cardDebitDates);
}

async function getTransactionsForAllAccounts(authHeader, startMoment, options) {
  const cardsByAccountUrl = `${BASE_URL}/CardsByAccounts`;
  const banksResponse = await fetchGet(cardsByAccountUrl, authHeader);
  const txnConverter = new VisaCalTransactionConverter();

  if (_.get(banksResponse, 'Response.Status.Succeeded')) {
    const accounts = [];
    for (let i = 0; i < banksResponse.BankAccounts.length; i += 1) {
      const bank = banksResponse.BankAccounts[i];
      const bankDebits = await getBankDebits(authHeader, bank.AccountID);
      // Check that the bank has an active card to scrape
      if (bank.Cards.some((card) => card.IsEffectiveInd)) {
        if (_.get(bankDebits, 'Response.Status.Succeeded')) {
          for (let j = 0; j < bank.Cards.length; j += 1) {
            const rawTxns = await getTxnsOfCard(authHeader, bank.Cards[j], bankDebits.Debits);
            if (rawTxns) {
              let txns = txnConverter.convertTransactions(rawTxns);
              txns = txnConverter.prepareTransactions(
                txns,
                startMoment,
                options.combineInstallments,
              );
              const result = {
                accountNumber: bank.Cards[j].LastFourDigits,
                txns,
              };
              accounts.push(result);
            }
          }
        } else {
          const { Description, Message } = bankDebits.Response.Status;

          if (Message !== NO_DATA_FOUND_MSG) {
            const message = `${Description}. ${Message}`;
            throw new Error(message);
          }
        }
      }
    }
    return {
      success: true,
      accounts,
    };
  }

  return { success: false };
}

class VisaCalScraper extends BaseScraper {
  private authHeader: string;

  async login(credentials) {
    const authRequest = {
      username: credentials.username,
      password: credentials.password,
      rememberMe: null,
    };

    this.emitProgress(ScrapeProgressTypes.LoggingIn);

    const authResponse = await fetchPost(AUTH_URL, authRequest, HEADER_SITE);
    if (authResponse === PASSWORD_EXPIRED_MSG) {
      return {
        success: false,
        errorType: ErrorTypes.ChangePassword,
      };
    }

    if (authResponse === INVALID_CREDENTIALS) {
      return {
        success: false,
        errorType: ErrorTypes.InvalidPassword,
      };
    }

    if (!authResponse || !authResponse.token) {
      return {
        success: false,
        errorType: ErrorTypes.General,
        errorMessage: `No token found in authResponse: ${JSON.stringify(authResponse)}`,
      };
    }
    this.authHeader = `CALAuthScheme ${authResponse.token}`;
    this.emitProgress(ScrapeProgressTypes.LoginSuccess);
    return { success: true };
  }

  async fetchData() {
    const defaultStartMoment = moment().subtract(1, 'years');
    const startDate = this.options.startDate || defaultStartMoment.toDate();
    const startMoment = moment.max(defaultStartMoment, moment(startDate));

    const authHeader = { Authorization: this.authHeader, ...HEADER_SITE };
    return getTransactionsForAllAccounts(authHeader, startMoment, this.options);
  }
}

export default VisaCalScraper;
